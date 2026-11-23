/**
 * Hood head warmth in torso selection (#413): the selectors that choose torso
 * layers before the head count a hood the way the accessories and the outfit
 * check do, so a hood that overheats the head loses to an outfit without it,
 * and a hood that fills a gap no hat can loses nothing.
 */
import { describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import type { ActivityType } from '@/lib/biophysics/constants';
import type { ExertionLevel } from '@/lib/biophysics/exertion';
import { categorizeGarments } from './categorization';
import { hoodHeadPlanner, hoodInsulation, selectPhaseAccessories } from './extremities';
import type { RecommendationRequest } from './request';
import { alpine } from './sports/alpine';
import { biking } from './sports/biking';
import { buildRunningEnsemble } from './sports/running-outfit';
import { running } from './sports/running';
import { skiTouring } from './sports/ski-touring';
import { buildTouringClimbEnsemble } from './sports/ski-touring-outfit';
import { buildXCEnsemble, xc } from './sports/xc';
import type { PhaseTargets } from './thermal-targets';
import type { GarmentRow, HeadwearRow } from './types';

const GARMENTS = catalog.garments as GarmentRow[];
const HEADWEAR = catalog.headwear as unknown as HeadwearRow[];
const f2c = (f: number) => (f - 32) * 5 / 9;

interface Conditions { tempF: number; windMph: number; exertion?: ExertionLevel; snow?: boolean }

function request({ tempF, windMph, exertion = 'moderate', snow = false }: Conditions) {
  return {
    tempC: f2c(tempF), windMs: windMph * 0.44704, humidity: snow ? 85 : 50, exertion, bodyMetrics: DEFAULT_BODY_METRICS,
    precipitation: snow, weather: { temperature: tempF, wind_speed: windMph, ...(snow ? { precipitation: true, precipitation_type: 'snow' } : {}) },
  } as unknown as RecommendationRequest;
}

const PHASES: Array<[ActivityType, (c: Conditions) => PhaseTargets]> = [
  ['running', c => running.computeTargets(request(c))],
  ['xc_skiing', c => xc.computeTargets(request(c))],
  ['biking', c => biking.computeTargets(request(c))],
  ['alpine_skiing', c => alpine.computeTargets(request(c))],
  ['ski_touring_uphill', c => skiTouring.computeTargets(request(c)).uphill],
  ['ski_touring_downhill', c => skiTouring.computeTargets(request(c)).downhill],
];
const hooded = (...types: string[]) => types.map((hood_type, i) => ({ id: `hood-${i}`, hood_type }) as GarmentRow);
const counted = (outfit: GarmentRow[]) => outfit.filter(g => g.hood_type && g.hood_type !== 'none');

describe('the torso selectors and the accessories agree on what a hood leaves for the head', () => {
  const cases = PHASES.flatMap(([activity, targetsFor]) => [56, 25, 5, -15].flatMap(tempF =>
    [[], ['attached'], ['helmet_compatible'], ['attached', 'helmet_compatible'], ['insulated']].map(types =>
      ({ activity, targetsFor, tempF, types })))).map(c => ({ ...c, name: `${c.activity} ${c.tempF}°F ${c.types.join('+') || 'no hood'}` }));

  it.each(cases)('$name', ({ activity, targetsFor, tempF, types }) => {
    const targets = targetsFor({ tempF, windMph: 10 });
    const ensemble = hooded(...types);
    const planner = hoodHeadPlanner(activity, targets, HEADWEAR, f2c(tempF));
    const selection = selectPhaseAccessories(activity, targets, { handwear: [], headwear: HEADWEAR }, f2c(tempF), ensemble);
    // Same hood credit, with the same helmet rule.
    expect(planner.hoodClo(ensemble)).toBe(hoodInsulation(ensemble, selection.headwear.helmet != null));
    // The gap is zero exactly when the chosen accessories leave the head in band.
    const gap = planner.gap(planner.hoodClo(ensemble));
    const status = selection.assessments.head.thermal_status;
    expect({ over: gap.excess > 0, under: gap.deficit > 0 }).toEqual({ over: status === 'over', under: status === 'under' });
  });

  it('counts only helmet-compatible hoods where a helmet is required', () => {
    const targets = alpine.computeTargets(request({ tempF: 25, windMph: 10 }));
    const planner = hoodHeadPlanner('alpine_skiing', targets, HEADWEAR, f2c(25));
    expect(planner.hoodClo(hooded('attached'))).toBe(0);
    expect(planner.hoodClo(hooded('helmet_compatible'))).toBeGreaterThan(0);
    // No helmet in the pool: every hood counts, as the outfit check counts it.
    expect(hoodHeadPlanner('alpine_skiing', targets, [], f2c(25)).hoodClo(hooded('attached'))).toBeGreaterThan(0);
  });
});

describe('running chooses between a hooded and an unhooded top by what the hood does to the head', () => {
  const top = GARMENTS.find(g => g.model_name === 'Capilene Cool Lightweight')!;
  const tights = GARMENTS.find(g => g.usage === 'standalone' && g.category === 'base_layer' && g.coverage_legs === 1)!;
  // The same top with a hood, sorted first so it would win any tie.
  const hoodie = { ...top, id: `0-${top.id}`, model_name: 'Capilene Cool Hoodie', hood_type: 'attached' };
  const pool = categorizeGarments([hoodie, top, tights]);

  it('leaves the hood off when it would push the head over its band', () => {
    const conditions = { tempF: 45, windMph: 4, exertion: 'easy' as const };
    const targets = running.computeTargets(request(conditions));
    const head = hoodHeadPlanner('running', targets, HEADWEAR, f2c(45));
    expect(head.gap(head.hoodClo([hoodie])).excess).toBeGreaterThan(0);
    // Without the planner the hood doesn't count: the search sees one top
    // and keeps the first sorted, the hoodie.
    expect(buildRunningEnsemble(pool, targets)).toContain(hoodie);
    expect(buildRunningEnsemble(pool, targets, 0.3, { head })).toEqual([top, tights]);
  });

  it('wears the hood when it puts the head in band and no hat is available', () => {
    // Sorted last this time, so it loses the tie without the planner.
    const lateHoodie = { ...hoodie, id: `zz-${top.id}` };
    const late = categorizeGarments([top, lateHoodie, tights]);
    const conditions = { tempF: 30, windMph: 10 };
    const targets = running.computeTargets(request(conditions));
    const head = hoodHeadPlanner('running', targets, [], f2c(30));
    expect(head.gap(0).deficit).toBeGreaterThan(0);
    expect(head.gap(head.hoodClo([lateHoodie]))).toEqual({ deficit: 0, excess: 0 });
    expect(buildRunningEnsemble(late, targets)).toContain(top);
    expect(buildRunningEnsemble(late, targets, 0.3, { head })).toContain(lateHoodie);
  });
});

describe('the catalog outfits from #413 no longer stack hoods over the head band', () => {
  const snow = { tempF: 5, windMph: 20, exertion: 'hard' as const, snow: true };
  const breezy = { tempF: 18, windMph: 15 };

  it.each([
    ['running', snow], ['running', breezy], ['xc_skiing', snow], ['xc_skiing', breezy],
  ] as const)('%s at %j: one hood at most, and the head in band', (activity, conditions) => {
    const sport = activity === 'running' ? running : xc;
    const targets = sport.computeTargets(request(conditions));
    const head = hoodHeadPlanner(activity, targets, HEADWEAR, f2c(conditions.tempF));
    const categorized = categorizeGarments(GARMENTS);
    const build = (planner?: typeof head) => activity === 'running'
      ? buildRunningEnsemble(categorized, targets, 0.3, { head: planner })
      : buildXCEnsemble(categorized, targets.regional, 0.25, targets.policy!.protection, planner);
    // Before #413: two hoods, with the head over its band.
    expect(counted(build()).length).toBe(2);
    const outfit = build(head);
    expect(counted(outfit).length).toBeLessThanOrEqual(1);
    const accessories = selectPhaseAccessories(activity, targets, { handwear: [], headwear: HEADWEAR }, f2c(conditions.tempF), outfit);
    expect(accessories.assessments.head.thermal_status).toBe('in_range');
  });

  it('the touring climb wears a hooded fleece instead of a hat that overshoots its head band', () => {
    const conditions = { tempF: 25, windMph: 12 };
    const touring = skiTouring.computeTargets(request(conditions));
    const fleece = GARMENTS.find(g => g.model_name === 'R1 Pullover')!;
    const hoody = GARMENTS.find(g => g.model_name === 'R1 Air Full-Zip Hoody')!;
    const pants = GARMENTS.find(g => g.model_name === 'Wind Shield Pants')!;
    const overBand = HEADWEAR.filter(h => h.model_name === 'Rho LTW Beanie');
    const pool = categorizeGarments([fleece, hoody, pants]);
    const head = hoodHeadPlanner('ski_touring_uphill', touring.uphill, overBand, f2c(25));
    const climb = (planner?: typeof head) =>
      buildTouringClimbEnsemble(pool, touring.uphill.regional, touring.climbProtection, 0.2, planner).map(g => g.id);
    expect(climb()).toContain(fleece.id);
    expect(climb(head)).toContain(hoody.id);
    const accessories = selectPhaseAccessories('ski_touring_uphill', touring.uphill, { handwear: [], headwear: overBand },
      f2c(25), [hoody, pants]);
    expect(accessories.headwear.headWarmth).toBeNull();
    expect(accessories.assessments.head.thermal_status).toBe('in_range');
  });
});
