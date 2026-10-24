import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess, loadTripFull } from "@/lib/trips";
import { fetchUserWardrobeItems } from "@/lib/userWardrobe";
import * as packingList from "@/lib/packingList";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { ORGANIZER, SAM } from "@/test/tripApi";
import { TRIP_ACTIVITY_OPTIONS } from "@/lib/trip-activities";
import { buildLodging } from "@/lib/trip-lodging";
import { addDaysToDateString } from "@/lib/forecastRange";
import { savedOutfit, WEAR } from "@/test/savedKit";
import type { TripPackResponse } from "@/types/trip-packing";
import type { TripFull, TripMember, TripMemberDayKit } from "@/types/trips";
import type { SavedKit } from "@/types/savedKit";
import { GET, POST } from "./route";

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

  it("returns only current personal shared responsibilities with stable identities and pending/packed states", async () => {
    const full = mockTrip(["2026-10-08"]);
    full.members = [ORGANIZER, SAM];
    const gear = { id: "pending", trip_id: full.trip.id, description: "Stove", assignee_member_id: ORGANIZER.id, sort_order: 0, created_at: full.trip.created_at, revision: "v1", accepted_at: null, packed_at: null };
    full.gear = [gear, { ...gear, id: "accepted", accepted_at: full.trip.created_at, accepted_by: "user-1", packed_at: full.trip.created_at, packed_by: "user-1" },
      { ...gear, id: "other", assignee_member_id: SAM.id }, { ...gear, id: "unassigned", assignee_member_id: null }];
    const result = await (await getPack()).json();
    expect(result.groupGear.map((g: { id: string }) => g.id)).toEqual(["pending", "accepted"]);
    expect(result.groupGear[0]).toMatchObject({ id: "pending", accepted_at: null, packed_at: null });
    expect(result.groupGear[1]).toMatchObject({ id: "accepted", packed_by: "user-1" });
  });

  it("returns a recoverable error when shared responsibility state cannot be loaded", async () => {
    mockTrip(["2026-10-08"]);
    vi.mocked(loadTripFull).mockRejectedValue(new Error("Couldn't load shared gear"));
    const response = await getPack();
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/Reload/);
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
    expect(data.suggestedDays).toBe(dates.length);
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
    expect(data.suggestions.totalRequiredSlots).toBeGreaterThan(0);
    expect(data.suggestions.extras).toEqual(["Removable mid-layer for daytime swings"]);
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
    expect(data.suggestedDays).toBe(1);
    expect(data.coverage[0].forecast).toMatchObject({ status: "partial", availableHours: 13, expectedHours: 16 });
  });

  it.each([undefined, "Mars/Olympus"])("doesn't pack using UTC when the forecast time zone is %s", async (timezone) => {
    mockTrip(["2026-10-08"]);
    const fixture = forecastFixture("America/New_York", "2026-10-08T04:00Z", 24, () => -4);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ...fixture, timezone }) });

    const response = await getPack();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.suggestedDays).toBe(0);
    expect(data.suggestions.totalRequiredSlots).toBe(0);
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
    expect(data.suggestedDays).toBe(9);
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
    expect(data.suggestedDays).toBe(10);
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
    expect(data.suggestedDays).toBe(supported ? 1 : 0);
    expect(data.coverage[0]).toMatchObject({
      advice: supported ? "available" : ["Rest", "Travel"].includes(activity) ? "rest" : "unsupported",
      forecast: { status: supported ? "available" : "not_requested", availableHours: supported ? 16 : 0 },
    });
    // Travel and Rest have no clothing to plan, so they link to the day rather than a kit task (#334).
    if (["Rest", "Travel"].includes(activity)) {
      expect(data.coverage[0]).toMatchObject({ message: `${activity} day; review personal items manually.`, action: "review_day" });
    }
    if (activity === "Climb") expect(data.coverage[0].approximation).toMatch(/hiking guidance/);
    if (!supported) {
      expect(data.suggestions.totalRequiredSlots).toBe(0);
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
    expect(data.suggestedDays).toBe(0);
    expect(data.coverage).toHaveLength(2);
    expect(data.coverage.every((day: { forecast: { status: string }; reason: string }) =>
      day.forecast.status === "unavailable" && day.reason === "no_daytime_hours")).toBe(true);
    expect(data.skipped).toHaveLength(2);
    expect(data.suggestions.extras).toEqual([]);
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
    expect(data.suggestedDays).toBe(1);
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
    expect(data.suggestedDays).toBe(16);
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
    expect(data.suggestedDays).toBe(1);
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
    expect(data.suggestedDays).toBe(0);
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
    expect(data.suggestedDays).toBe(0);
    expect(data.coverage).toHaveLength(2);
    for (const day of data.coverage) {
      expect(day.forecast).toMatchObject(kind === "past" ? { status: "unavailable", reason: "past" }
        : kind === "distant" ? { status: "unavailable", reason: "outside_forecast" }
        : { status: "not_requested", reason: "not_needed" });
      expect(day.forecast.message).not.toMatch(/Choose a location/);
    }
  });

  it("plans no clothing for days you aren't on, and keeps a kit you saved there (#334)", async () => {
    const dates = ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];
    const full = mockTrip(dates);
    full.members = [ORGANIZER];
    // Arrives Friday the 9th and skips it, so the 7th and 8th aren't trip days for them.
    full.lodging = buildLodging(full.trip, [], [], { members: [ORGANIZER], per_member: true,
      attendance: [{ trip_id: "trip-1", member_id: ORGANIZER.id, arrival_date: "2026-10-09", departure_date: null, skipped_dates: ["2026-10-09"] }] });
    full.kits = [{ id: "kit-8", trip_day_id: "2026-10-08", trip_member_id: ORGANIZER.id,
      effort: "steady", items: ["shell"], note: null, state: "ok", updated_at: "2026-10-01T00:00Z" }];
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture("America/New_York", "2026-10-07T04:00Z", 96, () => -4) });
    const data = await (await getPack()).json();
    expect(data.coverage.map((day: { advice: string; reason?: string }) => [day.advice, day.reason])).toEqual([
      ["rest", "not_taking_part"], ["manual", "manual_kit"], ["rest", "not_taking_part"], ["available", undefined],
    ]);
    expect(data.coverage[0]).toMatchObject({ message: "You're not on the trip this day.", action: "review_day" });
    expect(data.coverage[2]).toMatchObject({ message: "You're not taking part this day; review personal items manually.", action: "review_day" });
    expect(data.suggestedDays).toBe(1);
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
    expect(data.suggestedDays).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(new URL(vi.mocked(global.fetch).mock.calls[0][0] as string).searchParams.get("latitude")).toBe("40");
    expect(data.coverage.slice(1, 4).every((day: { forecast: { reason: string } }) => day.forecast.reason === "not_needed")).toBe(true);
    // The missing date uses the base stop: already-fetched weather can be reused.
    expect(data.coverage[4]).toMatchObject({ reason: "no_day", forecast: { status: "available" } });
  });

  it("limits concurrent forecast requests and still accounts for every required stop", async () => {
    const dates = Array.from({ length: 7 }, (_, index) => addDaysToDateString("2026-10-08", index));
    const full = mockTrip(dates);
    full.stops = dates.map((_, index) => ({ ...full.stops[0], id: `stop-${index}`, latitude: 40 + index }));
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
    expect(data.suggestedDays).toBe(7);
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
    expect(data.suggestedDays).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("accepts valid zero coordinates", async () => {
    mockTrip(["2026-10-08"], 0, 0);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture("UTC", "2026-10-08T00:00Z", 24, () => 0) });
    expect((await (await getPack()).json()).suggestedDays).toBe(1);
  });

  it("preserves the trip authorization error without fetching weather", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Not found" }, { status: 404 }));
    global.fetch = vi.fn();
    expect((await getPack()).status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

});

const ANA: TripMember = { ...SAM, id: "member-ana", user_id: "user-2", display_name: "Ana", status: "joined" };
const RAIN_SHELL = { ...WEAR, torso: { ...WEAR.torso, outer: [{ name: "Rain shell", sourceId: "g-9" }] } };
const outfitWith = (wear = WEAR) => savedOutfit({ phases: [{ id: "outing", wear, carry: [], decision: null }] });

function kit(day: string, member: TripMember, outfit: SavedKit | null, items: string[] = []): TripMemberDayKit {
  return {
    id: `kit-${member.id}-${day}`, trip_day_id: day, trip_member_id: member.id, effort: "steady", items, note: null, state: "ok",
    updated_at: `${day}T01:00:00+00:00`, outfit, outfit_saved_at: outfit ? `${day}T01:00:00+00:00` : null,
  };
}

/** A three-day trip at Stowe with the organizer and Ana, and a database client with `packing` rows and an rpc. */
function mockKitTrip(options: {
  kits?: TripMemberDayKit[]; userId?: string; packing?: Record<string, unknown>[]; packingError?: boolean;
  /** Before migration 032: reading the equipment column fails. */
  noEquipmentColumn?: boolean;
} = {}) {
  const dates = ["2026-10-10", "2026-10-11", "2026-10-12"];
  const full: TripFull = {
    trip: { id: "trip-1", owner_user_id: "user-1", name: "Stowe", start_date: dates[0], end_date: dates[2], status: "planning", created_at: "", updated_at: "" },
    stops: [{ id: "stop-1", trip_id: "trip-1", position: 0, name: "Stowe, Vermont", latitude: 44.47, longitude: -72.69, activities: ["Alpine"], created_at: "" }],
    days: dates.map((date) => ({ id: date, trip_id: "trip-1", stop_id: "stop-1", date, activity: "Alpine" })),
    members: [ORGANIZER, ANA], kits: options.kits ?? [], gear: [],
  };
  const fake = createFakeSupabase({ trip_member_packing: options.packing ?? [] });
  const rpc = vi.fn().mockResolvedValue({ data: { items: [], quantities: {} }, error: null });
  const failing = (code: string) => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code, message: "missing" } }) }) });
  const supabase = {
    from: (table: string) => {
      if (table === "trip_member_packing" && options.packingError) return { select: () => failing("42P01") };
      if (table === "trip_member_packing" && options.noEquipmentColumn) {
        return { select: (columns: string) => columns.includes("equipment") ? failing("42703") : fake.from(table).select() };
      }
      return fake.from(table);
    },
    rpc,
  };
  vi.mocked(loadTripFull).mockResolvedValue(full);
  vi.mocked(requireTripAccess).mockResolvedValue({ trip: full.trip, userId: options.userId ?? "user-1", supabase: supabase as unknown as SupabaseClient });
  return { full, rpc };
}

const postPack = (body: unknown) => POST(
  new NextRequest("http://localhost:3000/api/v1/trips/trip-1/pack", { method: "POST", body: JSON.stringify(body) }),
  { params: Promise.resolve({ id: "trip-1" }) }
);

describe("GET /api/v1/trips/[id]/pack from saved outfits", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-08T12:00Z"));
    vi.mocked(fetchUserWardrobeItems).mockResolvedValue([]);
    vi.spyOn(packingList, "buildPackingListFromDays");
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture("America/New_York", "2026-10-08T04:00Z", 120, () => -4) });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it("packs the same jacket on three days once, with each day, and asks no forecast for them", async () => {
    mockKitTrip({ kits: ["2026-10-10", "2026-10-11", "2026-10-12"].map((day) => kit(day, ORGANIZER, outfitWith())) });
    const data: TripPackResponse = await (await getPack()).json();
    expect(data.items.filter((item) => item.name === "Ski shell")).toEqual([expect.objectContaining({
      key: "item:g-3", ownership: "owned", quantity: 1,
      days: ["2026-10-10", "2026-10-11", "2026-10-12"].map((date) => ({ date, uses: ["wear"] })),
    })]);
    expect(data.items.find((item) => item.name === "Fleece")?.ownership).toBe("suggested");
    expect(data.coverage.map((day) => day.advice)).toEqual(["saved", "saved", "saved"]);
    expect(data.suggestedDays).toBe(0);
    expect(data.suggestions.totalRequiredSlots).toBe(0);
    expect(data.skipped).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps two members' lists to themselves", async () => {
    const kits = [kit("2026-10-10", ORGANIZER, outfitWith()), kit("2026-10-10", ANA, outfitWith(RAIN_SHELL))];
    mockKitTrip({ kits });
    const mine: TripPackResponse = await (await getPack()).json();
    expect(mine.items.map((item) => item.name)).toContain("Ski shell");
    expect(mine.items.map((item) => item.name)).not.toContain("Rain shell");
    expect(Object.keys(mine.kitVersions)).toEqual(["kit-member-you-2026-10-10"]);
    mockKitTrip({ kits, userId: "user-2" });
    const anas: TripPackResponse = await (await getPack()).json();
    expect(anas.items.map((item) => item.name)).toContain("Rain shell");
    expect(anas.items.map((item) => item.name)).not.toContain("Ski shell");
  });

  it("lists an older checklist apart, and suggests only for the day with nothing saved", async () => {
    mockKitTrip({ kits: [kit("2026-10-10", ORGANIZER, null, ["shell", "gloves"]), kit("2026-10-12", ORGANIZER, outfitWith())] });
    const data: TripPackResponse = await (await getPack()).json();
    expect(data.checklists).toEqual([{ date: "2026-10-10", items: ["shell", "gloves"] }]);
    expect(data.coverage.map((day) => day.advice)).toEqual(["manual", "available", "saved"]);
    expect(data.coverage[0].message).toMatch(/Older checklist/);
    expect(data.coverage[1].message).toMatch(/No outfit saved/);
    expect(data.suggestedDays).toBe(1);
    expect(data.suggestions.totalRequiredSlots).toBeGreaterThan(0);
    expect(vi.mocked(packingList.buildPackingListFromDays).mock.calls[0][0].map((day) => day.date)).toEqual(["2026-10-11"]);
    // Checklist slots never become named items.
    expect(data.items.some((item) => item.name === "shell")).toBe(false);
    expect(data.skipped).toEqual([{ date: "2026-10-10", reason: "manual_kit" }]);
  });

  it("notes a saved outfit planned for another activity, without changing it", async () => {
    const { full } = mockKitTrip({ kits: [kit("2026-10-10", ORGANIZER, outfitWith())] });
    full.days[0].activity = "XC";
    const data: TripPackResponse = await (await getPack()).json();
    expect(data.coverage[0]).toMatchObject({ advice: "saved", action: "review_day", notes: [expect.stringMatching(/Planned for Alpine Skiing, not this day's activity \(XC\)/)] });
    expect(data.items.some((item) => item.name === "Ski shell")).toBe(true);
  });

  it("records the first list as acknowledged, without flagging it", async () => {
    const { rpc } = mockKitTrip({ kits: [kit("2026-10-10", ORGANIZER, outfitWith())] });
    const data: TripPackResponse = await (await getPack()).json();
    expect(data.items.every((item) => !item.change)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("update_trip_packing", expect.objectContaining({ p_trip_id: "trip-1", p_user_id: "user-1", p_op: expect.objectContaining({
      op: "acknowledge", kits: { "kit-member-you-2026-10-10": "2026-10-10T01:00:00+00:00" },
      seen: expect.objectContaining({ "item:g-3": { name: "Ski shell", dates: ["2026-10-10"], slots: ["2026-10-10:torso:outer"] } }),
    }) }));
  });

  it("doesn't record an empty list, so the first outfit saved isn't flagged as new", async () => {
    const { rpc } = mockKitTrip();
    await getPack();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("flags a substituted jacket and an item that left since the list was acknowledged, with saved quantities and items", async () => {
    const seen = {
      "item:g-3": { name: "Ski shell", dates: ["2026-10-10"], slots: ["2026-10-10:torso:outer"] },
      "item:old": { name: "Old gloves", dates: ["2026-10-10"], slots: ["2026-10-10:hands:outer"] },
    };
    const manual = [{ id: "0b4b6a7e-9c1d-4f53-a8b2-2f6c1d9e7a10", name: "Headlamp", quantity: 1 }];
    const { rpc } = mockKitTrip({
      kits: [kit("2026-10-10", ORGANIZER, outfitWith(RAIN_SHELL))],
      packing: [{ trip_member_id: ORGANIZER.id, seen, items: manual, quantities: { "item:g-1": 3 } }],
    });
    const data: TripPackResponse = await (await getPack()).json();
    expect(data.items.find((item) => item.name === "Rain shell")?.change).toEqual({ kind: "replaced", replaces: ["Ski shell"] });
    expect(data.items.find((item) => item.name === "Insulated gloves")?.change).toEqual({ kind: "replaced", replaces: ["Old gloves"] });
    expect(data.items.find((item) => item.name === "Merino crew")).toMatchObject({ quantity: 3, change: { kind: "added" } });
    expect(data.removed).toEqual([
      { key: "item:g-3", name: "Ski shell", dates: ["2026-10-10"] },
      { key: "item:old", name: "Old gloves", dates: ["2026-10-10"] },
    ]);
    expect(data.manual).toEqual(manual);
    expect(data.editable).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("still lists the outfits when the person's own choices can't be read, and offers no changes", async () => {
    const { rpc } = mockKitTrip({ kits: [kit("2026-10-10", ORGANIZER, outfitWith())], packingError: true });
    const data: TripPackResponse = await (await getPack()).json();
    expect(data.editable).toBe(false);
    expect(data.manual).toEqual([]);
    expect(data.items.length).toBeGreaterThan(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/trips/[id]/pack touring equipment", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-08T12:00Z"));
    vi.mocked(fetchUserWardrobeItems).mockResolvedValue([]);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () =>
      forecastFixture("America/New_York", "2026-10-08T04:00Z", 120, () => -4) });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  /** Alpine, then Backcountry, then a day with no activity of its own at a Backcountry-first stop. */
  const touringTrip = (options: Parameters<typeof mockKitTrip>[0] = {}) => {
    const mocked = mockKitTrip(options);
    mocked.full.stops[0].activities = ["Backcountry", "Alpine"];
    mocked.full.days[1].activity = "Backcountry";
    mocked.full.days[2].activity = null;
    return mocked;
  };

  it("lists the person's equipment for the Backcountry days, with the template as their list stands", async () => {
    touringTrip({ packing: [{ trip_member_id: ORGANIZER.id, items: [{ id: "0b4b6a7e-9c1d-4f53-a8b2-2f6c1d9e7a10", name: "shovel", quantity: 1 }],
      quantities: {}, equipment: { transceiver: { status: "added", quantity: 2 }, probe: { status: "removed", quantity: 1 }, rope: { status: "added", quantity: 1 } } }] });
    const { equipment }: TripPackResponse = await (await getPack()).json();
    expect(equipment.dates).toEqual(["2026-10-11", "2026-10-12"]);
    expect(equipment.editable).toBe(true);
    // Only the template's items: an unknown id isn't listed.
    expect(equipment.items).toEqual([expect.objectContaining({ id: "transceiver", key: "equipment:transceiver", name: "Avalanche transceiver", quantity: 2 })]);
    const states = Object.fromEntries(equipment.template.map((option) => [option.id, [option.state, option.listedAs]]));
    expect(states).toMatchObject({
      transceiver: ["added", undefined], probe: ["removed", undefined], shovel: ["listed", "shovel"], skins: ["available", undefined],
    });
  });

  it("says when the plan has no Backcountry days, and shows the equipment the person added anyway", async () => {
    mockKitTrip({ packing: [{ trip_member_id: ORGANIZER.id, items: [], quantities: {}, equipment: { shovel: { status: "added", quantity: 1 } } }] });
    const { equipment }: TripPackResponse = await (await getPack()).json();
    expect(equipment.dates).toEqual([]);
    expect(equipment.items.map((item) => item.id)).toEqual(["shovel"]);
  });

  it("reads the rest of the list before migration 032, and offers no equipment changes", async () => {
    const manual = [{ id: "0b4b6a7e-9c1d-4f53-a8b2-2f6c1d9e7a10", name: "Headlamp", quantity: 1 }];
    touringTrip({ noEquipmentColumn: true, packing: [{ trip_member_id: ORGANIZER.id, items: manual, quantities: {} }] });
    const data: TripPackResponse = await (await getPack()).json();
    expect(data.editable).toBe(true);
    expect(data.manual).toEqual(manual);
    expect(data.equipment).toMatchObject({ editable: false, items: [], dates: ["2026-10-11", "2026-10-12"] });
  });
});

describe("POST /api/v1/trips/[id]/pack", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const id = "0b4b6a7e-9c1d-4f53-a8b2-2f6c1d9e7a10";

  it("applies a change to the signed-in member's list and returns their choices", async () => {
    const { rpc } = mockKitTrip();
    rpc.mockResolvedValueOnce({ data: { items: [{ id, name: "Headlamp", quantity: 2 }], quantities: { "item:g-1": 3 } }, error: null });
    const response = await postPack({ op: "add_item", id, name: " Headlamp ", quantity: 2 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ manual: [{ id, name: "Headlamp", quantity: 2 }], quantities: { "item:g-1": 3 }, checks: {}, equipment: {} });
    expect(rpc).toHaveBeenCalledWith("update_trip_packing", { p_trip_id: "trip-1", p_user_id: "user-1", p_op: { op: "add_item", id, name: "Headlamp", quantity: 2 } });
  });

  it("refuses an invalid change without saving", async () => {
    const { rpc } = mockKitTrip();
    const response = await postPack({ op: "item_quantity", id, quantity: 0 });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/1 to 20/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["P0002", 404, /removed in another session/],
    ["40001", 409, /saved outfits changed/], ["PT409", 409, /saved outfits changed/],
    ["22023", 400, /Check the change/],
    ["42501", 404, /Not found/],
    ["42883", 503, /can't be saved yet/],
    ["XX000", 500, /Couldn't save/],
  ])("answers a %s failure with %i", async (failure, status, message) => {
    const { rpc } = mockKitTrip();
    rpc.mockResolvedValueOnce({ data: null, error: { code: failure, message: "failed" } });
    const response = await postPack({ op: "item_quantity", id, quantity: 2 });
    expect(response.status).toBe(status);
    expect((await response.json()).error).toMatch(message);
  });

  it("acknowledges the list the person saw, worked out again on the server", async () => {
    const { rpc } = mockKitTrip({ kits: [kit("2026-10-10", ORGANIZER, outfitWith()), kit("2026-10-11", ANA, outfitWith(RAIN_SHELL))] });
    const response = await postPack({ op: "acknowledge", kits: { "kit-member-you-2026-10-10": "2026-10-10T01:00:00Z" } });
    expect(response.status).toBe(200);
    const op = rpc.mock.calls[0][1].p_op;
    expect(op).toMatchObject({ op: "acknowledge", kits: { "kit-member-you-2026-10-10": "2026-10-10T01:00:00+00:00" } });
    expect(Object.keys(op.seen)).toContain("item:g-3");
    expect(Object.keys(op.seen)).not.toContain("item:g-9");
  });

  it("refuses to acknowledge a list whose outfits changed since it was shown", async () => {
    const { rpc } = mockKitTrip({ kits: [kit("2026-10-10", ORGANIZER, outfitWith())] });
    const response = await postPack({ op: "acknowledge", kits: { "kit-member-you-2026-10-10": "2026-10-09T01:00:00Z" } });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "kits_changed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("adds template equipment once each and returns the saved equipment", async () => {
    const { rpc } = mockKitTrip();
    rpc.mockResolvedValueOnce({ data: { items: [], quantities: {}, checks: {}, equipment: { transceiver: { status: "added", quantity: 1 } } }, error: null });
    const response = await postPack({ op: "add_equipment", ids: ["transceiver", "transceiver"] });
    expect(response.status).toBe(200);
    expect((await response.json()).equipment).toEqual({ transceiver: { status: "added", quantity: 1 } });
    expect(rpc).toHaveBeenCalledWith("update_trip_packing", { p_trip_id: "trip-1", p_user_id: "user-1", p_op: { op: "add_equipment", ids: ["transceiver"] } });
  });

  it.each([
    { op: "add_equipment", ids: ["transceiver", "rope"] },
    { op: "equipment_quantity", id: "rope", quantity: 2 },
    { op: "remove_equipment", id: "rope" },
    { op: "add_equipment", ids: [] },
    { op: "remove_equipment", id: "Transceiver!" },
  ])("refuses equipment that isn't the template's %j", async (change) => {
    const { rpc } = mockKitTrip();
    expect((await postPack(change)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says equipment can't be saved yet before migration 032", async () => {
    const { rpc } = mockKitTrip();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "Invalid change" } });
    const response = await postPack({ op: "equipment_quantity", id: "probe", quantity: 2 });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/can't be saved yet/);
  });

  it("preserves the trip authorization error", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Not found" }, { status: 404 }));
    expect((await postPack({ op: "remove_item", id })).status).toBe(404);
  });
});

describe("Private packing check API", () => {
  const mutation = "fd037a5d-b4d4-4b2e-8d6a-624ca9c8503b";
  const body = (overrides: Record<string, unknown> = {}) => ({ op: "set_packed", key: "item:g-3", packed: true,
    quantity: 1, expected: null, mutation, kits: { "kit-member-you-2026-10-10": "2026-10-10T01:00:00+00:00" }, ...overrides });
  const checks = { "item:g-3": { packed: true, quantity: 1, version: mutation } };
  beforeEach(() => { vi.clearAllMocks(); });

  it("validates the member's item and supplies only server-derived aliases to the RPC", async () => {
    const { rpc } = mockKitTrip({ kits: [kit("2026-10-10", ORGANIZER, outfitWith())] });
    rpc.mockResolvedValueOnce({ data: { items: [], quantities: {}, checks }, error: null });
    const response = await postPack(body({ aliases: ["another-user-item"], userId: "user-2", memberId: ANA.id }));
    expect(response.status).toBe(200);
    expect((await response.json()).checks).toEqual(checks);
    expect(rpc).toHaveBeenCalledWith("update_trip_packing", { p_trip_id: "trip-1", p_user_id: "user-1", p_op: {
      ...body(), aliases: ["general:torso:outer:ski shell", "carry:ski shell"],
    } });
  });

  it.each(["item:g-9", "group:stove", "general:imaginary", "manual:not-a-uuid"])("refuses a check for an absent or nonpersonal item %s", async (key) => {
    const { rpc } = mockKitTrip({ kits: [kit("2026-10-10", ORGANIZER, outfitWith()), kit("2026-10-10", ANA, outfitWith(RAIN_SHELL))] });
    const response = await postPack(body({ key }));
    expect(response.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows manual identities through to the transaction's ownership and existence check", async () => {
    const { rpc } = mockKitTrip();
    expect((await postPack(body({ key: `manual:${mutation}`, kits: {} }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("update_trip_packing", expect.objectContaining({ p_op: expect.objectContaining({ aliases: [] }) }));
  });

  it("allows template equipment through to the transaction's check, and refuses other equipment keys", async () => {
    const { rpc } = mockKitTrip();
    expect((await postPack(body({ key: "equipment:transceiver", kits: {} }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("update_trip_packing", expect.objectContaining({
      p_op: expect.objectContaining({ key: "equipment:transceiver", aliases: [] }) }));
    rpc.mockClear();
    for (const key of ["equipment:rope", "equipment:", "equipment:transceiver:x"]) {
      expect((await postPack(body({ key, kits: {} }))).status).toBe(404);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an outfit revision that changed before the request and maps transaction conflicts", async () => {
    const { rpc } = mockKitTrip({ kits: [kit("2026-10-10", ORGANIZER, outfitWith())] });
    expect((await postPack(body({ kits: {} }))).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0409", message: "private database detail" } });
    const response = await postPack(body());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "This item changed in another session. Review its saved state and try again.", code: "packing_changed" });
  });

  it.each([{ packed: "true" }, { expected: "old" }, { mutation: "x" }, { quantity: 0 }, { quantity: 21 }, { kits: { id: "invalid-time" } }])("refuses malformed checks %j", async (invalid) => {
    const { rpc } = mockKitTrip();
    expect((await postPack(body(invalid))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reads only the current member's checks on reload, including removed identities for later return", async () => {
    vi.mocked(fetchUserWardrobeItems).mockResolvedValue([]);
    const { full } = mockKitTrip({ kits: [kit("2026-10-10", ORGANIZER, outfitWith()), kit("2026-10-10", ANA, outfitWith())], packing: [
      { trip_member_id: ORGANIZER.id, checks, seen: {}, items: [], quantities: {} },
      { trip_member_id: ANA.id, checks: { "carry:other-person": { packed: true, quantity: 1, version: mutation } }, seen: {}, items: [], quantities: {} },
    ] });
    full.trip.end_date = "2026-10-10";
    const response = await getPack();
    expect((await response.json()).checks).toEqual(checks);
  });
});
