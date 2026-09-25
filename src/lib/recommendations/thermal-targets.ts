/**
 * Thermal targets shared by every sport: metabolic rate, IREQ, the activity
 * target range widened by the CoWEDA validation buffer, and the regional and
 * extremity targets scaled to that range.
 */
import {
  calculateExtremityIreq,
  calculateIreq,
  calculateRegionalIreq,
} from '@/lib/biophysics/ireq';
import { calculateActivityTargetRange, scaleIreqShapeToTargetRange } from '@/lib/biophysics/targets';
import { getMetabolicRateForActivity, type ExertionLevel } from '@/lib/biophysics/exertion';
import { applyBodySizeMetabolicAdjustment } from '@/lib/biophysics/bodyMetrics';
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
}

/** Metabolic rate for an activity at the given exertion, scaled for body size. */
export function metabolicRateFor(
  activity: ActivityType,
  exertion: ExertionLevel,
  bodyMetrics: UserBodyMetrics
): number {
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
 * speed.
 */
export function phaseTargets(
  activity: ActivityType,
  baseline: IreqResult,
  metabolicRate: number,
  conditions: Conditions,
  windMs: number
) {
  const range = calculateActivityTargetRange({
    activity,
    ireqMin: baseline.ireqMin,
    ireqNeutral: baseline.ireqNeutral,
    dleHours: baseline.dleHours,
    airTempC: conditions.tempC,
    windSpeedMs: windMs,
  });
  const validationBuffer = calculateCowedaValidationBuffer({
    airTempC: conditions.tempC,
    relativeHumidity: conditions.humidity,
    metabolicRate,
  });
  const adjustedRange = applyCowedaBufferToTargetRange(range, validationBuffer);
  const targetRange: [number, number] = [adjustedRange.min, adjustedRange.max];

  const regional = scaleIreqShapeToTargetRange(calculateRegionalIreq(baseline, activity), {
    ireqMin: baseline.ireqMin,
    ireqNeutral: baseline.ireqNeutral,
    targetMin: targetRange[0],
    targetMax: targetRange[1],
  });
  const extremity = applyCowedaBufferToExtremityTargets(
    calculateExtremityIreq(baseline, activity, conditions.tempC, windMs),
    validationBuffer
  );

  return { targetRange, validationBuffer, regional, extremity };
}

export type PhaseTargets = ReturnType<typeof phaseTargets>;
