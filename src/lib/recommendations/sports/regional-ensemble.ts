/** Shared regional outfit search for alpine and XC skiing. */
import { ENSEMBLE_REGRESSION } from '@/lib/biophysics/constants';
import type { PhaseTargets } from '../thermal-targets';
import type { CategorizedGarments, GarmentRow } from '../types';

type Layer = 'base' | 'mid' | 'outer';
const TORSO = 1;
const ARMS = 2;
const LEGS = 4;
const EPSILON = 1e-6;

interface OutfitTotals {
  baseMask: number;
  outerMask: number;
  waterproofMask: number;
  torsoClo: number;
  armsClo: number;
  legsClo: number;
  breathability: number;
  unbreathable: number;
  count: number;
}

interface GarmentFeatures extends OutfitTotals {
  garment: GarmentRow;
  layer: Layer;
  occupancy: number;
  puffy: boolean;
  acceptsPuffy: boolean;
}

interface OutfitRankInput {
  missingBase: number;
  missingOuter: number;
  missingWaterproof: number;
  excess: number;
  deficit: number;
  surplus: number;
  count: number;
  breathability: number;
  unbreathable: number;
}

interface SearchOptions {
  puffyFitsUnder: (outer: GarmentRow) => boolean;
  rank: (outfit: OutfitRankInput) => number[];
  breathableFrom?: Record<Layer, number>;
}

const EMPTY: OutfitTotals = {
  baseMask: 0, outerMask: 0, waterproofMask: 0,
  torsoClo: 0, armsClo: 0, legsClo: 0,
  breathability: 0, unbreathable: 0, count: 0,
};

function layer(garment: GarmentRow): Layer {
  if (garment.category === 'base_layer') return 'base';
  if (['hard_shell', 'soft_shell', 'windbreaker', 'outer_insulated'].includes(garment.category)) return 'outer';
  return 'mid';
}

function features(garment: GarmentRow, options: Pick<SearchOptions, 'puffyFitsUnder' | 'breathableFrom'>): GarmentFeatures {
  const slot = layer(garment);
  // Bibs insulate the torso but sit underneath its jacket, occupying only leg slots.
  const occupancy = (garment.covers_torso && !(garment.covers_legs && !garment.covers_arms) ? TORSO : 0) |
    (garment.covers_arms ? ARMS : 0) | (garment.covers_legs ? LEGS : 0);
  const thermal = garment.garment_thermal_properties;
  const protection = garment.garment_protection;
  const outerMask = slot === 'outer' ? occupancy : 0;
  const waterproof = protection?.waterproof_rating === 'waterproof' || (protection?.waterproof_mm ?? 0) > 0;
  const breathability = thermal?.evap_potential ?? 0;
  return {
    garment, layer: slot, occupancy,
    baseMask: slot === 'base' ? occupancy : 0,
    outerMask,
    waterproofMask: waterproof ? outerMask : 0,
    torsoClo: garment.covers_torso ? thermal?.rcl_torso ?? 0 : 0,
    armsClo: garment.covers_arms ? thermal?.rcl_arms ?? 0 : 0,
    legsClo: garment.covers_legs ? thermal?.rcl_legs ?? 0 : 0,
    breathability,
    unbreathable: options.breathableFrom && breathability < options.breathableFrom[slot] ? 1 : 0,
    count: 1,
    puffy: garment.category === 'insulation_down' || garment.category === 'insulation_synthetic',
    acceptsPuffy: slot === 'outer' && options.puffyFitsUnder(garment),
  };
}

function garmentPools(
  categorized: CategorizedGarments,
  options: Pick<SearchOptions, 'puffyFitsUnder' | 'breathableFrom'>
): Record<Layer, GarmentFeatures[]> {
  return {
    base: categorized.baseLayers.map((g) => features(g, options)),
    mid: [...categorized.midLayers, ...categorized.insulation.filter((g) => g.category !== 'outer_insulated')]
      .map((g) => features(g, options)),
    outer: [...categorized.shells, ...categorized.insulation.filter((g) => g.category === 'outer_insulated')]
      .map((g) => features(g, options)),
  };
}

interface CapacityState {
  baseMask: number;
  midMask: number;
  outerMask: number;
  waterproofMask: number;
  puffyMask: number;
  blockingOuterMask: number;
  torsoClo: number;
  armsClo: number;
  legsClo: number;
}

function capacityKey(state: CapacityState): number {
  // Six three-bit region masks describe all future compatibility constraints.
  return state.baseMask | (state.midMask << 3) | (state.outerMask << 6) |
    (state.waterproofMask << 9) | (state.puffyMask << 12) | (state.blockingOuterMask << 15);
}

/**
 * Find each region's maximum across all wearable outfits, retaining the
 * selected outfit's base/outer coverage and, when wet, waterproof coverage.
 * Keep separate regional maxima for each compatibility state: the maximum
 * torso, arms and legs values can come from different valid outfits.
 * Process all alternatives for a garment ID together so it cannot be reused.
 */
export function findRegionalInsulationCapacity(
  categorized: CategorizedGarments,
  selected: GarmentRow[],
  precipitation: boolean,
  puffyFitsUnder: SearchOptions['puffyFitsUnder']
): PhaseTargets['regional']['min'] {
  const options = { puffyFitsUnder };
  const pools = garmentPools(categorized, options);
  const groups = new Map<string, GarmentFeatures[]>();
  for (const item of [...pools.base, ...pools.mid, ...pools.outer]) {
    if (!item.occupancy) continue;
    const group = groups.get(item.garment.id) ?? [];
    group.push(item);
    groups.set(item.garment.id, group);
  }
  let states = new Map<number, CapacityState>([[0, {
    baseMask: 0, midMask: 0, outerMask: 0, waterproofMask: 0,
    puffyMask: 0, blockingOuterMask: 0, torsoClo: 0, armsClo: 0, legsClo: 0,
  }]]);

  for (const group of groups.values()) {
    const next = new Map(states); // Also allow leaving this garment off.
    for (const state of states.values()) {
      for (const item of group) {
        const occupied = item.layer === 'base' ? state.baseMask : item.layer === 'mid' ? state.midMask : state.outerMask;
        if (occupied & item.occupancy) continue;
        if (item.puffy && (state.blockingOuterMask & item.occupancy)) continue;
        if (item.layer === 'outer' && !item.acceptsPuffy && (state.puffyMask & item.occupancy)) continue;
        const candidate: CapacityState = {
          baseMask: state.baseMask | item.baseMask,
          midMask: state.midMask | (item.layer === 'mid' ? item.occupancy : 0),
          outerMask: state.outerMask | item.outerMask,
          waterproofMask: state.waterproofMask | item.waterproofMask,
          puffyMask: state.puffyMask | (item.puffy ? item.occupancy : 0),
          blockingOuterMask: state.blockingOuterMask | (item.layer === 'outer' && !item.acceptsPuffy ? item.occupancy : 0),
          torsoClo: state.torsoClo + item.torsoClo,
          armsClo: state.armsClo + item.armsClo,
          legsClo: state.legsClo + item.legsClo,
        };
        const key = capacityKey(candidate);
        const existing = next.get(key);
        next.set(key, existing ? {
          ...candidate,
          torsoClo: Math.max(existing.torsoClo, candidate.torsoClo),
          armsClo: Math.max(existing.armsClo, candidate.armsClo),
          legsClo: Math.max(existing.legsClo, candidate.legsClo),
        } : candidate);
      }
    }
    states = next;
  }

  const required = selected.map((g) => features(g, options)).reduce(extend, EMPTY);
  const capacity = { torso: 0, arms: 0, legs: 0 };
  for (const state of states.values()) {
    if ((state.baseMask & required.baseMask) !== required.baseMask ||
      (state.outerMask & required.outerMask) !== required.outerMask ||
      (precipitation && (state.waterproofMask & required.waterproofMask) !== required.waterproofMask)) continue;
    capacity.torso = Math.max(capacity.torso, state.torsoClo * ENSEMBLE_REGRESSION.thermal.torso.coef);
    capacity.arms = Math.max(capacity.arms, state.armsClo * ENSEMBLE_REGRESSION.thermal.arm.coef);
    capacity.legs = Math.max(capacity.legs, state.legsClo * ENSEMBLE_REGRESSION.thermal.leg.coef);
  }
  return capacity;
}

/** The slot, identity and puffy-pairing rules are all pairwise. */
function compatible(a: GarmentFeatures | undefined, b: GarmentFeatures | undefined): boolean {
  if (!a || !b) return true;
  if (a.garment.id === b.garment.id) return false;
  if (!(a.occupancy & b.occupancy)) return true;
  if (a.layer === b.layer) return false;
  return !(a.puffy && b.layer === 'outer' && !b.acceptsPuffy) &&
    !(b.puffy && a.layer === 'outer' && !a.acceptsPuffy);
}

/** Add in dressing order, preserving the previous search's floating-point sums. */
function extend(prefix: OutfitTotals, item: GarmentFeatures | undefined): OutfitTotals {
  if (!item) return prefix;
  return {
    baseMask: prefix.baseMask | item.baseMask,
    outerMask: prefix.outerMask | item.outerMask,
    waterproofMask: prefix.waterproofMask | item.waterproofMask,
    torsoClo: prefix.torsoClo + item.torsoClo,
    armsClo: prefix.armsClo + item.armsClo,
    legsClo: prefix.legsClo + item.legsClo,
    breathability: prefix.breathability + item.breathability,
    unbreathable: prefix.unbreathable + item.unbreathable,
    count: prefix.count + 1,
  };
}

function missing(mask: number, region: number): number {
  return region === LEGS ? Number(!(mask & LEGS)) : Number(!(mask & TORSO)) + Number(!(mask & ARMS));
}

function isBetter(rank: number[], best: number[]): boolean {
  for (let i = 0; i < rank.length; i++) {
    if (Math.abs(rank[i] - best[i]) > EPSILON) return rank[i] < best[i];
  }
  return false;
}

/**
 * Dress torso/arms, then legs, comparing wearable base + optional mid + outer
 * combinations. Cache garment features and the prefix/base/mid sums; only
 * compute the outer contribution and rank in the innermost loop. Allocate
 * garment arrays only for winning outfits, keeping enumeration and ties intact.
 */
export function buildRegionalEnsemble(
  categorized: CategorizedGarments,
  targets: PhaseTargets['regional'],
  options: SearchOptions
): GarmentRow[] {
  const pools = garmentPools(categorized, options);
  let ensemble: GarmentFeatures[] = [];

  for (const region of [TORSO, LEGS]) {
    const prefix = ensemble.reduce(extend, EMPTY);
    const choices = (slot: Layer): Array<GarmentFeatures | undefined> => [
      undefined,
      ...pools[slot].filter((g) => (g.occupancy & region) && ensemble.every((chosen) => compatible(chosen, g))),
    ];
    const bases = choices('base');
    const mids = choices('mid');
    const outers = choices('outer');
    let best = ensemble;
    let bestRank = [Infinity];

    for (const base of bases) {
      const withBase = extend(prefix, base);
      for (const mid of mids) {
        if (!compatible(base, mid)) continue;
        const partial = extend(withBase, mid);
        for (const outer of outers) {
          if (!compatible(base, outer) || !compatible(mid, outer)) continue;
          const torso = (partial.torsoClo + (outer?.torsoClo ?? 0)) * ENSEMBLE_REGRESSION.thermal.torso.coef;
          const arms = (partial.armsClo + (outer?.armsClo ?? 0)) * ENSEMBLE_REGRESSION.thermal.arm.coef;
          const legs = (partial.legsClo + (outer?.legsClo ?? 0)) * ENSEMBLE_REGRESSION.thermal.leg.coef;
          const candidateRank = options.rank({
            missingBase: missing(partial.baseMask | (outer?.baseMask ?? 0), region),
            missingOuter: missing(partial.outerMask | (outer?.outerMask ?? 0), region),
            missingWaterproof: missing(partial.waterproofMask | (outer?.waterproofMask ?? 0), region),
            excess: Math.max(0, torso - targets.neutral.torso) + Math.max(0, arms - targets.neutral.arms) + Math.max(0, legs - targets.neutral.legs),
            deficit: region === LEGS ? Math.max(0, targets.min.legs - legs) :
              Math.max(0, targets.min.torso - torso) + Math.max(0, targets.min.arms - arms),
            surplus: region === LEGS ? Math.max(0, legs - targets.min.legs) :
              Math.max(0, torso - targets.min.torso) + Math.max(0, arms - targets.min.arms),
            count: partial.count + (outer ? 1 : 0),
            breathability: partial.breathability + (outer?.breathability ?? 0),
            unbreathable: partial.unbreathable + (outer?.unbreathable ?? 0),
          });
          if (isBetter(candidateRank, bestRank)) {
            best = [...ensemble, ...[base, mid, outer].filter((g) => g !== undefined)];
            bestRank = candidateRank;
          }
        }
      }
    }
    ensemble = best;
  }

  const order = { base: 0, mid: 1, outer: 2 };
  return ensemble.sort((a, b) => order[a.layer] - order[b.layer]).map((g) => g.garment);
}
