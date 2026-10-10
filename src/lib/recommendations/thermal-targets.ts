/**
 * Thermal targets shared by every sport: metabolic rate, IREQ, the activity
 * target range widened by the CoWEDA validation buffer, the regional targets
 * that split that range across the body, and the extremity targets.
 */
import { calculateExtremityIreq, calculateIreq } from '@/lib/biophysics/ireq';
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
 * the CoWEDA validation buffer, and `windMs` is the phase's effective wind
 * speed. `extremityBaseline` is the IREQ the hands and head follow, when it
 * differs from `baseline`.
 */
export function phaseTargets(
  activity: ActivityType,
  baseline: IreqResult,
  metabolicRate: number,
  conditions: Conditions,
  windMs: number,
  extremityBaseline: IreqResult = baseline,
  exertion: ExertionLevel = 'moderate',
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
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const validationBuffer = policy ? {
    ...rawBuffer,
    wholeBody: round2(rawBuffer.wholeBody * exposure),
    coldRisk: round2(rawBuffer.coldRisk * exposure),
    extremity: round2(rawBuffer.extremity * exposure),
  } : rawBuffer;
  const adjustedRange = applyCowedaBufferToTargetRange(
    policy ? { min: round2(range.min * exposure), max: range.max } : range,
    validationBuffer,
  );
  const targetRange: [number, number] = [adjustedRange.min, adjustedRange.max];

  const regional = calculateRegionalTargets(activity, targetRange);
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
