import { NextRequest, NextResponse } from 'next/server';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { calculateIreq } from '@/lib/biophysics/ireq';
import { scoreEnsemble } from '@/lib/biophysics/scorer';
import { METABOLIC_RATES, getAlpineCloTargets } from '@/lib/biophysics/constants';
import {
  validateRecommendationRequest,
  getUserWardrobeGarmentIds,
  fetchGarmentsWithDetails,
  categorizeGarments,
  sortByInsulation,
  sortByWaterproofness,
  sortByBreathability,
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
 * POST /api/v1/recommendations/alpine
 * Get alpine/resort skiing clothing recommendations
 *
 * Alpine skiing accounts for chairlift time (static periods) with dual metabolic rates
 *
 * Body:
 * {
 *   weather: {
 *     temperature: number,  // °F
 *     wind_speed: number,   // mph
 *     humidity?: number,
 *     precipitation?: boolean,
 *     precipitation_type?: 'rain' | 'snow' | 'mixed'
 *   }
 * }
 *
 * Headers:
 *   x-user-id: string (optional) - If provided, uses only user's wardrobe items
 */
export async function POST(request: NextRequest) {
  const validated = await validateRecommendationRequest(request);
  if (validated instanceof NextResponse) return validated;

  const { supabase, userId, weather, tempC, windMs } = validated;

  // Calculate IREQ for both skiing and chairlift
  const ireqSkiing = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs + 5, // Add speed-induced wind
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate: METABOLIC_RATES.alpine_skiing,
  });

  const ireqChairlift = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs,
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate: METABOLIC_RATES.chairlift,
  });

  // Use weighted average (40% chairlift, 60% skiing)
  const targetCloMin = ireqSkiing.ireqMin * 0.6 + ireqChairlift.ireqMin * 0.4;
  const targetCloMax = ireqChairlift.ireqNeutral; // Don't want to be cold on lift

  // Check if user has wardrobe items
  const wardrobeIds = await getUserWardrobeGarmentIds(supabase, userId);
  const useWardrobe = wardrobeIds && wardrobeIds.length > 0;

  // Fetch suitable garments
  const { data: allGarments, error } = await fetchGarmentsWithDetails(supabase, {
    wardrobeIds: useWardrobe ? wardrobeIds : null,
    activityFilter: useWardrobe ? undefined : { field: 'alpine_skiing_score', minScore: 5 },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!allGarments || allGarments.length === 0) {
    return NextResponse.json({
      message: 'No suitable garments found in database',
      ireq: {
        skiing: { min: ireqSkiing.ireqMin, neutral: ireqSkiing.ireqNeutral },
        chairlift: { min: ireqChairlift.ireqMin, neutral: ireqChairlift.ireqNeutral },
        target_range: [targetCloMin, targetCloMax],
      },
      guidance: getAlpineGuidance(tempC, weather.precipitation),
    });
  }

  // Categorize and build ensemble
  const categorized = categorizeGarments(allGarments);
  const ensemble = buildAlpineEnsemble(
    categorized,
    targetCloMin,
    targetCloMax,
    weather.precipitation ?? false
  );

  // Fetch user's extremity gear (handwear and headwear)
  const [userHandwear, userHeadwear] = await Promise.all([
    fetchUserHandwear(supabase, userId),
    fetchUserHeadwear(supabase, userId),
  ]);

  // Select best extremity gear for conditions (alpine has static periods on chairlift)
  const recommendedHandwear = selectHandwear(userHandwear, tempC, false);
  const recommendedHeadwear = selectHeadwearByCategory(userHeadwear, tempC, false);

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
      precipitationType: weather.precipitation_type,
    },
    {
      name: 'Alpine Skiing',
      metabolicRate: METABOLIC_RATES.alpine_skiing,
      hasStaticPeriods: true,
      staticMetabolicRate: METABOLIC_RATES.chairlift,
      windExposure: 'exposed',
    },
    'alpine_skiing'
  );

  // Get direct clo targets for alpine skiing based on temperature
  const alpineTargets = getAlpineCloTargets(tempC);

  // Format regional targets using the new direct values
  const regionalIreq = {
    min: {
      torso: alpineTargets.torso.min,
      arms: alpineTargets.torso.min * 0.85, // Arms need slightly less than torso
      legs: alpineTargets.legs.min,
    },
    neutral: {
      torso: alpineTargets.torso.neutral,
      arms: alpineTargets.torso.neutral * 0.85,
      legs: alpineTargets.legs.neutral,
    },
  };

  // Format extremity targets using the new direct values
  const extremityIreq = {
    min: {
      hands: alpineTargets.hands.min,
      head: alpineTargets.head.min,
    },
    neutral: {
      hands: alpineTargets.hands.neutral,
      head: alpineTargets.head.neutral,
    },
  };

  return NextResponse.json({
    conditions: {
      temperature: `${weather.temperature}°F`,
      wind_speed: `${weather.wind_speed} mph`,
      precipitation: weather.precipitation ?? false,
    },
    ireq: {
      skiing: { min: ireqSkiing.ireqMin, neutral: ireqSkiing.ireqNeutral },
      chairlift: { min: ireqChairlift.ireqMin, neutral: ireqChairlift.ireqNeutral },
      target_range: [Math.round(targetCloMin * 100) / 100, Math.round(targetCloMax * 100) / 100],
      regional: regionalIreq,
      extremity: extremityIreq,
    },
    recommendation: {
      garments: ensemble.map((g) => ({
        ...formatGarmentResponse(g),
        rcl: g.garment_thermal_properties?.rcl_whole_body,
      })),
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
    guidance: getAlpineGuidance(tempC, weather.precipitation),
  });
}

function buildAlpineEnsemble(
  categorized: CategorizedGarments,
  minClo: number,
  maxClo: number,
  precipitation: boolean
): GarmentRow[] {
  const ensemble: GarmentRow[] = [];
  let currentClo = 0;

  // 1. Base layers for torso and legs separately (prioritize warmth for alpine)
  const torsoBaseLayers = categorized.baseLayers.filter((g) => g.covers_torso);
  const legsBaseLayers = categorized.baseLayers.filter((g) => g.covers_legs);

  // Select torso base layer
  const sortedTorsoBases = sortByInsulation(torsoBaseLayers);
  if (sortedTorsoBases.length > 0) {
    const suitableBase = sortedTorsoBases.find(
      (b) => (b.garment_thermal_properties?.rcl_whole_body ?? 0) <= minClo * 0.3
    );
    const baseLayer = suitableBase ?? sortedTorsoBases[sortedTorsoBases.length - 1];
    ensemble.push(baseLayer);
    currentClo += baseLayer.garment_thermal_properties?.rcl_whole_body ?? 0;
  }

  // Select legs base layer
  const sortedLegsBases = sortByInsulation(legsBaseLayers);
  if (sortedLegsBases.length > 0) {
    const suitableBase = sortedLegsBases.find(
      (b) => (b.garment_thermal_properties?.rcl_whole_body ?? 0) <= minClo * 0.3
    );
    const baseLayer = suitableBase ?? sortedLegsBases[sortedLegsBases.length - 1];
    // Don't add if it's the same item (e.g., one-piece that covers both)
    if (!ensemble.some((g) => g.id === baseLayer.id)) {
      ensemble.push(baseLayer);
      currentClo += baseLayer.garment_thermal_properties?.rcl_whole_body ?? 0;
    }
  }

  // 2. Mid layer or insulation
  const allMids = sortByInsulation([...categorized.midLayers, ...categorized.insulation], false);

  for (const mid of allMids) {
    const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
    if (currentClo + midClo <= maxClo && currentClo < minClo) {
      ensemble.push(mid);
      currentClo += midClo;
    }
    if (currentClo >= minClo) break;
  }

  // 3. Shell (required for alpine - weather protection)
  const sortedShells = precipitation
    ? sortByWaterproofness(categorized.shells)
    : sortByBreathability(categorized.shells);

  if (sortedShells.length > 0) {
    ensemble.push(sortedShells[0]);
    currentClo += sortedShells[0].garment_thermal_properties?.rcl_whole_body ?? 0;
  }

  return ensemble;
}

function getAlpineGuidance(tempC: number, precipitation?: boolean): string[] {
  const guidance: string[] = [];

  if (tempC > 0) {
    guidance.push('Warm conditions - lighter insulation is fine');
    guidance.push('Soft shell may be preferable for breathability');
  } else if (tempC > -10) {
    guidance.push('Standard resort conditions');
    guidance.push('Mid-weight base + light insulation + shell');
  } else if (tempC > -20) {
    guidance.push('Cold conditions - prioritize warmth');
    guidance.push('Heavy base + substantial insulation + shell');
  } else {
    guidance.push('Extreme cold - maximum insulation needed');
    guidance.push('Consider face protection and hand warmers');
  }

  if (precipitation) {
    guidance.push('Precipitation expected - waterproof shell recommended');
  }

  guidance.push('Remember: chairlift time requires more insulation than skiing');

  return guidance;
}
