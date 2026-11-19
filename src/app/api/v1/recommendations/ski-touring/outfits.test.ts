// @vitest-environment node
/**
 * Ski-touring climb and descent outfits on the golden fixture catalog (#372):
 * the issue's reproductions, rain, deep cold, a sparse wardrobe and the
 * light-pack option.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import catalog from '@/test/fixtures/gear-catalog.json';
import { createFakeSupabase } from '@/test/fakeSupabase';
import type { BiophysicsRecommendation, RecommendedGarment } from '@/types/biophysics';
import { POST } from './route';

const state = vi.hoisted(() => ({ client: null as unknown, userId: null as string | null }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => state.client }));
vi.mock('@/lib/auth', () => ({ getAuthUserId: async () => state.userId }));

type Row = Record<string, unknown>;
const USER_ID = 'user_touring';
const garments = catalog.garments as Row[];

beforeEach(() => {
  state.userId = null;
  state.client = createFakeSupabase(catalog);
});

async function recommend(body: Row): Promise<BiophysicsRecommendation> {
  const response = await POST(new NextRequest('http://localhost/api/v1/recommendations/ski-touring', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  expect(response.status).toBe(200);
  return response.json();
}

function useWardrobe(models: string[]) {
  const ids = models.map((model) => {
    const row = garments.find((g) => g.model_name === model);
    if (!row) throw new Error(`Missing fixture garment ${model}`);
    return row.id;
  });
  state.userId = USER_ID;
  state.client = createFakeSupabase({
    ...catalog,
    user_wardrobe: ids.map((item_id) => ({ user_id: USER_ID, item_type: 'garment', item_id, disabled: false })),
  });
}

const climbGarments = (body: BiophysicsRecommendation) => body.recommendation.garments;
const isProtectiveShell = (g: RecommendedGarment) => g.category === 'hard_shell' || g.category === 'windbreaker';
const packed = (body: BiophysicsRecommendation) => body.pack_items?.garments ?? [];
const inRange = (value: number, [min, max]: [number, number]) => value >= min - 0.05 && value <= max + 0.01;

describe('ski-touring outfits (#372)', () => {
  it('25°F, 12 mph, moderate: a climb near target without a shell, and descent legs covered', async () => {
    const body = await recommend({ weather: { temperature: 25, wind_speed: 12, humidity: 60 }, exertion: 'moderate' });
    // Was 1.44 clo against 0.86–1.17, torso 1.71 against 1.01.
    expect(inRange(body.recommendation.ensemble_properties.total_clo, body.ireq.target_range)).toBe(true);
    expect(body.recommendation.evaluation?.bodyParts.torso.status).toBe('in_range');
    expect(body.recommendation.evaluation?.bodyParts.legs.status).toBe('in_range');
    expect(climbGarments(body).some(isProtectiveShell)).toBe(false);
    // Was legs 1.01 against a 2.87 minimum: the pack now brings a leg layer.
    const legLayer = packed(body).find((g) => g.covers_legs);
    expect(legLayer).toBeDefined();
    // Since #374 the climb wears lighter fleece pants, and the warmest catalog
    // over-pants leave the descent (whose targets are unchanged) short on the
    // legs. The shortfall is reported, not hidden.
    expect(body.descent_evaluation?.bodyParts.legs.status).toBe('under');
    expect(body.descent_evaluation?.decision?.status).toBe('cooler');
    expect(body.transition_protocol?.steps).toContain(`Leg layer to add: ${legLayer!.name}`);
    // The shell the climb didn't wear goes on for the descent.
    expect(packed(body).some((g) => g.covers_torso && g.covers_arms && g.protection?.waterproof_rating === 'waterproof')).toBe(true);
  });

  it('45°F, 4 mph, easy: the climb comes out within its target', async () => {
    const body = await recommend({ weather: { temperature: 45, wind_speed: 4 }, exertion: 'easy' });
    // Was 1.44 clo against 0.60–0.82.
    expect(inRange(body.recommendation.ensemble_properties.total_clo, body.ireq.target_range)).toBe(true);
    expect(climbGarments(body).some(isProtectiveShell)).toBe(false);
  });

  it('65°F, 4 mph, moderate: no hard-shell jacket or bibs on the climb', async () => {
    const body = await recommend({ weather: { temperature: 65, wind_speed: 4 }, exertion: 'moderate' });
    // Was a hard-shell jacket and hard-shell bibs, 1.01 clo against 0.06–0.22.
    expect(climbGarments(body).some(isProtectiveShell)).toBe(false);
    expect(body.recommendation.ensemble_properties.total_clo).toBeLessThan(0.35);
    expect(body.guidance.some((line) => line.startsWith('Climb: no wind or wet protection is needed'))).toBe(true);
  });

  it('rain: the climb wears waterproof or water-resistant torso and leg coverage', async () => {
    const body = await recommend({
      weather: { temperature: 36, wind_speed: 8, humidity: 95, precipitation: true, precipitation_type: 'rain' },
    });
    for (const region of ['torso', 'legs'] as const) {
      expect(climbGarments(body).some((g) => g[`covers_${region}`]
        && ['waterproof', 'water_resistant'].includes(g.protection?.waterproof_rating ?? ''))).toBe(true);
    }
    // A shell is never worn on bare skin when a base layer exists.
    expect(climbGarments(body).some((g) => g.covers_torso && g.category === 'base_layer')).toBe(true);
    expect(body.warnings.some((w) => w.includes('lacks required'))).toBe(false);
  });

  it('wind on the climb: torso and legs get wind protection', async () => {
    const body = await recommend({
      weather: { temperature: 5, wind_speed: 20, humidity: 85, precipitation: true, precipitation_type: 'snow' }, exertion: 'hard',
    });
    for (const region of ['torso', 'legs'] as const) {
      expect(climbGarments(body).some((g) => g[`covers_${region}`]
        && ['wind_resistant', 'windproof'].includes(g.protection?.windproof_rating ?? ''))).toBe(true);
    }
  });

  it('deep cold: puffies stay in the pack and the descent adds leg insulation', async () => {
    const body = await recommend({ weather: { temperature: -15, wind_speed: 10 }, exertion: 'moderate' });
    expect(climbGarments(body).some((g) => ['insulation_down', 'insulation_synthetic', 'outer_insulated'].includes(g.category))).toBe(false);
    expect(packed(body).some((g) => g.covers_legs)).toBe(true);
    expect(body.descent_breakdown!.regional_clo.legs).toBeGreaterThan(body.recommendation.ensemble_properties.regional_clo!.legs + 1);
  });

  it('sparse wardrobe: dresses every region and packs the shell it owns', async () => {
    useWardrobe(['Capilene Cool Lightweight', 'Lifa Active Pant', 'Alpha FL Jacket', 'Nano-Air Hoody']);
    const body = await recommend({ weather: { temperature: 25, wind_speed: 12 }, exertion: 'moderate', use_wardrobe_only: true });
    expect(climbGarments(body).map((g) => g.name).sort()).toEqual(['Helly Hansen Lifa Active Pant', 'Patagonia Capilene Cool Lightweight']);
    expect(packed(body).map((g) => g.name).sort()).toEqual(["Arc'teryx Alpha FL Jacket", 'Patagonia Nano-Air Hoody']);
    // Nothing owned can go over the legs, so they stay short and say so.
    expect(body.descent_evaluation?.bodyParts.legs.status).toBe('under');
  });

  it('a wardrobe without any shell still gets a climb and descent', async () => {
    useWardrobe(['Capilene Cool Lightweight', 'Lifa Active Pant']);
    const body = await recommend({ weather: { temperature: 36, wind_speed: 8, precipitation: true, precipitation_type: 'rain' }, use_wardrobe_only: true });
    expect(climbGarments(body)).toHaveLength(2);
    expect(packed(body)).toEqual([]);
    expect(body.warnings).toEqual(expect.arrayContaining([
      'Climb: Available clothing lacks required wet-weather protection for torso.',
      'Climb: Available clothing lacks required wet-weather protection for legs.',
    ]));
  });

  it('prioritize_light_pack still reports a lighter pack', async () => {
    const conditions = { weather: { temperature: 25, wind_speed: 4 }, exertion: 'easy' };
    const normal = await recommend(conditions);
    const light = await recommend({ ...conditions, prioritize_light_pack: true });
    expect(light.pack_items!.total_weight_g).toBeLessThan(normal.pack_items!.total_weight_g);
    for (const body of [normal, light]) {
      expect(body.pack_items!.total_weight_g).toBe(packed(body).reduce((sum, g) => sum + (g.weight_g ?? 0), 0));
      // Packed layers never raise the climb's insulation.
      const climbIds = new Set(climbGarments(body).map((g) => g.id));
      expect(packed(body).some((g) => climbIds.has(g.id))).toBe(false);
    }
    expect(light.recommendation.ensemble_properties).toEqual(normal.recommendation.ensemble_properties);
  });
});
