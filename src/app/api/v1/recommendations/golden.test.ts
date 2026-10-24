/**
 * Golden tests for the sport recommendation routes.
 *
 * Each route runs against a snapshot of the real gear catalog for a matrix of
 * conditions, and the full JSON response is compared to a stored snapshot. Any
 * change to recommendation output shows up as a snapshot diff: review it, and
 * if the change is intended, update with `npx vitest run -u`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import catalog from "@/test/fixtures/gear-catalog.json";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { POST as alpine } from "./alpine/route";
import { POST as biking } from "./biking/route";
import { POST as running } from "./running/route";
import { POST as skiTouring } from "./ski-touring/route";
import { POST as xc } from "./xc/route";
import { POST as evaluateLayers } from '../ensembles/evaluate/route';
import type { BiophysicsRecommendation, RecommendedGarment } from "@/types/biophysics";

const state = vi.hoisted(() => ({
  userId: null as string | null,
  client: null as unknown,
}));

vi.mock("@/lib/supabase", () => ({ getSupabase: () => state.client }));
vi.mock("@/lib/auth", () => ({ getAuthUserId: async () => state.userId }));

type Row = Record<string, unknown>;
const USER_ID = "user_golden";

function wardrobeRows(itemType: string, rows: Row[], every: number): Row[] {
  return rows
    .filter((_, i) => i % every === 0)
    .map((row, i) => ({
      user_id: USER_ID,
      item_type: itemType,
      item_id: row.id,
      // One paused item per type exercises the `disabled = false` filter.
      disabled: i === 1,
    }));
}

const FULL_WARDROBE: Row[] = [
  ...wardrobeRows("garment", catalog.garments, 2),
  ...wardrobeRows("handwear", catalog.handwear, 3),
  ...wardrobeRows("headwear", catalog.headwear, 3),
];

const ROUTES = [
  { sport: "alpine", POST: alpine },
  { sport: "biking", POST: biking },
  { sport: "running", POST: running },
  { sport: "ski-touring", POST: skiTouring },
  { sport: "xc", POST: xc },
];

const CONDITIONS: Array<{ name: string; body: Row }> = [
  {
    name: "mild, calm, dry, easy",
    body: { weather: { temperature: 45, wind_speed: 4 }, exertion: "easy" },
  },
  {
    name: "cool, breezy, moderate",
    body: { weather: { temperature: 25, wind_speed: 12, humidity: 60 }, exertion: "moderate" },
  },
  {
    name: "cold, windy, snowing, hard",
    body: {
      weather: { temperature: 5, wind_speed: 20, humidity: 85, precipitation: true, precipitation_type: "snow" },
      exertion: "hard",
    },
  },
  {
    name: "extreme cold",
    body: { weather: { temperature: -15, wind_speed: 10 }, exertion: "moderate" },
  },
  {
    name: "near-freezing rain, default exertion",
    body: {
      weather: { temperature: 36, wind_speed: 8, humidity: 95, precipitation: true, precipitation_type: "rain" },
    },
  },
  {
    name: "large body, legacy intensity alias",
    body: { weather: { temperature: 18, wind_speed: 6 }, intensity: "high", height_inches: 76, weight_lbs: 230 },
  },
];

const MODES: Array<{ name: string; userId: string | null; wardrobe: Row[]; extraBody?: Row }> = [
  { name: "signed out (catalog)", userId: null, wardrobe: [] },
  { name: "signed in (wardrobe)", userId: USER_ID, wardrobe: FULL_WARDROBE, extraBody: { use_wardrobe_only: true } },
];

async function callRoute(POST: (request: NextRequest) => Promise<Response>, body: Row) {
  const request = new NextRequest("http://localhost:3000/api/v1/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

function useDatabase(userId: string | null, wardrobe: Row[]) {
  state.userId = userId;
  state.client = createFakeSupabase({
    garments: catalog.garments,
    handwear: catalog.handwear,
    headwear: catalog.headwear,
    user_wardrobe: wardrobe,
  });
}

const OUTER_CATEGORIES = ["outer_insulated", "hard_shell", "soft_shell", "windbreaker"];

// Bibs cover the torso but sit under the jacket, so they only fill the legs slots.
const isBib = (g: RecommendedGarment) => g.covers_legs && !g.covers_arms;

// Outer layers each regional-ensemble sport allows over a puffy mid.
const PUFFY_OUTERS: Record<string, string[]> = {
  alpine: ["hard_shell"],
  xc: ["hard_shell", "soft_shell", "windbreaker"],
};

function expectWearable(body: BiophysicsRecommendation, puffyOuters: string[]) {
  const garments = body.recommendation?.garments ?? [];
  expect(garments.length).toBeGreaterThan(0);
  expect(new Set(garments.map((g) => g.id)).size).toBe(garments.length);
  for (const region of ["torso", "arms", "legs"] as const) {
    const layers = garments.filter((g) => g[`covers_${region}`] && !(region === "torso" && isBib(g)));
    const bases = layers.filter((g) => g.category === "base_layer");
    const mids = layers.filter((g) => ["mid_layer_light", "mid_layer_heavy", "insulation_down", "insulation_synthetic"].includes(g.category));
    const outers = layers.filter((g) => OUTER_CATEGORIES.includes(g.category));
    expect(bases.length).toBeLessThanOrEqual(1);
    expect(mids.length).toBeLessThanOrEqual(1);
    expect(outers.length).toBeLessThanOrEqual(1);
    if (mids.some((g) => ["insulation_down", "insulation_synthetic"].includes(g.category)) && outers.length) {
      expect(puffyOuters).toContain(outers[0].category);
    }
  }
}

// XC needs a wind layer on the torso and legs unless it is mild, calm and dry.
function expectWindLayers(body: BiophysicsRecommendation) {
  const garments = body.recommendation?.garments ?? [];
  for (const region of ["torso", "legs"] as const) {
    const layers = garments.filter((g) => g[`covers_${region}`] && !(region === "torso" && isBib(g)));
    expect(layers.some((g) => OUTER_CATEGORIES.includes(g.category))).toBe(true);
  }
}

describe.each(ROUTES)("POST /api/v1/recommendations/$sport (golden)", ({ POST, sport }) => {
  beforeEach(() => {
    useDatabase(null, []);
  });

  for (const mode of MODES) {
    describe(mode.name, () => {
      it.each(CONDITIONS)("$name", async ({ name, body }) => {
        useDatabase(mode.userId, mode.wardrobe);
        const result = await callRoute(POST, { ...body, ...mode.extraBody });
        if (sport in PUFFY_OUTERS) expectWearable(result.body, PUFFY_OUTERS[sport]);
        if (sport === "xc" && name !== "mild, calm, dry, easy") expectWindLayers(result.body);
        // A score of 0 can't tell one outfit from another (#152).
        expect(result.body.recommendation?.thermal_comfort_score).toBeGreaterThan(0);
        expect(result).toMatchSnapshot();
      });
    });
  }

  it("signed in with an empty wardrobe falls back to the catalog", async () => {
    useDatabase(USER_ID, []);
    const result = await callRoute(POST, CONDITIONS[1].body);
    if (sport in PUFFY_OUTERS) expectWearable(result.body, PUFFY_OUTERS[sport]);
    expect(result).toMatchSnapshot();
  });

  it("wardrobe-only with an empty wardrobe returns targets without garments", async () => {
    useDatabase(USER_ID, []);
    expect(
      await callRoute(POST, { ...CONDITIONS[2].body, use_wardrobe_only: true })
    ).toMatchSnapshot();
  });

  it("rejects non-numeric weather", async () => {
    expect(
      await callRoute(POST, { weather: { temperature: "cold", wind_speed: 5 } })
    ).toMatchSnapshot();
  });
});

describe.each([
  { sport: 'running', activity: 'running', POST: running, easyRate: 254.2 },
  { sport: 'xc', activity: 'xc_skiing', POST: xc, easyRate: 266.0 },
])('POST /api/v1/recommendations/$sport (calibration contract)', ({ POST, activity, easyRate }) => {
  it('uses sustained moderate effort and reference body metrics when omitted', async () => {
    useDatabase(null, []);
    const { status, body } = await callRoute(POST, {
      weather: { temperature: 56, wind_speed: 8, humidity: 50 },
    });
    expect(status).toBe(200);
    expect(body.ireq.policy).toMatchObject({ activity, phase: 'sustained', effort: 'moderate' });
    expect(body.ireq.policy.metabolicRateWm2).toBeCloseTo(395.2, 0);
    expect(body.ireq.target_range[0]).toBe(0.03);
    expect(body.ireq.extremity).toEqual({ min: { hands: 0, head: 0 }, neutral: { hands: 0, head: 0 }, max: { hands: activity === 'xc_skiing' ? 0.55 : 0, head: 0 } });
    expect(body.ireq.validation_source).toBe('coweda_inspired_unvalidated_swttr_margin');
    expect(body.guidance).toEqual(expect.arrayContaining(body.ireq.policy.assumptions));
    expect(body.recommendation.headwear).toEqual({ helmet: null, head_warmth: null, neck_warmth: null });
    expect(body.recommendation.accessories.head.state).toBe('not_needed');
    if (activity === 'running') {
      expect(body.recommendation.handwear).toBeNull();
      expect(body.recommendation.accessories.hands.state).toBe('not_needed');
    } else {
      expect(body.recommendation.handwear).not.toBeNull();
      expect(body.recommendation.accessories.hands).toMatchObject({ purpose: 'pole_grip', state: 'selected' });
      expect(body.guidance.join(' ')).toContain('friction protection');
    }
  });

  it('keeps the same body-specific heat-balance floor with clothing or a targets-only response', async () => {
    const request = {
      weather: { temperature: 50, wind_speed: 8, humidity: 50 },
      exertion: 'easy', height_inches: 62, weight_lbs: 110,
    };
    useDatabase(null, []);
    const full = await callRoute(POST, request);
    expect(full.status).toBe(200);
    expect(full.body.recommendation.garments.length).toBeGreaterThan(0);
    expect(full.body.ireq.policy.metabolicRateWm2).toBeCloseTo(easyRate, 0);
    expect(full.body.ireq.min).toBeGreaterThan(0.25);
    expect(full.body.ireq.target_range[0]).toBeGreaterThanOrEqual(full.body.ireq.min);

    useDatabase(USER_ID, []);
    const empty = await callRoute(POST, { ...request, use_wardrobe_only: true });
    expect(empty.status).toBe(200);
    expect(empty.body.recommendation).toBeUndefined();
    expect(empty.body.ireq).toEqual(full.body.ireq);
    expect(empty.body.recommendations.guidance).toEqual(expect.arrayContaining(empty.body.ireq.policy.assumptions));
  });
});

describe('running accessory selection and manual evaluation', () => {
  it('selects or suggests a T-shirt and shorts for the reported mild run from the full catalog', async () => {
    useDatabase(null, []);
    const { status, body } = await callRoute(running, { weather: { temperature: 56, wind_speed: 8 }, exertion: 'moderate' });
    expect(status).toBe(200);
    expect(body.recommendation.garments.map((g: RecommendedGarment) => g.garment_type).sort()).toEqual(['shorts', 'top_short_sleeve']);
    expect(body.requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ region: 'torso', label: 'Lightweight short-sleeve running top', status: 'generic_suggestion', matched_is_owned: false }),
      expect.objectContaining({ region: 'legs', label: 'Running shorts', status: 'generic_suggestion', matched_is_owned: false }),
    ]));
    expect(body.guidance.join(' ')).toContain('While running, wear:');
    expect(body.guidance.join(' ')).toContain('Bring extra layers for breaks');
    expect(body.recommendation.handwear).toBeNull();
    expect(body.recommendation.headwear.head_warmth).toBeNull();
  });

  it('does not force thermal accessories in the originally reported four-item wardrobe', async () => {
    state.userId = USER_ID;
    const garments = catalog.garments.filter(g => ['Capilene Cool Lightweight', 'Capilene Thermal Weight Boot-Length Bottoms'].includes(g.model_name));
    const handwear = catalog.handwear.filter(g => g.model_name === 'Ultrafit Multi-Sport Running Gloves');
    const headwear = catalog.headwear.filter(g => g.model_name === 'Merino 150 Beanie');
    expect([garments.length, handwear.length, headwear.length]).toEqual([2, 1, 1]);
    state.client = createFakeSupabase({
      garments, handwear, headwear,
      user_wardrobe: [['garment', garments], ['handwear', handwear], ['headwear', headwear]].flatMap(([type, items]) =>
        (items as typeof garments).map(item => ({ user_id: USER_ID, item_type: type, item_id: item.id, disabled: false }))),
    });
    const { status, body } = await callRoute(running, { weather: { temperature: 56, wind_speed: 8 }, exertion: 'moderate', use_wardrobe_only: true });
    expect(status).toBe(200);
    expect(body.recommendation.handwear).toBeNull();
    expect(body.recommendation.headwear.head_warmth).toBeNull();
    expect(body.recommendation.accessories.hands.state).toBe('not_needed');
    expect(body.recommendation.garments).toEqual(expect.not.arrayContaining([
      expect.objectContaining({ id: garments.find(g => g.usage === 'underlayer')!.id }),
    ]));
    expect(body.requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ region: 'legs', label: 'Running shorts', status: 'missing' }),
    ]));
  });

  it('gives matching accessory assessments to automatic selection and manual removal', async () => {
    const garments = catalog.garments.filter(g => ['top_short_sleeve', 'shorts'].includes(g.garment_type ?? ''));
    state.userId = null;
    state.client = createFakeSupabase({ garments, handwear: catalog.handwear, headwear: catalog.headwear, user_wardrobe: [] });
    const { body } = await callRoute(running, { weather: { temperature: 56, wind_speed: 8 } });
    const { ireq, recommendation } = body as BiophysicsRecommendation;
    expect(recommendation.garments).toHaveLength(2);
    const worn = {
      torso: recommendation.garments.filter(g => g.covers_torso).map(g => ({ sourceId: g.id, item_type: 'garment' })),
      legs: recommendation.garments.filter(g => g.covers_legs).map(g => ({ sourceId: g.id, item_type: 'garment' })),
      hands: [], headNeck: [],
    };
    const phase = {
      items: worn,
      targets: { torso: ireq.regional!.neutral.torso, legs: ireq.regional!.neutral.legs, hands: ireq.extremity!.neutral.hands, headNeck: ireq.extremity!.neutral.head },
      minTargets: { torso: ireq.regional!.min.torso, legs: ireq.regional!.min.legs, hands: ireq.extremity!.min.hands, headNeck: ireq.extremity!.min.head },
      extremityMaxTargets: { hands: ireq.extremity!.max!.hands, headNeck: ireq.extremity!.max!.head },
      arms: { clo: recommendation.ensemble_properties.regional_clo!.arms, minTarget: ireq.regional!.min.arms },
      targetRange: ireq.target_range,
    };
    const { body: { phases: [removed, added] } } = await callRoute(evaluateLayers, { phases: [phase, {
      ...phase, items: { ...worn,
        hands: [{ sourceId: catalog.handwear.find(h => h.model_name === 'Ultrafit Multi-Sport Running Gloves')!.id, item_type: 'handwear' }],
        headNeck: [{ sourceId: catalog.headwear.find(h => h.model_name === 'Merino 150 Beanie')!.id, item_type: 'headwear' }],
      },
    }] });
    expect(removed.bodyParts.hands.status).toBe(recommendation.accessories!.hands.thermal_status);
    expect(removed.bodyParts.headNeck.status).toBe(recommendation.accessories!.head.thermal_status);
    expect(removed.decision.riskType).toBe('comfortable');
    expect(Math.abs(removed.comfortScore - recommendation.thermal_comfort_score!)).toBeLessThan(1);
    expect(added.bodyParts.hands.status).toBe('over');
    expect(added.bodyParts.headNeck.status).toBe('over');
    expect(added.decision.riskType).toBe('overheat');
  });

  it.each([['running', running], ['xc', xc]] as const)('wears owned gloves and a balaclava rated for -15°F (%s), and manual checks agree', async (_, POST) => {
    useDatabase(USER_ID, FULL_WARDROBE);
    const { body } = await callRoute(POST, { ...CONDITIONS[3].body, use_wardrobe_only: true });
    const { ireq, recommendation } = body as BiophysicsRecommendation;
    const owned = (type: string, id: string | undefined) => FULL_WARDROBE.some(row => row.item_type === type && row.item_id === id);

    expect(owned('handwear', recommendation.handwear?.id)).toBe(true);
    expect(owned('headwear', recommendation.headwear?.head_warmth?.id)).toBe(true);
    for (const part of ['hands', 'head'] as const) {
      expect(recommendation.accessories![part]).toMatchObject({ state: 'selected', thermal_status: 'in_range' });
      expect(recommendation.accessories![part].max).toBe(ireq.extremity!.max![part]);
    }
    expect(body.warnings).toEqual(expect.not.arrayContaining([expect.stringContaining('no suitable')]));

    const worn = {
      torso: recommendation.garments.filter(g => g.covers_torso).map(g => ({ sourceId: g.id, item_type: 'garment' })),
      legs: recommendation.garments.filter(g => g.covers_legs).map(g => ({ sourceId: g.id, item_type: 'garment' })),
      hands: [{ sourceId: recommendation.handwear!.id, item_type: 'handwear' }],
      headNeck: [{ sourceId: recommendation.headwear!.head_warmth!.id, item_type: 'headwear' }],
    };
    const phase = {
      items: worn,
      targets: { torso: ireq.regional!.neutral.torso, legs: ireq.regional!.neutral.legs, hands: ireq.extremity!.neutral.hands, headNeck: ireq.extremity!.neutral.head },
      minTargets: { torso: ireq.regional!.min.torso, legs: ireq.regional!.min.legs, hands: ireq.extremity!.min.hands, headNeck: ireq.extremity!.min.head },
      extremityMaxTargets: { hands: ireq.extremity!.max!.hands, headNeck: ireq.extremity!.max!.head },
      arms: { clo: recommendation.ensemble_properties.regional_clo!.arms, minTarget: ireq.regional!.min.arms },
      targetRange: ireq.target_range,
    };
    const { body: { phases: [kept, removed] } } = await callRoute(evaluateLayers, { phases: [phase, { ...phase, items: { ...worn, hands: [], headNeck: [] } }] });
    expect(kept.bodyParts.hands.status).toBe('in_range');
    expect(kept.bodyParts.headNeck.status).toBe('in_range');
    expect(kept.decision.riskType).not.toBe('overheat');
    expect(removed.bodyParts.hands.status).toBe('under');
    expect(removed.decision.riskType).toBe('cold');
  });
});

describe("POST /api/v1/recommendations/alpine (golden, comfort)", () => {
  it.each(MODES)("does not warn about regional insulation at 45°F with $name gear", async (mode) => {
    useDatabase(mode.userId, mode.wardrobe);
    const { body } = await callRoute(alpine, { ...CONDITIONS[0].body, ...mode.extraBody });

    expect(body.recommendation.garments).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "outer_insulated", covers_legs: true }),
    ]));
    expect(body.warnings).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/^Insufficient (torso|arms|legs) insulation:/),
    ]));
  });

  it("scores the in-range catalog outfit as comfortable at 45°F", async () => {
    useDatabase(null, []);
    const { body } = await callRoute(alpine, CONDITIONS[0].body);
    const [min, max] = body.ireq.target_range;
    const totalClo = body.recommendation.ensemble_properties.total_clo;

    expect(totalClo).toBeGreaterThanOrEqual(min);
    expect(totalClo).toBeLessThanOrEqual(max);
    expect(body.recommendation.thermal_comfort_score).toBeGreaterThanOrEqual(85);
  });

  it("reports local accessory excess even when whole-body insulation is in range at 25°F", async () => {
    useDatabase(null, []);
    const { body } = await callRoute(alpine, CONDITIONS[1].body);
    const { ensemble_properties: properties, thermal_comfort_score: score } = body.recommendation;

    expect(properties.total_clo).toBeGreaterThanOrEqual(body.ireq.target_range[0]);
    expect(properties.total_clo).toBeLessThanOrEqual(body.ireq.target_range[1]);
    expect(score).toBeLessThan(85);
    expect(body.recommendation.evaluation.bodyParts.headNeck.status).toBe('over');
    expect(body.recommendation.evaluation.decision).toMatchObject({
      status: 'warmer', summary: 'Warmer than recommended',
    });
    expect(body.recommendation.evaluation.decision.reasons).toContain(
      'Head and neck has more insulation than its estimated upper target.',
    );
    expect(body.warnings).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/^Insufficient (torso|arms|legs) insulation:/),
    ]));
  });

  it("retains a down layer and protective shell at 5°F in 20 mph wind", async () => {
    useDatabase(null, []);
    const { body } = await callRoute(alpine, CONDITIONS[2].body);

    expect(body.recommendation.garments).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "insulation_down" }),
      expect.objectContaining({ category: "hard_shell", covers_torso: true }),
    ]));
    expect(body.recommendation.ensemble_properties.total_clo).toBeGreaterThanOrEqual(3.9);
  });
});

describe("POST /api/v1/recommendations/ski-touring (golden, pack options)", () => {
  it("prioritizes a light pack when asked", async () => {
    useDatabase(null, []);
    expect(
      await callRoute(skiTouring, { ...CONDITIONS[2].body, prioritize_light_pack: true })
    ).toMatchSnapshot();
  });
});
