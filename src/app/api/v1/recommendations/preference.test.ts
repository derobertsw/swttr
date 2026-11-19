/**
 * Run Warm / Run Cold in personalized recommendations (#251): request
 * resolution and ownership, the bounded band adjustment, selection changes
 * and their explanation, manual evaluation, and sports that don't take it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import catalog from '@/test/fixtures/gear-catalog.json';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { POLE_GRIP_MAX_CLO } from '@/lib/biophysics/sport-policy';
import { buildRecommendedLayers, evaluationItemsByBodyPart } from '@/lib/layers';
import type { BiophysicsRecommendation, PhaseEvaluationInput } from '@/types/biophysics';
import { POST as alpine } from './alpine/route';
import { POST as biking } from './biking/route';
import { POST as running } from './running/route';
import { POST as touring } from './ski-touring/route';
import { POST as xc } from './xc/route';
import { POST as evaluate } from '../ensembles/evaluate/route';

const state = vi.hoisted(() => ({ client: null as unknown, userId: null as string | null }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => state.client }));
vi.mock('@/lib/auth', () => ({ getAuthUserId: async () => state.userId }));

type Route = (request: NextRequest) => Promise<Response>;
type Body = BiophysicsRecommendation & { message?: string; recommendations?: { guidance: string[] } };

function useCatalog(tables: Record<string, Record<string, unknown>[]> = {}) {
  state.client = createFakeSupabase({ garments: catalog.garments, handwear: catalog.handwear, headwear: catalog.headwear, ...tables });
}

beforeEach(() => {
  state.userId = null;
  useCatalog();
});

async function call(route: Route, body: unknown): Promise<{ status: number; body: Body }> {
  const response = await route(new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
}

async function recommend(route: Route, body: Record<string, unknown>): Promise<Body> {
  const result = await call(route, body);
  expect(result.status).toBe(200);
  return result.body;
}

/** The response without what the setting adds, to compare with the standard one. */
function withoutPreference({ preference, ...body }: Body) {
  const message = preference?.message;
  return {
    ...body,
    guidance: body.guidance?.filter(line => line !== message),
    ...(body.recommendations ? { recommendations: { ...body.recommendations, guidance: body.recommendations.guidance.filter(line => line !== message) } } : {}),
  };
}

const MILD = { weather: { temperature: 56, wind_speed: 4 }, exertion: 'easy' };
const CONDITIONS = [
  { weather: { temperature: 56, wind_speed: 4 }, exertion: 'easy' },
  { weather: { temperature: 56, wind_speed: 12 }, exertion: 'moderate' },
  { weather: { temperature: 45, wind_speed: 4 }, exertion: 'moderate' },
  { weather: { temperature: 45, wind_speed: 12 }, exertion: 'easy' },
  { weather: { temperature: 35, wind_speed: 12 }, exertion: 'hard' },
  { weather: { temperature: 25, wind_speed: 4 }, exertion: 'moderate' },
  { weather: { temperature: 10, wind_speed: 12 }, exertion: 'moderate' },
  { weather: { temperature: 36, wind_speed: 8, humidity: 95, precipitation: true, precipitation_type: 'rain' }, exertion: 'moderate' },
];

describe('which setting a request uses', () => {
  it.each(['warm', null, 1, ''])('rejects temperature_sensitivity %j', async value => {
    const { status, body } = await call(running, { ...MILD, temperature_sensitivity: value });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'temperature_sensitivity must be one of: hot, neutral, cold' });
  });

  it('uses the standard targets for an older caller, signed out, and for an explicit neutral', async () => {
    const legacy = await recommend(running, MILD);
    expect(legacy).not.toHaveProperty('preference');
    expect(await recommend(running, { ...MILD, temperature_sensitivity: 'neutral' })).toEqual(legacy);
  });

  it("uses a signed-in caller's saved setting when the request has none, and the request's when it has one", async () => {
    state.userId = 'user_a';
    useCatalog({ user_preferences: [{ user_id: 'user_a', temperature_sensitivity: 'cold' }] });
    expect((await recommend(running, MILD)).preference).toMatchObject({ sensitivity: 'cold', source: 'saved' });
    expect((await recommend(running, { ...MILD, temperature_sensitivity: 'hot' })).preference)
      .toMatchObject({ sensitivity: 'hot', source: 'request' });
    // A sent neutral wins over the saved setting too.
    expect(await recommend(running, { ...MILD, temperature_sensitivity: 'neutral' })).not.toHaveProperty('preference');
  });

  it("never reads another user's saved setting", async () => {
    useCatalog({ user_preferences: [{ user_id: 'user_b', temperature_sensitivity: 'cold' }] });
    const standard = await recommend(running, MILD);
    expect(standard).not.toHaveProperty('preference');
    // Neither signed out nor with a user ID in the body.
    expect(await recommend(running, { ...MILD, user_id: 'user_b', userId: 'user_b' })).toEqual(standard);
    state.userId = 'user_a';
    expect(await recommend(running, { ...MILD, user_id: 'user_b' })).not.toHaveProperty('preference');
  });

  it('falls back to neutral when the saved setting cannot be read', async () => {
    state.userId = 'user_a';
    useCatalog({ user_preferences: [{ user_id: 'user_a', temperature_sensitivity: 'not-a-setting' }] });
    expect(await recommend(running, MILD)).not.toHaveProperty('preference');
    state.client = createFakeSupabase(
      { garments: catalog.garments, handwear: catalog.handwear, headwear: catalog.headwear },
      { missing: ['user_preferences'] },
    );
    expect(await recommend(running, MILD)).not.toHaveProperty('preference');
  });
});

describe.each([['running', running], ['xc', xc]] as const)('%s bands and layers', (_sport, route) => {
  it.each(CONDITIONS)('narrows the standard band from one side only at $weather.temperature°F, $weather.wind_speed mph, $exertion', async conditions => {
    const [hot, standard, cold] = await Promise.all((['hot', 'neutral', 'cold'] as const)
      .map(sensitivity => recommend(route, { ...conditions, temperature_sensitivity: sensitivity })));
    for (const body of [hot, cold]) {
      // Weather, heat balance, protection needs and assumptions stay as calculated.
      expect(body.conditions).toEqual(standard.conditions);
      expect([body.ireq.min, body.ireq.neutral]).toEqual([standard.ireq.min, standard.ireq.neutral]);
      expect(body.ireq.policy?.protection).toEqual(standard.ireq.policy?.protection);
      expect(body.ireq.validation_buffer_clo).toEqual(standard.ireq.validation_buffer_clo);
    }
    const s = standard.ireq;
    // Run Warm never lowers a minimum; Run Cold never raises an upper limit.
    expect(hot.ireq.target_range[0]).toBe(s.target_range[0]);
    expect(hot.ireq.regional!.min).toEqual(s.regional!.min);
    expect(hot.ireq.extremity!.min).toEqual(s.extremity!.min);
    expect(cold.ireq.target_range[1]).toBe(s.target_range[1]);
    expect(cold.ireq.regional!.neutral).toEqual(s.regional!.neutral);
    expect(cold.ireq.extremity!.neutral).toEqual(s.extremity!.neutral);
    const width = s.target_range[1] - s.target_range[0];
    // A quarter of the band, within rounding to 0.01 clo.
    expect(Math.abs(hot.ireq.target_range[1] - (s.target_range[1] - width / 4))).toBeLessThanOrEqual(0.0051);
    expect(Math.abs(cold.ireq.target_range[0] - (s.target_range[0] + width / 4))).toBeLessThanOrEqual(0.0051);
    for (const part of ['torso', 'arms', 'legs'] as const) {
      expect(hot.ireq.regional!.neutral[part]).toBeLessThanOrEqual(s.regional!.neutral[part]);
      expect(cold.ireq.regional!.min[part]).toBeGreaterThanOrEqual(s.regional!.min[part]);
      expect(cold.ireq.regional!.min[part]).toBeLessThanOrEqual(cold.ireq.regional!.neutral[part]);
    }
    // XC keeps its pole-grip glove allowance.
    if (s.policy?.protection.poleGrip) expect(hot.ireq.extremity!.max!.hands).toBeGreaterThanOrEqual(POLE_GRIP_MAX_CLO);
    expect(hot.recommendation.accessories?.hands.purpose).toBe(standard.recommendation.accessories?.hands.purpose);

    for (const [body, direction] of [[hot, -1], [cold, 1]] as const) {
      const effect = body.preference!.effect;
      expect(body.preference).toMatchObject({ targets_adjusted: true, standard_target_range: s.target_range });
      expect(body.guidance).toContain(body.preference!.message);
      expect(body.ireq.policy?.preference).toMatchObject({ bandShare: 0.25, targetsChanged: true });
      const ids = (b: Body) => b.recommendation.garments.map(g => g.id).sort();
      if (effect === 'changed_layers') {
        // Ordering where suitable alternatives exist: lighter for Run Warm, warmer for Run Cold.
        const kind = direction < 0 ? 'lighter' : 'warmer';
        expect(body.preference!.message).toContain(`That gives ${kind} layers`);
      } else {
        expect(['same_layers', 'standard_layers_kept']).toContain(effect);
        expect(ids(body)).toEqual(ids(standard));
        expect(body.preference!.message).not.toMatch(/adds|leaves out/);
      }
    }
    // Required protection is never traded away.
    const protectionWarnings = (b: Body) => b.warnings.filter(w => /^Available (XC )?clothing/.test(w)).sort();
    expect(protectionWarnings(hot)).toEqual(protectionWarnings(standard));
  });

  it('makes lighter and warmer choices somewhere in the matrix, and Run Warm never adds a shortfall', async () => {
    const effects = { hot: new Set<string>(), cold: new Set<string>() };
    for (const conditions of CONDITIONS) {
      const standard = await recommend(route, conditions);
      for (const sensitivity of ['hot', 'cold'] as const) {
        const body = await recommend(route, { ...conditions, temperature_sensitivity: sensitivity });
        effects[sensitivity].add(body.preference!.effect);
        if (sensitivity === 'hot') {
          // Against the same minimum, Run Warm's layers fall short no further than the standard ones.
          const shortfall = (b: Body) => Math.max(b.recommendation.evaluation!.maxRegionalDeficit ?? 0,
            b.ireq.target_range[0] - b.recommendation.evaluation!.totalClo!);
          expect(shortfall(body)).toBeLessThanOrEqual(Math.max(shortfall(standard), 0.05) + 0.01);
        }
      }
    }
    expect(effects.cold.has('changed_layers')).toBe(true);
    if (route === running) expect(effects.hot.has('changed_layers')).toBe(true);
    expect([...effects.hot, ...effects.cold].every(effect => effect !== 'not_supported')).toBe(true);
  });

  it('keeps the only layers in a sparse wardrobe and says so', async () => {
    const top = catalog.garments.find(g => g.model_name === 'Capilene Cool Lightweight')!;
    const bottom = catalog.garments.find(g => g.model_name === 'Generic Running Shorts')
      ?? catalog.garments.find(g => g.covers_legs && !g.covers_torso)!;
    state.userId = 'user_sparse';
    useCatalog({
      user_wardrobe: [top, bottom].map(g => ({ user_id: 'user_sparse', item_type: 'garment', item_id: g.id, disabled: false })),
    });
    for (const sensitivity of ['hot', 'cold'] as const) {
      const body = await recommend(route, { weather: { temperature: 40, wind_speed: 6 }, use_wardrobe_only: true, temperature_sensitivity: sensitivity });
      const standard = await recommend(route, { weather: { temperature: 40, wind_speed: 6 }, use_wardrobe_only: true });
      expect(body.recommendation.garments.map(g => g.id)).toEqual(standard.recommendation.garments.map(g => g.id));
      expect(['same_layers', 'standard_layers_kept']).toContain(body.preference!.effect);
    }
  });

  it('explains narrowed targets when there is no gear to choose from', async () => {
    state.userId = 'user_empty';
    const body = await recommend(route, { ...MILD, use_wardrobe_only: true, temperature_sensitivity: 'cold' });
    const standard = await recommend(route, { ...MILD, use_wardrobe_only: true });
    expect(body.message).toBe('No suitable garments found in database');
    expect(body.preference).toMatchObject({ effect: 'targets_only', targets_adjusted: true, standard_target_range: standard.ireq.target_range });
    expect(body.recommendations!.guidance).toContain(body.preference!.message);
    expect(body.ireq.target_range[0]).toBeGreaterThan(standard.ireq.target_range[0]);
  });
});

/** The evaluation input LayerDisplay sends for the recommendation's own layers. */
function phase(body: BiophysicsRecommendation): PhaseEvaluationInput {
  const { ireq, recommendation: rec } = body;
  return {
    ...(ireq.policy?.preference?.targetsChanged ? { sensitivity: ireq.policy.preference.sensitivity } : {}),
    items: evaluationItemsByBodyPart(buildRecommendedLayers(rec.garments, rec.handwear, rec.headwear)),
    targets: { torso: ireq.regional!.neutral.torso, legs: ireq.regional!.neutral.legs,
      hands: ireq.extremity!.neutral.hands, headNeck: ireq.extremity!.neutral.head },
    minTargets: { torso: ireq.regional!.min.torso, legs: ireq.regional!.min.legs,
      hands: ireq.extremity!.min.hands, headNeck: ireq.extremity!.min.head },
    arms: { clo: 99, target: ireq.regional!.neutral.arms, minTarget: ireq.regional!.min.arms },
    extremityMaxTargets: ireq.extremity?.max ? { hands: ireq.extremity.max.hands, headNeck: ireq.extremity.max.head } : undefined,
    targetRange: ireq.target_range,
    breathabilityTarget: rec.evaluation?.breathabilityTarget,
    requireStandalone: Boolean(ireq.policy), protectionNeeds: ireq.policy?.protection,
  };
}

describe('manual evaluation with the same setting', () => {
  it.each([['running', running], ['xc', xc]] as const)('%s edits are judged like the recommendation', async (_sport, route) => {
    for (const conditions of CONDITIONS.slice(0, 6)) {
      for (const sensitivity of ['hot', 'cold'] as const) {
        const body = await recommend(route, { ...conditions, temperature_sensitivity: sensitivity });
        const { status, body: evaluated } = await call(evaluate as Route, { phases: [phase(body)] });
        expect(status).toBe(200);
        const [edited] = (evaluated as unknown as { phases: BiophysicsRecommendation['recommendation']['evaluation'][] }).phases;
        const initial = body.recommendation.evaluation!;
        expect(edited!.comfortScore).toBe(initial.comfortScore);
        expect(edited!.decision).toEqual(initial.decision);
        expect(initial.decision!.reasons!.some(reason => reason.startsWith(`Targets follow ${sensitivity === 'hot' ? 'Run Warm' : 'Run Cold'}`))).toBe(true);
      }
    }
  });

  it('accepts only hot or cold as the explaining setting', async () => {
    const body = await recommend(running, { ...MILD, temperature_sensitivity: 'hot' });
    const { status } = await call(evaluate as Route, { phases: [{ ...phase(body), sensitivity: 'neutral' }] });
    expect(status).toBe(400);
    const { body: plain } = await call(evaluate as Route, { phases: [{ ...phase(body), sensitivity: undefined }] });
    const reasons = (plain as unknown as { phases: { decision: { reasons: string[] } }[] }).phases[0].decision.reasons;
    expect(reasons.some(reason => reason.startsWith('Targets follow'))).toBe(false);
  });
});

describe('sports whose targets do not take the setting yet', () => {
  it.each([['alpine', alpine], ['biking', biking], ['touring', touring]] as const)(
    '%s keeps every phase target and layer, and says the setting is not applied',
    async (_sport, route) => {
      for (const conditions of [CONDITIONS[2], CONDITIONS[6], CONDITIONS[7]]) {
        const standard = await recommend(route, conditions);
        for (const sensitivity of ['hot', 'cold'] as const) {
          const body = await recommend(route, { ...conditions, temperature_sensitivity: sensitivity });
          expect(body.preference).toMatchObject({ sensitivity, source: 'request', effect: 'not_supported', targets_adjusted: false });
          expect(body.guidance.at(-1)).toBe(body.preference!.message);
          expect(withoutPreference(body)).toEqual(standard);
        }
      }
    },
  );

  it('says so in a targets-only answer too', async () => {
    state.userId = 'user_empty';
    const body = await recommend(alpine, { ...MILD, use_wardrobe_only: true, temperature_sensitivity: 'hot' });
    expect(body.preference?.effect).toBe('not_supported');
    expect(body.guidance).toContain(body.preference!.message);
  });
});
