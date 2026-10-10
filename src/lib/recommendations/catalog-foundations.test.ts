import { beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import { loadGearPool } from './gear-pool';
import type { RecommendationRequest } from './request';
import { GET as available } from '@/app/api/wardrobe/available/route';

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => state.client }));
const basics = catalog.garments.filter(g => g.brand === 'SWTTR');
const request = (): RecommendationRequest => ({
  supabase: state.client as RecommendationRequest['supabase'], userId: null,
  weather: { temperature: 56, wind_speed: 8 }, tempC: 13.33, windMs: 3.58,
  humidity: 50, precipitation: false, exertion: 'moderate', bodyMetrics: DEFAULT_BODY_METRICS,
  useWardrobeOnly: false, prioritizeLightPack: false,
});
beforeEach(() => { state.client = createFakeSupabase({ garments: catalog.garments, headwear: [], handwear: [], user_wardrobe: [] }); });

describe('catalog foundation API plumbing', () => {
  it('shows the new basics and partial coverage in wardrobe browse/search data', async () => {
    const response = await available();
    const body = await response.json();
    expect(response.status).toBe(200);
    const items = body.items.filter((item: { brand: string }) => item.brand === 'SWTTR');
    expect(items).toHaveLength(3);
    expect(items.find((item: { garment_type: string }) => item.garment_type === 'shorts')).toMatchObject({ usage: 'standalone', coverage_legs: 0.3, rcl_legs: 0.06, thermal_provenance: { generic_estimate: true } });
  });
  it('includes new basics in running and standalone tights in XC while preserving other sports', async () => {
    for (const [activity, expected] of [['running', 3], ['xc_skiing', 1], ['biking', 0], ['alpine_skiing', 0], ['ski_touring_uphill', 0]]) {
      const result = await loadGearPool(request(), { activity: activity as string });
      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.pool.categorized.baseLayers.filter(g => g.brand === 'SWTTR')).toHaveLength(expected as number);
    }
  });
  it('returns the existing no-gear state for unknown thermal data rather than scored comfort', async () => {
    state.client = createFakeSupabase({ garments: [{ ...basics[0], garment_thermal_properties: null }], user_wardrobe: [] });
    expect((await loadGearPool(request(), { activity: 'running' })).status).toBe('empty');
  });
});
