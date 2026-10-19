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
import { isCalibratedActivity, SUSTAINED_ACTIVITY_METS, sustainedSportPolicy } from '@/lib/biophysics/sport-policy';
import {
  applyCowedaBufferToExtremityTargets,
  applyCowedaBufferToTargetRange,
  calculateCowedaValidationBuffer,
} from '@/lib/biophysics/coweda';
import type { ActivityType } from '@/lib/biophysics/constants';
import type { IreqResult } from '@/types/garments';
import type { UserBodyMetrics } from '@/types/preferences';

interface Conditions {
  tempC: number;
  humidity: number;
  precipitation?: boolean;
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
    dleHours: ireq.dleHours,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
) {
  const policy = isCalibratedActivity(activity)
    ? sustainedSportPolicy(activity, exertion, metabolicRate, conditions, windMs)
    : undefined;
  const exposure = policy?.coldExposureFactor ?? 1;
  const range = calculateActivityTargetRange({
    activity,
    ireqMin: baseline.ireqMin,
    ireqNeutral: baseline.ireqNeutral,
    dleHours: baseline.dleHours,
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
  const targetRange: [number, number] = [toBasic(resultantRange[0]), toBasic(resultantRange[1])];
  const convertRegions = (values: typeof resultantRegional.min, reference: number) => ({
    torso: toBasic(values.torso, reference),
    arms: toBasic(values.arms, reference),
    legs: toBasic(values.legs, reference),
  });
  const regional = {
    min: convertRegions(resultantRegional.min, resultantRange[0]),
    neutral: convertRegions(resultantRegional.neutral, resultantRange[1]),
  };
  const rawExtremity = calculateExtremityIreq(extremityBaseline, activity, conditions.tempC, windMs);
  const taperedExtremity = policy ? {
    min: { hands: round2(rawExtremity.min.hands * exposure), head: round2(rawExtremity.min.head * exposure) },
    neutral: { hands: round2(rawExtremity.neutral.hands * exposure), head: round2(rawExtremity.neutral.head * exposure) },
  } : rawExtremity;
  const extremity = applyCowedaBufferToExtremityTargets(
    taperedExtremity,
    validationBuffer
  );

  return { targetRange, validationBuffer, regional, extremity, ...(policy ? { policy } : {}) };
}

export type PhaseTargets = ReturnType<typeof phaseTargets>;
