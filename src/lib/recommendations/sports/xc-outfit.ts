import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { THERMAL_DISPLAY_CLO_EPSILON } from '@/lib/biophysics/comfort';
import { ensembleToThermalGarments } from '../formatting';
import { garmentCapabilities, hasUsableThermalData } from '../garment-semantics';
import type { PhaseTargets } from '../thermal-targets';
import type { GarmentRow } from '../types';

type Region = 'torso' | 'legs';
type Needs = { wind: boolean; wet: boolean };
const parts = (region: Region) => region === 'torso' ? ['torso', 'arms'] as const : ['legs'] as const;
const covers = (g: GarmentRow, part: 'torso' | 'arms' | 'legs') => g[`covers_${part}`] && (g[`coverage_${part}`] ?? 1) === 1;

/** Reviewed standalone clothing meets the clothing need, including a
 * reviewed outer worn over underwear. A base slot itself proves nothing;
 * unknown legacy usage cannot establish suitable public clothing. */
export function xcBasic(outfit: GarmentRow[], region: Region): GarmentRow | undefined {
  const full = (g: GarmentRow) => parts(region).every(p => covers(g, p));
  return outfit.find(g => full(g) && garmentCapabilities(g).standalone);
}

export function xcProtection(outfit: GarmentRow[], region: Region, needs: Needs): boolean {
  return parts(region).every(part => (!needs.wind || outfit.some(g => covers(g, part) && garmentCapabilities(g).wind))
    && (!needs.wet || outfit.some(g => covers(g, part) && garmentCapabilities(g).wet)));
}

/** Shared prediction with final/manual evaluation; never reapply coverage. */
export function xcRegionFit(outfit: GarmentRow[], targets: PhaseTargets['regional'], region: Region) {
  const props = predictEnsembleThermal(ensembleToThermalGarments(outfit));
  const clo = { torso: props.rcl.torso, arms: props.rcl.arm, legs: props.rcl.leg };
  const sum = (fn: (part: 'torso' | 'arms' | 'legs') => number) => parts(region).reduce((n, p) => n + fn(p), 0);
  return {
    deficit: sum(p => Math.max(0, targets.min[p] - clo[p] - THERMAL_DISPLAY_CLO_EPSILON)),
    excess: sum(p => Math.max(0, clo[p] - targets.neutral[p])),
    // Same bounded wardrobe mismatch allowance as the running/XC contract.
    severeExcess: sum(p => Math.max(0, clo[p] - targets.neutral[p] - 0.15)),
  };
}

export function xcRegionMatches(outfit: GarmentRow[], targets: PhaseTargets, region: Region): boolean {
  if (!xcBasic(outfit, region) || outfit.some(g => !hasUsableThermalData(g))) return false;
  const fit = xcRegionFit(outfit, targets.regional, region);
  return fit.deficit === 0 && fit.severeExcess === 0
    && xcProtection(outfit, region, targets.policy?.protection ?? { wind: false, wet: false });
}

export function xcRequirementLabel(targets: PhaseTargets, region: Region): string {
  const basic = region === 'torso' ? 'Breathable Nordic top with insulation as needed' : 'Standalone Nordic tights or pants';
  const needs = targets.policy?.protection;
  return basic + (needs?.wet ? ' with wet-weather protection' : needs?.wind ? ' with wind protection' : '');
}
