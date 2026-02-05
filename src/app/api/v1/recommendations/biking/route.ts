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
  selectHeadwearByCategory,
  formatHandwearResponse,
  formatHeadwearResponse,
  ensembleToThermalGarments,
  type GarmentRow,
  type CategorizedGarments,
} from '@/lib/recommendations/shared';

/**
 * POST /api/v1/recommendations/biking
 * Get biking clothing recommendations
 */
export async function POST(request: NextRequest) {
  const validated = await validateRecommendationRequest(request);
  if (validated instanceof NextResponse) return validated;

  const { supabase, userId, weather, tempC, windMs } = validated;

  // Calculate IREQ for biking (moderate intensity)
  const ireq = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs,
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate: METABOLIC_RATES.biking_moderate,
  });

  // Biking: balance breathability with wind protection
  const maxClo = Math.min(ireq.ireqNeutral + 0.25, 1.6);
  const minEvapPotential = 0.25;

  // Check if user has wardrobe items
  const wardrobeIds = await getUserWardrobeGarmentIds(supabase, userId);
  const useWardrobe = wardrobeIds && wardrobeIds.length > 0;

  // Fetch garments (no activity filter for biking yet)
  const { data: allGarments, error } = await fetchGarmentsWithDetails(supabase, {
    wardrobeIds: useWardrobe ? wardrobeIds : null,
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
        guidance: getBikingGuidance(tempC, ireq),
      },
    });
  }

  const categorized = categorizeGarments(allGarments);
  const ensemble = buildBikingEnsemble(categorized, ireq, maxClo, minEvapPotential);

  const [userHandwear, userHeadwear] = await Promise.all([
    fetchUserHandwear(supabase, userId),
    fetchUserHeadwear(supabase, userId),
  ]);

  const recommendedHandwear = selectHandwear(userHandwear, tempC, true);
  const recommendedHeadwear = selectHeadwearByCategory(userHeadwear, tempC, true);

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
      name: 'Biking',
      metabolicRate: METABOLIC_RATES.biking_moderate,
      hasStaticPeriods: false,
      windExposure: 'exposed',
    },
    'biking'
  );

  const regionalIreq = calculateRegionalIreq(ireq, 'biking');
  const extremityIreq = calculateExtremityIreq(ireq, 'biking', tempC, windMs);

  return NextResponse.json({
    conditions: {
      temperature: `${weather.temperature}°F`,
      wind_speed: `${weather.wind_speed} mph`,
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
      headwear: {
        helmet: recommendedHeadwear.helmet ? formatHeadwearResponse(recommendedHeadwear.helmet) : null,
        head_warmth: recommendedHeadwear.headWarmth ? formatHeadwearResponse(recommendedHeadwear.headWarmth) : null,
        neck_warmth: recommendedHeadwear.neckWarmth ? formatHeadwearResponse(recommendedHeadwear.neckWarmth) : null,
      },
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
    guidance: getBikingGuidance(tempC, ireq),
  });
}

function buildBikingEnsemble(
  categorized: CategorizedGarments,
  ireq: { ireqMin: number; ireqNeutral: number },
  maxClo: number,
  minEvapPotential: number
): GarmentRow[] {
  const ensemble: GarmentRow[] = [];

  const torsoBaseLayers = categorized.baseLayers.filter((g) => g.covers_torso);
  const legsBaseLayers = categorized.baseLayers.filter((g) => g.covers_legs);

  const sortedTorsoBases = sortByBreathability(torsoBaseLayers);
  if (sortedTorsoBases.length > 0) {
    const suitableBase = findBreathableGarment(sortedTorsoBases, minEvapPotential);
    ensemble.push(suitableBase ?? sortedTorsoBases[0]);
  }

  const sortedLegsBases = sortByBreathability(legsBaseLayers);
  if (sortedLegsBases.length > 0) {
    const suitableBase = findBreathableGarment(sortedLegsBases, minEvapPotential);
    if (!ensemble.some((g) => g.id === suitableBase?.id)) {
      ensemble.push(suitableBase ?? sortedLegsBases[0]);
    }
  }

  let currentClo = getEnsembleClo(ensemble);

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

  if (categorized.shells.length > 0) {
    const sortedShells = sortByBreathability(categorized.shells);
    for (const shell of sortedShells) {
      const shellClo = shell.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + shellClo <= maxClo) {
        ensemble.push(shell);
        break;
      }
    }
  }

  return ensemble;
}

function getBikingGuidance(tempC: number, ireq: { ireqMin: number; ireqNeutral: number }): string[] {
  const guidance: string[] = [];

  if (tempC > 0) {
    guidance.push('Mild conditions - prioritize breathable layers');
  } else if (tempC > -10) {
    guidance.push('Cool conditions - add wind protection');
  } else {
    guidance.push('Cold conditions - add a midlayer and wind shell');
  }

  if (ireq.ireqNeutral < 1.1) {
    guidance.push('Avoid heavy insulation to prevent overheating');
  }

  return guidance;
}
