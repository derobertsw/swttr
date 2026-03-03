import { NextRequest, NextResponse } from 'next/server';
import {
  calculateIreq,
  calculateRegionalIreq,
  calculateExtremityIreq,
  DLE_ESTIMATION_METHOD,
} from '@/lib/biophysics/ireq';
import { calculateActivityTargetRange, scaleIreqShapeToTargetRange } from '@/lib/biophysics/targets';
import { getMetabolicRateForActivity, parseExertionLevel } from '@/lib/biophysics/exertion';
import {
  applyBodySizeMetabolicAdjustment,
  parseBodyMetricsFromRequestBody,
} from '@/lib/biophysics/bodyMetrics';
import {
  COWEDA_VALIDATION_SOURCE,
  applyCowedaBufferToExtremityTargets,
  applyCowedaBufferToTargetRange,
  calculateCowedaValidationBuffer,
} from '@/lib/biophysics/coweda';
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
 * POST /api/v1/recommendations/biking
 * Get biking clothing recommendations
 */
export async function POST(request: NextRequest) {
  const validated = await validateRecommendationRequest(request);
  if (validated instanceof NextResponse) return validated;

  const { weather, tempC, windMs, body } = validated;
  const exertion = parseExertionLevel(body.exertion ?? body.intensity);
  const bodyMetrics = parseBodyMetricsFromRequestBody(body);
  const metabolicRate = applyBodySizeMetabolicAdjustment(
    getMetabolicRateForActivity('biking', exertion),
    bodyMetrics
  );

  const ireq = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs,
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate,
  });

  const targetRange = calculateActivityTargetRange({
    activity: 'biking',
    ireqMin: ireq.ireqMin,
    ireqNeutral: ireq.ireqNeutral,
    dleHours: ireq.dleHours,
    airTempC: tempC,
    windSpeedMs: windMs,
  });
  const validationBuffer = calculateCowedaValidationBuffer({
    airTempC: tempC,
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate,
  });
  const adjustedTargetRange = applyCowedaBufferToTargetRange(targetRange, validationBuffer);
  const targetMinClo = adjustedTargetRange.min;
  const maxClo = adjustedTargetRange.max;
  const minEvapPotential = 0.25;

  const prepared = await prepareRouteData(validated, {
    forceWardrobeOnly: body.use_wardrobe_only === true,
  });
  if (!isPreparedData(prepared)) {
    return NextResponse.json({
      message: 'No suitable garments found in database',
      ireq: { min: ireq.ireqMin, neutral: ireq.ireqNeutral },
      recommendations: {
        target_clo_range: [targetMinClo, maxClo],
        min_evap_potential: minEvapPotential,
        guidance: getBikingGuidance(tempC, ireq),
      },
    });
  }

  const { categorized, userHandwear, userHeadwear } = prepared;
  const ensemble = buildBikingEnsemble(categorized, ireq, maxClo, minEvapPotential);
  const regionalIreq = scaleIreqShapeToTargetRange(calculateRegionalIreq(ireq, 'biking'), {
    ireqMin: ireq.ireqMin,
    ireqNeutral: ireq.ireqNeutral,
    targetMin: targetMinClo,
    targetMax: maxClo,
  });
  const extremityIreq = applyCowedaBufferToExtremityTargets(
    calculateExtremityIreq(ireq, 'biking', tempC, windMs),
    validationBuffer
  );

  const recommendedHandwear = selectHandwear(
    userHandwear,
    tempC,
    true,
    extremityIreq.neutral.hands
  );
  const recommendedHeadwear = selectHeadwearByCategory(userHeadwear, tempC, true, { includeHelmet: false });

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
        name: 'Biking',
        metabolicRate,
        hasStaticPeriods: false,
        windExposure: 'exposed',
      },
      activityKey: 'biking',
      comfortContext: {
        targetRange: [targetMinClo, maxClo],
        regionalNeutralTarget: regionalIreq.neutral,
        extremityNeutralTarget: extremityIreq.neutral,
      },
    },
    recommendedHandwear,
    recommendedHeadwear
  );

  return NextResponse.json({
    conditions: {
      temperature: `${weather.temperature}°F`,
      wind_speed: `${weather.wind_speed} mph`,
      exertion,
    },
    ireq: {
      min: ireq.ireqMin,
      neutral: ireq.ireqNeutral,
      dle_hours: ireq.dleHours,
      dle_method: DLE_ESTIMATION_METHOD,
      target_range: [targetMinClo, maxClo],
      regional: regionalIreq,
      extremity: extremityIreq,
      validation_buffer_clo: {
        whole_body: validationBuffer.wholeBody,
        cold_risk: validationBuffer.coldRisk,
        extremity: validationBuffer.extremity,
        context: validationBuffer.context,
      },
      validation_source: COWEDA_VALIDATION_SOURCE,
    },
    recommendation: response.recommendation,
    warnings: response.warnings,
    guidance: getBikingGuidance(tempC, ireq),
  });
}

export function buildBikingEnsemble(
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
    const legsBase = suitableBase ?? sortedLegsBases[0];
    if (!ensemble.some((g) => g.id === legsBase.id)) {
      ensemble.push(legsBase);
    }
  }

  let currentClo = getEnsembleClo(ensemble);

  if (currentClo < ireq.ireqMin && categorized.midLayers.length > 0) {
    const torsoMids = sortByBreathability(categorized.midLayers.filter((g) => g.covers_torso));
    for (const mid of torsoMids) {
      const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + midClo <= maxClo) {
        ensemble.push(mid);
        currentClo += midClo;
        break;
      }
    }

    const legsMids = sortByBreathability(categorized.midLayers.filter((g) => g.covers_legs));
    for (const mid of legsMids) {
      if (ensemble.some((g) => g.id === mid.id)) continue;
      const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + midClo <= maxClo) {
        ensemble.push(mid);
        currentClo += midClo;
        break;
      }
    }
  }

  if (categorized.shells.length > 0) {
    const torsoShells = sortByBreathability(categorized.shells.filter((s) => s.covers_torso));
    for (const shell of torsoShells) {
      const shellClo = shell.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + shellClo <= maxClo) {
        ensemble.push(shell);
        currentClo += shellClo;
        break;
      }
    }

    const legsShells = sortByBreathability(categorized.shells.filter((s) => s.covers_legs));
    for (const shell of legsShells) {
      if (ensemble.some((g) => g.id === shell.id)) continue;
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
