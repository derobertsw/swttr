import type { UserBodyMetrics } from "@/types/preferences";

export const DEFAULT_BODY_METRICS: UserBodyMetrics = {
  heightInches: 69,
  weightLbs: 170,
};

export const MIN_HEIGHT_INCHES = 54;
export const MAX_HEIGHT_INCHES = 84;
export const MIN_WEIGHT_LBS = 90;
export const MAX_WEIGHT_LBS = 320;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function sanitizeOptionalBodyMetrics(
  input: Partial<UserBodyMetrics> | null | undefined
): Partial<UserBodyMetrics> {
  const heightRaw = parseFiniteNumber(input?.heightInches);
  const weightRaw = parseFiniteNumber(input?.weightLbs);

  return {
    heightInches: heightRaw === null
      ? undefined
      : clamp(Math.round(heightRaw), MIN_HEIGHT_INCHES, MAX_HEIGHT_INCHES),
    weightLbs: weightRaw === null
      ? undefined
      : clamp(Math.round(weightRaw), MIN_WEIGHT_LBS, MAX_WEIGHT_LBS),
  };
}

export function sanitizeBodyMetrics(input: Partial<UserBodyMetrics> | null | undefined): UserBodyMetrics {
  const optional = sanitizeOptionalBodyMetrics(input);

  return {
    heightInches: clamp(
      Math.round(optional.heightInches ?? DEFAULT_BODY_METRICS.heightInches),
      MIN_HEIGHT_INCHES,
      MAX_HEIGHT_INCHES
    ),
    weightLbs: clamp(
      Math.round(optional.weightLbs ?? DEFAULT_BODY_METRICS.weightLbs),
      MIN_WEIGHT_LBS,
      MAX_WEIGHT_LBS
    ),
  };
}

export function parseBodyMetricsFromRequestBody(
  body: Record<string, unknown>
): UserBodyMetrics {
  return sanitizeBodyMetrics({
    heightInches: body.height_inches,
    weightLbs: body.weight_lbs,
  });
}

function inchesToCm(inches: number): number {
  return inches * 2.54;
}

function lbsToKg(lbs: number): number {
  return lbs * 0.45359237;
}

function getBodySurfaceArea(heightInches: number, weightLbs: number): number {
  const heightCm = inchesToCm(heightInches);
  const weightKg = lbsToKg(weightLbs);
  return 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);
}

function getHeatDensity(heightInches: number, weightLbs: number): number {
  const bsa = getBodySurfaceArea(heightInches, weightLbs);
  if (!Number.isFinite(bsa) || bsa <= 0) return 0;
  return lbsToKg(weightLbs) / bsa;
}

/**
 * Returns a bounded multiplier for metabolic rate based on body-size ratio.
 * Smaller/lighter users receive a lower effective metabolic factor (warmer recommendations),
 * while larger/heavier users receive a slightly higher factor.
 */
export function getBodySizeMetabolicFactor(metrics: UserBodyMetrics): number {
  // Higher kg/m² generally means more retained heat per surface area.
  const heatDensity = getHeatDensity(metrics.heightInches, metrics.weightLbs);
  if (!Number.isFinite(heatDensity) || heatDensity <= 0) return 1;
  const baselineHeatDensity = getHeatDensity(
    DEFAULT_BODY_METRICS.heightInches,
    DEFAULT_BODY_METRICS.weightLbs
  );
  const offset = heatDensity - baselineHeatDensity;
  const unboundedFactor = 1 + offset * 0.012;

  return clamp(unboundedFactor, 0.88, 1.12);
}

export function applyBodySizeMetabolicAdjustment(
  baseMetabolicRate: number,
  metrics: UserBodyMetrics
): number {
  return baseMetabolicRate * getBodySizeMetabolicFactor(metrics);
}
