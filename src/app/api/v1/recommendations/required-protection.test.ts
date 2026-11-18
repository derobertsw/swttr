/**
 * Required protection (#373): alpine, the touring descent and cycling always
 * report their helmet, whether it is owned, suggested from the catalog or
 * missing, and whatever the thermal demand.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import catalog from '@/test/fixtures/gear-catalog.json';
import bikeHelmets from '@/test/fixtures/bike-helmets.json';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { POST as alpine } from './alpine/route';
import { POST as biking } from './biking/route';
import { POST as skiTouring } from './ski-touring/route';
import type { BiophysicsRecommendation, RecommendedHeadwear } from '@/types/biophysics';

const state = vi.hoisted(() => ({ userId: null as string | null, client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => state.client }));
vi.mock('@/lib/auth', () => ({ getAuthUserId: async () => state.userId }));

type Row = Record<string, unknown> & { id: string; headwear_type?: string };
const USER_ID = 'user_protection';
// The catalog after the bike helmet seed; the golden fixture stays frozen without them.
const HEADWEAR = [...catalog.headwear, ...bikeHelmets.headwear];
const byType = (type: string) => HEADWEAR.find(h => h.headwear_type === type)!;
const SKI = byType('ski_helmet');
const BIKE = byType('bike_helmet');
const BEANIE = byType('midweight_beanie');

const SPORTS = [
  { sport: 'alpine', POST: alpine, activity: 'alpine_skiing', label: 'ski helmet', own: SKI, other: BIKE,
    helmet: (body: BiophysicsRecommendation) => body.recommendation.headwear, prefix: '' },
  { sport: 'ski-touring descent', POST: skiTouring, activity: 'ski_touring_downhill', label: 'ski helmet', own: SKI, other: BIKE,
    helmet: (body: BiophysicsRecommendation) => body.descent_headwear, prefix: 'Descent: ' },
  { sport: 'biking', POST: biking, activity: 'biking', label: 'bike helmet', own: BIKE, other: SKI,
    helmet: (body: BiophysicsRecommendation) => body.recommendation.headwear, prefix: '' },
];

function useDatabase(userId: string | null, headwear: Row[], owned: Row[] = []) {
  state.userId = userId;
  const wardrobe = (type: string, rows: Row[]) => rows.map(row => ({ user_id: USER_ID, item_type: type, item_id: row.id, disabled: false }));
  state.client = createFakeSupabase({
    garments: catalog.garments, handwear: catalog.handwear, headwear,
    user_wardrobe: userId ? [...wardrobe('garment', catalog.garments), ...wardrobe('headwear', owned)] : [],
  });
}

async function recommend(POST: (request: NextRequest) => Promise<Response>, temperature: number, extra: Row | object = {}) {
  const response = await POST(new NextRequest('http://localhost/api/v1/recommendations', {
    method: 'POST',
    body: JSON.stringify({ weather: { temperature, wind_speed: 12 }, exertion: 'moderate', ...extra }),
  }));
  expect(response.status).toBe(200);
  return response.json() as Promise<BiophysicsRecommendation>;
}

const helmetWarnings = (body: BiophysicsRecommendation) => body.warnings.filter(w => /helmet/i.test(w));

describe.each(SPORTS)('$sport required helmet', ({ POST, activity, label, own, other, helmet, prefix }) => {
  beforeEach(() => useDatabase(null, HEADWEAR));
  const requirement = (body: BiophysicsRecommendation) => body.requirements?.find(r => r.id === `${activity}:helmet`);

  // 25°F is the issue's reproduction; 75°F checks mild weather never removes it.
  describe.each([25, 75])('at %i°F', temperature => {
    it('matches an owned helmet as owned', async () => {
      useDatabase(USER_ID, HEADWEAR, [BEANIE, own]);
      const body = await recommend(POST, temperature, { use_wardrobe_only: true });
      expect((helmet(body) as RecommendedHeadwear).helmet?.id).toBe(own.id);
      expect(requirement(body)).toMatchObject({
        kind: 'protection', region: 'head', status: 'owned_match', matched_garment_id: own.id, matched_is_owned: true,
      });
      expect(helmetWarnings(body)).toEqual([]);
    });

    it.each([
      { owned: 'no helmet', rows: [BEANIE] },
      { owned: "only the other sport's helmet", rows: [BEANIE, other] },
    ])('reports a missing helmet when the wardrobe holds $owned', async ({ rows }) => {
      useDatabase(USER_ID, HEADWEAR, rows);
      const body = await recommend(POST, temperature, { use_wardrobe_only: true });
      expect((helmet(body) as RecommendedHeadwear).helmet).toBeNull();
      expect(requirement(body)).toMatchObject({
        status: 'missing', generic_suggestion: { generic_estimate: true, owned: false },
        message: expect.stringContaining('none in your wardrobe'),
      });
      expect(requirement(body)?.matched_garment_id).toBeUndefined();
      expect(helmetWarnings(body)).toEqual([`${prefix}No ${label} in your wardrobe. Wear one in any weather: it's required protection, not optional warmth.`]);
    });

    it('suggests a catalog helmet without claiming it is owned', async () => {
      const body = await recommend(POST, temperature);
      expect((helmet(body) as RecommendedHeadwear).helmet?.type).toBe(own.headwear_type);
      expect(requirement(body)).toMatchObject({ status: 'generic_suggestion', matched_is_owned: false });
      expect(requirement(body)?.matched_garment_id).toBe((helmet(body) as RecommendedHeadwear).helmet?.id);
      expect(helmetWarnings(body)).toEqual([]);
    });
  });

  it('reports the gap when the catalog has no helmet of the type', async () => {
    useDatabase(null, HEADWEAR.filter(h => h.headwear_type !== own.headwear_type));
    const body = await recommend(POST, 25);
    expect((helmet(body) as RecommendedHeadwear).helmet).toBeNull();
    expect(requirement(body)).toMatchObject({ status: 'missing', message: expect.stringContaining('none available to suggest') });
    expect(helmetWarnings(body)).toHaveLength(1);
  });
});

it('keeps the touring climb helmet-free', async () => {
  useDatabase(null, HEADWEAR);
  const body = await recommend(skiTouring, 25);
  expect(body.recommendation.headwear?.helmet).toBeNull();
  expect(body.requirements?.map(r => r.id)).toEqual(['ski_touring_downhill:helmet']);
});
