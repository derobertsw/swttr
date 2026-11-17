/**
 * Extremity gear selection (handwear and headwear)
 */
import type { GarmentRow, HandwearRow, HeadwearRow, HeadwearRecommendations } from './types';
import type { AccessoryAssessment, AccessoryAssessments } from '@/types/biophysics';
import type { ActivityType, HoodType } from '@/lib/biophysics/constants';
import { HOOD_CLO_VALUES } from '@/lib/biophysics/constants';
import { localThermalStatus, THERMAL_DISPLAY_CLO_EPSILON, type ExtremityCloValues } from '@/lib/biophysics/comfort';
import { POLE_GRIP_MAX_CLO } from '@/lib/biophysics/sport-policy';
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
function supportsPoleGrip(item: HandwearRow): boolean {
  return ['liner_glove', 'light_glove', 'insulated_glove'].includes(item.handwear_type)
    && typeof item.dexterity_score === 'number' && item.dexterity_score >= 5;
}

/** Only finite nonnegative catalog clo can participate in thermal selection. */
const knownInsulation = (item: { rcl_clo: number }) =>
  typeof item.rcl_clo === 'number' && Number.isFinite(item.rcl_clo) && item.rcl_clo >= 0;

/** Which catalog rating matches a phase: active use, or static (chairlift rides, descents). */
type RatingBasis = 'active' | 'static';

/**
 * How one sport phase chooses its accessories. Running and XC take theirs
 * from the sustained-activity policy; the other phases are listed below.
 */
interface AccessoryPolicy {
  /** Going bare-handed competes with gloves (running and XC only). */
  bareHands: boolean;
  /** XC: gloves that grip poles are functional protection, chosen whenever
   * any exist and reported when missing. */
  poleGrip: boolean;
  /** Prefer gloves with confirmed protection, among those that fit. */
  wind: boolean;
  wet: boolean;
  rating: RatingBasis;
  /** A helmet is required protection, worn whatever the thermal budget. */
  helmet: boolean;
  /** Sustained running/XC: glove protection warnings and sustained-effort wording. */
  sustained: boolean;
}

/**
 * Cycling, alpine and ski touring keep their gloves on whatever the thermal
 * budget. Thin gloves up to XC's catalog liner allowance aren't judged as
 * overheating; like that allowance, this is not added thermal demand.
 */
const KEPT_GLOVE_MAX_CLO = POLE_GRIP_MAX_CLO;

/** Each phase keeps its own policy (#370): gloves stay on; ratings follow the
 * phase's activity level; helmets are required for alpine and the descent;
 * wind preference follows the phase's exposure. */
const PHASE_POLICIES: Partial<Record<ActivityType, Omit<AccessoryPolicy, 'wet'>>> = {
  biking: { bareHands: false, poleGrip: false, wind: true, rating: 'active', helmet: false, sustained: false },
  alpine_skiing: { bareHands: false, poleGrip: false, wind: true, rating: 'static', helmet: true, sustained: false },
  ski_touring_uphill: { bareHands: false, poleGrip: false, wind: false, rating: 'active', helmet: false, sustained: false },
  ski_touring_downhill: { bareHands: false, poleGrip: false, wind: true, rating: 'static', helmet: true, sustained: false },
};

function accessoryPolicy(activity: ActivityType, targets: PhaseTargets, wet: boolean): AccessoryPolicy {
  if (targets.policy) {
    const { protection } = targets.policy;
    return {
      bareHands: true, poleGrip: protection.poleGrip,
      wind: protection.wind, wet: protection.wet, rating: 'active', helmet: false, sustained: true,
    };
  }
  return { ...(PHASE_POLICIES[activity] ?? PHASE_POLICIES.biking!), wet };
}

/**
 * Catalog temperature ratings check the heuristic local bands in deep cold:
 * an item rated for the phase's activity level only above
 * `tempC + RATING_TOLERANCE_C` (two 5°C rating steps) gives way to items
 * rated for these conditions.
 */
const RATING_TOLERANCE_C = 10;

function ratedFor(item: HandwearRow | HeadwearRow, tempC: number, basis: RatingBasis): boolean {
  const minimum = basis === 'static' ? item.min_temp_static : item.min_temp_active;
  return minimum == null || minimum <= tempC + RATING_TOLERANCE_C;
}

/**
 * When nothing fits the local range: how far an option lies outside what the
 * outfit check accepts, with a shortfall counting double an excess. A much
 * warmer item loses to a small shortfall, and a large one loses to it.
 */
function outsideRange(clo: number, minimum: number, maximum: number): number {
  return Math.round((2 * Math.max(0, minimum - clo - THERMAL_DISPLAY_CLO_EPSILON)
    + Math.max(0, clo - maximum - THERMAL_DISPLAY_CLO_EPSILON)) * 1e4);
}

interface PhaseAccessorySelection {
  handwear: HandwearRow | null;
  headwear: HeadwearRecommendations;
  assessments: AccessoryAssessments;
  /** The local upper limits the outfit is judged against: the band's, raised
   * for kept thin gloves, a required helmet, or the lightest rated choice
   * when only unrated items would meet the band. */
  extremityMax: ExtremityCloValues;
  warnings: string[];
}

/**
 * Choose hand, head and neck warmth against the phase's local bands, for
 * every sport and phase, under that phase's policy. A required helmet and
 * any worn hood count in the head budget.
 */
export function selectPhaseAccessories(
  activity: ActivityType,
  targets: PhaseTargets,
  pool: { handwear: HandwearRow[]; headwear: HeadwearRow[]; availability?: 'unknown' },
  tempC: number,
  ensemble: GarmentRow[] = [],
  options: { precipitation?: boolean; preferHandwearId?: string } = {},
): PhaseAccessorySelection {
  const policy = accessoryPolicy(activity, targets, options.precipitation ?? false);
  const { min, neutral } = targets.extremity;
  const maximum = { ...(targets.extremity.max ?? neutral) };
  if (!policy.bareHands) maximum.hands = Math.max(maximum.hands, KEPT_GLOVE_MAX_CLO);
  const rated = (item: HandwearRow | HeadwearRow) => ratedFor(item, tempC, policy.rating);
  /** Items rated for these conditions, or every item when none is: something beats nothing in the cold. */
  const preferRated = <T extends HandwearRow | HeadwearRow>(items: T[]): T[] => {
    const ratedItems = items.filter(rated);
    return ratedItems.length > 0 ? ratedItems : items;
  };
  /** A part's inventory has items rated for these conditions and items that
   * aren't: the ratings say the conditions are colder than the lighter gear is
   * meant for, so leaving the part short is no longer a choice. */
  const deepCold = (items: Array<HandwearRow | HeadwearRow>) => items.some(rated) && items.some(item => !rated(item));

  const { poleGrip } = policy;
  const knownHands = pool.handwear.filter(knownInsulation);
  const ratedHands = preferRated(knownHands);
  // XC gloves must grip poles; warmth alone decides only when none can.
  const gripHands = poleGrip ? ratedHands.filter(supportsPoleGrip) : [];
  const hands = gripHands.length > 0 ? gripHands : ratedHands;
  const handsInRange = hands.filter(item => localThermalStatus(item.rcl_clo, min.hands, maximum.hands) === 'in_range');
  const thermalHandsNeeded = min.hands > THERMAL_DISPLAY_CLO_EPSILON;
  const preferred = (item: HandwearRow | null) => (item && item.id === options.preferHandwearId ? 1 : 0);
  // Bare hands are a real candidate only where the policy allows it. Functional
  // XC gloves may win even when no insulation is needed, but an expedition
  // mitten cannot fill that role.
  let handwear = !thermalHandsNeeded && !poleGrip && policy.bareHands ? null : [...handsInRange].sort((a, b) => {
    const gripA = poleGrip && supportsPoleGrip(a) ? 1 : 0;
    const gripB = poleGrip && supportsPoleGrip(b) ? 1 : 0;
    if (gripA !== gripB) return gripB - gripA;
    // One pair carries over from the climb to the descent when it fits.
    if (preferred(a) !== preferred(b)) return preferred(b) - preferred(a);
    const wetA = policy.wet && a.waterproof ? 1 : 0;
    const wetB = policy.wet && b.waterproof ? 1 : 0;
    if (wetA !== wetB) return wetB - wetA;
    const windA = policy.wind && a.windproof ? 1 : 0;
    const windB = policy.wind && b.windproof ? 1 : 0;
    if (windA !== windB) return windB - windA;
    return a.rcl_clo - b.rcl_clo || a.id.localeCompare(b.id);
  }).find(item => thermalHandsNeeded || !policy.bareHands || supportsPoleGrip(item)) ?? null;
  if (!handwear && (thermalHandsNeeded || !policy.bareHands)) {
    // Nothing fits: weigh going without against the nearest glove, unless
    // the policy keeps gloves on or the ratings say it's too cold to go
    // without. In deep cold, rated gear bounds the choice: the lightest rated
    // glove that reaches the band's minimum, or else the warmest, with any
    // shortfall still reported.
    const coldHands = deepCold(knownHands);
    const reaching = coldHands ? hands.filter(item => localThermalStatus(item.rcl_clo, min.hands, maximum.hands) !== 'under') : [];
    const nearest = reaching.length > 0 ? reaching : [...(policy.bareHands && !coldHands ? [null] : []), ...hands];
    handwear = nearest.sort((a, b) =>
      outsideRange(a?.rcl_clo ?? 0, min.hands, maximum.hands) - outsideRange(b?.rcl_clo ?? 0, min.hands, maximum.hands)
      || Number(!!b && poleGrip && supportsPoleGrip(b)) - Number(!!a && poleGrip && supportsPoleGrip(a))
      || preferred(b) - preferred(a)
      || (a?.rcl_clo ?? 0) - (b?.rcl_clo ?? 0) || (a?.id ?? '').localeCompare(b?.id ?? ''))[0] ?? null;
  }

  // Head + neck options share one local budget with a required helmet and
  // any worn hood (only helmet-compatible hoods under a helmet). Neck-only
  // coverage cannot silently satisfy a bare head, and a neck piece must
  // itself be rated for the conditions.
  const helmet = policy.helmet ? selectHelmet(pool.headwear, tempC) : null;
  const helmetClo = helmet && knownInsulation(helmet) ? helmet.rcl_clo : 0;
  const hoodClo = hoodInsulation(ensemble, helmet != null);
  const baseClo = hoodClo + helmetClo;
  // A required helmet is never judged as overheating: when it alone is
  // above the band, it sets the head's upper limit.
  if (localThermalStatus(helmetClo, min.head, maximum.head) === 'over') maximum.head = Math.round(helmetClo * 100) / 100;
  const heads = pool.headwear.filter(item => HEAD_WARMTH_TYPES.includes(item.headwear_type));
  const necks = pool.headwear.filter(item => NECK_WARMTH_TYPES.includes(item.headwear_type));
  const knownHeads = heads.filter(knownInsulation);
  const ratedNecks = necks.filter(item => knownInsulation(item) && rated(item));
  const combine = (overlapping: boolean) => [null, ...preferRated(knownHeads)].flatMap(head =>
    [null, ...ratedNecks].flatMap(neck => {
      if (neck && !head && baseClo === 0) return [];
      if (overlapping !== Boolean(neck && head?.covers_neck)) return [];
      // Summed in the order the outfit check sums worn items, then the hood.
      const clo = [helmet ? helmetClo : null, head?.rcl_clo, neck?.rcl_clo]
        .reduce<number>((total, value) => value == null ? total : total + value, 0) + hoodClo;
      return [{ head, neck, clo, count: Number(!!head) + Number(!!neck) }];
    }));
  // In deep cold, a head left short by the helmet and hood alone gets a hat:
  // a neck piece can't stand in for one, even within the band.
  const hatRequired = deepCold(knownHeads) && localThermalStatus(baseClo, min.head, maximum.head) === 'under';
  const allowed = <T extends { head: HeadwearRow | null }>(options: T[]) => {
    const withHat = options.filter(option => option.head);
    return hatRequired && withHat.length > 0 ? withHat : options;
  };
  // A neck piece goes over a balaclava only when nothing else allowed reaches
  // the band's minimum, as in deep cold.
  const separate = combine(false);
  const combinations = allowed(separate).some(option => localThermalStatus(option.clo, min.head, maximum.head) !== 'under')
    ? separate : [...separate, ...combine(true)];
  const byItems = (a: typeof combinations[number], b: typeof combinations[number]) => a.count - b.count || a.clo - b.clo
    || (a.head?.id ?? '').localeCompare(b.head?.id ?? '') || (a.neck?.id ?? '').localeCompare(b.neck?.id ?? '');
  const headOptions = allowed(combinations);
  const headInRange = headOptions.filter(option => localThermalStatus(option.clo, min.head, maximum.head) === 'in_range');
  const headReaching = deepCold(knownHeads)
    ? headOptions.filter(option => localThermalStatus(option.clo, min.head, maximum.head) !== 'under') : [];
  const headChoice = headInRange.length > 0 ? [...headInRange].sort(byItems)[0]
    : [...(headReaching.length > 0 ? headReaching : headOptions)].sort((a, b) =>
      outsideRange(a.clo, min.head, maximum.head) - outsideRange(b.clo, min.head, maximum.head) || byItems(a, b))[0];
  const headwear: HeadwearRecommendations = {
    helmet, headWarmth: headChoice?.head ?? null, neckWarmth: headChoice?.neck ?? null,
  };

  // In deep cold, nothing rated fits the heuristic band: the lightest rated
  // choice sets the upper limit, so it isn't judged as overheating.
  const ratingLimited = { hands: false, head: false };
  const raiseForRating = (part: 'hands' | 'head', known: Array<HandwearRow | HeadwearRow>, clo: number) => {
    if (!deepCold(known) || localThermalStatus(clo, min[part], maximum[part]) !== 'over') return;
    maximum[part] = Math.round(clo * 100) / 100;
    ratingLimited[part] = true;
  };
  if (handwear) raiseForRating('hands', knownHands, handwear.rcl_clo);
  if (headChoice?.head) raiseForRating('head', knownHeads, headChoice.clo);

  /** Separate worn warmth from unresolved inventory or functional protection. */
  function assessment(
    part: 'hands' | 'head', items: Array<HandwearRow | HeadwearRow>, candidates: Array<HandwearRow | HeadwearRow>,
    clo: number, functionalMissing = false, unknownWorn = false,
  ): AccessoryAssessment {
    const thermalNeeded = min[part] > THERMAL_DISPLAY_CLO_EPSILON;
    const thermal_status = localThermalStatus(clo, min[part], maximum[part]);
    const unresolved = thermal_status === 'under' || functionalMissing || unknownWorn;
    const unknownData = unknownWorn || pool.availability === 'unknown' || candidates.some(item => !knownInsulation(item));
    const state = unresolved ? unknownData ? 'unknown' : 'missing'
      : items.length ? 'selected' : 'not_needed';
    const grip = part === 'hands' && poleGrip;
    const purpose = thermalNeeded ? grip ? 'thermal_and_pole_grip' : 'thermal' : grip ? 'pole_grip' : 'none';
    const keptGloves = part === 'hands' && !policy.bareHands;
    const missingItem = !functionalMissing ? 'thermal accessory' : grip ? 'pole-grip gloves' : 'gloves';
    const message = state === 'unknown' ? `${part}: suitable accessory data is unknown; check warmth and protection before use.`
      : state === 'missing' && items.length > 0 && !functionalMissing ? `${part}: the closest available option still falls short of the local warmth range; check warmth before use.`
      : state === 'missing' && keptGloves && functionalMissing ? 'hands: no gloves available, and gloves stay on for this activity; check warmth and protection before use.'
      : state === 'missing' ? `${part}: no suitable ${missingItem} available; check warmth and protection before use.`
      : thermal_status === 'over' && items.length > 0 && keptGloves ? 'hands: gloves stay on for this activity, and the lightest available pair is warmer than the local warmth range.'
      : thermal_status === 'over' && items.length > 0 ? `${part}: the lightest available option is warmer than the local warmth range; going without would leave you colder.`
      : thermal_status === 'over' ? `${part}: existing hood insulation exceeds the local warmth range; vent the hood or choose a lighter layer.`
      : purpose === 'pole_grip' ? 'Thin XC gloves provide pole grip and friction protection; extra thermal insulation is not required.'
      : state === 'not_needed' ? `${part}: no additional thermal coverage needed${policy.sustained ? ' during sustained activity' : ''}.`
      : ratingLimited[part] ? `${part}: selected the lightest option rated for this cold; lighter ${part === 'hands' ? 'gloves' : 'hats'} aren't rated for it.`
      : `${part}: selected for the local warmth range${grip ? ' and pole grip' : ''}.`;
    return { state, purpose, thermal_status, selected_ids: items.map(item => item.id), clo, min: min[part], max: maximum[part], message };
  }
  const assessments: AccessoryAssessments = {
    // Pole-grip gloves, and gloves a phase keeps on, are protection even with
    // no thermal demand; running's bare hands stay a valid choice.
    hands: assessment('hands', handwear ? [handwear] : [], pool.handwear, handwear?.rcl_clo ?? 0,
      (poleGrip && (!handwear || !supportsPoleGrip(handwear))) || (!policy.bareHands && !handwear)),
    head: assessment('head', [headwear.headWarmth, headwear.neckWarmth].filter((item): item is HeadwearRow => !!item),
      [...heads, ...(baseClo > 0 || heads.length > 0 ? necks : [])], headChoice?.clo ?? baseClo,
      false, helmet != null && !knownInsulation(helmet)),
  };
  const warnings = Object.values(assessments).filter(value => value.state === 'missing' || value.state === 'unknown' || value.thermal_status === 'over')
    .map(value => value.message);
  for (const item of [handwear, headwear.headWarmth].filter((worn): worn is HandwearRow | HeadwearRow => !!worn)) {
    if (!rated(item)) warnings.push(`${item.brand} ${item.model_name} isn't rated for this cold; check warmth before use.`);
  }
  if (policy.sustained && handwear && policy.wet && !handwear.waterproof) {
    warnings.push('Selected gloves have no confirmed waterproof protection; keep hands dry and carry a dry pair for wet conditions.');
  }
  if (policy.sustained && handwear && policy.wind && !handwear.windproof) {
    warnings.push('Selected gloves have no confirmed wind protection; consider a wind-resistant pair for exposed conditions.');
  }
  return { handwear, headwear, assessments, extremityMax: maximum, warnings };
}

/** Required helmet for alpine and the touring descent (which one: #373). */
function selectHelmet(headwear: HeadwearRow[], tempC: number): HeadwearRow | null {
  return selectBestFromCategory(headwear.filter((h) => HELMET_TYPES.includes(h.headwear_type)), tempC, false);
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
