import { ENSEMBLE_REGRESSION } from '@/lib/biophysics/constants';
import type { PhaseTargets } from '../thermal-targets';
import type { CategorizedGarments, GarmentRow } from '../types';

type Region = 'torso' | 'arms' | 'legs';
type Layer = 'base' | 'mid' | 'outer';
const REGIONS: Region[] = ['torso', 'arms', 'legs'];
const EPSILON = 1e-6;

function covers(garment: GarmentRow, region: Region): boolean {
  return garment[`covers_${region}`];
}

function layer(garment: GarmentRow): Layer {
  if (garment.category === 'base_layer') return 'base';
  if (['hard_shell', 'soft_shell', 'windbreaker', 'outer_insulated'].includes(garment.category)) {
    return 'outer';
  }
  return 'mid';
}

function regionalClo(ensemble: GarmentRow[], region: Region): number {
  const sum = ensemble.reduce((total, garment) => {
    if (!covers(garment, region)) return total;
    const thermal = garment.garment_thermal_properties;
    // Match ensemble scoring: whole-body clo is not regional insulation.
    return total + (thermal?.[`rcl_${region}`] ?? 0);
  }, 0);
  const key = region === 'arms' ? 'arm' : region === 'legs' ? 'leg' : region;
  return sum * ENSEMBLE_REGRESSION.thermal[key].coef;
}

function isWearable(ensemble: GarmentRow[]): boolean {
  if (new Set(ensemble.map((g) => g.id)).size !== ensemble.length) return false;

  return REGIONS.every((region) => {
    const garments = ensemble.filter((g) => covers(g, region));
    // An item spanning regions occupies its slot in every region it covers.
    for (const slot of ['base', 'mid', 'outer'] as const) {
      if (garments.filter((g) => layer(g) === slot).length > 1) return false;
    }
    const mid = garments.find((g) => layer(g) === 'mid');
    const outer = garments.find((g) => layer(g) === 'outer');
    const puffy = mid?.category === 'insulation_down' || mid?.category === 'insulation_synthetic';
    // Without garment fit measurements, use a conservative pairing: puffies
    // can sit under a hard shell, but not another insulated or fitted outer.
    return !puffy || !outer || outer.category === 'hard_shell';
  });
}

function isWaterproof(garment: GarmentRow): boolean {
  const protection = garment.garment_protection;
  return protection?.waterproof_rating === 'waterproof' || (protection?.waterproof_mm ?? 0) > 0;
}

function isBetter(rank: number[], best: number[]): boolean {
  for (let i = 0; i < rank.length; i++) {
    if (Math.abs(rank[i] - best[i]) > EPSILON) return rank[i] < best[i];
  }
  return false;
}

/**
 * Pick a wearable base + optional mid/puffy + outer for each region. Compare
 * complete combinations so an insulated outer can replace a shell and its
 * warmth is budgeted before adding a mid. Never add duplicate layers just to
 * meet an unreachable target; scoring still reports the remaining shortfall.
 */
export function buildAlpineEnsemble(
  categorized: CategorizedGarments,
  targets: PhaseTargets['regional'],
  precipitation: boolean
): GarmentRow[] {
  const pools: Record<Layer, GarmentRow[]> = {
    base: categorized.baseLayers,
    mid: [...categorized.midLayers, ...categorized.insulation.filter((g) => g.category !== 'outer_insulated')],
    outer: [...categorized.shells, ...categorized.insulation.filter((g) => g.category === 'outer_insulated')],
  };
  let ensemble: GarmentRow[] = [];

  for (const region of ['torso', 'legs'] as const) {
    const scoredRegions: Region[] = region === 'torso' ? ['torso', 'arms'] : ['legs'];
    const options = (slot: Layer): Array<GarmentRow | undefined> => [
      undefined,
      ...pools[slot].filter((g) => covers(g, region) && isWearable([...ensemble, g])),
    ];
    const bases = options('base');
    const mids = options('mid');
    const outers = options('outer');
    let best = ensemble;
    let bestRank = [Infinity];

    for (const base of bases) {
      for (const mid of mids) {
        for (const outer of outers) {
          const candidate = [...ensemble, ...[base, mid, outer].filter((g) => g !== undefined)];
          if (!isWearable(candidate)) continue;

          const clo = Object.fromEntries(REGIONS.map((r) => [r, regionalClo(candidate, r)])) as Record<Region, number>;
          const missingCoverage = scoredRegions.reduce((missing, r) => missing +
            Number(!candidate.some((g) => covers(g, r) && layer(g) === 'base')) +
            Number(!candidate.some((g) => covers(g, r) && layer(g) === 'outer')), 0);
          const wetExposure = precipitation ? scoredRegions.filter((r) =>
            !candidate.some((g) => covers(g, r) && layer(g) === 'outer' && isWaterproof(g))
          ).length : 0;
          const excess = REGIONS.reduce((sum, r) => sum + Math.max(0, clo[r] - targets.neutral[r]), 0);
          const deficit = scoredRegions.reduce((sum, r) => sum + Math.max(0, targets.min[r] - clo[r]), 0);
          const surplus = scoredRegions.reduce((sum, r) => sum + Math.max(0, clo[r] - targets.min[r]), 0);
          const breathability = candidate.reduce((sum, g) => sum + (g.garment_thermal_properties?.evap_potential ?? 0), 0);
          // Keep base/outer coverage and rain protection, then fit regional
          // targets. Among adequate outfits, prefer fewer, lighter layers.
          // If even base + outer is too warm, choose the least excess.
          const rank = [missingCoverage, wetExposure, excess, deficit, candidate.length, surplus, -breathability];
          if (isBetter(rank, bestRank)) {
            best = candidate;
            bestRank = rank;
          }
        }
      }
    }
    ensemble = best;
  }

  // Return conventional dressing order, including multi-region items once.
  const order = { base: 0, mid: 1, outer: 2 };
  return ensemble.sort((a, b) => order[layer(a)] - order[layer(b)]);
}
