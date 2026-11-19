/**
 * Thermal targets shared by every sport: metabolic rate, IREQ, the activity
 * target range widened by CoWEDA-inspired heuristic margins, the regional targets
 * that split that range across the body, and the extremity targets.
 */
import {
  calculateExtremityIreq,
  calculateIreq,
  requiredBasicInsulation,
  walkingSpeedFromMetabolicRate,
  type DynamicExposure,
} from '@/lib/biophysics/ireq';
import { calculateActivityTargetRange, calculateRegionalTargets } from '@/lib/biophysics/targets';
import { getMetabolicRateForActivity, type ExertionLevel } from '@/lib/biophysics/exertion';
import { applyBodySizeMetabolicAdjustment, metabolicHeatFluxFromMet } from '@/lib/biophysics/bodyMetrics';
import {
  isCalibratedActivity,
  POLE_GRIP_MAX_CLO,
  preferenceBand,
  SUSTAINED_ACTIVITY_METS,
  sustainedSportPolicy,
  type PolicyPreference,
} from '@/lib/biophysics/sport-policy';
import {
  applyCowedaBufferToExtremityTargets,
  applyCowedaBufferToTargetRange,
  calculateCowedaValidationBuffer,
} from '@/lib/biophysics/coweda';
import type { ActivityType } from '@/lib/biophysics/constants';
import type { IreqResult } from '@/types/garments';
import type { ExposureConditions } from '@/types/biophysics';
import type { TemperatureSensitivity, UserBodyMetrics } from '@/types/preferences';
import type { XCPhaseContext } from '@/lib/biophysics/xc-policy';

interface Conditions {
  tempC: number;
  humidity: number;
  precipitation?: boolean;
  xc?: XCPhaseContext;
}

/** Metabolic rate for an activity at the given exertion, scaled for body size. */
export function metabolicRateFor(
  activity: ActivityType,
  exertion: ExertionLevel,
  bodyMetrics: UserBodyMetrics
): number {
  if (isCalibratedActivity(activity)) {
    return metabolicHeatFluxFromMet(SUSTAINED_ACTIVITY_METS[activity][exertion], bodyMetrics);
  }
  return applyBodySizeMetabolicAdjustment(
    getMetabolicRateForActivity(activity, exertion),
    bodyMetrics
  );
}

/**
 * Wind and motion for one activity phase: its relative air speed, the ISO
 * walking speed of its metabolic rate (none when seated), and the air
 * permeability of the outer fabric the phase is dressed in.
 */
export function phaseExposure(windMs: number, metabolicRate: number, airPermeability: number, seated = false): DynamicExposure {
  return {
    relativeAirSpeedMs: windMs,
    walkingSpeedMs: seated ? 0 : walkingSpeedFromMetabolicRate(metabolicRate),
    airPermeability,
  };
}

/** An IREQ result in the basic clo garments are rated in. */
export function basicIreq(ireq: IreqResult, exposure: DynamicExposure): IreqResult {
  return {
    ireqMin: round2(requiredBasicInsulation(ireq.ireqMin, exposure)),
    ireqNeutral: round2(requiredBasicInsulation(ireq.ireqNeutral, exposure)),
    heuristicExposureHours: ireq.heuristicExposureHours,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Each part's [min, neutral] band narrowed for a preference (see `preferenceBand`). */
function preferenceBands<Part extends string>(
  bands: { min: Record<Part, number>; neutral: Record<Part, number> },
  preference: PolicyPreference | undefined,
): { min: Record<Part, number>; neutral: Record<Part, number> } {
  const min = { ...bands.min };
  const neutral = { ...bands.neutral };
  for (const part of Object.keys(bands.min) as Part[]) {
    [min[part], neutral[part]] = preferenceBand(bands.min[part], bands.neutral[part], preference);
  }
  return { min, neutral };
}

/** IREQ for one activity phase at its effective wind speed. */
export function phaseIreq(conditions: Conditions, windMs: number, metabolicRate: number): IreqResult {
  return calculateIreq({
    airTemp: conditions.tempC,
    windSpeed: windMs,
    relativeHumidity: conditions.humidity,
    metabolicRate,
  });
}

/**
 * Target clo range and regional/extremity targets for one activity phase.
 *
 * `baseline` is the IREQ the phase is designed against, `metabolicRate` sizes
 * the CoWEDA-inspired margin, and `windMs` is the phase's effective wind
 * speed. `extremityBaseline` is the IREQ the hands and head follow, when it
 * differs from `baseline`. With `dynamicExposure`, the whole-body and regional
 * bands are converted to basic clo (`requiredBasicInsulation`); without it
 * they stay resultant, like IREQ. Hand and head targets stay resultant either
 * way: their heuristic multipliers already include a wind factor.
 * `dynamicExposure` must use the relative air speed and metabolic rate
 * `baseline` was computed at: the returned `exposureConditions` reuse them
 * for the selected outfit's exposure limit.
 *
 * `sensitivity` (Run Warm/Run Cold, #251) applies only through the sustained
 * running/XC policy: it narrows every final band from one side by the
 * policy's share (`preferenceBand`). Raw IREQ, weather, buffers and
 * protection needs stay as calculated; other sports ignore it.
 */
export function phaseTargets(
  activity: ActivityType,
  baseline: IreqResult,
  metabolicRate: number,
  conditions: Conditions,
  windMs: number,
  extremityBaseline: IreqResult = baseline,
  exertion: ExertionLevel = 'moderate',
  dynamicExposure?: DynamicExposure,
  sensitivity: TemperatureSensitivity = 'neutral',
) {
  const policy = isCalibratedActivity(activity)
    ? sustainedSportPolicy(activity, exertion, metabolicRate, conditions, windMs, sensitivity)
    : undefined;
  const exposure = policy?.coldExposureFactor ?? 1;
  const range = calculateActivityTargetRange({
    activity,
    ireqMin: baseline.ireqMin,
    ireqNeutral: baseline.ireqNeutral,
    heuristicExposureHours: baseline.heuristicExposureHours,
    airTempC: conditions.tempC,
    windSpeedMs: windMs,
  });
  const rawBuffer = calculateCowedaValidationBuffer({
    airTempC: conditions.tempC,
    relativeHumidity: conditions.humidity,
    metabolicRate,
  });
  const validationBuffer = policy ? {
    ...rawBuffer,
    wholeBody: round2(rawBuffer.wholeBody * exposure),
    coldRisk: round2(rawBuffer.coldRisk * exposure),
    extremity: round2(rawBuffer.extremity * exposure),
  } : rawBuffer;
  // Taper only the activity allowance above heat balance. The calculated
  // minimum can remain positive in mild air for easy efforts and smaller
  // bodies. Local extremity targets below are wholly heuristic
  // (IREQ supplies no local heat balance), so their full bands still taper.
  const minimum = policy
    ? round2(baseline.ireqMin + Math.max(0, range.min - baseline.ireqMin) * exposure)
    : range.min;
  const adjustedRange = applyCowedaBufferToTargetRange(
    { min: minimum, max: range.max },
    validationBuffer,
  );
  const resultantRange: [number, number] = [adjustedRange.min, adjustedRange.max];
  const resultantRegional = calculateRegionalTargets(activity, resultantRange);
  // Every margin above lives in resultant clo, like IREQ. Convert the final
  // bands to the basic (manikin) clo garments are rated in; regions share the
  // whole-body clothing area factor, so they still average back to it.
  const toBasic = (clo: number, fclReference = clo) => (dynamicExposure
    ? round2(requiredBasicInsulation(clo, dynamicExposure, fclReference))
    : clo);
  const standardRange: [number, number] = [toBasic(resultantRange[0]), toBasic(resultantRange[1])];
  const convertRegions = (values: typeof resultantRegional.min, reference: number) => ({
    torso: toBasic(values.torso, reference),
    arms: toBasic(values.arms, reference),
    legs: toBasic(values.legs, reference),
  });
  const standardRegional = {
    min: convertRegions(resultantRegional.min, resultantRange[0]),
    neutral: convertRegions(resultantRegional.neutral, resultantRange[1]),
  };
  const rawExtremity = calculateExtremityIreq(extremityBaseline, activity, conditions.tempC, windMs);
  const taperedExtremity = policy ? {
    min: { hands: round2(rawExtremity.min.hands * exposure), head: round2(rawExtremity.min.head * exposure) },
    neutral: { hands: round2(rawExtremity.neutral.hands * exposure), head: round2(rawExtremity.neutral.head * exposure) },
  } : rawExtremity;
  const standardExtremity = applyCowedaBufferToExtremityTargets(
    taperedExtremity,
    validationBuffer
  );

  // Run Warm/Run Cold narrows each final band from one side; with no
  // preference these are the standard bands unchanged. Hand and head upper
  // limits follow the narrowed neutral, but never drop below the functional
  // pole-grip glove allowance.
  const preference = policy?.preference;
  const targetRange = preferenceBand(standardRange[0], standardRange[1], preference);
  const regional = preferenceBands(standardRegional, preference);
  const extremity = preferenceBands(standardExtremity, preference);
  const finalPolicy = preference ? {
    ...policy,
    preference: {
      ...preference,
      targetsChanged: JSON.stringify([targetRange, regional, extremity])
        !== JSON.stringify([standardRange, standardRegional, standardExtremity]),
    },
  } : policy;

  // The phase's heat-balance conditions, for the selected outfit's exposure
  // limit (`calculateExposureLimit`): the same inputs as its IREQ and its
  // basic-clo conversion.
  const exposureConditions: ExposureConditions | undefined = dynamicExposure && {
    airTempC: conditions.tempC,
    relativeHumidity: conditions.humidity,
    metabolicRate,
    ...dynamicExposure,
  };

  return {
    targetRange, validationBuffer, regional,
    ...(exposureConditions ? { exposureConditions } : {}),
    extremity: {
      ...extremity,
      ...(policy ? { max: {
        hands: Math.max(extremity.neutral.hands, policy.protection.poleGrip ? POLE_GRIP_MAX_CLO : 0),
        head: extremity.neutral.head,
      } } : {}),
    },
    ...(finalPolicy ? { policy: finalPolicy } : {}),
  };
}

export type PhaseTargets = ReturnType<typeof phaseTargets>;
