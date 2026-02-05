import { NextRequest, NextResponse } from 'next/server';
import { calculateIreq } from '@/lib/biophysics/ireq';
import { METABOLIC_RATES, getAlpineCloTargets } from '@/lib/biophysics/constants';
import {
  validateRecommendationRequest,
  sortByInsulation,
  sortByWaterproofness,
  sortByBreathability,
  formatGarmentResponse,
  selectHandwear,
  selectHeadwearByCategory,
  type GarmentRow,
  type CategorizedGarments,
} from '@/lib/recommendations/shared';
import { prepareRouteData, isPreparedData } from '@/lib/recommendations/route-handler';
import { buildResponseComponents } from '@/lib/recommendations/response-builder';

/**
 * POST /api/v1/recommendations/alpine
 * Get alpine/resort skiing clothing recommendations
 *
 * Alpine skiing accounts for chairlift time (static periods) with dual metabolic rates
 */
export async function POST(request: NextRequest) {
  const validated = await validateRecommendationRequest(request);
  if (validated instanceof NextResponse) return validated;

  const { weather, tempC, windMs } = validated;

  // Calculate IREQ for both skiing and chairlift
  const ireqSkiing = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs + 5,
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate: METABOLIC_RATES.alpine_skiing,
  });

  const ireqChairlift = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs,
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate: METABOLIC_RATES.chairlift,
  });

  const targetCloMin = ireqSkiing.ireqMin * 0.6 + ireqChairlift.ireqMin * 0.4;
  const targetCloMax = ireqChairlift.ireqNeutral;

  const prepared = await prepareRouteData(validated, {
    activityFilter: { field: 'alpine_skiing_score', minScore: 5 },
  });
  if (!isPreparedData(prepared)) {
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

  const { categorized, userHandwear, userHeadwear } = prepared;
  const ensemble = buildAlpineEnsemble(
    categorized,
    targetCloMin,
    targetCloMax,
    weather.precipitation ?? false
  );

  const recommendedHandwear = selectHandwear(userHandwear, tempC, false);
  const recommendedHeadwear = selectHeadwearByCategory(userHeadwear, tempC, false);

  const response = buildResponseComponents(
    {
      ensemble,
      weather: {
        temperature: tempC,
        windSpeed: windMs,
        humidity: weather.humidity ?? 50,
        precipitation: weather.precipitation ?? false,
        precipitationType: weather.precipitation_type,
      },
      activity: {
        name: 'Alpine Skiing',
        metabolicRate: METABOLIC_RATES.alpine_skiing,
        hasStaticPeriods: true,
        staticMetabolicRate: METABOLIC_RATES.chairlift,
        windExposure: 'exposed',
      },
      activityKey: 'alpine_skiing',
    },
    recommendedHandwear,
    recommendedHeadwear
  );

  // Alpine uses custom garment formatting (includes rcl override)
  const alpineGarments = ensemble.map((g) => ({
    ...formatGarmentResponse(g),
    rcl: g.garment_thermal_properties?.rcl_whole_body,
  }));

  const alpineTargets = getAlpineCloTargets(tempC);

  const regionalIreq = {
    min: {
      torso: alpineTargets.torso.min,
      arms: alpineTargets.torso.min * 0.85,
      legs: alpineTargets.legs.min,
    },
    neutral: {
      torso: alpineTargets.torso.neutral,
      arms: alpineTargets.torso.neutral * 0.85,
      legs: alpineTargets.legs.neutral,
    },
  };

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
      ...response.recommendation,
      garments: alpineGarments,
    },
    warnings: response.warnings,
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

  const torsoBaseLayers = categorized.baseLayers.filter((g) => g.covers_torso);
  const legsBaseLayers = categorized.baseLayers.filter((g) => g.covers_legs);

  const sortedTorsoBases = sortByInsulation(torsoBaseLayers);
  if (sortedTorsoBases.length > 0) {
    const suitableBase = sortedTorsoBases.find(
      (b) => (b.garment_thermal_properties?.rcl_whole_body ?? 0) <= minClo * 0.3
    );
    const baseLayer = suitableBase ?? sortedTorsoBases[sortedTorsoBases.length - 1];
    ensemble.push(baseLayer);
    currentClo += baseLayer.garment_thermal_properties?.rcl_whole_body ?? 0;
  }

  const sortedLegsBases = sortByInsulation(legsBaseLayers);
  if (sortedLegsBases.length > 0) {
    const suitableBase = sortedLegsBases.find(
      (b) => (b.garment_thermal_properties?.rcl_whole_body ?? 0) <= minClo * 0.3
    );
    const baseLayer = suitableBase ?? sortedLegsBases[sortedLegsBases.length - 1];
    if (!ensemble.some((g) => g.id === baseLayer.id)) {
      ensemble.push(baseLayer);
      currentClo += baseLayer.garment_thermal_properties?.rcl_whole_body ?? 0;
    }
  }

  const allMids = sortByInsulation([...categorized.midLayers, ...categorized.insulation], false);

  const addMidIfFits = (mid: GarmentRow | undefined) => {
    if (!mid) return;
    if (ensemble.some((g) => g.id === mid.id)) return;
    const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
    if (currentClo + midClo <= maxClo && currentClo < minClo) {
      ensemble.push(mid);
      currentClo += midClo;
    }
  };

  addMidIfFits(allMids.find((m) => m.covers_torso));
  addMidIfFits(allMids.find((m) => m.covers_legs));

  for (const mid of allMids) {
    if (currentClo >= minClo) break;
    addMidIfFits(mid);
  }

  const hardShells = categorized.shells.filter(s => s.category === 'hard_shell');
  const otherShells = categorized.shells.filter(s => s.category !== 'hard_shell');

  const sortedHardShells = sortByWaterproofness(hardShells);
  const sortedOtherShells = precipitation
    ? sortByWaterproofness(otherShells)
    : sortByBreathability(otherShells);

  const sortedShells = [...sortedHardShells, ...sortedOtherShells];

  if (sortedShells.length > 0) {
    const torsoShell = sortedShells.find((s) => s.covers_torso) ?? sortedShells[0];
    if (torsoShell) {
      ensemble.push(torsoShell);
      currentClo += torsoShell.garment_thermal_properties?.rcl_whole_body ?? 0;
    }

    const legsShell = sortedShells.find(
      (s) => s.covers_legs && s.id !== torsoShell?.id
    );
    if (legsShell) {
      ensemble.push(legsShell);
      currentClo += legsShell.garment_thermal_properties?.rcl_whole_body ?? 0;
    }
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
