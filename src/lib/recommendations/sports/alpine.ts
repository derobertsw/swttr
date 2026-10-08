/**
 * Alpine (resort) skiing: insulation first, sized for the cold chairlift
 * ride as well as the descent.
 */
import { METABOLIC_RATES } from '@/lib/biophysics/constants';
import { COWEDA_VALIDATION_SOURCE } from '@/lib/biophysics/coweda';
import { DLE_ESTIMATION_METHOD } from '@/lib/biophysics/ireq';
import { applyBodySizeMetabolicAdjustment } from '@/lib/biophysics/bodyMetrics';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import type { IreqResult } from '@/types/garments';
import type { SportRecommender } from '../handler';
import { metabolicRateFor, phaseIreq, phaseTargets, type PhaseTargets } from '../thermal-targets';
import { buildAlpineEnsemble, alpineRegionalCapacity } from './alpine-ensemble';
import { selectHandwear, selectHeadwearByCategory } from '../extremities';
import { buildScoredRecommendation } from '../response-builder';
import {
  formatConditions,
  formatIreqPhase,
  formatValidationBuffer,
  ensembleToThermalGarments,
} from '../formatting';

/** Extra relative wind from skiing speed, in m/s. */
const SKIING_SPEED_WIND_MS = 5;
/** Weights for blending the skiing and chairlift phases. */
const SKIING_WEIGHT = 0.6;
const CHAIRLIFT_WEIGHT = 0.4;
/** Warn when a region falls this far below its minimum, in clo. */
const REGIONAL_WARNING_CLO = 0.12;

interface AlpineTargets extends PhaseTargets {
  skiingRate: number;
  chairliftRate: number;
  skiing: IreqResult;
  chairlift: IreqResult;
}

export const alpine: SportRecommender<AlpineTargets> = {
  catalog: { minScore: { field: 'alpine_skiing_score', minScore: 5 } },

  computeTargets({ tempC, windMs, humidity, exertion, bodyMetrics }) {
    const conditions = { tempC, humidity };
    const skiingRate = metabolicRateFor('alpine_skiing', exertion, bodyMetrics);
    const chairliftRate = applyBodySizeMetabolicAdjustment(METABOLIC_RATES.chairlift, bodyMetrics);
    const skiing = phaseIreq(conditions, windMs + SKIING_SPEED_WIND_MS, skiingRate);
    const chairlift = phaseIreq(conditions, windMs, chairliftRate);

    // The minimum blends both phases; comfort and exposure limits follow the
    // static chairlift ride. Hands and head follow the skiing phase: their
    // alpine multipliers already add the chairlift and wind exposure.
    const baseline: IreqResult = {
      ireqMin: skiing.ireqMin * SKIING_WEIGHT + chairlift.ireqMin * CHAIRLIFT_WEIGHT,
      ireqNeutral: chairlift.ireqNeutral,
      dleHours: chairlift.dleHours,
    };
    const blendedRate = (skiingRate * SKIING_WEIGHT) + (chairliftRate * CHAIRLIFT_WEIGHT);

    return {
      skiingRate,
      chairliftRate,
      skiing,
      chairlift,
      ...phaseTargets('alpine_skiing', baseline, blendedRate, conditions, windMs, skiing),
    };
  },

  emptyResponse({ tempC, weather }, targets) {
    return {
      ireq: {
        skiing: formatIreqPhase(targets.skiing),
        chairlift: formatIreqPhase(targets.chairlift),
        dle_hours: targets.chairlift.dleHours,
        dle_method: DLE_ESTIMATION_METHOD,
        target_range: targets.targetRange,
        validation_buffer_clo: formatValidationBuffer(targets.validationBuffer),
        validation_source: COWEDA_VALIDATION_SOURCE,
      },
      guidance: getAlpineGuidance(tempC, weather.precipitation),
    };
  },

  recommend(request, targets, pool) {
    const { tempC, windMs, humidity, weather } = request;
    const [targetCloMin, targetCloMax] = targets.targetRange;

    const ensemble = buildAlpineEnsemble(
      pool.categorized,
      targets.regional,
      request.precipitation
    );
    const handwear = selectHandwear(pool.handwear, tempC, false, targets.extremity.neutral.hands);
    const headwear = selectHeadwearByCategory(pool.headwear, tempC, false, { includeHelmet: true });

    const { recommendation, warnings } = buildScoredRecommendation(
      {
        ensemble,
        weather: {
          temperature: tempC,
          windSpeed: windMs,
          humidity,
          precipitation: request.precipitation,
          precipitationType: weather.precipitation_type,
        },
        activity: {
          name: 'Alpine Skiing',
          metabolicRate: targets.skiingRate,
          hasStaticPeriods: true,
          staticMetabolicRate: targets.chairliftRate,
          windExposure: 'exposed',
        },
        activityKey: 'alpine_skiing',
        comfortContext: {
          targetRange: targets.targetRange,
          regionalMinTarget: targets.regional.min,
          extremityMinTarget: targets.extremity.min,
        },
      },
      handwear,
      headwear
    );

    // Regional minima split the whole-body band derived from the blended
    // 60/40 skiing/chairlift baseline. Warn only about a shortfall the
    // available wearable layers could meaningfully reduce, respecting
    // coverage and rain protection; layer limits can make targets unreachable.
    const regionalClo = predictEnsembleThermal(ensembleToThermalGarments(ensemble)).rcl;
    let capacity: PhaseTargets['regional']['min'] | undefined;
    for (const [region, key] of [['torso', 'torso'], ['arms', 'arm'], ['legs', 'leg']] as const) {
      const minimum = targets.regional.min[region];
      const actual = regionalClo[key];
      if (minimum - actual > REGIONAL_WARNING_CLO) {
        capacity ??= alpineRegionalCapacity(pool.categorized, ensemble, request.precipitation);
        const attainableMinimum = Math.min(minimum, capacity[region]);
        if (attainableMinimum - actual > REGIONAL_WARNING_CLO) {
          warnings.push(`Insufficient ${region} insulation: ${actual.toFixed(1)} clo vs ${minimum.toFixed(1)} clo required for alpine conditions`);
        }
      }
    }

    return {
      conditions: {
        ...formatConditions(weather),
        exertion: request.exertion,
        precipitation: request.precipitation,
      },
      ireq: {
        skiing: formatIreqPhase(targets.skiing),
        chairlift: formatIreqPhase(targets.chairlift),
        dle_hours: targets.chairlift.dleHours,
        dle_method: DLE_ESTIMATION_METHOD,
        target_range: [Math.round(targetCloMin * 100) / 100, Math.round(targetCloMax * 100) / 100],
        regional: targets.regional,
        extremity: targets.extremity,
        validation_buffer_clo: formatValidationBuffer(targets.validationBuffer),
        validation_source: COWEDA_VALIDATION_SOURCE,
      },
      recommendation,
      warnings,
      guidance: getAlpineGuidance(tempC, weather.precipitation),
    };
  },
};

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
