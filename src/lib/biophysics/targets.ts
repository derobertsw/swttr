import type { ActivityType } from './constants';

export interface ActivityTargetRangeInput {
  activity: ActivityType;
  ireqMin: number;
  ireqNeutral: number;
  dleHours?: number;
  airTempC: number;
  windSpeedMs: number;
}

export interface ActivityTargetRangeResult {
  min: number;
  max: number;
}

type NumericProps<T extends object> = { [K in keyof T]: number };

interface ActivityRangeProfile {
  baseMaxBuffer: number;
  maxCap: number;
  minFloorFromNeutral: number;
}

const RANGE_PROFILE: Record<ActivityType, ActivityRangeProfile> = {
  running: { baseMaxBuffer: 0.10, maxCap: 1.45, minFloorFromNeutral: 0.80 },
  biking: { baseMaxBuffer: 0.16, maxCap: 1.70, minFloorFromNeutral: 0.85 },
  xc_skiing: { baseMaxBuffer: 0.24, maxCap: 2.00, minFloorFromNeutral: 0.85 },
  ski_touring_uphill: { baseMaxBuffer: 0.18, maxCap: 1.90, minFloorFromNeutral: 0.88 },
  ski_touring_downhill: { baseMaxBuffer: 0.28, maxCap: 3.80, minFloorFromNeutral: 0.90 },
  alpine_skiing: { baseMaxBuffer: 0.30, maxCap: 4.60, minFloorFromNeutral: 0.92 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compute an activity-specific target clo range using IREQ + environmental stress + DLE.
 */
export function calculateActivityTargetRange(input: ActivityTargetRangeInput): ActivityTargetRangeResult {
  const {
    activity,
    ireqMin,
    ireqNeutral,
    dleHours = 8,
    airTempC,
    windSpeedMs,
  } = input;
  const profile = RANGE_PROFILE[activity];

  const coldStress = clamp((-airTempC - 2) * 0.01, 0, 0.35);
  const windStress = clamp((windSpeedMs - 2) * 0.02, 0, 0.28);
  const dleStress = clamp((6 - dleHours) * 0.06, 0, 0.30);

  // Tighten minimum when DLE is short and/or conditions are severe.
  const minLift = clamp((dleStress * 0.45) + (coldStress * 0.15) + (windStress * 0.10), 0, 0.30);
  const minFloor = ireqNeutral * profile.minFloorFromNeutral;
  const targetMin = Math.max(ireqMin + minLift, minFloor);

  const maxBuffer = profile.baseMaxBuffer + coldStress + (windStress * 0.7) + dleStress;
  const rawMax = ireqNeutral + maxBuffer;
  const targetMax = Math.min(profile.maxCap, Math.max(targetMin + 0.12, rawMax));

  return {
    min: round2(targetMin),
    max: round2(targetMax),
  };
}

/**
 * Scale regional/extremity IREQ values so body-part targets stay aligned with the
 * adjusted whole-body target range shown in the UI.
 */
export function scaleIreqShapeToTargetRange<
  TMin extends object,
  TNeutral extends object
>(
  value: { min: NumericProps<TMin>; neutral: NumericProps<TNeutral> },
  input: {
    ireqMin: number;
    ireqNeutral: number;
    targetMin: number;
    targetMax: number;
  }
): { min: NumericProps<TMin>; neutral: NumericProps<TNeutral> } {
  const minScale = input.ireqMin > 0
    ? clamp(input.targetMin / input.ireqMin, 0.8, 2.2)
    : 1;
  const neutralScale = input.ireqNeutral > 0
    ? clamp(input.targetMax / input.ireqNeutral, 0.8, 2.2)
    : 1;

  const scaledMin = { ...value.min } as NumericProps<TMin>;
  for (const key of Object.keys(scaledMin) as Array<keyof TMin>) {
    scaledMin[key] = round2(scaledMin[key] * minScale);
  }

  const scaledNeutral = { ...value.neutral } as NumericProps<TNeutral>;
  for (const key of Object.keys(scaledNeutral) as Array<keyof TNeutral>) {
    scaledNeutral[key] = round2(scaledNeutral[key] * neutralScale);
  }

  return {
    min: scaledMin,
    neutral: scaledNeutral,
  };
}
