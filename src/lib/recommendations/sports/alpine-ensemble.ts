import type { PhaseTargets } from '../thermal-targets';
import type { CategorizedGarments, GarmentRow } from '../types';
import { buildRegionalEnsemble, evapPotential, missingLayers, targetFit } from './regional-ensemble';

function isWaterproof(garment: GarmentRow): boolean {
  const protection = garment.garment_protection;
  return protection?.waterproof_rating === 'waterproof' || (protection?.waterproof_mm ?? 0) > 0;
}

// Without garment fit measurements, use a conservative pairing: puffies can
// sit under a hard shell, but not another insulated or fitted outer.
const puffyFitsUnder = (outer: GarmentRow) => outer.category === 'hard_shell';

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
  return buildRegionalEnsemble(categorized, puffyFitsUnder, (candidate, scoredRegions) => {
    const missingCoverage =
      missingLayers(candidate, scoredRegions, 'base') + missingLayers(candidate, scoredRegions, 'outer');
    const wetExposure = precipitation ? missingLayers(candidate, scoredRegions, 'outer', isWaterproof) : 0;
    const { excess, deficit, surplus } = targetFit(candidate, targets, scoredRegions);
    const breathability = candidate.reduce((sum, g) => sum + evapPotential(g), 0);
    // Keep base/outer coverage and rain protection, then minimize the
    // total distance outside each region's min–neutral band: a small
    // torso excess must not outweigh an avoidable arms deficit, and a
    // large torso excess must not buy a small arms gain. Among equally
    // close outfits, prefer fewer, lighter layers.
    const targetDistance = deficit + excess;
    return [missingCoverage, wetExposure, targetDistance, candidate.length, surplus, -breathability];
  });
}
