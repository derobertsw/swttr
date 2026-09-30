import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess, loadTripFull } from "@/lib/trips";
import { fetchUserWardrobeItems } from "@/lib/userWardrobe";
import * as packingList from "@/lib/packingList";
import { createFakeSupabase } from "@/test/fakeSupabase";
import type { TripFull } from "@/types/trips";
import { GET } from "./route";

vi.mock("@/lib/trips", () => ({ requireTripAccess: vi.fn(), loadTripFull: vi.fn() }));
vi.mock("@/lib/userWardrobe", () => ({ fetchUserWardrobeItems: vi.fn() }));

/**
 * Deterministic Unix-hour response. Temperatures are 40°F + the local hour,
 * calculated from explicit offsets so the fixture doesn't reuse route logic.
 */
function forecastFixture(
  timezone: string,
  firstHour: string,
  count: number,
  offsetAt: (start: number) => number
) {
  const first = Date.parse(firstHour) / 1000;
  const time = Array.from({ length: count }, (_, index) => first + index * 3600);
  return {
    timezone,
    hourly: {
      time,
      temperature_2m: time.map((start) => 40 + ((start / 3600 + offsetAt(start)) % 24)),
      wind_speed_10m: time.map(() => 0),
      precipitation_probability: time.map(() => 0),
    },
  };
}

function mockTrip(dates: string[], latitude = 44.47, longitude = -72.69) {
  const full: TripFull = {
    trip: {
      id: "trip-1", owner_user_id: "user-1", name: "Ski trip",
      start_date: dates[0], end_date: dates[dates.length - 1], status: "planning",
      created_at: "2026-09-27T00:00:00Z", updated_at: "2026-09-27T00:00:00Z",
    },
    stops: [{
      id: "stop-1", trip_id: "trip-1", position: 0, name: "Base",
      latitude, longitude, activities: ["Alpine"], created_at: "2026-09-27T00:00:00Z",
    }],
    days: dates.map((date) => ({ id: date, trip_id: "trip-1", stop_id: "stop-1", date, activity: "Alpine" })),
    members: [], kits: [], gear: [],
  };
  vi.mocked(loadTripFull).mockResolvedValue(full);
  vi.mocked(requireTripAccess).mockResolvedValue({
    trip: full.trip,
    userId: "user-1",
    supabase: createFakeSupabase({}) as unknown as SupabaseClient,
  });
}

const getPack = () => GET(
  new NextRequest("http://localhost:3000/api/v1/trips/trip-1/pack"),
  { params: Promise.resolve({ id: "trip-1" }) }
);

describe("GET /api/v1/trips/[id]/pack", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchUserWardrobeItems).mockResolvedValue([]);
    // Keep the real plan and packing engines; inspect the days used to pack.
    vi.spyOn(packingList, "buildPackingListFromDays");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    {
      label: "Vermont, independent of the server's time zone",
      dates: ["2026-10-08", "2026-10-09"],
      timezone: "America/New_York", firstHour: "2026-10-08T04:00Z", count: 48,
      latitude: 44.47, longitude: -72.69, offsetAt: () => -4,
    },
    {
      label: "Sydney across the daylight saving jump",
      dates: ["2026-10-03", "2026-10-04", "2026-10-05"],
      timezone: "Australia/Sydney", firstHour: "2026-10-02T14:00Z", count: 72,
      latitude: -33.87, longitude: 151.21,
      offsetAt: (start: number) => start < Date.parse("2026-10-03T16:00Z") / 1000 ? 10 : 11,
    },
    {
      label: "Sydney after the jump with Open-Meteo's old offset",
      dates: ["2026-10-05", "2026-10-06"],
      timezone: "Australia/Sydney", firstHour: "2026-10-04T14:00Z", count: 48,
      latitude: -33.87, longitude: 151.21, offsetAt: () => 11,
    },
    {
      label: "Vermont across the daylight saving fallback",
      dates: ["2026-10-31", "2026-11-01", "2026-11-02"],
      timezone: "America/New_York", firstHour: "2026-10-31T04:00Z", count: 72,
      latitude: 44.47, longitude: -72.69,
      offsetAt: (start: number) => start < Date.parse("2026-11-01T06:00Z") / 1000 ? -4 : -5,
    },
  ])("packs using local dates and daytime windows in $label", async ({ dates, timezone, firstHour, count, latitude, longitude, offsetAt }) => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    mockTrip(dates, latitude, longitude);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(forecastFixture(timezone, firstHour, count, offsetAt)),
    });

    const response = await getPack();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.coveredDays).toBe(dates.length);
    const url = new URL(vi.mocked(global.fetch).mock.calls[0][0] as string);
    expect(url.searchParams.get("latitude")).toBe(String(latitude));
    expect(url.searchParams.get("longitude")).toBe(String(longitude));
    expect(url.searchParams.get("start_date")).toBe(dates[0]);
    expect(url.searchParams.get("end_date")).toBe(dates[dates.length - 1]);
    expect(url.searchParams.get("timezone")).toBe("auto");
    expect(url.searchParams.get("timeformat")).toBe("unixtime");

    const days = vi.mocked(packingList.buildPackingListFromDays).mock.calls[0][0];
    expect(days.map((day) => day.date)).toEqual(dates);
    for (const day of days) {
      expect(day.baseline).toMatchObject({ minTemp: 46, maxTemp: 61, effectiveTemperature: 46 });
      expect(day.dayparts.map(({ id, minTemp, maxTemp }) => ({ id, minTemp, maxTemp }))).toEqual([
        { id: "morning", minTemp: 46, maxTemp: 50 },
        { id: "midday", minTemp: 51, maxTemp: 55 },
        { id: "evening", minTemp: 56, maxTemp: 61 },
      ]);
    }
    expect(data.packingList.totalRequiredSlots).toBeGreaterThan(0);
    expect(data.packingList.extras).toEqual(["Removable mid-layer for daytime swings"]);
  });

  it.each([undefined, "Mars/Olympus"])("doesn't pack using UTC when the forecast time zone is %s", async (timezone) => {
    mockTrip(["2026-10-08"]);
    const fixture = forecastFixture("America/New_York", "2026-10-08T04:00Z", 24, () => -4);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ...fixture, timezone }) });

    const response = await getPack();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.coveredDays).toBe(0);
    expect(data.packingList.totalRequiredSlots).toBe(0);
  });
});
