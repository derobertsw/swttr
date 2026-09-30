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

interface ThermalComfortDecision {
  riskType: ThermalRiskType;
  severity: ThermalRiskSeverity;
  delta: number;
}

interface ThermalComfortInput {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
  /** Largest shortfall of the torso, arms or legs below its minimum target, in clo. */
  maxRegionalDeficit?: number;
  /** Largest shortfall of the hands or head below its minimum target, in clo. */
  maxExtremityDeficit?: number;
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

export function getMaxRegionalDeficit(
  regionalClo: RegionalCloValues | undefined,
  regionalTarget: RegionalCloValues | undefined
): number {
  if (!regionalClo || !regionalTarget) return 0;

  return Math.max(
    0,
    regionalTarget.torso - regionalClo.torso,
    regionalTarget.arms - regionalClo.arms,
    regionalTarget.legs - regionalClo.legs
  );
}

export function getMaxExtremityDeficit(
  extremityClo: ExtremityCloValues | undefined,
  extremityTarget: ExtremityCloValues | undefined
): number {
  if (!extremityClo || !extremityTarget) return 0;

  return Math.max(
    0,
    extremityTarget.hands - extremityClo.hands,
    extremityTarget.head - extremityClo.head
  );
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
    maxRegionalDeficit = 0,
    maxExtremityDeficit = 0,
    overheatBufferClo = OVERHEAT_BUFFER_CLO,
  } = input;

  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;
  const localDeficit = Math.max(maxRegionalDeficit, maxExtremityDeficit);
  const wholeBodyDeficit = targetMin - totalClo;
  const wholeBodyExcess = totalClo - targetMax;

  if (wholeBodyDeficit > THERMAL_DISPLAY_CLO_EPSILON) {
    const delta = Math.max(
      wholeBodyDeficit,
      localDeficit > THERMAL_DISPLAY_CLO_EPSILON ? localDeficit : 0
    );

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

  if (localDeficit > THERMAL_DISPLAY_CLO_EPSILON) {
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
 * Heat escapes through the clothing and the air layer around it, at a rate
 * inversely proportional to their combined insulation (ISO 11079). A cold
 * outfit scores 85 times the share of the minimum combined insulation it
 * provides, judged by its largest shortfall: roughly the share of its heat
 * loss the body can replace.
 *
 * An overheating outfit can still leave a body part short. It gets the lower
 * of the two scores, so extra insulation elsewhere never raises the score.
 */
export function calculateThermalComfortScore(input: ThermalComfortInput): number | null {
  const decision = evaluateThermalComfort(input);
  const { totalClo, targetRange, maxRegionalDeficit = 0, maxExtremityDeficit = 0 } = input;
  if (!decision || totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;
  const coldScore = (shortfall: number) =>
    85 * (1 - shortfall / (Math.max(0, targetMin) + SURFACE_AIR_CLO));

  let score: number;

  if (decision.riskType === "comfortable") {
    const midpoint = (targetMin + targetMax) / 2;
    const halfRange = Math.max(0.12, (targetMax - targetMin) / 2);
    const normalizedOffset = clamp(Math.abs(totalClo - midpoint) / halfRange, 0, 1);
    score = 100 - normalizedOffset * 15;
  } else if (decision.riskType === "cold") {
    score = coldScore(decision.delta);
  } else {
    score = 78 - decision.delta * 35;
    const localDeficit = Math.max(maxRegionalDeficit, maxExtremityDeficit);
    if (localDeficit > THERMAL_DISPLAY_CLO_EPSILON) {
      score = Math.min(score, coldScore(localDeficit));
    }
  }

  return Math.round(clamp(score, 0, 100) * 10) / 10;
}
