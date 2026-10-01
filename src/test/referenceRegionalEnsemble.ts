/** Frozen pre-#154 search and ranking, used only as a behavioral/performance reference. */
/**
 * Ensemble builder shared by alpine and XC skiing: compares complete
 * base + optional mid + outer outfits for each body region, and each sport
 * ranks them by its own priorities.
 */
import { ENSEMBLE_REGRESSION } from '@/lib/biophysics/constants';
import type { PhaseTargets } from '@/lib/recommendations/thermal-targets';
import type { CategorizedGarments, GarmentRow } from '@/lib/recommendations/types';

type Region = 'torso' | 'arms' | 'legs';
type Layer = 'base' | 'mid' | 'outer';
const REGIONS: Region[] = ['torso', 'arms', 'legs'];
const EPSILON = 1e-6;

function covers(garment: GarmentRow, region: Region): boolean {
  return garment[`covers_${region}`];
}

/**
 * Bibs cover the torso but sit under a jacket, so they fill only the legs
 * slots. One-piece suits also cover the arms and fill every region's slots.
 */
function occupies(garment: GarmentRow, region: Region): boolean {
  if (region === 'torso' && garment.covers_legs && !garment.covers_arms) return false;
  return covers(garment, region);
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

function isWearable(ensemble: GarmentRow[], puffyFitsUnder: (outer: GarmentRow) => boolean): boolean {
  if (new Set(ensemble.map((g) => g.id)).size !== ensemble.length) return false;

  return REGIONS.every((region) => {
    const garments = ensemble.filter((g) => occupies(g, region));
    // An item spanning regions occupies its slot in every region it fills.
    for (const slot of ['base', 'mid', 'outer'] as const) {
      if (garments.filter((g) => layer(g) === slot).length > 1) return false;
    }
    const mid = garments.find((g) => layer(g) === 'mid');
    const outer = garments.find((g) => layer(g) === 'outer');
    const puffy = mid?.category === 'insulation_down' || mid?.category === 'insulation_synthetic';
    return !puffy || !outer || puffyFitsUnder(outer);
  });
}

function isBetter(rank: number[], best: number[]): boolean {
  for (let i = 0; i < rank.length; i++) {
    if (Math.abs(rank[i] - best[i]) > EPSILON) return rank[i] < best[i];
  }
  return false;
}

function evapPotential(garment: GarmentRow): number {
  return garment.garment_thermal_properties?.evap_potential ?? 0;
}

/** How many of `regions` lack a `slot` layer, counting only garments that pass `accept`. */
function missingLayers(
  outfit: GarmentRow[],
  regions: Region[],
  slot: Layer,
  accept: (garment: GarmentRow) => boolean = () => true
): number {
  return regions.filter((r) => !outfit.some((g) => occupies(g, r) && layer(g) === slot && accept(g))).length;
}

/**
 * Regional warmth against the min–neutral band, in the units ensemble scoring
 * uses: `deficit` below the minimum and `surplus` above it in the regions
 * being scored, and `excess` above the neutral target in any region.
 */
function targetFit(outfit: GarmentRow[], targets: PhaseTargets['regional'], scoredRegions: Region[]) {
  const clo = Object.fromEntries(REGIONS.map((r) => [r, regionalClo(outfit, r)])) as Record<Region, number>;
  return {
    excess: REGIONS.reduce((sum, r) => sum + Math.max(0, clo[r] - targets.neutral[r]), 0),
    deficit: scoredRegions.reduce((sum, r) => sum + Math.max(0, targets.min[r] - clo[r]), 0),
    surplus: scoredRegions.reduce((sum, r) => sum + Math.max(0, clo[r] - targets.min[r]), 0),
  };
}

/**
 * Dress the torso (scored together with the arms), then the legs. Each step
 * tries every wearable base + optional mid + optional outer on top of the
 * layers already chosen and keeps the outfit with the lowest `rank`, compared
 * element by element. Allows at most one item per slot in each region it
 * fills, so insulated outerwear takes the outer slot and no shell goes over
 * it, and a puffy mid only under an outer that `puffyFitsUnder` accepts.
 * Returns the garments in dressing order.
 */
function buildRegionalEnsemble(
  categorized: CategorizedGarments,
  puffyFitsUnder: (outer: GarmentRow) => boolean,
  rank: (outfit: GarmentRow[], scoredRegions: Region[]) => number[]
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
      ...pools[slot].filter((g) => occupies(g, region) && isWearable([...ensemble, g], puffyFitsUnder)),
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
          if (!isWearable(candidate, puffyFitsUnder)) continue;

          const candidateRank = rank(candidate, scoredRegions);
          if (isBetter(candidateRank, bestRank)) {
            best = candidate;
            bestRank = candidateRank;
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


export function referenceAlpineEnsemble(
  categorized: CategorizedGarments,
  targets: PhaseTargets['regional'],
  precipitation: boolean
): GarmentRow[] {
  return buildRegionalEnsemble(categorized, (outer) => outer.category === 'hard_shell', (candidate, scoredRegions) => {
    const missingCoverage = missingLayers(candidate, scoredRegions, 'base') + missingLayers(candidate, scoredRegions, 'outer');
    const wetExposure = precipitation ? missingLayers(candidate, scoredRegions, 'outer', (garment) => {
      const protection = garment.garment_protection;
      return protection?.waterproof_rating === 'waterproof' || (protection?.waterproof_mm ?? 0) > 0;
    }) : 0;
    const { excess, deficit, surplus } = targetFit(candidate, targets, scoredRegions);
    const breathability = candidate.reduce((sum, g) => sum + evapPotential(g), 0);
    return [missingCoverage, wetExposure, deficit + excess, candidate.length, surplus, -breathability];
  });
}

export function referenceXCEnsemble(
  categorized: CategorizedGarments,
  targets: PhaseTargets['regional'],
  minEvapPotential: number,
  windLayer: boolean
): GarmentRow[] {
  const breathableFrom = { base: minEvapPotential, mid: minEvapPotential, outer: 0.2 };
  return buildRegionalEnsemble(categorized, (outer) => outer.category !== 'outer_insulated', (candidate, scoredRegions) => {
    const missingCoverage = missingLayers(candidate, scoredRegions, 'base') +
      (windLayer ? missingLayers(candidate, scoredRegions, 'outer') : 0);
    const { excess, deficit, surplus } = targetFit(candidate, targets, scoredRegions);
    const unbreathable = candidate.filter((g) => evapPotential(g) < breathableFrom[layer(g)]).length;
    const breathability = candidate.reduce((sum, g) => sum + evapPotential(g), 0);
    return [missingCoverage, deficit + excess, unbreathable, candidate.length, -breathability, surplus];
  });
}
