export const OVERHEAT_BUFFER_CLO = 0.3;
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
  clo: number;
  minimum: number;
}

interface ThermalComfortDecision {
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
  minimum: Record<K, number> | undefined
): BodyPartClo[] {
  if (!clo || !minimum) return [];
  return (Object.keys(minimum) as K[]).map((part) => ({ clo: clo[part], minimum: minimum[part] }));
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

/**
 * Cold when the whole body is below its target range or a body part is below
 * its minimum, overheating when the whole body is well above the range, and
 * comfortable otherwise. `delta` is the largest shortfall or the excess, in clo.
 */
export function evaluateThermalComfort(input: ThermalComfortInput): ThermalComfortDecision | null {
  const {
    totalClo,
    targetRange,
    bodyParts,
    overheatBufferClo = OVERHEAT_BUFFER_CLO,
  } = input;

  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;
  const localDeficit = localShortfall(bodyParts).deficit;
  const wholeBodyDeficit = targetMin - totalClo;
  const wholeBodyExcess = totalClo - targetMax;

  if (wholeBodyDeficit > THERMAL_DISPLAY_CLO_EPSILON) {
    const delta = Math.max(wholeBodyDeficit, localDeficit);

    return {
      riskType: "cold",
      severity: getSeverity(delta, targetRange),
      delta,
    };
  }

  if (wholeBodyExcess > overheatBufferClo) {
    return {
      riskType: "overheat",
      severity: getSeverity(wholeBodyExcess, targetRange),
      delta: wholeBodyExcess,
    };
  }

  if (localDeficit > 0) {
    return {
      riskType: "cold",
      severity: getSeverity(localDeficit, targetRange),
      delta: localDeficit,
    };
  }

  return {
    riskType: "comfortable",
    severity: "moderate",
    delta: 0,
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
  } else if (decision.riskType === "cold") {
    const wholeBodyDeficit = targetMin - totalClo;
    const wholeBodyShare = wholeBodyDeficit > THERMAL_DISPLAY_CLO_EPSILON
      ? shortfallShare(wholeBodyDeficit, targetMin)
      : 0;
    score = 85 * (1 - Math.max(wholeBodyShare, localShare));
  } else {
    score = Math.min(78 - decision.delta * 35, 85 * (1 - localShare));
  }

  return Math.round(clamp(score, 0, 100) * 10) / 10;
}
