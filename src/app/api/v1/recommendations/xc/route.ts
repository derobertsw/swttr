import { NextRequest, NextResponse } from 'next/server';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { calculateIreq, calculateRegionalIreq, calculateExtremityIreq } from '@/lib/biophysics/ireq';
import { scoreEnsemble } from '@/lib/biophysics/scorer';
import { METABOLIC_RATES } from '@/lib/biophysics/constants';
import {
  validateRecommendationRequest,
  getUserWardrobeGarmentIds,
  fetchGarmentsWithDetails,
  categorizeGarments,
  sortByBreathability,
  getEnsembleClo,
  findBreathableGarment,
  formatGarmentResponse,
  fetchUserHandwear,
  fetchUserHeadwear,
  selectHandwear,
  selectHeadwear,
  formatHandwearResponse,
  formatHeadwearResponse,
  ensembleToThermalGarments,
  type GarmentRow,
  type CategorizedGarments,
} from '@/lib/recommendations/shared';

/**
 * POST /api/v1/recommendations/xc
 * Get XC skiing clothing recommendations
 *
 * XC skiing prioritizes breathability (evap_potential >= 0.25) over warmth
 *
 * Body:
 * {
 *   weather: {
 *     temperature: number,  // °F
 *     wind_speed: number,   // mph
 *     humidity?: number,
 *     precipitation?: boolean
 *   },
 *   intensity?: 'easy' | 'moderate' | 'racing' (default: 'moderate')
 * }
 *
 * Headers:
 *   x-user-id: string (optional) - If provided, uses only user's wardrobe items
 */
export async function POST(request: NextRequest) {
  const validated = await validateRecommendationRequest(request);
  if (validated instanceof NextResponse) return validated;

  const { supabase, userId, weather, tempC, windMs, body } = validated;

  const intensity = (body.intensity ?? 'moderate') as 'easy' | 'moderate' | 'racing';
  const intensityToRate: Record<'easy' | 'moderate' | 'racing', keyof typeof METABOLIC_RATES> = {
    easy: 'xc_skiing_easy',
    moderate: 'xc_skiing_moderate',
    racing: 'xc_skiing_racing',
  };
  const metabolicRateKey = intensityToRate[intensity];

  // Calculate IREQ
  const ireq = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs,
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate: METABOLIC_RATES[metabolicRateKey],
  });

  // XC skiing has tight clo constraints - don't want to overheat
  const maxClo = Math.min(ireq.ireqNeutral + 0.3, 1.8);
  const minEvapPotential = 0.25;

  // Check if user has wardrobe items
  const wardrobeIds = await getUserWardrobeGarmentIds(supabase, userId);
  const useWardrobe = wardrobeIds && wardrobeIds.length > 0;

  // Fetch suitable garments
  const { data: allGarments, error } = await fetchGarmentsWithDetails(supabase, {
    wardrobeIds: useWardrobe ? wardrobeIds : null,
    activityFilter: useWardrobe ? undefined : { field: 'xc_skiing_score', minScore: 6 },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!allGarments || allGarments.length === 0) {
    return NextResponse.json({
      message: 'No suitable garments found in database',
      ireq: { min: ireq.ireqMin, neutral: ireq.ireqNeutral },
      recommendations: {
        target_clo_range: [ireq.ireqMin, maxClo],
        min_evap_potential: minEvapPotential,
        guidance: getXCGuidance(tempC, ireq),
      },
    });
  }

  // Categorize garments
  const categorized = categorizeGarments(allGarments);

  // Build optimal ensemble prioritizing breathability
  const ensemble = buildXCEnsemble(categorized, ireq, maxClo, minEvapPotential);

  // Fetch user's extremity gear (handwear and headwear)
  const [userHandwear, userHeadwear] = await Promise.all([
    fetchUserHandwear(supabase, userId),
    fetchUserHeadwear(supabase, userId),
  ]);

  // Select best extremity gear for conditions
  const recommendedHandwear = selectHandwear(userHandwear, tempC, true);
  const recommendedHeadwear = selectHeadwear(userHeadwear, tempC, true);

  // Score the ensemble
  const thermalGarments = ensembleToThermalGarments(ensemble);

  const ensembleProps = predictEnsembleThermal(thermalGarments);

  const score = scoreEnsemble(
    thermalGarments,
    {
      temperature: tempC,
      windSpeed: windMs,
      humidity: weather.humidity ?? 50,
      precipitation: weather.precipitation ?? false,
    },
    {
      name: 'XC Skiing',
      metabolicRate: METABOLIC_RATES[metabolicRateKey],
      hasStaticPeriods: false,
      windExposure: 'normal',
    },
    'xc_skiing'
  );

  // Calculate regional IREQ targets
  const regionalIreq = calculateRegionalIreq(ireq, 'xc_skiing');
  const extremityIreq = calculateExtremityIreq(ireq, 'xc_skiing', tempC, windMs);

  return NextResponse.json({
    conditions: {
      temperature: `${weather.temperature}°F`,
      wind_speed: `${weather.wind_speed} mph`,
      intensity,
    },
    ireq: {
      min: ireq.ireqMin,
      neutral: ireq.ireqNeutral,
      target_range: [ireq.ireqMin, maxClo],
      regional: regionalIreq,
      extremity: extremityIreq,
    },
    recommendation: {
      garments: ensemble.map(formatGarmentResponse),
      handwear: recommendedHandwear ? formatHandwearResponse(recommendedHandwear) : null,
      headwear: recommendedHeadwear ? formatHeadwearResponse(recommendedHeadwear) : null,
      ensemble_properties: {
        total_clo: ensembleProps.rcl.wholeBody,
        regional_clo: {
          torso: Math.round(ensembleProps.rcl.torso * 100) / 100,
          arms: Math.round(ensembleProps.rcl.arm * 100) / 100,
          legs: Math.round(ensembleProps.rcl.leg * 100) / 100,
        },
        evap_potential: ensembleProps.evapPotential,
        permeability_index: ensembleProps.im,
      },
      score: score.totalScore,
      component_scores: score.componentScores,
    },
    warnings: score.warnings,
    guidance: getXCGuidance(tempC, ireq),
  });
}

function buildXCEnsemble(
  categorized: CategorizedGarments,
  ireq: { ireqMin: number; ireqNeutral: number },
  maxClo: number,
  minEvapPotential: number
): GarmentRow[] {
  const ensemble: GarmentRow[] = [];

  // 1. Select base layers for torso and legs separately
  const torsoBaseLayers = categorized.baseLayers.filter((g) => g.covers_torso);
  const legsBaseLayers = categorized.baseLayers.filter((g) => g.covers_legs);

  // Select torso base layer (prioritize breathability)
  const sortedTorsoBases = sortByBreathability(torsoBaseLayers);
  if (sortedTorsoBases.length > 0) {
    const suitableBase = findBreathableGarment(sortedTorsoBases, minEvapPotential);
    ensemble.push(suitableBase ?? sortedTorsoBases[0]);
  }

  // Select legs base layer (prioritize breathability)
  const sortedLegsBases = sortByBreathability(legsBaseLayers);
  if (sortedLegsBases.length > 0) {
    const suitableBase = findBreathableGarment(sortedLegsBases, minEvapPotential);
    // Don't add if it's the same item (e.g., one-piece that covers both)
    if (!ensemble.some((g) => g.id === suitableBase?.id)) {
      ensemble.push(suitableBase ?? sortedLegsBases[0]);
    }
  }

  // 2. Check if we need more layers
  let currentClo = getEnsembleClo(ensemble);

  // Add mid layer if needed and it won't exceed max
  if (currentClo < ireq.ireqMin && categorized.midLayers.length > 0) {
    const sortedMids = sortByBreathability(categorized.midLayers);

    for (const mid of sortedMids) {
      const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + midClo <= maxClo) {
        ensemble.push(mid);
        currentClo += midClo;
        break;
      }
    }
  }

  // 3. Add windbreaker/soft shell if windy (only if breathable)
  if (categorized.shells.length > 0) {
    const breathableSoftShells = categorized.shells.filter(
      (s) => (s.garment_thermal_properties?.evap_potential ?? 0) >= 0.20
    );
    if (breathableSoftShells.length > 0) {
      const shell = breathableSoftShells[0];
      const shellClo = shell.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + shellClo <= maxClo) {
        ensemble.push(shell);
      }
    }
  }

  return ensemble;
}

function getXCGuidance(tempC: number, ireq: { ireqMin: number; ireqNeutral: number }): string[] {
  const guidance: string[] = [];

  if (tempC > 0) {
    guidance.push('Warm conditions - prioritize breathability over insulation');
    guidance.push('A single breathable base layer may be sufficient');
  } else if (tempC > -10) {
    guidance.push('Moderate cold - balance warmth and breathability');
    guidance.push('Consider a light base + breathable mid layer');
  } else {
    guidance.push('Cold conditions - ensure adequate insulation while maintaining breathability');
    guidance.push('Use a mid-weight base with a breathable softshell');
  }

  guidance.push(`Target insulation: ${ireq.ireqMin.toFixed(1)}-${ireq.ireqNeutral.toFixed(1)} clo`);
  guidance.push('Look for garments with evaporative potential >= 0.25');

  return guidance;
}
