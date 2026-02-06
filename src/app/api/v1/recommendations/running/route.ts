import { NextRequest, NextResponse } from 'next/server';
import { calculateIreq, calculateRegionalIreq, calculateExtremityIreq } from '@/lib/biophysics/ireq';
import { METABOLIC_RATES } from '@/lib/biophysics/constants';
import { calculateActivityTargetRange, scaleIreqShapeToTargetRange } from '@/lib/biophysics/targets';
import {
  validateRecommendationRequest,
  sortByBreathability,
  getEnsembleClo,
  findBreathableGarment,
  selectHandwear,
  selectHeadwearByCategory,
  type GarmentRow,
  type CategorizedGarments,
} from '@/lib/recommendations/shared';
import { prepareRouteData, isPreparedData } from '@/lib/recommendations/route-handler';
import { buildResponseComponents } from '@/lib/recommendations/response-builder';

/**
 * POST /api/v1/recommendations/running
 * Get running clothing recommendations
 */
export async function POST(request: NextRequest) {
  const validated = await validateRecommendationRequest(request);
  if (validated instanceof NextResponse) return validated;

  const { weather, tempC, windMs } = validated;

  // Calculate IREQ for running (moderate intensity)
  const ireq = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs,
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate: METABOLIC_RATES.running_moderate,
  });

  const targetRange = calculateActivityTargetRange({
    activity: 'running',
    ireqMin: ireq.ireqMin,
    ireqNeutral: ireq.ireqNeutral,
    dleHours: ireq.dleHours,
    airTempC: tempC,
    windSpeedMs: windMs,
  });
  const targetMinClo = targetRange.min;
  const maxClo = targetRange.max;
  const minEvapPotential = 0.3;

  // Prepare common data
  const prepared = await prepareRouteData(validated, {});
  if (!isPreparedData(prepared)) {
    // Empty garments case
    return NextResponse.json({
      message: 'No suitable garments found in database',
      ireq: { min: ireq.ireqMin, neutral: ireq.ireqNeutral },
      recommendations: {
        target_clo_range: [targetMinClo, maxClo],
        min_evap_potential: minEvapPotential,
        guidance: getRunningGuidance(tempC, ireq),
      },
    });
  }

  const { categorized, userHandwear, userHeadwear } = prepared;
  const ensemble = buildRunningEnsemble(categorized, ireq, maxClo, minEvapPotential);
  const extremityIreq = scaleIreqShapeToTargetRange(
    calculateExtremityIreq(ireq, 'running', tempC, windMs),
    {
      ireqMin: ireq.ireqMin,
      ireqNeutral: ireq.ireqNeutral,
      targetMin: targetMinClo,
      targetMax: maxClo,
    }
  );

  const recommendedHandwear = selectHandwear(
    userHandwear,
    tempC,
    true,
    extremityIreq.neutral.hands
  );
  const recommendedHeadwear = selectHeadwearByCategory(userHeadwear, tempC, true);

  const response = buildResponseComponents(
    {
      ensemble,
      weather: {
        temperature: tempC,
        windSpeed: windMs,
        humidity: weather.humidity ?? 50,
        precipitation: weather.precipitation ?? false,
      },
      activity: {
        name: 'Running',
        metabolicRate: METABOLIC_RATES.running_moderate,
        hasStaticPeriods: false,
        windExposure: 'normal',
      },
      activityKey: 'running',
    },
    recommendedHandwear,
    recommendedHeadwear
  );

  const regionalIreq = scaleIreqShapeToTargetRange(calculateRegionalIreq(ireq, 'running'), {
    ireqMin: ireq.ireqMin,
    ireqNeutral: ireq.ireqNeutral,
    targetMin: targetMinClo,
    targetMax: maxClo,
  });
  return NextResponse.json({
    conditions: {
      temperature: `${weather.temperature}°F`,
      wind_speed: `${weather.wind_speed} mph`,
    },
    ireq: {
      min: ireq.ireqMin,
      neutral: ireq.ireqNeutral,
      dle_hours: ireq.dleHours,
      target_range: [targetMinClo, maxClo],
      regional: regionalIreq,
      extremity: extremityIreq,
    },
    recommendation: response.recommendation,
    warnings: response.warnings,
    guidance: getRunningGuidance(tempC, ireq),
  });
}

function buildRunningEnsemble(
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

  if (categorized.shells.length > 0 && (currentClo < ireq.ireqMin || ireq.ireqMin > 1.0)) {
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

function getRunningGuidance(tempC: number, ireq: { ireqMin: number; ireqNeutral: number }): string[] {
  const guidance: string[] = [];

  if (tempC > 0) {
    guidance.push('Mild conditions - focus on breathability');
  } else if (tempC > -10) {
    guidance.push('Cool conditions - light insulation + wind protection');
  } else {
    guidance.push('Cold conditions - add a light midlayer and wind shell');
  }

  if (ireq.ireqNeutral < 1.0) {
    guidance.push('Avoid over-layering to prevent overheating');
  }

  return guidance;
}
