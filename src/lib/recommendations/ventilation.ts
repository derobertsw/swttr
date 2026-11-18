/**
 * Vent advice for the garments a recommendation selected (#290): when to
 * open or close the vents a garment actually has, phase by phase.
 *
 * The catalog's `garment_ventilation` row lists a garment's vents and an
 * estimated `ventilation_factor`, the multiplier on the garment's evaporative
 * resistance (Recl) with its vents open. A garment without a row has unknown
 * vents, so it gets no advice. Opening vents is never credited with a change
 * in dry insulation (clo): warmth targets, outfit selection and the comfort
 * decision all stay on the closed outfit, and the open-state breathability is
 * reported separately, as an estimate.
 *
 * Policy, for the active phase (alpine skiing, the touring climb):
 * 1. Precipitation expected: keep vents closed. An open vent isn't assumed to
 *    keep the garment's closed-state waterproofing.
 * 2. Ambient wind at or above VENT_MAX_WIND_MS: keep vents closed.
 * 3. The outfit is cooler than its target, or the vent's body region is below
 *    its minimum: keep vents closed.
 * 4. Otherwise open them when the closed outfit's evaporative potential is
 *    below the breathability target for the effort, or the outfit is warmer
 *    than its target (venting sheds moisture; the warmth warning stays).
 * 5. Otherwise keep them closed.
 * Rest phases (chairlift, touring transition) and the touring descent always
 * close them: little heat is made sitting or stopped, and the descent adds
 * speed wind and snow spray.
 */
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { breathabilityTarget } from '@/lib/biophysics/scorer';
import type {
  PhaseEvaluation,
  TransitionProtocol,
  VentAdvice,
  VentilationAdvice,
  VentOpenEstimate,
  VentPhase,
  VentType,
} from '@/types/biophysics';
import { ensembleToThermalGarments } from './formatting';
import type { GarmentRow, GarmentVentilationProps } from './types';

/**
 * Ambient wind (m/s) from which open vents aren't advised: the scorer's
 * threshold for wind that strips an unshelled outfit's protection.
 */
const VENT_MAX_WIND_MS = 8;
/** The schema's lower bound for ventilation_factor. */
const MIN_VENTILATION_FACTOR = 0.3;

type VentRegion = VentAdvice['region'];
type ActivePhase = VentOpenEstimate['phase'];
type RestPhase = Exclude<VentPhase, ActivePhase>;

interface GarmentVent {
  vent: VentType;
  region: VentRegion;
}

const VENT_LABELS: Record<VentType, { label: string; pronoun: 'them' | 'it' }> = {
  pit_zips: { label: 'pit zips', pronoun: 'them' },
  side_vents: { label: 'side vents', pronoun: 'them' },
  thigh_vents: { label: 'thigh vents', pronoun: 'them' },
  two_way_zip: { label: 'the two-way front zip', pronoun: 'it' },
};

const ACTIVE_WORDING: Record<ActivePhase, string> = { skiing: 'while skiing', climb: 'while climbing' };

const REST_REASONS: Record<RestPhase, string> = {
  chairlift: 'Sitting on the lift makes little heat, and open vents let warmth out.',
  transition: 'You stop moving at the transition, so close vents before you cool down.',
  descent: 'Speed adds wind and snow spray on the way down.',
};

function ventilationRecord(garment: GarmentRow): GarmentVentilationProps | null {
  const value = garment.garment_ventilation;
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === 'object' ? record : null;
}

/**
 * The adjustable vents a garment's record lists, each with the region it
 * opens. Assumptions: pit zips and a two-way front zip vent the torso; side
 * vents vent the legs on pants and bibs, otherwise the torso; thigh vents vent
 * the legs. Back vents and mesh-lined pockets may be fixed, so they aren't
 * advised on.
 */
function adjustableVents(garment: GarmentRow): GarmentVent[] {
  const record = ventilationRecord(garment);
  if (!record) return [];
  const vents: GarmentVent[] = [];
  if (record.has_pit_zips === true && garment.covers_torso) vents.push({ vent: 'pit_zips', region: 'torso' });
  if (record.main_zip_two_way === true && garment.covers_torso) vents.push({ vent: 'two_way_zip', region: 'torso' });
  if (record.has_side_vents === true && (garment.covers_legs || garment.covers_torso)) {
    vents.push({ vent: 'side_vents', region: garment.covers_legs ? 'legs' : 'torso' });
  }
  if (record.has_thigh_vents === true && garment.covers_legs) vents.push({ vent: 'thigh_vents', region: 'legs' });
  return vents;
}

/**
 * The garment's Recl multiplier with vents open, or null when it is missing,
 * invalid, or 1.0 (no benefit): then no open-state benefit is estimated.
 */
function ventilationFactor(garment: GarmentRow): number | null {
  const raw = ventilationRecord(garment)?.ventilation_factor;
  if (raw === null || raw === undefined || raw === '') return null;
  const factor = Number(raw);
  return Number.isFinite(factor) && factor >= MIN_VENTILATION_FACTOR && factor < 1 ? factor : null;
}

interface PhaseSetting {
  setting: VentAdvice['setting'];
  basis: VentAdvice['basis'];
  reason: string;
}

const REGION_NAMES: Record<VentRegion, string> = { torso: 'Your torso is', legs: 'Your legs are' };

function activeSetting(
  input: VentAdviceInput,
  region: VentRegion,
  closedEvapPotential: number,
  target: number
): PhaseSetting {
  const decision = input.active.evaluation?.decision;
  const during = ACTIVE_WORDING[input.active.phase];
  if (input.precipitation) {
    return { setting: 'closed', basis: 'weather', reason: 'Precipitation is expected, and open vents let snow or rain in.' };
  }
  if (input.windMs >= VENT_MAX_WIND_MS) {
    return { setting: 'closed', basis: 'weather', reason: 'The wind is strong enough that open vents would strip away warmth.' };
  }
  if (decision?.riskType === 'cold') {
    return { setting: 'closed', basis: 'outfit', reason: 'The outfit is already cooler than recommended, so keep the warmth in.' };
  }
  if (input.active.evaluation?.bodyParts[region]?.status === 'under') {
    return { setting: 'closed', basis: 'outfit', reason: `${REGION_NAMES[region]} already below the warmth target, so keep the warmth in.` };
  }
  const warm = decision?.riskType === 'overheat';
  const extraInsulation = 'Venting helps with moisture but does not remove the extra insulation.';
  if (Number.isFinite(closedEvapPotential) && closedEvapPotential < target) {
    return {
      setting: 'open',
      basis: 'outfit',
      reason: warm
        ? `The outfit lets out less moisture than you make ${during} and is warmer than recommended. ${extraInsulation}`
        : `The outfit lets out less moisture than you make ${during}, so venting helps keep you dry.`,
    };
  }
  if (warm) {
    return { setting: 'open', basis: 'outfit', reason: `The outfit is warmer than recommended. ${extraInsulation}` };
  }
  return { setting: 'closed', basis: 'outfit', reason: `The outfit lets out enough moisture ${during} with the vents closed.` };
}

function restMessage(phase: RestPhase, vent: VentType, wasOpen: boolean): string {
  const { label, pronoun } = VENT_LABELS[vent];
  if (phase === 'chairlift') return wasOpen ? `Close ${label} before the chairlift` : `Keep ${label} closed on the chairlift`;
  if (phase === 'transition') return wasOpen ? `Close ${label} at the transition` : `Keep ${label} closed at the transition`;
  return wasOpen
    ? `Close ${label} at the transition and keep ${pronoun} closed for the descent`
    : `Keep ${label} closed for the descent`;
}

/**
 * Open-state evaporative potential: each opened garment's factor applied
 * once to its Recl in the vented regions, before the ensemble regression.
 * Null when no opened garment has a usable factor or nothing improves.
 */
function openStateEstimate(
  ensemble: GarmentRow[],
  openRegions: Map<string, Set<VentRegion>>,
  closedEvapPotential: number
): { garmentIds: string[]; evapPotential: number } | null {
  const garmentIds: string[] = [];
  const opened = ensembleToThermalGarments(ensemble).map((thermal, index) => {
    const garment = ensemble[index];
    const regions = openRegions.get(garment.id);
    const factor = ventilationFactor(garment);
    if (!regions || factor === null) return thermal;
    garmentIds.push(garment.id);
    return {
      ...thermal,
      reclTorso: regions.has('torso') ? thermal.reclTorso * factor : thermal.reclTorso,
      reclLegs: regions.has('legs') ? thermal.reclLegs * factor : thermal.reclLegs,
    };
  });
  if (garmentIds.length === 0) return null;
  const evapPotential = predictEnsembleThermal(opened).evapPotential;
  if (!Number.isFinite(evapPotential) || !(evapPotential > closedEvapPotential)) return null;
  return { garmentIds, evapPotential };
}

interface VentAdviceInput {
  /** Ambient wind, m/s. */
  windMs: number;
  precipitation: boolean;
  /** The moving phase the outfit is assessed for. */
  active: {
    phase: ActivePhase;
    ensemble: GarmentRow[];
    metabolicRate: number;
    /** The server's assessment of that outfit, vents closed. */
    evaluation?: PhaseEvaluation;
  };
  /** Phases after it, in order, with what is worn in each. */
  rest: Array<{ phase: RestPhase; ensemble: GarmentRow[] }>;
}

/**
 * Vent settings for every selected garment with known adjustable vents, for
 * the active phase and each phase after it. Undefined when none has any.
 */
export function ventilationAdvice(input: VentAdviceInput): VentilationAdvice | undefined {
  const { active } = input;
  const closedEvapPotential = predictEnsembleThermal(ensembleToThermalGarments(active.ensemble)).evapPotential;
  const target = breathabilityTarget(active.metabolicRate);

  const advice: VentAdvice[] = [];
  const openRegions = new Map<string, Set<VentRegion>>();
  const openVents = new Set<string>();
  for (const garment of active.ensemble) {
    for (const { vent, region } of adjustableVents(garment)) {
      const { setting, basis, reason } = activeSetting(input, region, closedEvapPotential, target);
      const { label } = VENT_LABELS[vent];
      if (setting === 'open') {
        openVents.add(`${garment.id}:${vent}`);
        openRegions.set(garment.id, (openRegions.get(garment.id) ?? new Set()).add(region));
      }
      advice.push({
        garment_id: garment.id,
        garment_name: `${garment.brand} ${garment.model_name}`,
        vent,
        region,
        phase: active.phase,
        setting,
        basis,
        message: setting === 'open'
          ? `Open ${label} ${ACTIVE_WORDING[active.phase]}`
          : `Keep ${label} closed ${ACTIVE_WORDING[active.phase]}`,
        reason,
        effect_estimated: false,
      });
    }
  }

  const estimate = openRegions.size > 0 ? openStateEstimate(active.ensemble, openRegions, closedEvapPotential) : null;
  const estimates: VentOpenEstimate[] = estimate ? [{
    phase: active.phase,
    garment_ids: estimate.garmentIds,
    closed_evap_potential: closedEvapPotential,
    open_evap_potential: estimate.evapPotential,
    breathability_target: target,
    basis: 'estimate',
  }] : [];
  for (const entry of advice) {
    if (entry.setting !== 'open') continue;
    entry.effect_estimated = estimate?.garmentIds.includes(entry.garment_id) ?? false;
    // A known vent with no usable factor still gets advice, without an estimate.
    if (ventilationFactor(active.ensemble.find((g) => g.id === entry.garment_id)!) === null) {
      entry.reason += ' This garment has no vent rating, so no breathability gain is estimated.';
    }
  }

  for (const { phase, ensemble } of input.rest) {
    for (const garment of ensemble) {
      for (const { vent, region } of adjustableVents(garment)) {
        const wasOpen = openVents.has(`${garment.id}:${vent}`);
        advice.push({
          garment_id: garment.id,
          garment_name: `${garment.brand} ${garment.model_name}`,
          vent,
          region,
          phase,
          setting: 'closed',
          basis: 'phase',
          message: restMessage(phase, vent, wasOpen),
          reason: REST_REASONS[phase],
          effect_estimated: false,
        });
      }
    }
  }

  return advice.length > 0 ? { advice, estimates } : undefined;
}

/**
 * Adds closing the vents opened for the climb to the touring transition
 * protocol, so the checklist and the per-garment advice agree.
 */
export function withVentTransitionStep(
  protocol: TransitionProtocol,
  ventilation: VentilationAdvice | undefined
): TransitionProtocol {
  const opened = ventilation?.advice.filter((entry) => entry.phase === 'climb' && entry.setting === 'open') ?? [];
  if (opened.length === 0) return protocol;
  const vents = opened.map((entry) => `${VENT_LABELS[entry.vent].label} on the ${entry.garment_name}`);
  return { ...protocol, steps: [...protocol.steps, `Close the vents you opened for the climb: ${vents.join(', ')}`] };
}
