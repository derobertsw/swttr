/**
 * XC skiing: breathability over warmth, with separate clo targets for torso
 * and legs so one region cannot borrow insulation from the other.
 */
import { exertionToXcIntensity } from '@/lib/biophysics/exertion';
import { SIGNIFICANT_WIND_MS } from '@/lib/biophysics/scorer';
import type { PhaseTargets } from '../thermal-targets';
import type { RecommendationRequest } from '../request';
import type { CategorizedGarments, GarmentRow } from '../types';
import { createSinglePhaseSport } from './single-phase';
import { buildRegionalEnsemble } from './regional-ensemble';

const MIN_EVAP_POTENTIAL = 0.25;
/** Shells breathe less than base and mid layers, so they have a lower bar. */
const MIN_SHELL_EVAP_POTENTIAL = 0.2;

// XC skiers wear light insulation under a wind shell or soft shell, so a
// puffy fits under any shell, but not under insulated outerwear.
const puffyFitsUnder = (outer: GarmentRow) => outer.category !== 'outer_insulated';

/**
 * XC skiers make their own wind, so the torso and legs need a wind layer
 * once it is freezing, windy, or wet. In mild, calm, dry weather a shell is
 * optional.
 */
export function needsWindLayer(
  { tempC, windMs, precipitation }: Pick<RecommendationRequest, 'tempC' | 'windMs' | 'precipitation'>
): boolean {
  return precipitation || tempC <= 0 || windMs > SIGNIFICANT_WIND_MS;
}

/**
 * Pick a base, an optional mid and an outer layer for the torso, then the
 * legs. When `windLayer` is true every region gets an outer layer, and
 * insulated pants or jackets count as that layer, so no shell goes over them.
 * Then keep each region within its min–neutral band. Among equally close
 * outfits, prefer layers that meet the breathability bar, then fewer layers,
 * then the most breathable ones.
 */
export function buildXCEnsemble(
  categorized: CategorizedGarments,
  targets: PhaseTargets['regional'],
  minEvapPotential: number,
  windLayer: boolean
): GarmentRow[] {
  const breathableFrom = { base: minEvapPotential, mid: minEvapPotential, outer: MIN_SHELL_EVAP_POTENTIAL };

  return buildRegionalEnsemble(categorized, targets, {
    puffyFitsUnder,
    breathableFrom,
    rank: (candidate) => {
      const missingCoverage = candidate.missingBase + (windLayer ? candidate.missingOuter : 0);
      const { excess, deficit, surplus, unbreathable, breathability, count } = candidate;
      return [missingCoverage, deficit + excess, unbreathable, count, -breathability, surplus];
    },
  });
}

function getXCGuidance(tempC: number, ireq: { ireqMin: number; ireqNeutral: number }): string[] {
  const guidance: string[] = [];

  if (tempC > 0) {
    guidance.push('Warm conditions - prioritize breathability over insulation');
    guidance.push('A single breathable base layer may be sufficient');
  } else if (tempC > -10) {
    guidance.push('Moderate cold - balance warmth and breathability');
    guidance.push('Consider a light base + breathable mid layer');
  } else {
    guidance.push('Cold conditions - ensure adequate insulation while maintaining breathability');
    guidance.push('Use a mid-weight base with a breathable softshell');
  }

  guidance.push(`Target insulation: ${ireq.ireqMin.toFixed(1)}-${ireq.ireqNeutral.toFixed(1)} clo`);
  guidance.push('Look for garments with evaporative potential >= 0.25');

  return guidance;
}

export const xc = createSinglePhaseSport({
  activity: 'xc_skiing',
  profile: { name: 'XC Skiing', windExposure: 'normal' },
  minEvapPotential: MIN_EVAP_POTENTIAL,
  catalog: { minScore: { field: 'xc_skiing_score', minScore: 6 } },
  buildEnsemble: (categorized, targets, request) =>
    buildXCEnsemble(categorized, targets.regional, MIN_EVAP_POTENTIAL, needsWindLayer(request)),
  conditions: (request) => ({ intensity: exertionToXcIntensity(request.exertion) }),
  guidance: (request, ireq) => getXCGuidance(request.tempC, ireq),
});
