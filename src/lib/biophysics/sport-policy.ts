/** Server-owned policy for sustained running/XC. See docs/running-xc-foundations.md. */
import type { ActivityType } from './constants';
import type { ExertionLevel } from './exertion';

export const SUSTAINED_ACTIVITY_METS = {
  running: { easy: 6.5, moderate: 8.5, hard: 11.0 },
  xc_skiing: { easy: 6.8, moderate: 8.5, hard: 11.3 },
} as const satisfies Partial<Record<ActivityType, Record<ExertionLevel, number>>>;

export interface SustainedSportPolicy {
  version: 'running_xc_v1';
  activity: 'running' | 'xc_skiing';
  phase: 'sustained';
  effort: ExertionLevel;
  metabolicRateWm2: number;
  /** Applicability of cold-exposure heuristics, not a probability or safety bound. */
  coldExposureFactor: number;
  protection: { wind: boolean; wet: boolean; poleGrip: boolean };
  assumptions: string[];
}

/** Narrow to the activities governed by the sustained running/XC policy. */
export function isCalibratedActivity(activity: ActivityType): activity is SustainedSportPolicy['activity'] {
  return activity === 'running' || activity === 'xc_skiing';
}

/** Build phase assumptions and weather-driven cold allowances/protection needs. */
export function sustainedSportPolicy(
  activity: SustainedSportPolicy['activity'],
  effort: ExertionLevel,
  metabolicRateWm2: number,
  conditions: { tempC: number; precipitation?: boolean },
  windMs: number,
): SustainedSportPolicy {
  // Continuous taper: full cold margins at freezing, none at 10°C in dry
  // moderate wind. Wind and wet conditions retain exposure allowances.
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const coldExposureFactor = Math.max(
    clamp01((10 - conditions.tempC) / 10),
    clamp01((windMs - 4) / 8),
    conditions.precipitation ? 0.7 : 0,
  );
  return {
    version: 'running_xc_v1', activity, phase: 'sustained', effort,
    metabolicRateWm2, coldExposureFactor,
    protection: {
      wind: conditions.tempC <= 0 || windMs > 8,
      wet: conditions.precipitation ?? false,
      poleGrip: activity === 'xc_skiing',
    },
    assumptions: [
      'These targets assume continuous movement. Bring extra layers for breaks and frequent stops.',
      'These are clothing estimates; adjust layers for your comfort and changing conditions.',
    ],
  };
}
