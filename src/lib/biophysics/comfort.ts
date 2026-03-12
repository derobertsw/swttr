export const REGIONAL_DEFICIT_CLO_THRESHOLD = 0.12;
export const EXTREMITY_DEFICIT_CLO_THRESHOLD = 0.1;
export const OVERHEAT_BUFFER_CLO = 0.3;
export const THERMAL_DISPLAY_CLO_EPSILON = 0.05;

export type ThermalRiskType = "comfortable" | "cold" | "overheat";
export type ThermalRiskSeverity = "moderate" | "high";

export interface RegionalCloValues {
  torso: number;
  arms: number;
  legs: number;
}

export interface ExtremityCloValues {
  hands: number;
  head: number;
}

export interface ThermalComfortDecision {
  riskType: ThermalRiskType;
  severity: ThermalRiskSeverity;
  delta: number;
}

interface ThermalComfortInput {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
  maxRegionalDeficit?: number;
  maxExtremityDeficit?: number;
  regionalDeficitThreshold?: number;
  extremityDeficitThreshold?: number;
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
  regionalNeutralTarget: RegionalCloValues | undefined
): number {
  if (!regionalClo || !regionalNeutralTarget) return 0;

  return Math.max(
    0,
    regionalNeutralTarget.torso - regionalClo.torso,
    regionalNeutralTarget.arms - regionalClo.arms,
    regionalNeutralTarget.legs - regionalClo.legs
  );
}

export function getMaxExtremityDeficit(
  extremityClo: ExtremityCloValues | undefined,
  extremityNeutralTarget: ExtremityCloValues | undefined
): number {
  if (!extremityClo || !extremityNeutralTarget) return 0;

  return Math.max(
    0,
    extremityNeutralTarget.hands - extremityClo.hands,
    extremityNeutralTarget.head - extremityClo.head
  );
}

function evaluateThermalComfortScoreState(input: ThermalComfortInput): ThermalComfortDecision | null {
  const {
    totalClo,
    targetRange,
    maxRegionalDeficit = 0,
    maxExtremityDeficit = 0,
    regionalDeficitThreshold = REGIONAL_DEFICIT_CLO_THRESHOLD,
    extremityDeficitThreshold = EXTREMITY_DEFICIT_CLO_THRESHOLD,
    overheatBufferClo = OVERHEAT_BUFFER_CLO,
  } = input;

  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;

  const localDeficit = Math.max(maxRegionalDeficit, maxExtremityDeficit);
  const localThreshold = maxRegionalDeficit >= maxExtremityDeficit
    ? regionalDeficitThreshold
    : extremityDeficitThreshold;
  if (localDeficit > localThreshold) {
    return {
      riskType: "cold",
      severity: getSeverity(localDeficit, targetRange),
      delta: localDeficit,
    };
  }

  if (totalClo < targetMin) {
    const deficit = targetMin - totalClo;
    return {
      riskType: "cold",
      severity: getSeverity(deficit, targetRange),
      delta: deficit,
    };
  }

  if (totalClo > targetMax + overheatBufferClo) {
    const excess = totalClo - targetMax;
    return {
      riskType: "overheat",
      severity: getSeverity(excess, targetRange),
      delta: excess,
    };
  }

  return {
    riskType: "comfortable",
    severity: "moderate",
    delta: 0,
  };
}

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

export function calculateThermalComfortScore(input: ThermalComfortInput): number | null {
  const {
    totalClo,
    targetRange,
    maxRegionalDeficit = 0,
    maxExtremityDeficit = 0,
    regionalDeficitThreshold = REGIONAL_DEFICIT_CLO_THRESHOLD,
    extremityDeficitThreshold = EXTREMITY_DEFICIT_CLO_THRESHOLD,
    overheatBufferClo = OVERHEAT_BUFFER_CLO,
  } = input;

  if (totalClo === undefined || !targetRange) return null;

  const decision = evaluateThermalComfortScoreState({
    totalClo,
    targetRange,
    maxRegionalDeficit,
    maxExtremityDeficit,
    regionalDeficitThreshold,
    extremityDeficitThreshold,
    overheatBufferClo,
  });
  if (!decision) return null;

  const [targetMin, targetMax] = targetRange;
  const midpoint = (targetMin + targetMax) / 2;
  const halfRange = Math.max(0.12, (targetMax - targetMin) / 2);

  let score: number;

  if (decision.riskType === "comfortable") {
    const normalizedOffset = clamp(Math.abs(totalClo - midpoint) / halfRange, 0, 1);
    score = 100 - normalizedOffset * 15;
  } else if (decision.riskType === "cold") {
    score = 78 - decision.delta * 42;
  } else {
    score = 78 - decision.delta * 35;
  }

  if (maxRegionalDeficit > regionalDeficitThreshold) {
    const extraDeficit = maxRegionalDeficit - regionalDeficitThreshold;
    score -= 8 + (extraDeficit * 70);
  }
  if (maxExtremityDeficit > extremityDeficitThreshold) {
    const extraDeficit = maxExtremityDeficit - extremityDeficitThreshold;
    score -= 10 + (extraDeficit * 85);
  }

  return Math.round(clamp(score, 0, 100) * 10) / 10;
}
