/** Complete moving outfits for running, independent of the cycling builder. */
import { predictEnsembleThermal, type ThermalGarment } from '@/lib/biophysics/ensemble';
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

function runningOutfitProperties(ensemble: GarmentRow[]) {
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

function excessMargin(fullCoverage: boolean, targets: PhaseTargets, part: 'torso' | 'arms' | 'legs'): number {
  const needs = targets.policy?.protection;
  const lightNeed = targets.regional.min[part] <= (part === 'arms' ? 0.05 : 0.1);
  // Do not fill a light need with warm full coverage merely because a
  // short-sleeve top/shorts is absent. Required protection remains eligible.
  return lightNeed && fullCoverage && !needs?.wind && !needs?.wet ? 0.05 : MATCH_MARGIN;
}

/** Match the selected combination, including its outer and insulation, using
 * the same regional prediction as selection/final evaluation. Coverage is
 * already in regional clo and must never be multiplied into it again. */
export function runningRegionIssues(ensemble: GarmentRow[], targets: PhaseTargets, region: Region): string[] {
  if (!runningBasic(ensemble, region)) return [`a suitable standalone garment is missing for ${region}`];
  if (ensemble.some(g => !hasUsableThermalData(g))) return [`insulation is unknown for ${region}`];
  const props = runningOutfitProperties(ensemble);
  const parts = region === 'torso' ? ['torso', 'arms'] as const : ['legs'] as const;
  const clo = { torso: props.rcl.torso, arms: props.rcl.arm, legs: props.rcl.leg };
  const issues: string[] = [];
  for (const part of parts) {
    if (clo[part] < Math.max(0, targets.regional.min[part] - THERMAL_DISPLAY_CLO_EPSILON)) issues.push(`still below the insulation target for ${part}`);
    if (clo[part] > targets.regional.neutral[part] + excessMargin(ensemble.some(g => (g[`coverage_${part}`] ?? 0) > 0.65), targets, part)) issues.push(`still above the suitable warmth range for ${part}`);
  }
  if (targets.policy && !runningProtection(ensemble, region, targets.policy.protection)) {
    issues.push(`still missing required ${targets.policy.protection.wet ? 'rain' : 'wind'} protection for ${region}`);
  }
  return issues;
}

export function runningRegionMatches(ensemble: GarmentRow[], targets: PhaseTargets, region: Region): boolean {
  return runningRegionIssues(ensemble, targets, region).length === 0;
}

interface SearchTotals {
  basicMask: number;
  windMask: number;
  wetMask: number;
  waterproofMask: number;
  fullMask: number;
  torso: number;
  arms: number;
  legs: number;
  torsoWhole: number;
  legsWhole: number;
  count: number;
  unbreathable: number;
}

interface SearchItem {
  garment: GarmentRow;
  thermal: ThermalGarment;
  totals: SearchTotals;
}

const EMPTY_TOTALS: SearchTotals = {
  basicMask: 0, windMask: 0, wetMask: 0, waterproofMask: 0, fullMask: 0,
  torso: 0, arms: 0, legs: 0, torsoWhole: 0, legsWhole: 0, count: 0, unbreathable: 0,
};

function extendTotals(previous: SearchTotals, item: SearchItem | undefined): SearchTotals {
  if (!item) return previous;
  const next = item.totals;
  return {
    basicMask: previous.basicMask | next.basicMask,
    windMask: previous.windMask | next.windMask,
    wetMask: previous.wetMask | next.wetMask,
    waterproofMask: previous.waterproofMask | next.waterproofMask,
    fullMask: previous.fullMask | next.fullMask,
    torso: previous.torso + next.torso, arms: previous.arms + next.arms, legs: previous.legs + next.legs,
    torsoWhole: previous.torsoWhole + next.torsoWhole, legsWhole: previous.legsWhole + next.legsWhole,
    count: previous.count + next.count, unbreathable: previous.unbreathable + next.unbreathable,
  };
}

interface RegionalChoice {
  items: SearchItem[];
  thermal: ThermalGarment;
  /** Protection, waterproof coverage, excessive warmth, missing basic. */
  priority: number[];
  clo: number;
  deficit: number;
  excess: number;
  unbreathable: number;
}

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > EPSILON) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/** Identical selection capabilities can only tie. Keep the first sorted ID,
 * as the exhaustive search did, so duplicate products do not multiply work.
 * IDs, names and ownership never participate in the suitability rank. */
function selectionKey(g: GarmentRow, minEvapPotential: number): string {
  const t = g.garment_thermal_properties!;
  return JSON.stringify([
    g.category, g.covers_torso, g.covers_arms, g.covers_legs,
    g.usage, g.coverage_torso, g.coverage_arms, g.coverage_legs,
    t.rcl_torso, t.rcl_arms, t.rcl_legs, t.recl_torso, t.recl_arms, t.recl_legs,
    g.garment_protection?.windproof_rating, g.garment_protection?.waterproof_rating,
    (t.evap_potential ?? 0) < minEvapPotential,
  ]);
}

/** Sum only this region's inputs. Prediction still goes through the shared
 * ensemble model; exposed skin is already included in the regional values. */
function regionalThermal(items: Pick<SearchItem, 'thermal'>[], region: Region): ThermalGarment {
  const thermal: ThermalGarment = {
    rclTorso: 0, rclArms: 0, rclLegs: 0, reclTorso: 0, reclArms: 0, reclLegs: 0,
    coversTorso: false, coversArms: false, coversLegs: false,
  };
  for (const { thermal: item } of items) {
    if (region === 'torso') {
      if (item.coversTorso) {
        thermal.coversTorso = true;
        thermal.rclTorso += item.rclTorso;
        thermal.reclTorso += item.reclTorso;
      }
      if (item.coversArms) {
        thermal.coversArms = true;
        thermal.rclArms += item.rclArms;
        thermal.reclArms += item.reclArms;
      }
    } else if (item.coversLegs) {
      thermal.coversLegs = true;
      thermal.rclLegs += item.rclLegs;
      thermal.reclLegs += item.reclLegs;
    }
  }
  return thermal;
}

/** The shared model is linear in regional insulation. Cache each item's
 * disjoint regional contributions once; adding them gives the same prediction
 * (within floating-point precision) without re-running the model per outfit.
 * Evaporation is nonlinear and is still predicted for complete contenders. */
function searchItem(garment: GarmentRow, thermal: ThermalGarment, minEvapPotential: number): SearchItem {
  const capability = garmentCapabilities(garment);
  let basicMask = 0, windMask = 0, wetMask = 0, waterproofMask = 0, fullMask = 0;
  for (const [part, mask] of [['torso', 1], ['arms', 2], ['legs', 4]] as const) {
    if ((garment[`coverage_${part}`] ?? 0) > 0.65) fullMask |= mask;
    if (part === 'arms' || !garment[`covers_${part}`]) continue;
    const coverage = garment[`coverage_${part}`];
    if (capability.standalone && typeof coverage === 'number' && coverage > 0) basicMask |= mask;
    if ((garment[`coverage_${part}`] ?? 1) === 1) {
      if (capability.wind) windMask |= mask;
      if (capability.wet) wetMask |= mask;
      if (garment.garment_protection?.waterproof_rating === 'waterproof') waterproofMask |= mask;
    }
  }
  const torso = predictEnsembleThermal([regionalThermal([{ thermal }], 'torso')]);
  const legs = predictEnsembleThermal([regionalThermal([{ thermal }], 'legs')]);
  return { garment, thermal, totals: {
    basicMask, windMask, wetMask, waterproofMask, fullMask,
    torso: torso.rcl.torso, arms: torso.rcl.arm, legs: legs.rcl.leg,
    torsoWhole: torso.rcl.wholeBody, legsWhole: legs.rcl.wholeBody, count: 1,
    unbreathable: Number((garment.garment_thermal_properties?.evap_potential ?? 0) < minEvapPotential),
  } };
}

/** With shared garments fixed, the first four priorities are independent
 * additive regional costs. A worse regional priority can never be rescued
 * by the other region, so discard it before considering complete pairs.
 * Keep every tied thermal alternative: lower clo is not always better. */
function regionalChoices(
  items: SearchItem[], prefix: SearchItem[], region: Region,
  targets: PhaseTargets, needs: Protection,
): RegionalChoice[] {
  const pools = [0, 1, 2].map(layer => [undefined, ...items.filter(item =>
    item.garment[`covers_${region}`] && slot(item.garment) === layer
    && prefix.every(shared => compatible(shared.garment, item.garment)))]);
  let bestPriority: number[] | undefined;
  const best = new Map<string, RegionalChoice>();
  const prefixTotals = prefix.reduce(extendTotals, EMPTY_TOTALS);
  const mask = region === 'legs' ? 4 : 1;
  const parts = region === 'torso' ? ['torso', 'arms'] as const : ['legs'] as const;
  const partMask = { torso: 1, arms: 2, legs: 4 };
  for (const base of pools[0]) {
    const withBase = extendTotals(prefixTotals, base);
    for (const mid of pools[1]) {
      if (base && mid && !compatible(base.garment, mid.garment)) continue;
      const partial = extendTotals(withBase, mid);
      for (const outer of pools[2]) {
        if (outer && ((base && !compatible(base.garment, outer.garment)) || (mid && !compatible(mid.garment, outer.garment)))) continue;
        // Reject unsupported underwear before allocating/predicting an outfit.
        const basic = Boolean((partial.basicMask | (outer?.totals.basicMask ?? 0)) & mask);
        if (!basic && (partial.count || outer)) continue;
        const totals = extendTotals(partial, outer);
        let deficit = 0, excess = 0, severeExcess = 0;
        for (const part of parts) {
          const margin = excessMargin(Boolean(totals.fullMask & partMask[part]), targets, part);
          deficit += Math.max(0, targets.regional.min[part] - totals[part] - THERMAL_DISPLAY_CLO_EPSILON);
          excess += Math.max(0, totals[part] - targets.regional.neutral[part]);
          severeExcess += Math.max(0, totals[part] - targets.regional.neutral[part] - margin);
        }
        const priority = [
          Number((needs.wind && !(totals.windMask & mask)) || (needs.wet && !(totals.wetMask & mask))),
          Number(needs.wet && !(totals.waterproofMask & mask)), severeExcess, Number(!basic),
        ];
        const comparison = bestPriority ? compareRank(priority, bestPriority) : -1;
        if (comparison > 0) continue;
        if (comparison < 0) { best.clear(); bestPriority = priority; }
        const chosen = [base, mid, outer].filter((item): item is SearchItem => !!item);
        const outfit = [...prefix, ...chosen].sort((a, b) => slot(a.garment) - slot(b.garment));
        const thermal = regionalThermal(outfit, region);
        const unbreathable = totals.unbreathable - prefixTotals.unbreathable;
        // Same thermal inputs and regional priorities: fewer layers, then
        // fewer unbreathable items strictly dominate for every other region.
        const key = JSON.stringify(thermal);
        const existing = best.get(key);
        if (existing && compareRank([chosen.length, unbreathable], [existing.items.length, existing.unbreathable]) >= 0) continue;
        best.set(key, {
          items: chosen, thermal, priority, clo: region === 'torso' ? totals.torsoWhole : totals.legsWhole,
          deficit, excess, unbreathable,
        });
      }
    }
  }
  return [...best.values()];
}

/** Fix cross-region items first, then prune independent regional choices
 * before pairing. Every garment is converted once, every regional outfit is
 * ranked from cached shared-model contributions, with evaporation predicted only for contenders.
 * No candidate cap, thermal bins or greedy torso-first selection is used. */
export function buildRunningEnsemble(
  categorized: CategorizedGarments,
  targets: PhaseTargets,
  minEvapPotential = 0.3,
): GarmentRow[] {
  const unique = new Map<string, GarmentRow>();
  const garments = [...new Map(Object.values(categorized).flat().map(g => [g.id, g])).values()]
    .filter(g => hasUsableThermalData(g) && (g.suitable_activities?.includes('running')
      || (g.garment_type !== 'bib' && g.category !== 'outer_insulated')))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const garment of garments) {
    const key = selectionKey(garment, minEvapPotential);
    if (!unique.has(key)) unique.set(key, garment);
  }
  const candidates = [...unique.values()];
  const converted = ensembleToThermalGarments(candidates);
  const items = candidates.map((garment, i) => searchItem(garment, converted[i], minEvapPotential));
  const shared = items.filter(item => item.garment.covers_torso && item.garment.covers_legs);
  const separate = items.filter(item => !shared.includes(item));
  const sharedPools = [0, 1, 2].map(layer => [undefined, ...shared.filter(item => slot(item.garment) === layer)]);
  const needs = targets.policy?.protection ?? { wind: false, wet: false, poleGrip: false };
  let best: GarmentRow[] = [];
  let bestRank: number[] | undefined;
  let bestEvap = -Infinity;
  for (const base of sharedPools[0]) for (const mid of sharedPools[1]) for (const outer of sharedPools[2]) {
    const prefix = [base, mid, outer].filter((item): item is SearchItem => !!item);
    if (!prefix.every((item, i) => prefix.slice(i + 1).every(other => compatible(item.garment, other.garment)))) continue;
    const torsoChoices = regionalChoices(separate, prefix, 'torso', targets, needs);
    const legChoices = regionalChoices(separate, prefix, 'legs', targets, needs);
    const sharedUnbreathable = prefix.filter(item => (item.garment.garment_thermal_properties?.evap_potential ?? 0) < minEvapPotential).length;
    for (const torso of torsoChoices) for (const legs of legChoices) {
      // Regional predictions are disjoint contributions to the same shared
      // whole-body model. Shared garments enter each covered region once.
      const totalClo = torso.clo + legs.clo;
      const deficit = torso.deficit + legs.deficit + Math.max(0, targets.targetRange[0] - totalClo - THERMAL_DISPLAY_CLO_EPSILON);
      const excess = torso.excess + legs.excess + Math.max(0, totalClo - targets.targetRange[1]);
      const rank = [
        ...torso.priority.map((value, i) => value + legs.priority[i]),
        deficit + excess, excess, prefix.length + torso.items.length + legs.items.length,
        sharedUnbreathable + torso.unbreathable + legs.unbreathable,
      ];
      const comparison = bestRank ? compareRank(rank, bestRank) : -1;
      if (comparison > 0) continue;
      const evap = predictEnsembleThermal([torso.thermal, legs.thermal]).evapPotential;
      if (comparison === 0 && evap <= bestEvap + EPSILON) continue;
      best = [...prefix, ...torso.items, ...legs.items].map(item => item.garment);
      bestRank = rank;
      bestEvap = evap;
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
