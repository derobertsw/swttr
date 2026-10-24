/** Complete moving outfits for running, independent of the cycling builder. */
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { THERMAL_DISPLAY_CLO_EPSILON } from '@/lib/biophysics/comfort';
import type { SustainedSportPolicy } from '@/lib/biophysics/sport-policy';
import { ensembleToThermalGarments } from '../formatting';
import { garmentCapabilities, hasUsableThermalData } from '../garment-semantics';
import type { PhaseTargets } from '../thermal-targets';
import type { CategorizedGarments, GarmentRow } from '../types';

type Region = 'torso' | 'legs';
type Protection = SustainedSportPolicy['protection'];
const REGIONS = ['torso', 'legs'] as const;
const EPSILON = 1e-6;
/** Same small mismatch allowance used by wardrobe requirements. */
const MATCH_MARGIN = 0.15;

function slot(g: GarmentRow): number {
  if (g.category === 'base_layer') return 0;
  if (['soft_shell', 'hard_shell', 'windbreaker', 'outer_insulated'].includes(g.category)) return 2;
  return 1;
}

function compatible(a: GarmentRow, b: GarmentRow): boolean {
  if (a.id === b.id) return false;
  if (!REGIONS.some(r => a[`covers_${r}`] && b[`covers_${r}`])) return true;
  if (slot(a) === slot(b)) return false;
  // Insulated outerwear already supplies the insulation slot.
  const puffy = (g: GarmentRow) => ['insulation_down', 'insulation_synthetic'].includes(g.category);
  return !(a.category === 'outer_insulated' && puffy(b)) && !(b.category === 'outer_insulated' && puffy(a));
}

/** A category or a coverage boolean alone cannot prove standalone use.
 * Shorts cover the clothing need even though lower legs remain exposed. */
export function runningBasic(ensemble: GarmentRow[], region: Region): GarmentRow | undefined {
  return ensemble.find(g => g[`covers_${region}`] && garmentCapabilities(g).standalone
    && typeof g[`coverage_${region}`] === 'number' && g[`coverage_${region}`]! > 0);
}

export function runningProtection(ensemble: GarmentRow[], region: Region, needs: Protection): boolean {
  // Explicit short coverage cannot protect a whole region. Legacy full-size
  // outers still use their coverage booleans when fractions are unreviewed.
  const fullCoverage = (g: GarmentRow) => g[`covers_${region}`] && (g[`coverage_${region}`] ?? 1) === 1;
  return (!needs.wind || ensemble.some(g => fullCoverage(g) && garmentCapabilities(g).wind))
    && (!needs.wet || ensemble.some(g => fullCoverage(g) && garmentCapabilities(g).wet));
}

export function runningOutfitProperties(ensemble: GarmentRow[]) {
  return predictEnsembleThermal(ensembleToThermalGarments(ensemble));
}

export function runningRequirementLabel(targets: PhaseTargets, region: Region): string {
  const light = region === 'torso'
    ? targets.regional.min.torso <= 0.1 && targets.regional.min.arms <= 0.05
    : targets.regional.min.legs <= 0.1;
  const basic = region === 'torso'
    ? light ? 'Lightweight short-sleeve running top' : 'Breathable long-sleeve running top with insulation as needed'
    : light ? 'Running shorts' : 'Standalone running tights or pants';
  const needs = targets.policy?.protection;
  return basic + (needs?.wet ? ' with rain protection' : needs?.wind ? ' with wind protection' : '');
}

function excessMargin(ensemble: GarmentRow[], targets: PhaseTargets, part: 'torso' | 'arms' | 'legs'): number {
  const needs = targets.policy?.protection;
  const lightNeed = targets.regional.min[part] <= (part === 'arms' ? 0.05 : 0.1);
  const fullCoverage = ensemble.some(g => (g[`coverage_${part}`] ?? 0) > 0.65);
  // Do not fill a light need with warm full coverage merely because a
  // short-sleeve top/shorts is absent. Required protection remains eligible.
  return lightNeed && fullCoverage && !needs?.wind && !needs?.wet ? 0.05 : MATCH_MARGIN;
}

/** Match the selected combination, including its outer and insulation, using
 * the same regional prediction as selection/final evaluation. Coverage is
 * already in regional clo and must never be multiplied into it again. */
export function runningRegionMatches(ensemble: GarmentRow[], targets: PhaseTargets, region: Region): boolean {
  if (!runningBasic(ensemble, region)) return false;
  if (ensemble.some(g => !hasUsableThermalData(g))) return false;
  const props = runningOutfitProperties(ensemble);
  const parts = region === 'torso' ? ['torso', 'arms'] as const : ['legs'] as const;
  const clo = { torso: props.rcl.torso, arms: props.rcl.arm, legs: props.rcl.leg };
  return parts.every(part => clo[part] >= Math.max(0, targets.regional.min[part] - THERMAL_DISPLAY_CLO_EPSILON)
    && clo[part] <= targets.regional.neutral[part] + excessMargin(ensemble, targets, part))
    && (!targets.policy || runningProtection(ensemble, region, targets.policy.protection));
}

/** Enumerate regional clothing options, then compare complete combinations.
 * No thermal base is mandatory. Unknown standalone metadata cannot establish
 * a basic, but measured mid/shell layers can complement a reviewed basic. */
export function buildRunningEnsemble(
  categorized: CategorizedGarments,
  targets: PhaseTargets,
  minEvapPotential = 0.3,
): GarmentRow[] {
  const garments = [...new Map(Object.values(categorized).flat().filter(hasUsableThermalData).map(g => [g.id, g])).values()]
    // Ski bibs and unreviewed insulated outerwear are not moving running
    // outfits. An explicitly reviewed running outer can opt in.
    .filter(g => g.suitable_activities?.includes('running')
      || (g.garment_type !== 'bib' && g.category !== 'outer_insulated'))
    .sort((a, b) => a.id.localeCompare(b.id));
  const choices = (region: Region): GarmentRow[][] => {
    const pools = [0, 1, 2].map(s => [undefined, ...garments.filter(g => g[`covers_${region}`] && slot(g) === s)]);
    const result: GarmentRow[][] = [[]];
    for (const base of pools[0]) for (const mid of pools[1]) for (const outer of pools[2]) {
      const outfit = [base, mid, outer].filter((g): g is GarmentRow => !!g);
      if (!outfit.length || !outfit.every((g, i) => outfit.slice(i + 1).every(other => compatible(g, other)))) continue;
      // Never wear thermal underwear alone, nor pretend unreviewed legacy
      // garments prove a standalone clothing need.
      if (!runningBasic(outfit, region)) continue;
      result.push(outfit);
    }
    return result;
  };
  const needs = targets.policy?.protection ?? { wind: false, wet: false, poleGrip: false };
  let best: GarmentRow[] = [];
  let bestRank = [Infinity];
  const torsoChoices = choices('torso');
  const legChoices = choices('legs');
  for (const torso of torsoChoices) for (const legs of legChoices) {
    const outfit = [...new Map([...torso, ...legs].map(g => [g.id, g])).values()];
    if (!outfit.every((g, i) => outfit.slice(i + 1).every(other => compatible(g, other)))) continue;
    if (REGIONS.some(r => outfit.some(g => g[`covers_${r}`]) && !runningBasic(outfit, r))) continue;
    const props = runningOutfitProperties(outfit);
    const clo = { torso: props.rcl.torso, arms: props.rcl.arm, legs: props.rcl.leg };
    let deficit = Math.max(0, targets.targetRange[0] - props.rcl.wholeBody - THERMAL_DISPLAY_CLO_EPSILON);
    let excess = Math.max(0, props.rcl.wholeBody - targets.targetRange[1]);
    let severeExcess = 0;
    for (const part of ['torso', 'arms', 'legs'] as const) {
      deficit += Math.max(0, targets.regional.min[part] - clo[part] - THERMAL_DISPLAY_CLO_EPSILON);
      excess += Math.max(0, clo[part] - targets.regional.neutral[part]);
      severeExcess += Math.max(0, clo[part] - targets.regional.neutral[part] - excessMargin(outfit, targets, part));
    }
    const rank = [
      REGIONS.filter(r => !runningProtection(outfit, r, needs)).length,
      needs.wet ? REGIONS.filter(r => !outfit.some(g => g[`covers_${r}`] && (g[`coverage_${r}`] ?? 1) === 1
        && g.garment_protection?.waterproof_rating === 'waterproof')).length : 0,
      severeExcess,
      REGIONS.filter(r => !runningBasic(outfit, r)).length,
      deficit + excess, excess, outfit.length,
      outfit.filter(g => (g.garment_thermal_properties?.evap_potential ?? 0) < minEvapPotential).length,
      -props.evapPotential,
    ];
    const firstDifference = rank.findIndex((value, i) => Math.abs(value - bestRank[i]) > EPSILON);
    if (firstDifference !== -1 && rank[firstDifference] < bestRank[firstDifference]) {
      best = outfit;
      bestRank = rank;
    }
  }
  return best.sort((a, b) => slot(a) - slot(b));
}

export function runningProtectionWarnings(ensemble: GarmentRow[], targets: PhaseTargets): string[] {
  const needs = targets.policy?.protection;
  if (!needs) return [];
  return REGIONS.filter(r => !runningProtection(ensemble, r, needs))
    .map(r => `Available clothing does not provide the required ${needs.wet ? 'wet' : 'wind'} protection for ${r}.`);
}
