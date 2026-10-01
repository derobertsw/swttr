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

function features(garment: GarmentRow, options: SearchOptions): GarmentFeatures {
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
  const pools: Record<Layer, GarmentFeatures[]> = {
    base: categorized.baseLayers.map((g) => features(g, options)),
    mid: [...categorized.midLayers, ...categorized.insulation.filter((g) => g.category !== 'outer_insulated')]
      .map((g) => features(g, options)),
    outer: [...categorized.shells, ...categorized.insulation.filter((g) => g.category === 'outer_insulated')]
      .map((g) => features(g, options)),
  };
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
