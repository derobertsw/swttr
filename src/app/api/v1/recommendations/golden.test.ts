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

describe("POST /api/v1/recommendations/alpine (golden, comfort)", () => {
  it("scores an outfit inside the target range as comfortable", async () => {
    useDatabase(null, []);
    const { body } = await callRoute(alpine, CONDITIONS[0].body);
    const [min, max] = body.ireq.target_range;
    const totalClo = body.recommendation.ensemble_properties.total_clo;

    expect(totalClo).toBeGreaterThanOrEqual(min);
    expect(totalClo).toBeLessThanOrEqual(max);
    expect(body.recommendation.thermal_comfort_score).toBeGreaterThanOrEqual(85);
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
