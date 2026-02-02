import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { garmentToThermalProps, predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { calculateIreq, calculateRegionalIreq, calculateExtremityIreq, fahrenheitToCelsius, mphToMs } from '@/lib/biophysics/ireq';
import { scoreEnsemble, type GarmentWithProtection } from '@/lib/biophysics/scorer';
import { METABOLIC_RATES } from '@/lib/biophysics/constants';
import {
  getUserWardrobeGarmentIds,
  fetchGarmentsWithDetails,
  categorizeGarments,
  sortByInsulation,
  sortByWaterproofness,
  sortByBreathability,
  formatGarmentResponse,
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
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  const userId = request.headers.get('x-user-id');
  const body = await request.json();

  if (!body.weather?.temperature || body.weather?.wind_speed === undefined) {
    return NextResponse.json(
      { error: 'weather.temperature and weather.wind_speed are required' },
      { status: 400 }
    );
  }

  // Convert to metric
  const tempC = fahrenheitToCelsius(body.weather.temperature);
  const windMs = mphToMs(body.weather.wind_speed);

  // Calculate IREQ for both skiing and chairlift
  const ireqSkiing = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs + 5, // Add speed-induced wind
    relativeHumidity: body.weather.humidity ?? 50,
    metabolicRate: METABOLIC_RATES.alpine_skiing,
  });

  const ireqChairlift = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs,
    relativeHumidity: body.weather.humidity ?? 50,
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
      guidance: getAlpineGuidance(tempC, body.weather.precipitation),
    });
  }

  // Categorize and build ensemble
  const categorized = categorizeGarments(allGarments);
  const ensemble = buildAlpineEnsemble(
    categorized,
    targetCloMin,
    targetCloMax,
    body.weather.precipitation ?? false
  );

  // Score the ensemble
  const thermalGarments: GarmentWithProtection[] = ensemble.map((g) => {
    const baseProps = garmentToThermalProps(g, g.garment_thermal_properties ?? {});
    return {
      ...baseProps,
      category: g.category,
      windproofRating: g.garment_protection?.windproof_rating as GarmentWithProtection['windproofRating'],
      waterproofRating: g.garment_protection?.waterproof_rating as GarmentWithProtection['waterproofRating'],
      waterproofMm: g.garment_protection?.waterproof_mm,
    };
  });

  const ensembleProps = predictEnsembleThermal(thermalGarments);

  const score = scoreEnsemble(
    thermalGarments,
    {
      temperature: tempC,
      windSpeed: windMs,
      humidity: body.weather.humidity ?? 50,
      precipitation: body.weather.precipitation ?? false,
      precipitationType: body.weather.precipitation_type,
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

  // Calculate regional IREQ targets (use chairlift since that's the cold period)
  const regionalIreq = calculateRegionalIreq(ireqChairlift, 'alpine_skiing');
  const extremityIreq = calculateExtremityIreq(ireqChairlift, 'alpine_skiing', tempC, windMs);

  return NextResponse.json({
    conditions: {
      temperature: `${body.weather.temperature}°F`,
      wind_speed: `${body.weather.wind_speed} mph`,
      precipitation: body.weather.precipitation ?? false,
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
    guidance: getAlpineGuidance(tempC, body.weather.precipitation),
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

  // 1. Base layer (prioritize warmth for alpine)
  const sortedBases = sortByInsulation(categorized.baseLayers);

  if (sortedBases.length > 0) {
    // Pick base layer based on target clo
    const suitableBase = sortedBases.find(
      (b) => (b.garment_thermal_properties?.rcl_whole_body ?? 0) <= minClo * 0.3
    );
    const baseLayer = suitableBase ?? sortedBases[sortedBases.length - 1];
    ensemble.push(baseLayer);
    currentClo += baseLayer.garment_thermal_properties?.rcl_whole_body ?? 0;
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
