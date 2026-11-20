/**
 * Extremity gear selection (handwear and headwear)
 */
import type { GarmentRow, HandwearRow, HeadwearRow, HeadwearRecommendations } from './types';
import type { AccessoryAssessment, AccessoryAssessments } from '@/types/biophysics';
import type { ActivityType, HoodType } from '@/lib/biophysics/constants';
import { ACCESSORY_CLO_SCALE, HOOD_CLO_VALUES } from '@/lib/biophysics/constants';
import { EXTREMITY_CLO_EPSILON, localThermalStatus, type ExtremityCloValues } from '@/lib/biophysics/comfort';
import { POLE_GRIP_MAX_CLO } from '@/lib/biophysics/sport-policy';
import type { PhaseTargets } from './thermal-targets';

// Headwear type categories
/** Helmets each sport or phase requires: protection, chosen whatever the
 * thermal demand. A ski helmet doesn't stand in for a bike helmet, or the reverse. */
export const REQUIRED_HELMET_TYPES: Partial<Record<ActivityType, readonly string[]>> = {
  alpine_skiing: ['ski_helmet'],
  ski_touring_downhill: ['ski_helmet'],
  biking: ['bike_helmet'],
};
/** Every helmet type; none of them counts as head warmth. */
export const HELMET_TYPES: readonly string[] = ['ski_helmet', 'bike_helmet'];
export const HEAD_WARMTH_TYPES = ['liner_beanie', 'midweight_beanie', 'heavy_beanie', 'balaclava_light', 'balaclava_heavy', 'headband'];
const NECK_WARMTH_TYPES = ['buff_thin', 'buff_heavy', 'facemask'];

/**
 * How much of a worn hood's hood-up insulation counts toward the head. The
 * engine can't tell whether a hood is up, so it keeps the weight the head
 * bands were tuned with: on the earlier accessory scale a hood counted at its
 * hood-up value against hats at about 2.2x theirs. An unvalidated
 * assumption that keeps selection where it was; counting hoods in full is a
 * product decision (docs/catalog-accessory-clo.md, "Hoods").
 */
export const HOOD_HEAD_CREDIT = ACCESSORY_CLO_SCALE.head;

/** Shared with response scoring: incompatible hoods cannot count under a helmet. */
export function hoodInsulation(ensemble: GarmentRow[], hasHelmet: boolean): number {
  return ensemble.reduce((clo, garment) => {
    const hood = garment.hood_type;
    return clo + (hood && hood in HOOD_CLO_VALUES && (!hasHelmet || hood === 'helmet_compatible')
      ? HOOD_CLO_VALUES[hood as HoodType] * HOOD_HEAD_CREDIT : 0);
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
 * phase's activity level; helmets (REQUIRED_HELMET_TYPES) are required for alpine, the descent and cycling;
 * wind preference follows the phase's exposure. */
const PHASE_POLICIES: Partial<Record<ActivityType, Omit<AccessoryPolicy, 'wet'>>> = {
  biking: { bareHands: false, poleGrip: false, wind: true, rating: 'active', helmet: true, sustained: false },
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

/** Rating checks for one phase's conditions. */
function ratingChecks(tempC: number, basis: RatingBasis) {
  const rated = (item: HandwearRow | HeadwearRow) => ratedFor(item, tempC, basis);
  return {
    rated,
    /** Items rated for these conditions, or every item when none is: something beats nothing in the cold. */
    preferRated: <T extends HandwearRow | HeadwearRow>(items: T[]): T[] => {
      const ratedItems = items.filter(rated);
      return ratedItems.length > 0 ? ratedItems : items;
    },
    /** A part's inventory has items rated for these conditions and items that
     * aren't: the ratings say the conditions are colder than the lighter gear is
     * meant for, so leaving the part short is no longer a choice. */
    deepCold: (items: Array<HandwearRow | HeadwearRow>) => items.some(rated) && items.some(item => !rated(item)),
  };
}

/**
 * When nothing fits the local range: how far an option lies outside what the
 * outfit check accepts, with a shortfall counting double an excess. A much
 * warmer item loses to a small shortfall, and a large one loses to it.
 */
function outsideRange(clo: number, minimum: number, maximum: number, tolerance: number): number {
  return Math.round((2 * Math.max(0, minimum - clo - tolerance)
    + Math.max(0, clo - maximum - tolerance)) * 1e4);
}

interface HeadChoice {
  head: HeadwearRow | null;
  neck: HeadwearRow | null;
  /** Worn head and neck insulation, the helmet and hood included. */
  clo: number;
}

/**
 * Head and neck choices for one phase, before any garment is chosen: the
 * required helmet, the candidate hats and neck pieces, and how to choose
 * among them for a given worn-hood insulation. Accessory selection and the
 * torso selectors (#413) both choose through this, so they agree on what a
 * hood leaves for the head.
 */
function headSelection(
  activity: ActivityType, targets: PhaseTargets, policy: AccessoryPolicy, headwear: HeadwearRow[], tempC: number,
) {
  const { rated, preferRated, deepCold } = ratingChecks(tempC, policy.rating);
  const minimum = targets.extremity.min.head;
  const tolerance = EXTREMITY_CLO_EPSILON.head;
  const status = (clo: number, maximum: number) => localThermalStatus(clo, minimum, maximum, tolerance);
  // Head + neck options share one local budget with a required helmet and
  // any worn hood (only helmet-compatible hoods under a helmet). Neck-only
  // coverage cannot silently satisfy a bare head, and a neck piece must
  // itself be rated for the conditions.
  const helmet = policy.helmet ? selectHelmet(headwear, tempC, REQUIRED_HELMET_TYPES[activity] ?? []) : null;
  const helmetClo = helmet && knownInsulation(helmet) ? helmet.rcl_clo : 0;
  const bandMax = targets.extremity.max?.head ?? targets.extremity.neutral.head;
  // A required helmet is never judged as overheating: when it alone is
  // above the band, it sets the head's upper limit.
  const helmetMax = status(helmetClo, bandMax) === 'over' ? Math.round(helmetClo * 100) / 100 : bandMax;
  // Under a helmet, only head warmth that fits under one (#373); a thick beanie doesn't.
  const heads = headwear.filter(item => HEAD_WARMTH_TYPES.includes(item.headwear_type)
    && (!helmet || item.helmet_compatible !== false));
  const necks = headwear.filter(item => NECK_WARMTH_TYPES.includes(item.headwear_type));
  const knownHeads = heads.filter(knownInsulation);
  const ratedNecks = necks.filter(item => knownInsulation(item) && rated(item));
  const coldHeads = deepCold(knownHeads);

  /** The head and neck pieces to wear over a hood of this insulation, and the
   * head's upper limit they are judged against. */
  function choose(hoodClo: number): { choice: HeadChoice | undefined; maximum: number; ratingLimited: boolean } {
    const baseClo = hoodClo + helmetClo;
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
    const hatRequired = coldHeads && status(baseClo, helmetMax) === 'under';
    const allowed = <T extends { head: HeadwearRow | null }>(options: T[]) => {
      const withHat = options.filter(option => option.head);
      return hatRequired && withHat.length > 0 ? withHat : options;
    };
    // A neck piece goes over a balaclava only when nothing else allowed reaches
    // the band's minimum, as in deep cold.
    const separate = combine(false);
    const combinations = allowed(separate).some(option => status(option.clo, helmetMax) !== 'under')
      ? separate : [...separate, ...combine(true)];
    const byItems = (a: typeof combinations[number], b: typeof combinations[number]) => a.count - b.count || a.clo - b.clo
      || (a.head?.id ?? '').localeCompare(b.head?.id ?? '') || (a.neck?.id ?? '').localeCompare(b.neck?.id ?? '');
    const headOptions = allowed(combinations);
    const headInRange = headOptions.filter(option => status(option.clo, helmetMax) === 'in_range');
    const headReaching = coldHeads ? headOptions.filter(option => status(option.clo, helmetMax) !== 'under') : [];
    const outside = (clo: number) => outsideRange(clo, minimum, helmetMax, tolerance);
    const choice = headInRange.length > 0 ? [...headInRange].sort(byItems)[0]
      : [...(headReaching.length > 0 ? headReaching : headOptions)].sort((a, b) =>
        outside(a.clo) - outside(b.clo) || byItems(a, b))[0];
    // In deep cold, nothing rated fits the heuristic band: the lightest rated
    // choice sets the upper limit, so it isn't judged as overheating.
    const ratingLimited = Boolean(choice?.head && coldHeads && status(choice.clo, helmetMax) === 'over');
    return { choice, maximum: ratingLimited ? Math.round(choice!.clo * 100) / 100 : helmetMax, ratingLimited };
  }

  return { helmet, helmetClo, heads, necks, choose };
}

/**
 * What a worn hood leaves for the head, for the selectors that choose torso
 * layers before the head (#413). They count a hood the way the outfit check
 * does (`hoodInsulation`), then ask how far outside the head band the
 * accessories chosen over it (`selectPhaseAccessories`) would still leave the
 * head. A hood that leaves the head in band costs nothing; one that pushes it
 * over, or leaves a gap no hat closes, costs that distance.
 */
export interface HoodHeadPlanner {
  /** Head insulation the hoods among these garments add. Additive over garments. */
  hoodClo(garments: GarmentRow[]): number;
  /** The head's shortfall below and excess above its band beyond the outfit
   * check's tolerance, once accessories are chosen over a hood of this
   * insulation. In clo of the head itself (the part-manikin scale), the same
   * kind of local insulation as the regional gaps it is added to. */
  gap(hoodClo: number): { deficit: number; excess: number };
}

export function hoodHeadPlanner(
  activity: ActivityType, targets: PhaseTargets, headwear: HeadwearRow[], tempC: number,
): HoodHeadPlanner {
  const selection = headSelection(activity, targets, accessoryPolicy(activity, targets, false), headwear, tempC);
  const helmetWorn = selection.helmet != null;
  const minimum = targets.extremity.min.head;
  const tolerance = EXTREMITY_CLO_EPSILON.head;
  const cache = new Map<number, { deficit: number; excess: number }>();
  return {
    hoodClo: garments => hoodInsulation(garments, helmetWorn),
    gap(hoodClo) {
      const cached = cache.get(hoodClo);
      if (cached) return cached;
      const { choice, maximum } = selection.choose(hoodClo);
      const clo = choice?.clo ?? hoodClo + selection.helmetClo;
      const gap = {
        deficit: Math.max(0, minimum - clo - tolerance),
        excess: Math.max(0, clo - maximum - tolerance),
      };
      cache.set(hoodClo, gap);
      return gap;
    },
  };
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
  /** A hand or head option against the part's band, at the part's tolerance. */
  const status = (part: 'hands' | 'head', clo: number) =>
    localThermalStatus(clo, min[part], maximum[part], EXTREMITY_CLO_EPSILON[part]);
  const outside = (part: 'hands' | 'head', clo: number) =>
    outsideRange(clo, min[part], maximum[part], EXTREMITY_CLO_EPSILON[part]);
  const { rated, preferRated, deepCold } = ratingChecks(tempC, policy.rating);

  const { poleGrip } = policy;
  const knownHands = pool.handwear.filter(knownInsulation);
  const ratedHands = preferRated(knownHands);
  // XC gloves must grip poles; warmth alone decides only when none can.
  const gripHands = poleGrip ? ratedHands.filter(supportsPoleGrip) : [];
  const hands = gripHands.length > 0 ? gripHands : ratedHands;
  const handsInRange = hands.filter(item => status('hands', item.rcl_clo) === 'in_range');
  const thermalHandsNeeded = min.hands > EXTREMITY_CLO_EPSILON.hands;
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
    const reaching = coldHands ? hands.filter(item => status('hands', item.rcl_clo) !== 'under') : [];
    const nearest = reaching.length > 0 ? reaching : [...(policy.bareHands && !coldHands ? [null] : []), ...hands];
    handwear = nearest.sort((a, b) =>
      outside('hands', a?.rcl_clo ?? 0) - outside('hands', b?.rcl_clo ?? 0)
      || Number(!!b && poleGrip && supportsPoleGrip(b)) - Number(!!a && poleGrip && supportsPoleGrip(a))
      || preferred(b) - preferred(a)
      || (a?.rcl_clo ?? 0) - (b?.rcl_clo ?? 0) || (a?.id ?? '').localeCompare(b?.id ?? ''))[0] ?? null;
  }

  // The head's choice, shared with the torso selectors (`hoodHeadPlanner`).
  const { helmet, helmetClo, heads, necks, choose } = headSelection(activity, targets, policy, pool.headwear, tempC);
  const hoodClo = hoodInsulation(ensemble, helmet != null);
  const baseClo = hoodClo + helmetClo;
  const { choice: headChoice, maximum: headMaximum, ratingLimited: headRatingLimited } = choose(hoodClo);
  maximum.head = headMaximum;
  const headwear: HeadwearRecommendations = {
    helmet, headWarmth: headChoice?.head ?? null, neckWarmth: headChoice?.neck ?? null,
  };

  // In deep cold, nothing rated fits the heuristic band: the lightest rated
  // choice sets the upper limit, so it isn't judged as overheating.
  const ratingLimited = { hands: false, head: headRatingLimited };
  if (handwear && deepCold(knownHands) && status('hands', handwear.rcl_clo) === 'over') {
    maximum.hands = Math.round(handwear.rcl_clo * 100) / 100;
    ratingLimited.hands = true;
  }

  /** Separate worn warmth from unresolved inventory or functional protection. */
  function assessment(
    part: 'hands' | 'head', items: Array<HandwearRow | HeadwearRow>, candidates: Array<HandwearRow | HeadwearRow>,
    clo: number, functionalMissing = false, unknownWorn = false,
  ): AccessoryAssessment {
    const thermalNeeded = min[part] > EXTREMITY_CLO_EPSILON[part];
    const thermal_status = status(part, clo);
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

/** The helmet a sport or phase requires (REQUIRED_HELMET_TYPES), worn whatever the thermal budget. */
function selectHelmet(headwear: HeadwearRow[], tempC: number, types: readonly string[]): HeadwearRow | null {
  return selectBestFromCategory(headwear.filter((h) => types.includes(h.headwear_type)), tempC, false);
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
