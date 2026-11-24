/**
 * Wardrobe coverage (#93): runs the personalized recommendation pipeline on
 * the wardrobe for every scenario in the grid, in-process, and summarizes
 * which scenarios it dresses for, the gaps, and the items doing the work.
 *
 * Nothing here changes a recommendation. Each scenario is exactly what the
 * sport's route would answer for the wardrobe (use_wardrobe_only, default
 * effort, standard body metrics, neutral targets), judged by the verdicts the
 * engine already reports:
 *
 * - Covered: every phase is "Likely comfortable" (`near_target`), or
 *   "Warmer than recommended" by no more than one target band's width (the
 *   engine's moderate severity), which venting or leaving a layer off covers.
 * - A gap otherwise, by the first of: no modeled gear for the activity; a
 *   required item the engine reports missing (a helmet, or a clothing
 *   requirement it couldn't match); an incomplete outfit (no clothing for a
 *   region, or the wind/rain protection the conditions need); a body part or
 *   the whole body under its minimum; or well over the upper target.
 */
import { categorizeGarments } from '@/lib/recommendations/categorization';
import { suitsActivity, type GearPool } from '@/lib/recommendations/gear-pool';
import type { SportRecommender } from '@/lib/recommendations/handler';
import type { RecommendationRequest } from '@/lib/recommendations/request';
import { alpine } from '@/lib/recommendations/sports/alpine';
import { biking } from '@/lib/recommendations/sports/biking';
import { running } from '@/lib/recommendations/sports/running';
import { skiTouring } from '@/lib/recommendations/sports/ski-touring';
import { xc } from '@/lib/recommendations/sports/xc';
import { fahrenheitToCelsius, mphToMs } from '@/lib/biophysics/ireq';
import { DEFAULT_EXERTION_LEVEL } from '@/lib/biophysics/exertion';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import type { BiophysicsRecommendation, EvaluatedBodyPart, PhaseEvaluation } from '@/types/biophysics';
import type {
  CoverageActivity,
  CoverageGap,
  CoverageGapCause,
  CoverageItem,
  CoverageScenarioResult,
  CoverageWeather,
  WardrobeCoverage,
} from '@/types/wardrobe-coverage';
import { COVERAGE_ACTIVITIES, COVERAGE_GRID, GRID_DESCRIPTION, GRID_VERSION, type CoverageScenario } from './grid';

type Recommend = (request: RecommendationRequest, pool: GearPool) => BiophysicsRecommendation;

function runner<Targets>(sport: SportRecommender<Targets>): { activity?: string; recommend: Recommend } {
  return {
    activity: sport.catalog.activity,
    recommend: (request, pool) => sport.recommend(request, sport.computeTargets(request), pool),
  };
}

const SPORTS: Record<CoverageActivity, ReturnType<typeof runner>> = {
  running: runner(running),
  biking: runner(biking),
  xc_skiing: runner(xc),
  alpine_skiing: runner(alpine),
  backcountry_skiing: runner(skiTouring),
};

const LABELS = Object.fromEntries(COVERAGE_ACTIVITIES.map(({ activity, label }) => [activity, label])) as Record<CoverageActivity, string>;
const TEMPERATURES = Object.fromEntries(COVERAGE_ACTIVITIES.map(({ activity, temperaturesF }) => [activity, temperaturesF])) as Record<CoverageActivity, number[]>;
const CAUSE_ORDER: CoverageGapCause[] = ['no_gear', 'missing_item', 'incomplete', 'too_cold', 'too_warm'];
const WORKHORSE_COUNT = 5;

/** In the order gaps list them. Arms are judged in the decision but not listed in bodyParts. */
const PARTS = ['torso', 'arms', 'legs', 'hands', 'head'] as const;
const PART_NAMES: Record<EvaluatedBodyPart, (typeof PARTS)[number]> = { torso: 'torso', legs: 'legs', hands: 'hands', headNeck: 'head' };

/** The wardrobe as the pipeline loads it: every usable item, before any activity filter. */
export interface WardrobeGear {
  /** Included catalog garments with usable thermal data. */
  garments: NonNullable<GearPool['garments']>;
  handwear: GearPool['handwear'];
  headwear: GearPool['headwear'];
}

/**
 * A scenario's verdict. `facets` are what fell short: missing item labels
 * (required protection first), body parts, or one incomplete-outfit reason.
 */
interface Verdict {
  covered: boolean;
  verdict: CoverageScenarioResult['verdict'];
  cause?: CoverageGapCause;
  facets?: string[];
  /** Ski touring: the phase that fell short. */
  phase?: 'climb' | 'descent';
}

const itemName = (row: { brand: string; model_name: string }) => `${row.brand} ${row.model_name}`.trim();

function joinWords(words: string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/** "Bike helmet" → "bike helmet"; keeps "XC ski gloves" and "Nordic". */
function inSentence(label: string): string {
  return /^[A-Z]{2}|^Nordic/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/** Body parts under their minimum (`under`) or over their upper target (`over`). */
function partsWith(evaluation: PhaseEvaluation, status: 'under' | 'over'): string[] {
  const parts = new Set<string>((Object.keys(PART_NAMES) as EvaluatedBodyPart[])
    .filter((part) => evaluation.bodyParts[part]?.status === status)
    .map((part) => PART_NAMES[part]));
  const armsReason = status === 'under' ? 'Arms needs more insulation' : 'Arms has more insulation';
  if (evaluation.decision?.reasons?.some((reason) => reason.startsWith(armsReason))) parts.add('arms');
  return PARTS.filter((part) => parts.has(part));
}

function incompleteReason(evaluation: PhaseEvaluation): string {
  const reasons = evaluation.decision?.reasons ?? [];
  const noClothing = reasons.map((reason) => /^No worn clothing selected for (.+?)\./.exec(reason)?.[1]).find(Boolean);
  if (noClothing) return `nothing to wear on the ${noClothing}`;
  const needs = new Set(reasons.map((reason) => /does not establish the required (wind|wet) protection/.exec(reason)?.[1]).filter(Boolean));
  if (needs.size) return needs.has('wet') ? 'no rain protection' : 'no wind protection';
  if (reasons.some((reason) => reason.startsWith('Pole-grip hand protection is missing'))) return 'no gloves for pole grip';
  return (evaluation.decision?.summary ?? 'outfit incomplete').toLowerCase();
}

/** The scenario's verdict from the engine's own requirements and phase decisions. */
export function judgeScenario(body: BiophysicsRecommendation): Verdict {
  const missing = (body.requirements ?? []).filter((requirement) => requirement.status === 'missing')
    .sort((a, b) => Number(b.kind === 'protection') - Number(a.kind === 'protection'));
  if (missing.length) {
    return { covered: false, verdict: 'gap', cause: 'missing_item', facets: missing.map((requirement) => inSentence(requirement.label)) };
  }

  const twoPhase = Boolean(body.descent_evaluation);
  const phases = [
    { evaluation: body.recommendation.evaluation, phase: twoPhase ? 'climb' as const : undefined },
    ...(twoPhase ? [{ evaluation: body.descent_evaluation, phase: 'descent' as const }] : []),
  ];
  const gap = (cause: CoverageGapCause, facets: string[], phase?: Verdict['phase']): Verdict =>
    ({ covered: false, verdict: 'gap', cause, facets, ...(phase && { phase }) });
  for (const { evaluation, phase } of phases) {
    if (!evaluation?.decision) return gap('incomplete', ['insulation unknown'], phase);
    if (evaluation.decision.status === 'incomplete') return gap('incomplete', [incompleteReason(evaluation)], phase);
  }
  for (const { evaluation, phase } of phases) {
    const { status } = evaluation!.decision!;
    if (status === 'cooler' || status === 'mixed') return gap('too_cold', partsWith(evaluation!, 'under'), phase);
  }
  for (const { evaluation, phase } of phases) {
    const { status, severity } = evaluation!.decision!;
    if (status === 'warmer' && severity === 'high') return gap('too_warm', partsWith(evaluation!, 'over'), phase);
  }
  const comfortable = phases.every(({ evaluation }) => evaluation!.decision!.status === 'near_target');
  return { covered: true, verdict: comfortable ? 'likely_comfortable' : 'a_little_warm' };
}

/** "legs too cold on the descent", "no bike helmet, plus 2 more items". */
function describe(cause: CoverageGapCause, facets: string[], phase?: Verdict['phase']): string {
  const where = phase ? ` on the ${phase}` : '';
  switch (cause) {
    case 'no_gear': return 'no modeled gear';
    case 'missing_item': {
      const more = facets.length - 1;
      return `no ${facets[0]}${more > 0 ? `, plus ${more} more item${more > 1 ? 's' : ''}` : ''}`;
    }
    case 'incomplete': return `${facets[0]}${where}`;
    case 'too_cold': return `${facets.length ? joinWords(facets) : 'whole body'} too cold${where}`;
    case 'too_warm': return `${facets.length ? joinWords(facets) : 'whole body'} too warm${where}`;
  }
}

/** Wardrobe items the response wears or packs, as `<item_type>:<id>`. */
export function itemsWorn(body: BiophysicsRecommendation): string[] {
  const { recommendation } = body;
  const headwear = [recommendation.headwear, body.descent_headwear]
    .flatMap((set) => set ? [set.helmet, set.head_warmth, set.neck_warmth] : []);
  return [...new Set([
    ...recommendation.garments.map((garment) => `garment:${garment.id}`),
    ...(body.pack_items?.garments ?? []).map((garment) => `garment:${garment.id}`),
    ...[recommendation.handwear, body.descent_handwear].flatMap((item) => item ? [`handwear:${item.id}`] : []),
    ...headwear.flatMap((item) => item ? [`headwear:${item.id}`] : []),
  ])];
}

function scenarioRequest(scenario: CoverageScenario, base: Pick<RecommendationRequest, 'supabase' | 'userId'>): RecommendationRequest {
  const { input } = scenario;
  return {
    ...base,
    weather: input,
    tempC: fahrenheitToCelsius(input.temperature),
    windMs: mphToMs(input.wind_speed),
    humidity: input.humidity ?? 50,
    precipitation: input.precipitation ?? false,
    exertion: DEFAULT_EXERTION_LEVEL,
    bodyMetrics: DEFAULT_BODY_METRICS,
    useWardrobeOnly: true,
    prioritizeLightPack: false,
    outingPattern: 'unknown',
    xcExposure: 'unknown',
  };
}

/** "at 15°F and below", "at 70°F", "at any temperature". */
function temperaturePhrase(activity: CoverageActivity, failing: number[]): string {
  const all = TEMPERATURES[activity];
  const temps = [...new Set(failing)].sort((a, b) => b - a);
  if (temps.length === all.length) return 'at any temperature';
  if (temps.length === 1) return `at ${temps[0]}°F`;
  const coldest = all.slice(-temps.length);
  const warmest = all.slice(0, temps.length);
  if (temps.every((t, i) => t === coldest[i])) return `at ${temps[0]}°F and below`;
  if (temps.every((t, i) => t === warmest[i])) return `at ${temps.at(-1)}°F and above`;
  return `at ${joinWords(temps.map((t) => `${t}°F`))}`;
}

function weatherPhrase(weather: CoverageWeather | undefined, temps: number[]): string {
  if (weather === 'calm_dry') return ' in calm, dry weather';
  if (weather === 'windy_wet') {
    const precipitation = temps.every((t) => t <= 32) ? 'snow' : temps.every((t) => t > 32) ? 'rain' : 'rain or snow';
    return ` in wind and ${precipitation}`;
  }
  return '';
}

interface Judged { result: CoverageScenarioResult; verdict: Verdict }

/** What fell short in every scenario of a group, else the most common. */
function sharedFacets(group: Judged[]): string[] {
  const lists = group.map(({ verdict }) => verdict.facets ?? []);
  const shared = lists[0].filter((facet) => lists.every((list) => list.includes(facet)));
  if (shared.length || !lists.some((list) => list.length)) return shared;
  const counts = new Map<string, number>();
  for (const facet of lists.flat()) counts.set(facet, (counts.get(facet) ?? 0) + 1);
  return [[...counts].sort((a, b) => b[1] - a[1])[0][0]];
}

/**
 * Groups failing scenarios by activity, cause, phase, weather and (for
 * missing items and incomplete outfits) the first thing missing, then merges
 * a group's calm and wet halves when they fail at the same temperatures for
 * the same reason (for missing items, the same first item).
 */
function summarizeGaps(judged: Judged[]): CoverageGap[] {
  const groups = new Map<string, Judged[]>();
  for (const entry of judged) {
    const { result, verdict } = entry;
    if (verdict.covered) continue;
    const keyed = verdict.cause === 'missing_item' || verdict.cause === 'incomplete' ? verdict.facets?.[0] : '';
    const weather = verdict.cause === 'no_gear' ? '' : result.weather;
    const key = [result.activity, verdict.cause, verdict.phase ?? '', weather, keyed].join('|');
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const merged = new Map<string, { group: Judged[]; weathers: Set<CoverageWeather> }>();
  for (const group of groups.values()) {
    const { result, verdict } = group[0];
    // Missing items merge on the first one (a helmet missing in any weather
    // is one gap); the merged group then names what all of it lacks.
    const reason = verdict.cause === 'missing_item' ? verdict.facets![0] : describe(verdict.cause!, sharedFacets(group), verdict.phase);
    const temps = group.map(({ result: r }) => r.temperature_f).sort((a, b) => b - a).join(',');
    const key = [result.activity, verdict.cause, verdict.phase ?? '', reason, temps].join('|');
    const existing = merged.get(key);
    if (existing) {
      existing.group.push(...group);
      existing.weathers.add(result.weather);
    } else {
      merged.set(key, { group: [...group], weathers: new Set([result.weather]) });
    }
  }

  return [...merged.values()].map(({ group, weathers }) => {
    const { result, verdict } = group[0];
    const { activity } = result;
    const cause = verdict.cause!;
    const detail = describe(cause, sharedFacets(group), verdict.phase);
    const temps = group.map(({ result: r }) => r.temperature_f);
    const weather = cause === 'no_gear' || weathers.size > 1 ? undefined : result.weather;
    const when = `${temperaturePhrase(activity, temps)}${weatherPhrase(weather, temps)}`;
    const message = cause === 'no_gear'
      ? `Nothing in your wardrobe is modeled for ${inSentence(LABELS[activity])}`
      : cause === 'missing_item'
        ? `${LABELS[activity]} ${when}: ${detail}`
        : `No outfit for ${inSentence(LABELS[activity])} ${when}: ${detail}`;
    return { activity, cause, message, scenario_ids: group.map(({ result: r }) => r.id) };
  }).sort((a, b) => b.scenario_ids.length - a.scenario_ids.length
    || CAUSE_ORDER.indexOf(a.cause) - CAUSE_ORDER.indexOf(b.cause));
}

/**
 * Evaluate the wardrobe on the grid. `base` carries the request fields the
 * sports never read for a given pool (the client and caller).
 */
export function evaluateCoverage(
  gear: WardrobeGear,
  base: Pick<RecommendationRequest, 'supabase' | 'userId'>,
  grid: CoverageScenario[] = COVERAGE_GRID,
): Omit<WardrobeCoverage, 'cached'> {
  const started = performance.now();
  const names = new Map<string, string>([
    ...gear.garments.map((row) => [`garment:${row.id}`, itemName(row)] as const),
    ...gear.handwear.map((row) => [`handwear:${row.id}`, itemName(row)] as const),
    ...gear.headwear.map((row) => [`headwear:${row.id}`, itemName(row)] as const),
  ]);

  // One pool per activity, narrowed as loadGearPool narrows a wardrobe.
  const pools = new Map<CoverageActivity, GearPool | null>();
  const poolFor = (activity: CoverageActivity): GearPool | null => {
    if (!pools.has(activity)) {
      const garments = gear.garments.filter((garment) => suitsActivity(garment, SPORTS[activity].activity));
      pools.set(activity, garments.length ? {
        usingWardrobe: true,
        garments,
        categorized: categorizeGarments(garments),
        handwear: gear.handwear,
        headwear: gear.headwear,
        handwearOwned: gear.handwear.length > 0,
        headwearOwned: gear.headwear.length > 0,
      } : null);
    }
    return pools.get(activity)!;
  };

  const judged: Judged[] = grid.map((scenario) => {
    const identity = { id: scenario.id, activity: scenario.activity, temperature_f: scenario.temperatureF, weather: scenario.weather };
    const pool = poolFor(scenario.activity);
    const body = pool && SPORTS[scenario.activity].recommend(scenarioRequest(scenario, base), pool);
    const verdict: Verdict = body ? judgeScenario(body) : { covered: false, verdict: 'gap', cause: 'no_gear', facets: [] };
    const result: CoverageScenarioResult = {
      ...identity,
      covered: verdict.covered,
      verdict: verdict.verdict,
      ...(verdict.cause && { cause: verdict.cause, detail: describe(verdict.cause, verdict.facets ?? [], verdict.phase) }),
      items: body ? itemsWorn(body).filter((key) => names.has(key)) : [],
    };
    return { result, verdict };
  });
  const scenarios = judged.map(({ result }) => result);

  const coveredCount = scenarios.filter((s) => s.covered).length;
  const uses = new Map<string, number>([...names.keys()].map((key) => [key, 0]));
  for (const scenario of scenarios) {
    if (scenario.covered) for (const key of scenario.items) uses.set(key, uses.get(key)! + 1);
  }
  const items: CoverageItem[] = [...uses].map(([key, count]) => ({ key, name: names.get(key)!, covered_scenarios: count }))
    .sort((a, b) => b.covered_scenarios - a.covered_scenarios || a.name.localeCompare(b.name));
  const used = items.filter((item) => item.covered_scenarios > 0);
  const modeled = items.length;

  return {
    grid_version: GRID_VERSION,
    grid_description: GRID_DESCRIPTION,
    scenario_count: scenarios.length,
    covered_count: coveredCount,
    comfortable_count: scenarios.filter((s) => s.verdict === 'likely_comfortable').length,
    coverage: scenarios.length ? coveredCount / scenarios.length : 0,
    efficiency: {
      score: modeled ? used.length / modeled : 0,
      used_items: used.length,
      modeled_items: modeled,
      covered_per_item: modeled ? Math.round((coveredCount / modeled) * 100) / 100 : 0,
    },
    by_activity: COVERAGE_ACTIVITIES.map(({ activity, label }) => {
      const own = scenarios.filter((s) => s.activity === activity);
      return { activity, label, covered: own.filter((s) => s.covered).length, total: own.length };
    }),
    gaps: summarizeGaps(judged),
    workhorses: used.slice(0, WORKHORSE_COUNT),
    idle_items: items.filter((item) => item.covered_scenarios === 0),
    scenarios,
    evaluation_ms: Math.round(performance.now() - started),
  };
}
