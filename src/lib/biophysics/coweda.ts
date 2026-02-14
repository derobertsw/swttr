import { CLO_TO_M2KW, METABOLIC_RATES } from "./constants";

export const COWEDA_VALIDATION_SOURCE = "potter_2020_coweda_validation";

/**
 * Validation metrics from:
 * Potter et al. (2020), Informatics in Medicine Unlocked 18:100301.
 * "Validation of new method for predicting human skin temperatures during cold exposure: CoWEDA"
 */
export const COWEDA_VALIDATION_METRICS = {
  allSkin: { maeC: 1.85, rmseC: 2.28 },
  finger: { maeC: 2.68, rmseC: 2.68 },
  meanSkin: { maeC: 1.06, rmseC: 1.25 },
  restR2: 0.98,
  exerciseR2: 0.8,
} as const;

export interface CowedaValidationBuffer {
  wholeBody: number;
  coldRisk: number;
  extremity: number;
  context: "rest" | "exercise";
}

interface TargetRange {
  min: number;
  max: number;
}

interface ExtremityTargetShape {
  min: { hands: number; head: number };
  neutral: { hands: number; head: number };
}

export interface CowedaBufferInput {
  airTempC: number;
  relativeHumidity: number;
  metabolicRate: number;
  workRate?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculateVaporPressure(tempC: number, rh: number): number {
  const pSat = 610.78 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  return pSat * (rh / 100);
}

function calculateAvailableHeatFlux(input: CowedaBufferInput): number {
  const M = input.metabolicRate;
  const W = input.workRate ?? 0;
  const boundedRh = clamp(input.relativeHumidity, 0, 100);
  const cRes = 0.0014 * M * (34 - input.airTempC);
  const pA = calculateVaporPressure(input.airTempC, boundedRh);
  const eRes = 0.0173 * M * (5.87 - pA / 1000);

  return M - W - cRes - eRes;
}

function getUncertaintyContextFactor(metabolicRate: number): {
  context: CowedaValidationBuffer["context"];
  factor: number;
} {
  const restCutoff = METABOLIC_RATES.light_activity;
  const highExercise = METABOLIC_RATES.xc_skiing_easy;

  if (metabolicRate <= restCutoff) {
    return { context: "rest", factor: 0.92 };
  }

  if (metabolicRate >= highExercise) {
    return { context: "exercise", factor: 1.1 };
  }

  const fraction = (metabolicRate - restCutoff) / (highExercise - restCutoff);
  return {
    context: "exercise",
    factor: 1 + (fraction * 0.1),
  };
}

/**
 * Converts CoWEDA validation skin-temperature uncertainty to clo buffers
 * for recommendation safety margins.
 */
export function calculateCowedaValidationBuffer(input: CowedaBufferInput): CowedaValidationBuffer {
  const availableHeatFlux = Math.max(45, calculateAvailableHeatFlux(input));
  const cloPerSkinDegree = (1 / availableHeatFlux) / CLO_TO_M2KW;

  const { context, factor } = getUncertaintyContextFactor(input.metabolicRate);

  const wholeBody = round2(clamp(
    cloPerSkinDegree * COWEDA_VALIDATION_METRICS.meanSkin.maeC * factor,
    0.03,
    0.30
  ));
  const coldRisk = round2(clamp(
    cloPerSkinDegree * COWEDA_VALIDATION_METRICS.allSkin.maeC * factor,
    0.05,
    0.42
  ));
  const extremity = round2(clamp(
    cloPerSkinDegree * COWEDA_VALIDATION_METRICS.finger.maeC * factor,
    0.07,
    0.60
  ));

  return {
    wholeBody,
    coldRisk,
    extremity,
    context,
  };
}

/**
 * Applies CoWEDA validation-derived safety margins to an activity target range.
 */
export function applyCowedaBufferToTargetRange(
  range: TargetRange,
  buffer: CowedaValidationBuffer
): TargetRange {
  const min = round2(range.min + buffer.coldRisk);
  const maxLift = Math.max(buffer.wholeBody, buffer.coldRisk * 0.45);
  const max = round2(Math.max(min + 0.12, range.max + maxLift));

  return { min, max };
}

/**
 * Applies extremity-focused uncertainty buffer from CoWEDA finger validation.
 */
export function applyCowedaBufferToExtremityTargets<T extends ExtremityTargetShape>(
  extremityTargets: T,
  buffer: CowedaValidationBuffer
): T {
  return {
    min: {
      hands: round2(extremityTargets.min.hands + buffer.extremity),
      head: round2(extremityTargets.min.head + buffer.extremity),
    },
    neutral: {
      hands: round2(extremityTargets.neutral.hands + buffer.extremity),
      head: round2(extremityTargets.neutral.head + buffer.extremity),
    },
  } as T;
}
