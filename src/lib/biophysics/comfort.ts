export const REGIONAL_DEFICIT_CLO_THRESHOLD = 0.12;
export const OVERHEAT_BUFFER_CLO = 0.3;

export type ThermalRiskType = "comfortable" | "cold" | "overheat";
export type ThermalRiskSeverity = "moderate" | "high";

export interface RegionalCloValues {
  torso: number;
  arms: number;
  legs: number;
}

export interface ThermalComfortDecision {
  riskType: ThermalRiskType;
  severity: ThermalRiskSeverity;
  delta: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

export function evaluateThermalComfort(input: {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
  maxRegionalDeficit?: number;
  regionalDeficitThreshold?: number;
  overheatBufferClo?: number;
}): ThermalComfortDecision | null {
  const {
    totalClo,
    targetRange,
    maxRegionalDeficit = 0,
    regionalDeficitThreshold = REGIONAL_DEFICIT_CLO_THRESHOLD,
    overheatBufferClo = OVERHEAT_BUFFER_CLO,
  } = input;

  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;
  const rangeWidth = Math.max(0.2, targetMax - targetMin);

  if (maxRegionalDeficit > regionalDeficitThreshold) {
    return {
      riskType: "cold",
      severity: maxRegionalDeficit <= rangeWidth ? "moderate" : "high",
      delta: maxRegionalDeficit,
    };
  }

  if (totalClo < targetMin) {
    const deficit = targetMin - totalClo;
    return {
      riskType: "cold",
      severity: deficit <= rangeWidth ? "moderate" : "high",
      delta: deficit,
    };
  }

  if (totalClo > targetMax + overheatBufferClo) {
    const excess = totalClo - targetMax;
    return {
      riskType: "overheat",
      severity: excess <= rangeWidth ? "moderate" : "high",
      delta: excess,
    };
  }

  return {
    riskType: "comfortable",
    severity: "moderate",
    delta: 0,
  };
}

export function calculateThermalComfortScore(input: {
  totalClo: number | undefined;
  targetRange: [number, number] | undefined;
  maxRegionalDeficit?: number;
  regionalDeficitThreshold?: number;
  overheatBufferClo?: number;
}): number | null {
  const {
    totalClo,
    targetRange,
    maxRegionalDeficit = 0,
    regionalDeficitThreshold = REGIONAL_DEFICIT_CLO_THRESHOLD,
    overheatBufferClo = OVERHEAT_BUFFER_CLO,
  } = input;

  if (totalClo === undefined || !targetRange) return null;

  const decision = evaluateThermalComfort({
    totalClo,
    targetRange,
    maxRegionalDeficit,
    regionalDeficitThreshold,
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

  return Math.round(clamp(score, 0, 100) * 10) / 10;
}
