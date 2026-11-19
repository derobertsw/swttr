/** Server-owned policy for sustained running/XC (docs/running-xc-foundations.md),
 * and the calibrated inputs cycling and the ski-touring climb share with it
 * (docs/cycling-touring-calibration.md). */
import type { TemperatureSensitivity } from '@/types/preferences';
import type { ActivityType } from './constants';
import type { ExertionLevel } from './exertion';
import { needsXCWindProtection, type XCPhaseContext } from './xc-policy';

export const SUSTAINED_ACTIVITY_METS = {
  running: { easy: 6.5, moderate: 8.5, hard: 11.0 },
  xc_skiing: { easy: 6.8, moderate: 8.5, hard: 11.3 },
} as const satisfies Partial<Record<ActivityType, Record<ExertionLevel, number>>>;

/** Compendium METs for cycling and the ski-touring climb (#374). Cycling uses
 * the self-selected easy, moderate and vigorous rows (01015–01017). The climb
 * has no Compendium row: snowshoeing at moderate effort (19190), XC ski
 * walking (19080) and moderate XC skiing (19090) stand in for Easy, Moderate
 * and Hard. Both mappings are SWTTR assumptions; see
 * docs/cycling-touring-calibration.md. Alpine skiing, the chairlift, the
 * touring descent and the transition keep their earlier rates. */
export const CYCLING_CLIMB_METS = {
  biking: { easy: 4.3, moderate: 7.0, hard: 9.0 },
  ski_touring_uphill: { easy: 5.3, moderate: 6.8, hard: 8.5 },
} as const satisfies Partial<Record<ActivityType, Record<ExertionLevel, number>>>;

/** Every activity whose rate is a Compendium MET converted by body mass and
 * Du Bois area (`metabolicHeatFluxFromMet`), with no extra size factor. */
export const COMPENDIUM_ACTIVITY_METS = { ...SUSTAINED_ACTIVITY_METS, ...CYCLING_CLIMB_METS };

export function usesCompendiumMets(activity: ActivityType): activity is keyof typeof COMPENDIUM_ACTIVITY_METS {
  return activity in COMPENDIUM_ACTIVITY_METS;
}

/** Assumed riding speed through still air, m/s, by effort: road speeds of the
 * Compendium's speed-labelled rows nearest each self-selected MET (about 7,
 * 11 and 14 mph). An assumption: gravel, trails and climbs are slower, and
 * a faster assumed speed is the colder choice. See
 * docs/cycling-touring-calibration.md. */
export const CYCLING_RIDE_SPEED_MS = { easy: 3.0, moderate: 5.0, hard: 6.3 } as const satisfies Record<ExertionLevel, number>;

/** ISO 11079 Annex A's upper limit of relative air speed. */
const MAX_RELATIVE_AIR_SPEED_MS = 18;

/**
 * Relative air speed at a rider: riding speed and ambient wind at right
 * angles, `√(ride² + wind²)`, capped at 18 m/s. Wind direction is unknown;
 * the crosswind sum sits slightly above the average over all headings, so it
 * leans cold. It enters only the heat balance (IREQ) and the basic-clo
 * conversion. The cold-margin taper, the target-range wind term and the hand
 * and head wind factor read ambient wind, so a harder effort's faster riding
 * never adds margin on top of its lower heat-balance requirement.
 */
export function cyclingRelativeAirSpeed(windMs: number, effort: ExertionLevel): number {
  const ride = CYCLING_RIDE_SPEED_MS[effort];
  return Math.min(MAX_RELATIVE_AIR_SPEED_MS, Math.hypot(ride, Math.max(0, windMs)));
}

/** Catalog liner-glove allowance for pole grip, not added thermal demand.
 * Uses existing liner estimates: 0.55 clo on the earlier accessory scale,
 * × 0.60 on the part-manikin scale (#376). See docs/running-xc-foundations.md
 * and docs/catalog-accessory-clo.md. */
export const POLE_GRIP_MAX_CLO = 0.33;

/** Share of each warmth band that Run Warm or Run Cold leaves out (#251).
 * Run Warm drops the warmest share and Run Cold the coolest; no limit moves
 * outward. An unvalidated engineering choice; see docs/running-xc-foundations.md. */
export const PREFERENCE_BAND_SHARE = 0.25;

/** A warm or cold preference as the policy applies it. Neutral has none. */
export interface PolicyPreference {
  sensitivity: Exclude<TemperatureSensitivity, 'neutral'>;
  bandShare: number;
  /** Whether narrowing changed any band in these conditions (set by phaseTargets). */
  targetsChanged: boolean;
}

export interface SustainedSportPolicy {
  version: 'running_xc_v1';
  activity: 'running' | 'xc_skiing';
  phase: 'sustained';
  effort: ExertionLevel;
  metabolicRateWm2: number;
  /** Applicability of added cold margins and local heuristics; never scales
   * whole-body heat balance. Not a probability or a measured safety bound. */
  coldExposureFactor: number;
  protection: { wind: boolean; wet: boolean; poleGrip: boolean };
  assumptions: string[];
  xc?: XCPhaseContext;
  /** Run Warm/Run Cold only. Narrows bands from one side and never widens them. */
  preference?: PolicyPreference;
}

/** Activities whose cold margins taper with exposure: running and XC through
 * their sustained policy, cycling and the ski-touring climb without it (#374).
 * Alpine, the chairlift and the touring descent keep full margins. */
const TAPERED_MARGIN_ACTIVITIES: ReadonlySet<ActivityType> = new Set(['running', 'xc_skiing', 'biking', 'ski_touring_uphill']);

export function tapersColdMargins(activity: ActivityType): boolean {
  return TAPERED_MARGIN_ACTIVITIES.has(activity);
}

/**
 * Applicability of added cold margins, 0–1: full margins at freezing, none at
 * 10°C in dry air with wind up to 4 m/s. Wind and wet conditions retain
 * exposure allowances. `windMs` is the weather's wind as the phase sees it,
 * never self-generated movement. An unvalidated engineering assumption.
 */
export function coldExposureFactor(conditions: { tempC: number; precipitation?: boolean }, windMs: number): number {
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  return Math.max(
    clamp01((10 - conditions.tempC) / 10),
    clamp01((windMs - 4) / 8),
    conditions.precipitation ? 0.7 : 0,
  );
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
  conditions: { tempC: number; precipitation?: boolean; xc?: XCPhaseContext },
  windMs: number,
  sensitivity: TemperatureSensitivity = 'neutral',
): SustainedSportPolicy {
  return {
    version: 'running_xc_v1', activity, phase: 'sustained', effort,
    metabolicRateWm2, coldExposureFactor: coldExposureFactor(conditions, windMs),
    protection: {
      wind: activity === 'xc_skiing' ? needsXCWindProtection(conditions.tempC, windMs) : conditions.tempC <= 0 || windMs > 8,
      wet: conditions.precipitation ?? false,
      poleGrip: activity === 'xc_skiing',
    },
    ...(conditions.xc ? { xc: conditions.xc } : {}),
    ...(sensitivity !== 'neutral' ? { preference: { sensitivity, bandShare: PREFERENCE_BAND_SHARE, targetsChanged: false } } : {}),
    assumptions: [
      'These targets assume continuous movement. Bring extra layers for breaks and frequent stops.',
      'These are clothing estimates; adjust layers for your comfort and changing conditions.',
    ],
  };
}

/**
 * One warmth band `[low, high]` narrowed for a preference: Run Warm lowers
 * `high` and Run Cold raises `low`, each by the policy's share of the width.
 * The other limit never moves, so Run Warm cannot lower a minimum and Run Cold
 * cannot raise an upper limit. Without a preference the band is unchanged.
 */
export function preferenceBand(low: number, high: number, preference?: Pick<PolicyPreference, 'sensitivity' | 'bandShare'>): [number, number] {
  if (!preference || !(high > low)) return [low, high];
  const shift = (high - low) * preference.bandShare;
  const round2 = (value: number) => Math.round(value * 100) / 100;
  return preference.sensitivity === 'hot' ? [low, round2(high - shift)] : [round2(low + shift), high];
}
