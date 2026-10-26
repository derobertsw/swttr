import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import catalog from '@/test/fixtures/gear-catalog.json';
import { createFakeSupabase } from '@/test/fakeSupabase';
import type { BiophysicsRecommendation } from '@/types/biophysics';
import { POST } from './route';

const state = vi.hoisted(() => ({ client: null as unknown, userId: null as string | null }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => state.client }));
vi.mock('@/lib/auth', () => ({ getAuthUserId: async () => state.userId }));
const weather = { temperature: 46.4, wind_speed: 2, humidity: 50 };
async function call(extra: Record<string, unknown> = {}) {
  const response = await POST(new NextRequest('http://localhost/api/v1/recommendations/xc', {
    method: 'POST', body: JSON.stringify({ weather, exertion: 'moderate', ...extra }),
  }));
  return { status: response.status, data: await response.json() as BiophysicsRecommendation };
}

beforeEach(() => {
  state.userId = null;
  state.client = createFakeSupabase({ garments: catalog.garments, handwear: catalog.handwear, headwear: catalog.headwear, user_wardrobe: [] });
});

describe('XC request and response integration', () => {
  it.each([
    { wind: false, wet: true, missing: 'wind' },
    { wind: true, wet: false, missing: 'wet-weather' },
    { wind: false, wet: false, missing: 'wind and wet-weather' },
    { wind: true, wet: true, missing: null },
  ])('names only missing protection with wind=$wind and wet=$wet coverage', async ({ wind, wet, missing }) => {
    const garments = catalog.garments.filter(g => g.model_name === 'Capilene Cool Lightweight'
      || g.model_name === 'Generic Standalone Running/Nordic Tights').map(g => ({ ...g, garment_protection: {
      windproof_rating: wind ? 'windproof' : 'none', waterproof_rating: wet ? 'waterproof' : 'none',
    } }));
    expect(garments).toHaveLength(2);
    state.client = createFakeSupabase({ garments, handwear: [], headwear: [], user_wardrobe: [] });
    const { data } = await call({ weather: { temperature: 32, wind_speed: 12, precipitation: true, precipitation_type: 'rain' } });
    expect(data.ireq.policy?.protection).toMatchObject({ wind: true, wet: true });
    expect(data.recommendation.garments).toHaveLength(2);
    expect(data.warnings.filter(warning => warning.startsWith('Available XC clothing'))).toEqual(missing ? [
      `Available XC clothing lacks required ${missing} protection for torso.`,
      `Available XC clothing lacks required ${missing} protection for legs.`,
    ] : []);
  });

  it('echoes outing pattern and exposure, retaining the same moving outfit/score when stops only change carry advice', async () => {
    const continuous = await call({ outing_pattern: 'continuous', xc_exposure: 'sheltered' });
    const stops = await call({ outing_pattern: 'frequent_stops', xc_exposure: 'sheltered' });
    expect(stops.status).toBe(200);
    expect(stops.data.conditions).toMatchObject({ outing_pattern: 'frequent_stops', xc_exposure: 'sheltered', exertion: 'moderate' });
    expect(stops.data.recommendation).toEqual(continuous.data.recommendation);
    expect(stops.data.ireq.target_range).toEqual(continuous.data.ireq.target_range);
    expect(continuous.data.carry_items).toEqual([]);
    expect(stops.data.carry_items).toHaveLength(1);
    expect(stops.data.guidance.join(' ')).toContain('Frequent stops');
    expect(stops.data.recommendation.accessories?.hands.purpose).toMatch(/pole_grip/);
  });

  it('makes unknown assumptions explicit and retains legacy effort controls', async () => {
    const { data } = await call({ exertion: undefined, intensity: 'racing' });
    expect(data.conditions).toMatchObject({ exertion: 'hard', outing_pattern: 'unknown', xc_exposure: 'unknown' });
    expect(data.ireq.policy?.xc?.outingPattern).toBe('unknown');
    expect(data.guidance.join(' ')).toContain('pattern is unknown');
  });

  it.each([{ outing_pattern: 'classic' }, { xc_exposure: 'skate' }, { outing_pattern: null }])('rejects invalid context: %o', async bad => {
    expect((await call(bad)).status).toBe(400);
  });

  it('does not claim suitable clothing from a wardrobe containing only thermal underwear', async () => {
    state.userId = 'xc-user';
    const underwear = catalog.garments.find(g => g.model_name === 'Capilene Thermal Weight Boot-Length Bottoms')!;
    state.client = createFakeSupabase({ garments: catalog.garments, handwear: [], headwear: [], user_wardrobe: [{
      user_id: state.userId, item_type: 'garment', item_id: underwear.id, disabled: false,
    }] });
    const { data } = await call({ use_wardrobe_only: true });
    expect(data.recommendation.garments).toEqual([]);
    expect(data.requirements?.filter(r => r.region === 'torso' || r.region === 'legs').every(r => r.status === 'missing')).toBe(true);
    expect(data.requirements?.some(r => r.matched_is_owned)).toBe(false);
  });

  it('distinguishes cold dry snow from near-melting wet snow in shared policy', async () => {
    const dry = await call({ weather: { ...weather, temperature: 14, precipitation: true, precipitation_type: 'snow' } });
    const wet = await call({ weather: { ...weather, temperature: 32, precipitation: true, precipitation_type: 'snow' } });
    expect(dry.data.ireq.policy?.protection.wet).toBe(false);
    expect(wet.data.ireq.policy?.protection.wet).toBe(true);
    expect(wet.data.guidance.join(' ')).toContain('near-melting snow');
  });
});
