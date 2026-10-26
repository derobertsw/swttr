/**
 * Requirement-first matching for running/XC: derive what the activity needs
 * from the thermal targets, then match owned garments against it. An owned
 * garment that is unsuitable (underlayer-only worn alone, too warm for a
 * light requirement, unknown thermal data) is never presented as a match;
 * the requirement survives as `missing` with a generic suggestion.
 */
import type { AccessoryAssessments, ClothingRequirement } from '@/types/biophysics';
import type { GarmentRow, HandwearRow, HeadwearRow } from './types';
import { garmentCapabilities, hasUsableThermalData } from './garment-semantics';
import { HEAD_WARMTH_TYPES } from './extremities';
import type { PhaseTargets } from './thermal-targets';
import { xcBasic, xcRegionMatches, xcRequirementLabel } from './sports/xc-outfit';
import { runningBasic, runningRegionMatches, runningRegionIssues, runningRequirementLabel } from './sports/running-outfit';

const CLO_MARGIN = 0.15;
const EXTREMITY_NEEDED_CLO = 0.05;

const LABELS: Record<string, Record<string, { light: string; standard: string }>> = {
  running: {
    torso: { light: 'Lightweight short-sleeve running top', standard: 'Breathable running top' },
    legs: { light: 'Running shorts', standard: 'Running tights or pants' },
    hands: { light: 'Lightweight running gloves', standard: 'Running gloves' },
    head: { light: 'Lightweight running hat', standard: 'Running beanie or hat' },
  },
  xc_skiing: {
    torso: { light: 'Breathable Nordic top', standard: 'Breathable Nordic top and wind layer' },
    legs: { light: 'Nordic ski tights', standard: 'Nordic ski tights or pants' },
    hands: { light: 'Lightweight XC ski gloves', standard: 'XC ski gloves' },
    head: { light: 'Lightweight XC ski hat', standard: 'XC ski hat or headband' },
  },
};

type Region = 'torso' | 'legs';

interface FunctionalNeeds {
  /** Breathability the requirement labels promise, when set. */
  minEvapPotential?: number;
  /** The torso requirement includes a wind layer. */
  torsoWind?: boolean;
  /** Wind or wet protection the sport's policy requires for torso and legs. */
  protection?: { wind: boolean; wet: boolean };
}

const OUTER_CATEGORIES = ['soft_shell', 'hard_shell', 'windbreaker', 'outer_insulated'];

/** An outer layer that supplies protection the region requires. */
function isProtectiveOuter(garment: GarmentRow, region: Region, functional: FunctionalNeeds): boolean {
  if (!OUTER_CATEGORIES.includes(garment.category)) return false;
  const capability = garmentCapabilities(garment);
  const { wind = false, wet = false } = functional.protection ?? {};
  if (region === 'torso' && functional.torsoWind) return true;
  return (wind || wet) && (!wind || capability.wind) && (!wet || capability.wet);
}

export function isSuitableForRegion(garment: GarmentRow, region: Region, targets: PhaseTargets['regional'], functional?: FunctionalNeeds): boolean {
  if (!garment[`covers_${region}`] || garment.usage === 'underlayer') return false;
  if (!hasUsableThermalData(garment)) return false;
  if (functional?.minEvapPotential !== undefined) {
    // An outer layer's breathability comes from the layers under it; when the
    // region needs a wind layer or wind/wet protection, outers are judged on
    // that protection instead.
    const evap = garment.garment_thermal_properties?.evap_potential;
    if (!isProtectiveOuter(garment, region, functional)
      && (typeof evap !== 'number' || evap < functional.minEvapPotential)) return false;
  }
  if (region === 'torso' && functional?.torsoWind && !garmentCapabilities(garment).wind) return false;
  const clo = garment.garment_thermal_properties?.[`rcl_${region}`];
  if (typeof clo !== 'number') return false;
  const { min, neutral } = targets;
  if (clo > neutral[region] + CLO_MARGIN) return false;
  if (clo < Math.max(0, min[region] - CLO_MARGIN)) return false;
  // A light leg/torso need is not met by a warm full-coverage layer.
  const coverage = garment[`coverage_${region}`];
  if (neutral[region] < 0.2 && typeof coverage === 'number' && coverage > 0.65 && clo > neutral[region] + 0.05) return false;
  return true;
}

/** Drop garments presented alone for a region they cannot suit: an
 * underlayer with nothing over it, or a warm full-coverage layer for a
 * light need. Layered cold outfits are left to ensemble scoring. */
export function filterUnsuitableEnsemble(ensemble: GarmentRow[], targets: PhaseTargets['regional'], functional?: FunctionalNeeds): GarmentRow[] {
  return ensemble.filter((g) => !(['torso', 'legs'] as const).some((region) => {
    if (!g[`covers_${region}`]) return false;
    // A garment the requirement matching rejects on breathability must not
    // be presented while its requirement reads missing. A missing wind
    // layer is a gap for an additional layer, so it never drops the top
    // underneath it.
    const breathability = functional ? { ...functional, torsoWind: false } : undefined;
    if (breathability && isSuitableForRegion(g, region, targets) && !isSuitableForRegion(g, region, targets, breathability)
      && !ensemble.some((other) => other.id !== g.id && isSuitableForRegion(other, region, targets, breathability))) return true;
    if (ensemble.some((other) => other.id !== g.id && isSuitableForRegion(other, region, targets))) return false;
    if (g.usage === 'underlayer' && !ensemble.some((other) => other.id !== g.id && other[`covers_${region}`])) return true;
    const coverage = g[`coverage_${region}`];
    const clo = g.garment_thermal_properties?.[`rcl_${region}`];
    return targets.neutral[region] < 0.2 && typeof coverage === 'number' && coverage > 0.65
      && typeof clo === 'number' && clo > targets.neutral[region] + 0.05;
  }));
}

interface RequirementPool {
  garments: GarmentRow[];
  handwear: HandwearRow[];
  headwear: HeadwearRow[];
  /** Ownership is tracked per item kind: owning gloves does not imply owning garments. */
  ownership: { garments: boolean; handwear: boolean; headwear: boolean };
  functional?: FunctionalNeeds;
  selectedIds?: ReadonlySet<string>;
  selectedGarments?: GarmentRow[];
  accessories?: AccessoryAssessments;
}

/** Match phase requirements to suitable items while preserving ownership and gaps. */
export function buildClothingRequirements(
  activity: string,
  targets: PhaseTargets,
  pool: RequirementPool,
): ClothingRequirement[] {
  const labels = LABELS[activity] ?? LABELS.running;
  const requirements: ClothingRequirement[] = [];

  for (const region of ['torso', 'legs'] as const) {
    const neutral = targets.regional.neutral[region];
    if (activity === 'xc_skiing' && (pool.selectedGarments || pool.garments.length === 0)) {
      const selected = pool.selectedGarments ?? [];
      const matches = xcRegionMatches;
      const basic = xcBasic;
      const label = xcRequirementLabel;
      const matched = matches(selected, targets, region) ? basic(selected, region) : undefined;
      const result = requirement(activity, region, label(targets, region), neutral, matched, pool.ownership.garments);
      if (matched) {
        const names = selected.filter(g => g[`covers_${region}`]).map(g => `${g.brand} ${g.model_name}`).join(' + ');
        result.matched_garment_name = names;
        result.message = `${result.label} — ${pool.ownership.garments ? 'matched in your wardrobe' : 'suggested (not in your wardrobe)'}: ${names}`;
      }
      requirements.push(result);
      continue;
    }

    if (activity === 'running' && (pool.selectedGarments || pool.garments.length === 0)) {
      const selected = pool.selectedGarments ?? [];
      const matched = runningRegionMatches(selected, targets, region) ? runningBasic(selected, region) : undefined;
      const result = requirement(activity, region, runningRequirementLabel(targets, region), neutral, matched, pool.ownership.garments);
      const names = selected.filter(g => g[`covers_${region}`]).map(g => `${g.brand} ${g.model_name}`).join(' + ');
      if (matched) {
        result.matched_garment_name = names;
        result.message = `${result.label} — ${pool.ownership.garments ? 'matched in your wardrobe' : 'suggested (not in your wardrobe)'}: ${names}`;
      } else if (runningBasic(selected, region)) {
        // Missing refers to the ideal requirement, not to ownership of the
        // best available clothing that is actually selected and evaluated.
        const source = pool.ownership.garments ? 'in your wardrobe' : 'from the catalog (not owned)';
        result.message = `${result.label} — best available ${source}: ${names}; ${runningRegionIssues(selected, targets, region).join('; ')}. Additional or alternative clothing is needed to meet this requirement.`;
      }
      requirements.push(result);
      continue;
    }
    let label = labels[region][neutral < 0.2 ? 'light' : 'standard'];
    if (activity === 'xc_skiing' && region === 'torso' && !pool.functional?.torsoWind) label = 'Breathable Nordic top';
    const candidates = pool.garments.filter((g) => isSuitableForRegion(g, region, targets.regional, pool.functional));
    const matched = candidates.find((g) => pool.selectedIds?.has(g.id)) ?? candidates[0];
    requirements.push(requirement(activity, region, label, neutral, matched, pool.ownership.garments));
  }

  // Only head-warmth items satisfy a head requirement; helmets, buffs and
  // neck warmers serve different requirements.
  const headWarmth = pool.headwear.filter((h) => HEAD_WARMTH_TYPES.includes(h.headwear_type));
  const extremity: Array<['hands' | 'head', number, HandwearRow[] | HeadwearRow[], boolean]> = [
    ['hands', targets.extremity.neutral.hands, pool.handwear, pool.ownership.handwear],
    ['head', targets.extremity.neutral.head, headWarmth, pool.ownership.headwear],
  ];
  for (const [region, neutral, items, owned] of extremity) {
    const accessory = pool.accessories?.[region];
    if (accessory) {
      const selected = (region === 'head' ? pool.headwear : items).filter(item => accessory.selected_ids.includes(item.id));
      const matched = region === 'head'
        ? selected.find(item => HEAD_WARMTH_TYPES.includes((item as HeadwearRow).headwear_type)) ?? selected[0]
        : selected[0];
      const neckOnly = region === 'head' && matched && !HEAD_WARMTH_TYPES.includes((matched as HeadwearRow).headwear_type);
      const label = region === 'hands' && accessory.purpose === 'pole_grip'
        ? 'Thin XC gloves for pole grip and friction protection'
        : neckOnly ? 'Neck layer to complement hood warmth' : labels[region][neutral < 0.2 ? 'light' : 'standard'];
      const result = requirement(activity, region, label, neutral,
        accessory.state === 'selected' && matched ? { id: matched.id, name: `${matched.brand} ${matched.model_name}` } : undefined, owned);
      if (accessory.state === 'not_needed' || accessory.state === 'unknown') {
        result.status = accessory.state;
        delete result.generic_suggestion;
      }
      result.message = accessory.state === 'selected' ? `${result.message}. ${accessory.message}` : accessory.message;
      requirements.push(result);
      continue;
    }
    const label = labels[region][neutral < 0.2 ? 'light' : 'standard'];
    if (neutral < EXTREMITY_NEEDED_CLO) {
      requirements.push({
        id: `${activity}:${region}`, region, label, status: 'not_needed', target_clo: neutral,
        message: `${label} — not needed in these conditions`,
      });
      continue;
    }
    const inRange = (item: HandwearRow | HeadwearRow) => item.rcl_clo >= Math.max(0, targets.extremity.min[region] - CLO_MARGIN)
      && item.rcl_clo <= neutral + CLO_MARGIN;
    const matched = items.find((item) => pool.selectedIds?.has(item.id) && inRange(item)) ?? items.find(inRange);
    requirements.push(requirement(activity, region, label, neutral,
      matched ? { id: matched.id, name: `${matched.brand} ${matched.model_name}` } : undefined, owned));
  }
  return requirements;
}

function requirement(
  activity: string, region: ClothingRequirement['region'], label: string, targetClo: number,
  matched: { id: string; name: string } | GarmentRow | undefined, usingWardrobe: boolean,
): ClothingRequirement {
  const base = { id: `${activity}:${region}`, region, label, target_clo: Math.round(targetClo * 100) / 100 };
  if (matched) {
    const garment = matched as GarmentRow;
    const name = garment.brand ? `${garment.brand} ${garment.model_name}` : (matched as { name: string }).name;
    return {
      ...base, status: usingWardrobe ? 'owned_match' : 'generic_suggestion',
      matched_garment_id: matched.id, matched_garment_name: name, matched_is_owned: usingWardrobe,
      message: usingWardrobe ? `${label} — matched to ${name} in your wardrobe` : `${label} — suggested: ${name} (not in your wardrobe)`,
    };
  }
  return {
    ...base, status: 'missing',
    generic_suggestion: { label, estimated_clo: base.target_clo, generic_estimate: true, owned: false },
    message: usingWardrobe ? `${label} — no matching item in your wardrobe` : `${label} — no suitable item found; consider: ${label} (generic suggestion, not owned)`,
  };
}
