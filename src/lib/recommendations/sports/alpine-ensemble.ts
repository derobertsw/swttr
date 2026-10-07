import type { PhaseTargets } from '../thermal-targets';
import type { CategorizedGarments, GarmentRow } from '../types';
import { buildRegionalEnsemble } from './regional-ensemble';

// Without garment fit measurements, use a conservative pairing: puffies can
// sit under a hard shell, but not another insulated or fitted outer.
const puffyFitsUnder = (outer: GarmentRow) => outer.category === 'hard_shell';

/**
 * Pick a wearable base + optional mid/puffy + outer for each region. Compare
 * complete combinations so an insulated outer can replace a shell and its
 * warmth is budgeted before adding a mid. Never add duplicate layers just to
 * meet an unreachable target; scoring still reports the remaining shortfall.
 * For warning checks, warmestRegion finds the warmest wearable alternative
 * for that region, preserving the same coverage and rain-protection priorities.
 */
export function buildAlpineEnsemble(
  categorized: CategorizedGarments,
  targets: PhaseTargets['regional'],
  precipitation: boolean,
  warmestRegion?: keyof PhaseTargets['regional']['min']
): GarmentRow[] {
  return buildRegionalEnsemble(categorized, targets, {
    puffyFitsUnder,
    rank: (candidate) => {
      const missingCoverage = candidate.missingBase + candidate.missingOuter;
      const wetExposure = precipitation ? candidate.missingWaterproof : 0;
      const { excess, deficit, surplus, breathability, count } = candidate;
      if (warmestRegion) {
        return [missingCoverage, wetExposure, -candidate.regionalClo[warmestRegion], count, surplus, -breathability];
      }
      // Keep base/outer coverage and rain protection, then minimize the
      // total distance outside each region's min–neutral band: a small
      // torso excess must not outweigh an avoidable arms deficit, and a
      // large torso excess must not buy a small arms gain. Among equally
      // close outfits, prefer fewer, lighter layers.
      const targetDistance = deficit + excess;
      return [missingCoverage, wetExposure, targetDistance, count, surplus, -breathability];
    },
  });
}
