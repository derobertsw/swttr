import { METABOLIC_RATES } from "./constants";
import { DEFAULT_BODY_METRICS, metabolicHeatFluxFromMet } from "./bodyMetrics";
import { CYCLING_CLIMB_METS, SUSTAINED_ACTIVITY_METS } from './sport-policy';

export const EXERTION_LEVELS = ["easy", "moderate", "hard"] as const;
export type ExertionLevel = (typeof EXERTION_LEVELS)[number];

export const DEFAULT_EXERTION_LEVEL: ExertionLevel = "moderate";

export const EXERTION_LABELS: Record<ExertionLevel, string> = {
  easy: "Easy",
  moderate: "Moderate",
  hard: "Hard",
};

export const EXERTION_DESCRIPTIONS: Record<ExertionLevel, string> = {
  easy: "Conservative pace with lower heat output.",
  moderate: "Steady pace for most outings.",
  hard: "High-output effort with more body heat.",
};

type ExertionAwareActivity =
  | "running"
  | "biking"
  | "xc_skiing"
  | "alpine_skiing"
  | "ski_touring_uphill"
  | "ski_touring_downhill";

const METABOLIC_RATE_BY_ACTIVITY: Record<
  ExertionAwareActivity,
  Record<ExertionLevel, number>
> = {
  running: {
    easy: metabolicHeatFluxFromMet(SUSTAINED_ACTIVITY_METS.running.easy, DEFAULT_BODY_METRICS),
    moderate: metabolicHeatFluxFromMet(SUSTAINED_ACTIVITY_METS.running.moderate, DEFAULT_BODY_METRICS),
    hard: metabolicHeatFluxFromMet(SUSTAINED_ACTIVITY_METS.running.hard, DEFAULT_BODY_METRICS),
  },
  biking: {
    easy: metabolicHeatFluxFromMet(CYCLING_CLIMB_METS.biking.easy, DEFAULT_BODY_METRICS),
    moderate: metabolicHeatFluxFromMet(CYCLING_CLIMB_METS.biking.moderate, DEFAULT_BODY_METRICS),
    hard: metabolicHeatFluxFromMet(CYCLING_CLIMB_METS.biking.hard, DEFAULT_BODY_METRICS),
  },
  xc_skiing: {
    easy: metabolicHeatFluxFromMet(SUSTAINED_ACTIVITY_METS.xc_skiing.easy, DEFAULT_BODY_METRICS),
    moderate: metabolicHeatFluxFromMet(SUSTAINED_ACTIVITY_METS.xc_skiing.moderate, DEFAULT_BODY_METRICS),
    hard: metabolicHeatFluxFromMet(SUSTAINED_ACTIVITY_METS.xc_skiing.hard, DEFAULT_BODY_METRICS),
  },
  alpine_skiing: {
    easy: METABOLIC_RATES.light_activity,
    moderate: METABOLIC_RATES.alpine_skiing,
    hard: METABOLIC_RATES.moderate_activity,
  },
  ski_touring_uphill: {
    easy: metabolicHeatFluxFromMet(CYCLING_CLIMB_METS.ski_touring_uphill.easy, DEFAULT_BODY_METRICS),
    moderate: metabolicHeatFluxFromMet(CYCLING_CLIMB_METS.ski_touring_uphill.moderate, DEFAULT_BODY_METRICS),
    hard: metabolicHeatFluxFromMet(CYCLING_CLIMB_METS.ski_touring_uphill.hard, DEFAULT_BODY_METRICS),
  },
  ski_touring_downhill: {
    easy: METABOLIC_RATES.light_activity,
    moderate: METABOLIC_RATES.ski_touring_downhill,
    hard: METABOLIC_RATES.moderate_activity,
  },
};

const XC_INTENSITY_TO_EXERTION: Record<string, ExertionLevel> = {
  easy: "easy",
  moderate: "moderate",
  racing: "hard",
};

export function parseExertionLevel(
  value: unknown,
  fallback: ExertionLevel = DEFAULT_EXERTION_LEVEL
): ExertionLevel {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();

  if (normalized in XC_INTENSITY_TO_EXERTION) {
    return XC_INTENSITY_TO_EXERTION[normalized];
  }

  if (normalized === "hard" || normalized === "moderate" || normalized === "easy") {
    return normalized;
  }

  return fallback;
}

/** Return W/m² at default body metrics; running, XC, cycling and the touring climb use the calibrated MET conversion. */
export function getMetabolicRateForActivity(
  activity: ExertionAwareActivity,
  exertion: ExertionLevel
): number {
  return METABOLIC_RATE_BY_ACTIVITY[activity][exertion];
}

export function exertionToXcIntensity(
  exertion: ExertionLevel
): "easy" | "moderate" | "racing" {
  if (exertion === "hard") return "racing";
  return exertion;
}

