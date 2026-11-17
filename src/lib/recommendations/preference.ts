/**
 * Run Warm / Run Cold in personalized recommendations (#251): which setting a
 * request uses, when a narrowed band may change the worn clothing, and how the
 * response explains what it changed. The bands themselves are narrowed by the
 * sport policy (`preferenceBand`), so selection, scoring and manual evaluation
 * all read the same targets.
 */
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { THERMAL_DISPLAY_CLO_EPSILON } from '@/lib/biophysics/comfort';
import type { getSupabase } from '@/lib/supabase';
import type { RecommendationPreference } from '@/types/biophysics';
import type { TemperatureSensitivity } from '@/types/preferences';
import { hoodInsulation } from './extremities';
import { ensembleToThermalGarments } from './formatting';
import type { PhaseTargets } from './thermal-targets';
import type { GarmentRow, HandwearRow, HeadwearRecommendations } from './types';

const SENSITIVITIES: readonly TemperatureSensitivity[] = ['hot', 'neutral', 'cold'];

/** The setting a request runs with, and where it came from. */
export interface ResolvedPreference {
  sensitivity: TemperatureSensitivity;
  /** `request`: sent with it; `saved`: the signed-in user's saved setting; `default`: neither, so neutral. */
  source: 'request' | 'saved' | 'default';
}

type WarmOrCold = ResolvedPreference & { sensitivity: 'hot' | 'cold' };

const NEUTRAL_PREFERENCE: ResolvedPreference = { sensitivity: 'neutral', source: 'default' };

function isSensitivity(value: unknown): value is TemperatureSensitivity {
  return (SENSITIVITIES as readonly unknown[]).includes(value);
}

/** The setting when it is warm or cold, otherwise nothing. */
export function warmOrCold(preference: ResolvedPreference | undefined): WarmOrCold | undefined {
  return preference && preference.sensitivity !== 'neutral' ? { ...preference, sensitivity: preference.sensitivity } : undefined;
}

/**
 * The request's `temperature_sensitivity` when sent, otherwise the signed-in
 * user's saved one, otherwise neutral. The saved setting is read only for
 * `userId`, the authenticated caller; nothing in the body selects whose
 * setting is read. A sent value wins: it is the caller's current choice,
 * which may not have finished saving. Null when a sent value isn't valid.
 */
export async function resolvePreference(
  value: unknown,
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string | null,
): Promise<ResolvedPreference | null> {
  if (value !== undefined) return isSensitivity(value) ? { sensitivity: value, source: 'request' } : null;
  if (!userId) return NEUTRAL_PREFERENCE;
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('temperature_sensitivity')
      .eq('user_id', userId)
      .maybeSingle();
    const saved = (data as { temperature_sensitivity?: unknown } | null)?.temperature_sensitivity;
    if (!error && isSensitivity(saved)) return { sensitivity: saved, source: 'saved' };
  } catch {
    // An unreadable setting falls back to neutral.
  }
  return NEUTRAL_PREFERENCE;
}

type BandTargets = Pick<PhaseTargets, 'targetRange' | 'regional' | 'extremity'>;

/** Largest shortfall below, and excess above, the whole-body and regional
 * bands, counting a worn hood's insulation against the head's upper limit. */
function bandMismatch(ensemble: GarmentRow[], targets: BandTargets) {
  const { rcl } = predictEnsembleThermal(ensembleToThermalGarments(ensemble));
  const clo = { torso: rcl.torso, arms: rcl.arm, legs: rcl.leg };
  const parts = ['torso', 'arms', 'legs'] as const;
  const headLimit = targets.extremity.max?.head ?? targets.extremity.neutral.head;
  return {
    deficit: Math.max(0, targets.targetRange[0] - rcl.wholeBody, ...parts.map(part => targets.regional.min[part] - clo[part])),
    excess: Math.max(0, rcl.wholeBody - targets.targetRange[1], ...parts.map(part => clo[part] - targets.regional.neutral[part]),
      hoodInsulation(ensemble, false) - headLimit),
  };
}

/**
 * Whether the clothing chosen for a narrowed band is worse than the standard
 * choice on the side the setting must never trade away, against the standard
 * band: Run Warm may not add a shortfall below minimum warmth, and Run Cold may
 * not add warmth above the upper limit. Narrowing one end moves the selectors'
 * excess/deficit ranking, so without this a lighter outfit could win while
 * falling short. Only mismatches the evaluation would report count.
 */
export function preferenceOverreach(
  sensitivity: 'hot' | 'cold',
  chosen: GarmentRow[],
  standard: GarmentRow[],
  standardTargets: BandTargets,
): 'minimum' | 'upper_limit' | null {
  const side = sensitivity === 'hot' ? 'deficit' : 'excess';
  const mismatch = bandMismatch(chosen, standardTargets)[side];
  const usual = bandMismatch(standard, standardTargets)[side];
  if (mismatch <= THERMAL_DISPLAY_CLO_EPSILON || mismatch <= usual + 0.01) return null;
  return sensitivity === 'hot' ? 'minimum' : 'upper_limit';
}

/** Worn clothing and accessories chosen for one set of targets. */
export interface PreferenceSelection {
  ensemble: GarmentRow[];
  handwear: HandwearRow | null;
  headwear: HeadwearRecommendations;
}

const LABELS = { hot: 'Run Warm', cold: 'Run Cold' } as const;

function items(selection: PreferenceSelection): Map<string, string> {
  const accessories = [selection.handwear, selection.headwear.helmet, selection.headwear.headWarmth, selection.headwear.neckWarmth];
  return new Map([...selection.ensemble, ...accessories]
    .flatMap(item => item ? [[item.id, `${item.brand} ${item.model_name}`] as const] : []));
}

/** Worn insulation: the whole-body prediction, then hands and head. */
function warmth(selection: PreferenceSelection): [number, number] {
  const { rcl } = predictEnsembleThermal(ensembleToThermalGarments(selection.ensemble));
  const { handwear, headwear } = selection;
  return [rcl.wholeBody, [handwear, headwear.headWarmth, headwear.neckWarmth].reduce((sum, item) => sum + (item?.rcl_clo ?? 0), 0)];
}

function list(names: string[]): string {
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** A sport whose targets don't take the setting yet. */
export function unsupportedPreference(preference: WarmOrCold): RecommendationPreference {
  return {
    sensitivity: preference.sensitivity, source: preference.source === 'saved' ? 'saved' : 'request',
    effect: 'not_supported', targets_adjusted: false,
    message: `${LABELS[preference.sensitivity]} isn't applied to this sport's personalized layers yet, so they use the standard warmth targets.`,
  };
}

/** The standard targets' side of the comparison: their band and, with gear, both choices. */
interface StandardComparison {
  targets: Pick<PhaseTargets, 'targetRange'>;
  selections?: {
    chosen: PreferenceSelection;
    usual: PreferenceSelection;
    /** Why the standard layers stayed (see `preferenceOverreach`), if they did. */
    kept: 'minimum' | 'upper_limit' | null;
  };
}

/**
 * What a warm or cold setting did, for a sport whose policy takes it. With
 * both selections, compares the worn layers with the standard targets'
 * choice; a clothing difference is described only when the layers differ.
 */
export function describePreference(
  preference: WarmOrCold,
  targets: Pick<PhaseTargets, 'targetRange'> & { policy?: { preference?: { targetsChanged: boolean } } },
  standard: StandardComparison,
): RecommendationPreference {
  const label = LABELS[preference.sensitivity];
  const base = { sensitivity: preference.sensitivity, source: preference.source === 'saved' ? 'saved' as const : 'request' as const };
  if (!targets.policy?.preference?.targetsChanged) {
    return {
      ...base, effect: 'no_change', targets_adjusted: false,
      message: `${label} makes no difference here: the suitable warmth range for these conditions leaves no room to adjust.`,
    };
  }
  const adjusted = { ...base, targets_adjusted: true, standard_target_range: standard.targets.targetRange };
  const aim = preference.sensitivity === 'hot'
    ? `${label} aims for the cooler part of the suitable warmth range; minimum warmth and required protection don't change.`
    : `${label} aims for the warmer part of the suitable warmth range; required protection doesn't change.`;
  const selections = standard.selections;
  if (!selections) return { ...adjusted, effect: 'targets_only', message: aim };
  if (selections.kept) {
    return {
      ...adjusted, effect: 'standard_layers_kept',
      message: `${aim} ${selections.kept === 'minimum'
        ? 'The lighter layers available would fall short of minimum warmth, so the standard layers stay.'
        : 'The warmer layers available would go past the upper warmth limit, so the standard layers stay.'}`,
    };
  }
  const chosen = items(selections.chosen);
  const usual = items(selections.usual);
  const added = [...chosen].filter(([id]) => !usual.has(id)).map(([, name]) => name);
  const removed = [...usual].filter(([id]) => !chosen.has(id)).map(([, name]) => name);
  if (added.length === 0 && removed.length === 0) {
    return { ...adjusted, effect: 'same_layers', message: `${aim} The same layers still fit best, so they match the standard choice.` };
  }
  const [bodyClo, extremityClo] = warmth(selections.chosen);
  const [usualBodyClo, usualExtremityClo] = warmth(selections.usual);
  const direction = Math.sign(Math.round((bodyClo - usualBodyClo) * 100))
    || Math.sign(Math.round((extremityClo - usualExtremityClo) * 100));
  const kind = direction < 0 ? 'lighter' : direction > 0 ? 'warmer' : 'different';
  const changes = [
    ...(added.length ? [`adds ${list(added)}`] : []),
    ...(removed.length ? [`leaves out ${list(removed)}`] : []),
  ].join('; ');
  return {
    ...adjusted, effect: 'changed_layers',
    message: `${aim} That gives ${kind} layers than the standard choice: it ${changes}.`,
  };
}
