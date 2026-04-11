import { METABOLIC_RATES } from "./constants";

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
    easy: METABOLIC_RATES.biking_moderate,
    moderate: METABOLIC_RATES.running_moderate,
    hard: METABOLIC_RATES.xc_skiing_racing,
  },
  biking: {
    easy: METABOLIC_RATES.xc_skiing_easy,
    moderate: METABOLIC_RATES.biking_moderate,
    hard: METABOLIC_RATES.running_moderate,
  },
  xc_skiing: {
    easy: METABOLIC_RATES.xc_skiing_easy,
    moderate: METABOLIC_RATES.xc_skiing_moderate,
    hard: METABOLIC_RATES.xc_skiing_racing,
  },
  alpine_skiing: {
    easy: METABOLIC_RATES.light_activity,
    moderate: METABOLIC_RATES.alpine_skiing,
    hard: METABOLIC_RATES.moderate_activity,
  },
  ski_touring_uphill: {
    easy: METABOLIC_RATES.moderate_activity,
    moderate: METABOLIC_RATES.ski_touring_uphill,
    hard: METABOLIC_RATES.xc_skiing_moderate,
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

