import type { ThermalDecision } from '@/types/biophysics';

/** Legacy significant-mismatch allowance; never a comfortable-band extension. */
const OVERHEAT_BUFFER_CLO = 0.3;
const WHOLE_BODY_WARMTH_EPSILON = 0.01;
export const THERMAL_DISPLAY_CLO_EPSILON = 0.05;
/**
 * Insulation of the air layer around the clothing, in clo. ISO 9920 puts it
 * at about 0.7 clo in still air; wind and movement thin it, so this uses a
 * light-breeze value.
 */
const SURFACE_AIR_CLO = 0.5;

type ThermalRiskType = "comfortable" | "cold" | "overheat";
type ThermalRiskSeverity = "moderate" | "high";

export interface RegionalCloValues {
  torso: number;
  arms: number;
  legs: number;
}

export interface ExtremityCloValues {
  hands: number;
  head: number;
}

/** A body part's insulation and the minimum it needs, in clo. */
export interface BodyPartClo {
  name?: string;
  clo: number;
  minimum: number;
  /** Opt-in local upper limit; legacy sport policies omit it. */
  maximum?: number;
}

interface ThermalComfortDecision extends ThermalDecision {
  riskType: ThermalRiskType;
  severity: ThermalRiskSeverity;
  delta: number;
}

interface ThermalComfortInput {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
  /** Torso, arms, legs, hands and head, each with its minimum target. */
  bodyParts?: BodyPartClo[];
  overheatBufferClo?: number;
  breathability?: { evapPotential: number; target: number };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getRangeWidth(targetRange: [number, number]): number {
  return Math.max(0.2, targetRange[1] - targetRange[0]);
}

function getSeverity(delta: number, targetRange: [number, number]): ThermalRiskSeverity {
  return delta <= getRangeWidth(targetRange) ? "moderate" : "high";
}

/** Pair each region's or extremity's clo with its minimum target. */
export function withMinimums<K extends string>(
  clo: Record<K, number> | undefined,
  minimum: Record<K, number> | undefined,
  maximum?: Partial<Record<K, number>>,
): BodyPartClo[] {
  if (!clo || !minimum) return [];
  return (Object.keys(minimum) as K[]).map((part) => ({
    clo: clo[part], minimum: minimum[part], ...(maximum ? { maximum: maximum[part] } : {}),
  }));
}

/**
 * Heat escapes through the clothing and the air layer around it, at a rate
 * inversely proportional to their combined insulation (ISO 11079). This is
 * the share of that combined insulation a shortfall leaves missing.
 */
function shortfallShare(deficit: number, minimum: number): number {
  return deficit / (Math.max(0, minimum) + SURFACE_AIR_CLO);
}

/**
 * The largest shortfall among body parts more than the display tolerance
 * below their minimum: in clo, and as a share of that part's own needs.
 */
function localShortfall(bodyParts: BodyPartClo[] = []): { deficit: number; share: number } {
  let deficit = 0;
  let share = 0;
  for (const part of bodyParts) {
    const partDeficit = part.minimum - part.clo;
    if (partDeficit <= THERMAL_DISPLAY_CLO_EPSILON) continue;
    deficit = Math.max(deficit, partDeficit);
    share = Math.max(share, shortfallShare(partDeficit, part.minimum));
  }
  return { deficit, share };
}

/** Shared local band assessment for accessory selection and manual edits. */
export function localThermalStatus(clo: number, minimum: number, maximum: number): 'under' | 'over' | 'in_range' {
  if (minimum - clo > THERMAL_DISPLAY_CLO_EPSILON) return 'under';
  if (clo - maximum > THERMAL_DISPLAY_CLO_EPSILON) return 'over';
  return 'in_range';
}

/**
 * Classify thermal fit against the phase bands, including local excess and
 * deficits. Significant mismatch warnings are separate from small comfort
 * adjustments. Legacy riskType conveys mismatch direction, not medical risk.
 */
export function evaluateThermalComfort(input: ThermalComfortInput): ThermalComfortDecision | null {
  const {
    totalClo,
    targetRange,
    bodyParts,
    overheatBufferClo = OVERHEAT_BUFFER_CLO,
  } = input;

  if (totalClo === undefined || !Number.isFinite(totalClo) || totalClo < 0 || !targetRange
    || targetRange.some(value => !Number.isFinite(value) || value < 0)
    || targetRange[0] > targetRange[1]
    || bodyParts?.some(part => !Number.isFinite(part.clo) || part.clo < 0 || !Number.isFinite(part.minimum)
      || (part.maximum !== undefined && !Number.isFinite(part.maximum)))) return null;

  const [targetMin, targetMax] = targetRange;
  const localDeficit = localShortfall(bodyParts).deficit;
  const wholeBodyDeficit = targetMin - totalClo;
  const wholeBodyExcess = totalClo - targetMax;
  const localExcess = Math.max(0, ...(bodyParts ?? []).map(part =>
    part.maximum !== undefined && part.clo - part.maximum > THERMAL_DISPLAY_CLO_EPSILON
      ? part.clo - part.maximum : 0));

  const cold = wholeBodyDeficit > THERMAL_DISPLAY_CLO_EPSILON || localDeficit > 0;
  const warm = wholeBodyExcess > WHOLE_BODY_WARMTH_EPSILON || localExcess > 0;
  const reasons: string[] = [];
  if (wholeBodyDeficit > THERMAL_DISPLAY_CLO_EPSILON) reasons.push('Whole-body insulation is below the estimated target band.');
  if (wholeBodyExcess > WHOLE_BODY_WARMTH_EPSILON) reasons.push('Whole-body insulation is above the estimated target band.');
  for (const part of bodyParts ?? []) {
    if (part.minimum - part.clo > THERMAL_DISPLAY_CLO_EPSILON) reasons.push(`${part.name ?? 'A body area'} needs more insulation; extra warmth elsewhere does not cover this gap.`);
    if (part.maximum !== undefined && part.clo - part.maximum > THERMAL_DISPLAY_CLO_EPSILON) reasons.push(`${part.name ?? 'A body area'} has more insulation than its estimated upper target.`);
  }
  const status = cold && warm ? 'mixed' : cold ? 'cooler' : warm ? 'warmer' : 'near_target';
  const summary = { mixed: 'Uneven warmth', cooler: 'Cooler than recommended', warmer: 'Warmer than recommended', near_target: 'Likely comfortable' }[status];
  const warnings: string[] = [];
  if (Math.max(wholeBodyDeficit, localDeficit) > getRangeWidth(targetRange)) warnings.push('Significant insulation shortfall: improve coverage of the areas below target.');
  if (Math.max(wholeBodyExcess, localExcess) > Math.max(overheatBufferClo, getRangeWidth(targetRange))) warnings.push('Significant excess insulation: reduce unnecessary warmth or vent as conditions allow.');
  const moisture = input.breathability;
  if (moisture && Number.isFinite(moisture.evapPotential) && moisture.evapPotential < moisture.target * 0.7) {
    const message = 'Limited breathability may cause moisture buildup during activity; vent or choose more breathable layers.';
    reasons.push(message);
    warnings.push(message);
  }
  if (!cold && !warm) reasons.unshift('Worn insulation is near the estimated whole-body and local target bands.');
  reasons.push('These clothing targets are estimates, not a prediction of injury or a confidence percentage.');
  const details = { status, summary, reasons, warnings } as const;

  if (wholeBodyDeficit > THERMAL_DISPLAY_CLO_EPSILON) {
    const delta = Math.max(wholeBodyDeficit, localDeficit);

    return {
      riskType: "cold",
      severity: getSeverity(delta, targetRange),
      delta,
      ...details,
    };
  }

  if (warm) {
    const delta = Math.max(wholeBodyExcess, localExcess);
    return {
      riskType: "overheat",
      severity: getSeverity(delta, targetRange),
      delta,
      ...details,
    };
  }

  if (localDeficit > 0) {
    return {
      riskType: "cold",
      severity: getSeverity(localDeficit, targetRange),
      delta: localDeficit,
      ...details,
    };
  }

  return {
    riskType: "comfortable",
    severity: "moderate",
    delta: 0,
    ...details,
  };
}

/**
 * 0–100 score for the decision above. Comfortable outfits score 85–100 by
 * how close they sit to the middle of the target range.
 *
 * A cold outfit scores 85 times the share of the needed insulation, surface
 * air included, that its worst-covered part has: roughly the share of that
 * part's heat loss the body can replace. The whole body is measured against
 * the range's minimum and each body part against its own, so a part that
 * needs far more insulation than the whole body still scores above 0.
 *
 * An overheating outfit can still leave a body part short. It gets the lower
 * of the two scores, so extra insulation elsewhere never raises the score.
 */
export function calculateThermalComfortScore(input: ThermalComfortInput): number | null {
  const decision = evaluateThermalComfort(input);
  const { totalClo, targetRange } = input;
  if (!decision || totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;
  const localShare = localShortfall(input.bodyParts).share;

  let score: number;

  if (decision.riskType === "comfortable") {
    const midpoint = (targetMin + targetMax) / 2;
    const halfRange = Math.max(0.12, (targetMax - targetMin) / 2);
    const normalizedOffset = clamp(Math.abs(totalClo - midpoint) / halfRange, 0, 1);
    score = 100 - normalizedOffset * 15;
  } else {
    const wholeBodyDeficit = targetMin - totalClo;
    const wholeBodyShare = wholeBodyDeficit > THERMAL_DISPLAY_CLO_EPSILON
      ? shortfallShare(wholeBodyDeficit, targetMin)
      : 0;
    const coldScore = 85 * (1 - Math.max(wholeBodyShare, localShare));
    const excess = Math.max(totalClo - targetMax, 0, ...(input.bodyParts ?? []).map(part =>
      part.maximum !== undefined && part.clo - part.maximum > THERMAL_DISPLAY_CLO_EPSILON ? part.clo - part.maximum : 0));
    // Preserve the existing ranking for small excesses; below half-score,
    // continue smoothly so severe excesses remain distinguishable (#152).
    const halfScoreExcess = 39 / 35;
    const warmthScore = excess <= halfScoreExcess ? 78 - excess * 35
      : 39 / (1 + (excess - halfScoreExcess) * 35 / 39);
    score = decision.status === 'cooler' ? coldScore : Math.min(warmthScore, coldScore);
  }

  return Math.round(clamp(score, 0, 100) * 10) / 10;
}
