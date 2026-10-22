/**
 * Extremity gear selection (handwear and headwear)
 */
import type { GarmentRow, HandwearRow, HeadwearRow, HeadwearRecommendations } from './types';
import type { AccessoryAssessment, AccessoryAssessments } from '@/types/biophysics';
import type { ActivityType, HoodType } from '@/lib/biophysics/constants';
import { HOOD_CLO_VALUES } from '@/lib/biophysics/constants';
import { localThermalStatus, THERMAL_DISPLAY_CLO_EPSILON } from '@/lib/biophysics/comfort';
import type { PhaseTargets } from './thermal-targets';

// Headwear type categories
const HELMET_TYPES = ['ski_helmet'];
export const HEAD_WARMTH_TYPES = ['liner_beanie', 'midweight_beanie', 'heavy_beanie', 'balaclava_light', 'balaclava_heavy', 'headband'];
const NECK_WARMTH_TYPES = ['buff_thin', 'buff_heavy', 'facemask'];

/** Shared with response scoring: incompatible hoods cannot count under a helmet. */
export function hoodInsulation(ensemble: GarmentRow[], hasHelmet: boolean): number {
  return ensemble.reduce((clo, garment) => {
    const hood = garment.hood_type;
    return clo + (hood && hood in HOOD_CLO_VALUES && (!hasHelmet || hood === 'helmet_compatible')
      ? HOOD_CLO_VALUES[hood as HoodType] : 0);
  }, 0);
}

/** Bounded compatibility mapping from existing catalog metadata. A category
 * alone does not prove pole handling; exclude mittens and require dexterity. */
export function supportsPoleGrip(item: HandwearRow): boolean {
  return ['liner_glove', 'light_glove', 'insulated_glove'].includes(item.handwear_type)
    && typeof item.dexterity_score === 'number' && item.dexterity_score >= 5;
}

const knownInsulation = (item: { rcl_clo: number }) =>
  typeof item.rcl_clo === 'number' && Number.isFinite(item.rcl_clo) && item.rcl_clo >= 0;

interface PhaseAccessorySelection {
  handwear: HandwearRow | null;
  headwear: HeadwearRecommendations;
  assessments?: AccessoryAssessments;
  warnings: string[];
}

/** Explicit sport/phase adoption. Only sustained running/XC opt into bare
 * candidates and local upper limits. Cycling, alpine and touring retain their
 * prior temperature/target rules, including mandatory descent helmets. */
export function selectPhaseAccessories(
  activity: ActivityType,
  targets: PhaseTargets,
  pool: { handwear: HandwearRow[]; headwear: HeadwearRow[]; availability?: 'unknown' },
  tempC: number,
  ensemble: GarmentRow[] = [],
): PhaseAccessorySelection {
  if (!targets.policy) {
    const activeHands = ['running', 'biking', 'xc_skiing'].includes(activity);
    return {
      handwear: selectHandwear(pool.handwear, tempC, activeHands, targets.extremity.neutral.hands),
      headwear: selectHeadwearByCategory(pool.headwear, tempC, activeHands || activity === 'ski_touring_uphill', {
        includeHelmet: activity === 'alpine_skiing' || activity === 'ski_touring_downhill',
      }),
      warnings: [],
    };
  }

  const { min, neutral } = targets.extremity;
  const maximum = targets.extremity.max ?? neutral;
  const poleGrip = targets.policy.protection.poleGrip;
  const handsInRange = pool.handwear.filter(item => knownInsulation(item)
    && localThermalStatus(item.rcl_clo, min.hands, maximum.hands) === 'in_range');
  const thermalHandsNeeded = min.hands > THERMAL_DISPLAY_CLO_EPSILON;
  // Bare hands are a real candidate. Functional XC gloves may win even when
  // no insulation is needed, but an expedition mitten cannot fill that role.
  const handwear = !thermalHandsNeeded && !poleGrip ? null : [...handsInRange].sort((a, b) => {
    const gripA = poleGrip && supportsPoleGrip(a) ? 1 : 0;
    const gripB = poleGrip && supportsPoleGrip(b) ? 1 : 0;
    if (gripA !== gripB) return gripB - gripA;
    const wetA = targets.policy!.protection.wet && a.waterproof ? 1 : 0;
    const wetB = targets.policy!.protection.wet && b.waterproof ? 1 : 0;
    if (wetA !== wetB) return wetB - wetA;
    const windA = targets.policy!.protection.wind && a.windproof ? 1 : 0;
    const windB = targets.policy!.protection.wind && b.windproof ? 1 : 0;
    if (windA !== windB) return windB - windA;
    return a.rcl_clo - b.rcl_clo || a.id.localeCompare(b.id);
  }).find(item => thermalHandsNeeded || supportsPoleGrip(item)) ?? null;

  // Head + neck options share one local budget, including existing hood
  // insulation. Neck-only coverage cannot silently satisfy a head need.
  const hoodClo = hoodInsulation(ensemble, false);
  const heads = pool.headwear.filter(item => HEAD_WARMTH_TYPES.includes(item.headwear_type));
  const necks = pool.headwear.filter(item => NECK_WARMTH_TYPES.includes(item.headwear_type));
  const combinations = [null, ...heads.filter(knownInsulation)].flatMap(head =>
    [null, ...necks.filter(knownInsulation)].flatMap(neck => {
      if (neck && (!head && hoodClo === 0 || head?.covers_neck)) return [];
      const clo = hoodClo + (head?.rcl_clo ?? 0) + (neck?.rcl_clo ?? 0);
      return localThermalStatus(clo, min.head, maximum.head) === 'in_range'
        ? [{ head, neck, clo, count: Number(!!head) + Number(!!neck) }] : [];
    }));
  combinations.sort((a, b) => a.count - b.count || a.clo - b.clo
    || (a.head?.id ?? '').localeCompare(b.head?.id ?? '') || (a.neck?.id ?? '').localeCompare(b.neck?.id ?? ''));
  const headChoice = combinations[0];
  const headwear: HeadwearRecommendations = {
    helmet: null, headWarmth: headChoice?.head ?? null, neckWarmth: headChoice?.neck ?? null,
  };

  function assessment(
    part: 'hands' | 'head', items: Array<HandwearRow | HeadwearRow>, candidates: Array<HandwearRow | HeadwearRow>,
    clo: number, functionalMissing = false,
  ): AccessoryAssessment {
    const thermalNeeded = min[part] > THERMAL_DISPLAY_CLO_EPSILON;
    const thermal_status = localThermalStatus(clo, min[part], maximum[part]);
    const unresolved = thermal_status === 'under' || functionalMissing;
    const unknownData = pool.availability === 'unknown' || candidates.some(item => !knownInsulation(item));
    const state = unresolved ? unknownData ? 'unknown' : 'missing'
      : items.length ? 'selected' : 'not_needed';
    const grip = part === 'hands' && poleGrip;
    const purpose = thermalNeeded ? grip ? 'thermal_and_pole_grip' : 'thermal' : grip ? 'pole_grip' : 'none';
    const message = state === 'unknown' ? `${part}: suitable accessory data is unknown; check warmth and protection before use.`
      : state === 'missing' ? `${part}: no suitable ${functionalMissing ? 'pole-grip gloves' : 'thermal accessory'} available; check warmth and protection before use.`
      : thermal_status === 'over' ? `${part}: existing hood insulation exceeds the local warmth range; vent the hood or choose a lighter layer.`
      : purpose === 'pole_grip' ? 'Thin XC gloves provide pole grip and friction protection; extra thermal insulation is not required.'
      : state === 'not_needed' ? `${part}: no additional thermal coverage needed during sustained activity.`
      : `${part}: selected for the local warmth range${grip ? ' and pole grip' : ''}.`;
    return { state, purpose, thermal_status, selected_ids: items.map(item => item.id), clo, min: min[part], max: maximum[part], message };
  }
  const assessments: AccessoryAssessments = {
    hands: assessment('hands', handwear ? [handwear] : [], pool.handwear, handwear?.rcl_clo ?? 0,
      poleGrip && (!handwear || !supportsPoleGrip(handwear))),
    head: assessment('head', [headwear.headWarmth, headwear.neckWarmth].filter((item): item is HeadwearRow => !!item),
      [...heads, ...(hoodClo > 0 || heads.length > 0 ? necks : [])], headChoice?.clo ?? hoodClo),
  };
  const warnings = Object.values(assessments).filter(value => value.state === 'missing' || value.state === 'unknown' || value.thermal_status === 'over')
    .map(value => value.message);
  if (handwear && targets.policy.protection.wet && !handwear.waterproof) {
    warnings.push('Selected gloves have no confirmed waterproof protection; keep hands dry and carry a dry pair for wet conditions.');
  }
  if (handwear && targets.policy.protection.wind && !handwear.windproof) {
    warnings.push('Selected gloves have no confirmed wind protection; consider a wind-resistant pair for exposed conditions.');
  }
  return { handwear, headwear, assessments, warnings };
}

/**
 * Select best handwear based on temperature
 */
export function selectHandwear(
  handwear: HandwearRow[],
  tempC: number,
  isActive: boolean,
  targetClo?: number
): HandwearRow | null {
  if (handwear.length === 0) return null;

  // Filter by temperature suitability
  const suitable = handwear.filter((h) => {
    const minTemp = isActive ? h.min_temp_active : h.min_temp_static;
    return minTemp === undefined || minTemp === null || tempC >= minTemp;
  });

  const candidates = suitable.length > 0 ? suitable : handwear;

  // If we have a hand clo target, choose the closest glove with a mild overshoot penalty.
  if (targetClo !== undefined) {
    // With an explicit clo target, do not hard-filter by min temp.
    // Instead, apply a cold-mismatch penalty when current temp is below glove's recommended minimum.
    const targetCandidates = [...handwear];
    const minRatio = tempC <= 0 ? 0.8 : 0.65;
    const minimumAcceptableClo = targetClo * minRatio;
    const constrainedCandidates = targetCandidates.filter((c) => c.rcl_clo >= minimumAcceptableClo);
    const pool = constrainedCandidates.length > 0 ? constrainedCandidates : targetCandidates;

    const scored = [...pool].sort((a, b) => {
      const deltaA = a.rcl_clo - targetClo;
      const deltaB = b.rcl_clo - targetClo;
      const costA = deltaA > 0 ? deltaA * 2 : Math.abs(deltaA);
      const costB = deltaB > 0 ? deltaB * 2 : Math.abs(deltaB);
      const minTempA = isActive ? a.min_temp_active : a.min_temp_static;
      const minTempB = isActive ? b.min_temp_active : b.min_temp_static;
      const belowMinA =
        minTempA !== undefined && minTempA !== null ? Math.max(0, minTempA - tempC) : 0;
      const belowMinB =
        minTempB !== undefined && minTempB !== null ? Math.max(0, minTempB - tempC) : 0;
      const tempPenaltyA = belowMinA > 0 ? (belowMinA * belowMinA) * 0.08 : 0;
      const tempPenaltyB = belowMinB > 0 ? (belowMinB * belowMinB) * 0.08 : 0;
      const totalA = costA + tempPenaltyA;
      const totalB = costB + tempPenaltyB;

      if (totalA !== totalB) return totalA - totalB;
      if (Math.abs(deltaA) !== Math.abs(deltaB)) return Math.abs(deltaA) - Math.abs(deltaB);
      return a.rcl_clo - b.rcl_clo;
    });
    return scored[0] || null;
  }

  // Fallback: temperature-only sort
  const sorted = [...candidates].sort((a, b) => {
    if (tempC < -10) return b.rcl_clo - a.rcl_clo; // Cold: prefer warmer
    if (tempC > 0) return a.rcl_clo - b.rcl_clo;   // Warm: prefer lighter
    return b.rcl_clo - a.rcl_clo; // Default: prefer warmer
  });

  return sorted[0] || null;
}

/**
 * Select headwear by category - returns helmet, head warmth, and neck warmth separately
 */
export function selectHeadwearByCategory(
  headwear: HeadwearRow[],
  tempC: number,
  isActive: boolean,
  options?: { includeHelmet?: boolean }
): HeadwearRecommendations {
  const includeHelmet = options?.includeHelmet ?? false;
  const helmets = includeHelmet
    ? headwear.filter((h) => HELMET_TYPES.includes(h.headwear_type))
    : [];
  const headWarmthItems = headwear.filter((h) => HEAD_WARMTH_TYPES.includes(h.headwear_type));
  const neckWarmthItems = headwear.filter((h) => NECK_WARMTH_TYPES.includes(h.headwear_type));

  // Select best helmet (prefer warmer for cold, but helmets have similar warmth)
  const helmet = selectBestFromCategory(helmets, tempC, isActive);

  // Select best head warmth layer based on temperature
  const headWarmth = selectBestFromCategory(headWarmthItems, tempC, isActive);

  // Select neck warmth if cold enough (below 0°C / 32°F)
  const neckWarmth = tempC < 0 ? selectBestFromCategory(neckWarmthItems, tempC, isActive) : null;

  return { helmet, headWarmth, neckWarmth };
}

/**
 * Select best item from a category based on temperature
 */
function selectBestFromCategory(
  items: HeadwearRow[],
  tempC: number,
  isActive: boolean
): HeadwearRow | null {
  if (items.length === 0) return null;

  // Filter by temperature suitability
  const suitable = items.filter((h) => {
    const minTemp = isActive ? h.min_temp_active : h.min_temp_static;
    return minTemp === undefined || minTemp === null || tempC >= minTemp;
  });

  // Sort by clo (warmest first for cold, lightest first for warm)
  const sorted = [...(suitable.length > 0 ? suitable : items)].sort((a, b) => {
    if (tempC < -10) return b.rcl_clo - a.rcl_clo; // Cold: prefer warmer
    if (tempC > 0) return a.rcl_clo - b.rcl_clo;   // Warm: prefer lighter
    return b.rcl_clo - a.rcl_clo; // Default: prefer warmer
  });

  return sorted[0] || null;
}
