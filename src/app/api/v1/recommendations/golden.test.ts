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

describe.each(ROUTES)("POST /api/v1/recommendations/$sport (golden)", ({ POST }) => {
  beforeEach(() => {
    useDatabase(null, []);
  });

  for (const mode of MODES) {
    describe(mode.name, () => {
      it.each(CONDITIONS)("$name", async ({ body }) => {
        useDatabase(mode.userId, mode.wardrobe);
        expect(await callRoute(POST, { ...body, ...mode.extraBody })).toMatchSnapshot();
      });
    });
  }

  it("signed in with an empty wardrobe falls back to the catalog", async () => {
    useDatabase(USER_ID, []);
    expect(await callRoute(POST, CONDITIONS[1].body)).toMatchSnapshot();
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

describe("POST /api/v1/recommendations/ski-touring (golden, pack options)", () => {
  it("prioritizes a light pack when asked", async () => {
    useDatabase(null, []);
    expect(
      await callRoute(skiTouring, { ...CONDITIONS[2].body, prioritize_light_pack: true })
    ).toMatchSnapshot();
  });
});
