import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess, loadTripFull } from "@/lib/trips";
import { fetchUserWardrobeItems } from "@/lib/userWardrobe";
import * as packingList from "@/lib/packingList";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { ORGANIZER, SAM } from "@/test/tripApi";
import { TRIP_ACTIVITY_OPTIONS } from "@/lib/trip-activities";
import { addDaysToDateString } from "@/lib/forecastRange";
import type { TripFull } from "@/types/trips";
import { GET } from "./route";

vi.mock("@/lib/trips", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn(), loadTripFull: vi.fn(),
}));
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
  return full;
}

const getPack = () => GET(
  new NextRequest("http://localhost:3000/api/v1/trips/trip-1/pack"),
  { params: Promise.resolve({ id: "trip-1" }) }
);

describe("GET /api/v1/trips/[id]/pack", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-08T12:00Z"));
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
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(`${dates[0]}T00:00Z`));
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
    expect(url.searchParams.get("forecast_days")).toBe("16");
    expect(url.searchParams.has("start_date")).toBe(false);
    expect(data.coverage.map((day: { date: string }) => day.date)).toEqual(dates);
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

  it("packs without a wardrobe when it couldn't be read", async () => {
    vi.mocked(fetchUserWardrobeItems).mockResolvedValueOnce(null);
    mockTrip(["2026-10-08"]);
    const forecast = forecastFixture("America/New_York", "2026-10-08T04:00Z", 24, () => -4);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(forecast) });

    const response = await getPack();

    expect(response.status).toBe(200);
    expect(vi.mocked(packingList.buildPackingListFromDays).mock.calls[0][2]).toEqual([]);
  });

  it("leaves out hours with a missing value rather than pack for zero", async () => {
    mockTrip(["2026-10-08"]);
    // Near the end of its window Open-Meteo returns null for some hours.
    const forecast = forecastFixture("America/New_York", "2026-10-08T04:00Z", 24, () => -4);
    forecast.hourly.temperature_2m[6] = null as unknown as number; // 6am
    forecast.hourly.precipitation_probability[7] = null as unknown as number; // 7am
    forecast.hourly.wind_speed_10m[8] = null as unknown as number; // 8am
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(forecast) });

    const response = await getPack();

    expect(response.status).toBe(200);
    const [day] = vi.mocked(packingList.buildPackingListFromDays).mock.calls[0][0];
    expect(day.baseline).toMatchObject({ minTemp: 49, maxWindSpeed: 0, maxPrecipProbability: 0 });
    expect(day.dayparts[0]).toMatchObject({ id: "morning", minTemp: 49 });
    const data = await response.json();
    expect(data.coveredDays).toBe(1);
    expect(data.coverage[0].forecast).toMatchObject({ status: "partial", availableHours: 13, expectedHours: 16 });
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
    expect(data.coverage[0]).toMatchObject({ advice: "unavailable", action: "retry_weather", forecast: { status: "error" } });
  });

  it("accounts for ten contiguous dates, even with duplicated or absent day rows", async () => {
    const dates = Array.from({ length: 10 }, (_, index) => addDaysToDateString("2026-10-08", index));
    const full = mockTrip(dates);
    full.days.push(full.days[0]);
    full.days.splice(3, 1);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture("America/New_York", "2026-10-08T04:00Z", 240, () => -4) });
    const data = await (await getPack()).json();
    expect(data.coverage.map((day: { date: string }) => day.date)).toEqual(dates);
    expect(data.totalDays).toBe(10);
    expect(data.coveredDays).toBe(9);
    expect(data.coverage[3]).toMatchObject({ advice: "missing_inputs", reason: "no_day" });
    expect(data.skipped).toEqual([{ date: "2026-10-11", reason: "no_day" }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("includes a return to the first stop on day ten without filling other stops with its weather", async () => {
    const dates = Array.from({ length: 10 }, (_, index) => addDaysToDateString("2026-10-08", index));
    const full = mockTrip(dates);
    full.stops.push({ ...full.stops[0], id: "stop-2", name: "Other stop", latitude: 46 });
    full.days.slice(1, 9).forEach((day) => { day.stop_id = "stop-2"; });
    global.fetch = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => {
      const fixture = forecastFixture("America/New_York", "2026-10-08T04:00Z", 240, () => -4);
      if (new URL(url).searchParams.get("latitude") === "46") fixture.hourly.temperature_2m.fill(20);
      return fixture;
    } }));
    const data = await (await getPack()).json();
    const plans = vi.mocked(packingList.buildPackingListFromDays).mock.calls[0][0];
    expect(data.coveredDays).toBe(10);
    expect(plans.map((day) => day.baseline.minTemp)).toEqual([46, 20, 20, 20, 20, 20, 20, 20, 20, 46]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(TRIP_ACTIVITY_OPTIONS)("reports the static engine's capability for %s separately from weather", async (activity) => {
    const full = mockTrip(["2026-10-08"]);
    full.days[0].activity = activity;
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture("America/New_York", "2026-10-08T04:00Z", 24, () => -4) });
    const data = await (await getPack()).json();
    const supported = ["Alpine", "XC", "Hike", "Climb"].includes(activity);
    expect(data.coveredDays).toBe(supported ? 1 : 0);
    expect(data.coverage[0]).toMatchObject({
      advice: supported ? "available" : activity === "Rest" ? "rest" : "unsupported",
      forecast: { status: supported ? "available" : "not_requested", availableHours: supported ? 16 : 0 },
    });
    if (activity === "Climb") expect(data.coverage[0].approximation).toMatch(/hiking guidance/);
    if (!supported) {
      expect(data.packingList.totalRequiredSlots).toBe(0);
      expect(data.coverage[0].forecast.reason).toBe("not_needed");
      expect(data.coverage[0].forecast.message).not.toMatch(/Choose a location/);
      expect(global.fetch).not.toHaveBeenCalled();
    }
  });

  it.each([[], null])("accounts for empty or null forecast values (%s)", async (values) => {
    mockTrip(["2026-10-08", "2026-10-09"]);
    const fixture = forecastFixture("America/New_York", "2026-10-08T04:00Z", 48, () => -4);
    if (values === null) fixture.hourly.temperature_2m.fill(null as unknown as number);
    else Object.values(fixture.hourly).forEach((series) => { series.length = 0; });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fixture });
    const data = await (await getPack()).json();
    expect(data.coveredDays).toBe(0);
    expect(data.coverage).toHaveLength(2);
    expect(data.coverage.every((day: { forecast: { status: string }; reason: string }) =>
      day.forecast.status === "unavailable" && day.reason === "no_daytime_hours")).toBe(true);
    expect(data.skipped).toHaveLength(2);
    expect(data.packingList.extras).toEqual([]);
  });

  it.each(["http", "network", "invalid_json"])("isolates a %s failure to its stop", async (failure) => {
    const full = mockTrip(["2026-10-08", "2026-10-09"]);
    full.stops.push({ ...full.stops[0], id: "stop-2", latitude: 46 });
    full.days[1].stop_id = "stop-2";
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (new URL(url).searchParams.get("latitude") === "46") {
        if (failure === "network") throw new Error("Offline");
        return { ok: failure === "invalid_json", json: async () => { throw new SyntaxError("Invalid JSON"); } };
      }
      return { ok: true, json: async () => forecastFixture("America/New_York", "2026-10-08T04:00Z", 48, () => -4) };
    });
    const data = await (await getPack()).json();
    expect(data.coveredDays).toBe(1);
    expect(data.coverage[1]).toMatchObject({ advice: "unavailable", forecast: { status: "error" }, action: "retry_weather" });
    expect(data.coverage[1].message).not.toMatch(/Choose/);
  });

  it("keeps past and distant dates planned without letting them fail today's weather", async () => {
    const dates = Array.from({ length: 19 }, (_, index) => addDaysToDateString("2026-10-07", index));
    mockTrip(dates);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture("America/New_York", "2026-10-08T04:00Z", 384, () => -4) });
    const data = await (await getPack()).json();
    expect(data.totalDays).toBe(19);
    expect(data.coveredDays).toBe(16);
    expect(data.coverage[0]).toMatchObject({ reason: "past", action: "plan_manually" });
    expect(data.coverage[17]).toMatchObject({ reason: "outside_forecast", action: "check_later" });
    expect(data.skipped.map((day: { date: string }) => day.date)).toEqual(["2026-10-07", "2026-10-24", "2026-10-25"]);
  });

  it.each(["Alpine", "Rest"])("reports only the requesting member's saved %s kit as manual, without claiming automatic coverage", async (activity) => {
    const full = mockTrip(["2026-10-08", "2026-10-09"]);
    full.days[0].activity = activity;
    full.members = [ORGANIZER, SAM];
    full.kits = full.days.map((day, index) => ({
      id: `kit-${index}`, trip_day_id: day.id, trip_member_id: index === 0 ? ORGANIZER.id : SAM.id,
      effort: "steady", items: ["shell"], note: null, state: "ok", updated_at: "2026-10-01T00:00Z",
    }));
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture("America/New_York", "2026-10-08T04:00Z", 48, () => -4) });
    const data = await (await getPack()).json();
    expect(data.coveredDays).toBe(1);
    expect(data.coverage[0]).toMatchObject({ advice: "manual", forecast: { status: "available" } });
    expect(data.coverage[1].advice).toBe("available");
  });

  it.each(["no_stop", "no_coords", "no_activity"])("gives an input action for %s", async (reason) => {
    const full = mockTrip(["2026-10-08"]);
    if (reason === "no_stop") full.stops = [];
    if (reason === "no_coords") full.stops[0].latitude = null;
    if (reason === "no_activity") { full.days[0].activity = null; full.stops[0].activities = []; }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture("America/New_York", "2026-10-08T04:00Z", 24, () => -4) });
    const data = await (await getPack()).json();
    expect(data.coveredDays).toBe(0);
    expect(data.coverage[0]).toMatchObject({ advice: "missing_inputs", reason,
      action: reason === "no_activity" ? "set_activity" : "set_location" });
  });

  it.each(["past", "distant", "manual", "no_day", "no_activity"])("doesn't request weather for an entirely %s trip", async (kind) => {
    const dates = kind === "past" ? ["2026-10-05", "2026-10-06"]
      : kind === "distant" ? ["2026-10-25", "2026-10-26"] : ["2026-10-08", "2026-10-09"];
    const full = mockTrip(dates);
    if (kind === "manual") {
      full.members = [ORGANIZER];
      full.kits = full.days.map((day) => ({
        id: `kit-${day.id}`, trip_day_id: day.id, trip_member_id: ORGANIZER.id,
        effort: "steady", items: ["shell"], note: null, state: "ok", updated_at: "2026-10-01T00:00Z",
      }));
    }
    if (kind === "no_day") full.days = [];
    if (kind === "no_activity") {
      full.stops[0].activities = [];
      full.days.forEach((day) => { day.activity = null; });
    }
    global.fetch = vi.fn().mockRejectedValue(new Error("Provider should not be called"));
    const data = await (await getPack()).json();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(data.coveredDays).toBe(0);
    expect(data.coverage).toHaveLength(2);
    for (const day of data.coverage) {
      expect(day.forecast).toMatchObject(kind === "past" ? { status: "unavailable", reason: "past" }
        : kind === "distant" ? { status: "unavailable", reason: "outside_forecast" }
        : { status: "not_requested", reason: "not_needed" });
      expect(day.forecast.message).not.toMatch(/Choose a location/);
    }
  });

  it("requests only the stop needed by automatic guidance in a mixed trip", async () => {
    const dates = Array.from({ length: 5 }, (_, index) => addDaysToDateString("2026-10-08", index));
    const full = mockTrip(dates);
    full.stops = dates.map((_, index) => ({ ...full.stops[0], id: `stop-${index}`, latitude: 40 + index }));
    full.days.forEach((day, index) => { day.stop_id = full.stops[index].id; });
    full.days[1].activity = "Rest";
    full.days[2].activity = "Run";
    full.members = [ORGANIZER];
    full.kits = [{ id: "kit-3", trip_day_id: full.days[3].id, trip_member_id: ORGANIZER.id,
      effort: "steady", items: ["shell"], note: null, state: "ok", updated_at: "2026-10-01T00:00Z" }];
    full.days.pop();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture("America/New_York", "2026-10-08T04:00Z", 120, () => -4) });
    const data = await (await getPack()).json();
    expect(data.coveredDays).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(new URL(vi.mocked(global.fetch).mock.calls[0][0] as string).searchParams.get("latitude")).toBe("40");
    expect(data.coverage.slice(1, 4).every((day: { forecast: { reason: string } }) => day.forecast.reason === "not_needed")).toBe(true);
    // The missing date uses the base stop: already-fetched weather can be reused.
    expect(data.coverage[4]).toMatchObject({ reason: "no_day", forecast: { status: "available" } });
  });

  it("limits concurrent forecast requests and still accounts for every required stop", async () => {
    const dates = Array.from({ length: 7 }, (_, index) => addDaysToDateString("2026-10-08", index));
    const full = mockTrip(dates);
    full.stops = dates.map((_, index) => ({ ...full.stops[0], id: `stop-${index}` }));
    full.days.forEach((day, index) => { day.stop_id = full.stops[index].id; });
    let inFlight = 0;
    let peak = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { ok: true, json: async () => forecastFixture("America/New_York", "2026-10-08T04:00Z", 168, () => -4) };
    });
    const data = await (await getPack()).json();
    expect(peak).toBe(3);
    expect(inFlight).toBe(0);
    expect(global.fetch).toHaveBeenCalledTimes(7);
    expect(data.coveredDays).toBe(7);
    expect(data.totalDays).toBe(7);
  });

  it.each([
    { now: "2026-10-08T00:30Z", date: "2026-10-07", timezone: "America/Los_Angeles", firstHour: "2026-10-07T07:00Z", offset: -7 },
    { now: "2026-10-08T23:30Z", date: "2026-10-24", timezone: "Pacific/Kiritimati", firstHour: "2026-10-23T10:00Z", offset: 14 },
  ])("doesn't skip a forecastable local boundary date $date", async ({ now, date, timezone, firstHour, offset }) => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(now));
    mockTrip([date]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture(timezone, firstHour, 24, () => offset) });
    const data = await (await getPack()).json();
    expect(data.coveredDays).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("accepts valid zero coordinates", async () => {
    mockTrip(["2026-10-08"], 0, 0);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture("UTC", "2026-10-08T00:00Z", 24, () => 0) });
    expect((await (await getPack()).json()).coveredDays).toBe(1);
  });

  it("preserves the trip authorization error without fetching weather", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Not found" }, { status: 404 }));
    global.fetch = vi.fn();
    expect((await getPack()).status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

});
