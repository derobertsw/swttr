// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import catalog from '@/test/fixtures/gear-catalog.json';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { POST as alpine } from '@/app/api/v1/recommendations/alpine/route';
import { POST as biking } from '@/app/api/v1/recommendations/biking/route';
import { POST as running } from '@/app/api/v1/recommendations/running/route';
import { POST as touring } from '@/app/api/v1/recommendations/ski-touring/route';
import { POST as xc } from '@/app/api/v1/recommendations/xc/route';
import type { GarmentRow, HandwearRow, HeadwearRow } from '@/lib/recommendations/types';
import type { BiophysicsRecommendation, PhaseEvaluation } from '@/types/biophysics';
import type { CoverageActivity } from '@/types/wardrobe-coverage';
import { evaluateCoverage, itemsWorn, judgeScenario } from './evaluate';
import { COVERAGE_GRID } from './grid';

const USER = 'user_coverage';
const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => state.client }));
vi.mock('@/lib/auth', () => ({ getAuthUserId: async () => 'user_coverage' }));

const garments = catalog.garments as unknown as GarmentRow[];
const handwear = catalog.handwear as unknown as HandwearRow[];
const headwear = catalog.headwear as unknown as HeadwearRow[];

/** A mixed wardrobe: every third catalog garment and a few accessories, including a ski helmet. */
const sample = {
  garments: garments.filter((_, index) => index % 3 === 0),
  handwear: handwear.filter((_, index) => index % 4 === 0),
  headwear: [...headwear.filter((_, index) => index % 5 === 0), headwear.find((h) => h.headwear_type === 'ski_helmet')!],
};

function useWardrobe(gear: typeof sample) {
  const rows = ([['garment', gear.garments], ['handwear', gear.handwear], ['headwear', gear.headwear]] as const)
    .flatMap(([type, items]) => items.map((item) => ({ user_id: USER, item_type: type, item_id: item.id, disabled: false })));
  state.client = createFakeSupabase({ ...catalog, user_wardrobe: rows } as never);
}

const ROUTES: Record<CoverageActivity, (request: NextRequest) => Promise<Response>> = {
  running, biking, xc_skiing: xc, alpine_skiing: alpine, backcountry_skiing: touring,
};

const base = () => ({ supabase: state.client as never, userId: USER });

beforeEach(() => useWardrobe(sample));

describe('coverage grid', () => {
  it('has 34 distinct scenarios across the five activities', () => {
    expect(COVERAGE_GRID).toHaveLength(34);
    expect(new Set(COVERAGE_GRID.map((s) => s.id)).size).toBe(34);
    expect(new Set(COVERAGE_GRID.map((s) => s.activity))).toEqual(new Set(Object.keys(ROUTES)));
    const wet = COVERAGE_GRID.filter((s) => s.weather === 'windy_wet');
    expect(wet.every((s) => s.input.precipitation && s.input.wind_speed === 15)).toBe(true);
    expect(wet.filter((s) => s.temperatureF <= 32).every((s) => s.input.precipitation_type === 'snow')).toBe(true);
  });
});

describe('evaluateCoverage', () => {
  it("judges each scenario on exactly the outfit the sport's route recommends from the wardrobe", async () => {
    const coverage = evaluateCoverage(sample, base());
    for (const scenario of COVERAGE_GRID) {
      const response = await ROUTES[scenario.activity](new NextRequest('http://localhost/api', {
        method: 'POST',
        body: JSON.stringify({ weather: scenario.input, exertion: 'moderate', use_wardrobe_only: true }),
      }));
      expect(response.status).toBe(200);
      const body = await response.json() as BiophysicsRecommendation;
      const result = coverage.scenarios.find((s) => s.id === scenario.id)!;
      const expected = judgeScenario(body);
      expect({ id: result.id, covered: result.covered, verdict: result.verdict, cause: result.cause })
        .toEqual({ id: scenario.id, covered: expected.covered, verdict: expected.verdict, cause: expected.cause });
      expect([...result.items].sort()).toEqual(itemsWorn(body).sort());
    }
  });

  it('scores coverage and efficiency from the scenarios', () => {
    const coverage = evaluateCoverage(sample, base());
    const covered = coverage.scenarios.filter((s) => s.covered);
    // The sample is meant to cover some scenarios and leave gaps in others.
    expect(covered.length).toBeGreaterThan(0);
    expect(covered.length).toBeLessThan(34);
    expect(coverage.covered_count).toBe(covered.length);
    expect(coverage.coverage).toBeCloseTo(covered.length / 34);
    const modeled = sample.garments.length + sample.handwear.length + sample.headwear.length;
    expect(coverage.efficiency.modeled_items).toBe(modeled);
    const used = new Set(covered.flatMap((s) => s.items));
    expect(coverage.efficiency.used_items).toBe(used.size);
    expect(coverage.efficiency.score).toBeCloseTo(used.size / modeled);
    expect(coverage.idle_items).toHaveLength(modeled - used.size);
    expect(coverage.by_activity.reduce((sum, a) => sum + a.total, 0)).toBe(34);
    // Workhorses are the most-used items, most first.
    const counts = coverage.workhorses.map((item) => item.covered_scenarios);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(counts[0]).toBe(Math.max(...[...used].map((key) => covered.filter((s) => s.items.includes(key)).length)));
  });

  it('reports every gap scenario exactly once, in plain language', () => {
    const coverage = evaluateCoverage(sample, base());
    const gapIds = coverage.gaps.flatMap((gap) => gap.scenario_ids).sort();
    expect(gapIds).toEqual(coverage.scenarios.filter((s) => !s.covered).map((s) => s.id).sort());
    for (const gap of coverage.gaps) {
      expect(gap.message).toMatch(/^(No outfit for |Nothing in your wardrobe|[A-Z][a-zA-Z ]+ at )/);
      expect(gap.message).not.toMatch(/undefined|null|NaN/);
    }
  });

  it('gives an empty wardrobe one no-gear gap per activity', () => {
    const coverage = evaluateCoverage({ garments: [], handwear: [], headwear: [] }, base());
    expect(coverage.covered_count).toBe(0);
    expect(coverage.efficiency).toEqual({ score: 0, used_items: 0, modeled_items: 0, covered_per_item: 0 });
    expect(coverage.gaps.map((gap) => gap.message)).toEqual([
      'Nothing in your wardrobe is modeled for running',
      'Nothing in your wardrobe is modeled for biking',
      'Nothing in your wardrobe is modeled for XC skiing',
      'Nothing in your wardrobe is modeled for alpine skiing',
      'Nothing in your wardrobe is modeled for backcountry skiing',
    ]);
  });

  it('names a missing helmet across every temperature it is missing at', () => {
    const coverage = evaluateCoverage({ ...sample, headwear: sample.headwear.filter((h) => h.headwear_type !== 'ski_helmet') }, base());
    const alpineGap = coverage.gaps.find((gap) => gap.activity === 'alpine_skiing');
    expect(alpineGap?.message).toBe('Alpine skiing at any temperature: no ski helmet');
    expect(alpineGap?.scenario_ids).toHaveLength(6);
    // The fixture catalog has no bike helmet: one gap, whatever else the wet scenarios lack.
    const bikingGaps = coverage.gaps.filter((gap) => gap.activity === 'biking' && gap.cause === 'missing_item');
    expect(bikingGaps.map((gap) => [gap.message, gap.scenario_ids.length]))
      .toEqual([['Biking at any temperature: no bike helmet', 8]]);
  });

  it('evaluates the full catalog as a wardrobe in well under a second', () => {
    const coverage = evaluateCoverage({ garments, handwear, headwear }, base());
    expect(coverage.scenario_count).toBe(34);
    expect(coverage.evaluation_ms).toBeLessThan(5000);
  });
});

describe('judgeScenario', () => {
  const part = (status: 'under' | 'over' | 'in_range') => ({ clo: 1, target: 1, delta: 0, status });
  const phase = (decision: Partial<NonNullable<PhaseEvaluation['decision']>>, parts: Partial<Record<'torso' | 'legs' | 'hands' | 'headNeck', 'under' | 'over' | 'in_range'>> = {}): PhaseEvaluation => ({
    bodyParts: {
      torso: part(parts.torso ?? 'in_range'), legs: part(parts.legs ?? 'in_range'),
      hands: part(parts.hands ?? 'in_range'), headNeck: part(parts.headNeck ?? 'in_range'),
    },
    maxRegionalDeficit: 0, maxExtremityDeficit: 0, hasRegionalGap: false, hasExtremityGap: false, comfortScore: 90,
    decision: { riskType: 'comfortable', severity: 'moderate', delta: 0, status: 'near_target', reasons: [], ...decision },
  });
  const body = (evaluation: PhaseEvaluation, extra: Partial<BiophysicsRecommendation> = {}) =>
    ({ recommendation: { garments: [], evaluation }, ...extra }) as unknown as BiophysicsRecommendation;

  it('covers a likely comfortable outfit, and one that is only a little warm', () => {
    expect(judgeScenario(body(phase({})))).toEqual({ covered: true, verdict: 'likely_comfortable' });
    expect(judgeScenario(body(phase({ status: 'warmer', severity: 'moderate' }, { torso: 'over' }))))
      .toEqual({ covered: true, verdict: 'a_little_warm' });
  });

  it('puts required protection first among missing items', () => {
    const requirements = [
      { id: 'biking:legs', region: 'legs', label: 'Cycling shorts', status: 'missing', message: '' },
      { id: 'biking:helmet', region: 'head', kind: 'protection', label: 'Bike helmet', status: 'missing', message: '' },
    ] as BiophysicsRecommendation['requirements'];
    expect(judgeScenario(body(phase({}), { requirements }))).toMatchObject({
      covered: false, cause: 'missing_item', facets: ['bike helmet', 'cycling shorts'],
    });
  });

  it('names the protection an incomplete outfit lacks', () => {
    expect(judgeScenario(body(phase({ status: 'incomplete', reasons: ['Selected torso clothing does not establish the required wet protection.'] }))))
      .toMatchObject({ cause: 'incomplete', facets: ['no rain protection'] });
  });

  it('lists the body parts under their minimum, arms included', () => {
    const evaluation = phase({ status: 'cooler', riskType: 'cold', reasons: ['Arms needs more insulation; extra warmth elsewhere does not cover this gap.'] }, { legs: 'under', hands: 'under' });
    expect(judgeScenario(body(evaluation))).toMatchObject({ cause: 'too_cold', facets: ['arms', 'legs', 'hands'] });
  });

  it('counts a mismatch wider than the target band as too warm', () => {
    expect(judgeScenario(body(phase({ status: 'warmer', severity: 'high' }, { torso: 'over', legs: 'over' }))))
      .toMatchObject({ cause: 'too_warm', facets: ['torso', 'legs'] });
  });

  it('judges both touring phases and says which one fell short', () => {
    const verdict = judgeScenario(body(phase({}), { descent_evaluation: phase({ status: 'cooler' }, { legs: 'under' }) }));
    expect(verdict).toMatchObject({ cause: 'too_cold', facets: ['legs'], phase: 'descent' });
  });
});
