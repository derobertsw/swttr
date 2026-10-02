import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import { GET } from "./route";

vi.mock("@/lib/trips", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/trips")>(), loadTripFull: vi.fn(), requireTripAccess: vi.fn(),
}));

const getWeather = (date = "2026-10-10") => GET(new NextRequest("http://localhost/api/v1/trips/trip-1/days/2026-10-10/weather"), {
  params: Promise.resolve({ id: TRIP.id, date }),
});

const forecastFixture = () => {
  const start = Date.parse("2026-10-10T04:00Z") / 1000;
  return {
    timezone: "America/New_York", hourly: {
      time: Array.from({ length: 24 }, (_, index) => start + index * 3600),
      temperature_2m: Array.from({ length: 24 }, (_, index) => 40 + index),
      wind_speed_10m: Array.from({ length: 24 }, (_, index) => index),
      precipitation_probability: Array.from({ length: 24 }, (_, index) => index),
    },
  };
};

describe("Trip day weather", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-08T12:00Z"));
    vi.mocked(requireTripAccess).mockResolvedValue({ trip: TRIP, userId: "user-1", supabase: createFakeSupabase({}) as unknown as SupabaseClient });
    vi.mocked(loadTripFull).mockResolvedValue(tripFull({ stops: [STOWE_STOP], days: [{
      id: "day-1", trip_id: TRIP.id, date: "2026-10-10", activity: "Hike", stop_id: null,
    }] }));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("summarizes destination-local daytime weather on the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => forecastFixture() }));
    const data = await (await getWeather()).json();
    expect(data.forecast).toMatchObject({ status: "available", availableHours: 16, expectedHours: 16 });
    expect(data.weather).toEqual({ tempF: 54, wind: 21, precip: 0.21 });
  });

  it("reports partial hours without turning nulls into zero readings", async () => {
    const fixture = forecastFixture();
    fixture.hourly.temperature_2m[6] = null as unknown as number;
    fixture.hourly.wind_speed_10m[7] = null as unknown as number;
    fixture.hourly.precipitation_probability[8] = null as unknown as number;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }));
    const data = await (await getWeather()).json();
    expect(data.forecast).toMatchObject({ status: "partial", availableHours: 13 });
    expect(data.weather).toEqual({ tempF: 55, wind: 21, precip: 0.21 });
  });

  it("doesn't borrow weather from another date or use overnight data as daytime coverage", async () => {
    const fixture = forecastFixture();
    Object.values(fixture.hourly).forEach((series) => { series.length = 6; });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }));
    const data = await (await getWeather()).json();
    expect(data.forecast).toMatchObject({ status: "unavailable", reason: "no_daytime_hours" });
    expect(data.weather).toBeNull();
  });

  it("reports a failed provider request as an actionable terminal state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    expect((await (await getWeather()).json()).forecast).toMatchObject({ status: "error", reason: "service_error" });
  });

  it("doesn't fetch weather without coordinates", async () => {
    vi.mocked(loadTripFull).mockResolvedValue(tripFull());
    vi.stubGlobal("fetch", vi.fn());
    expect((await (await getWeather()).json()).forecast).toMatchObject({ status: "not_requested", reason: "no_location" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([401, 404])("preserves the trip access response %s", async (status) => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Denied" }, { status }));
    vi.stubGlobal("fetch", vi.fn());
    expect((await getWeather()).status).toBe(status);
    expect(loadTripFull).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects dates outside this trip before fetching weather", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect((await getWeather("2026-10-20")).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
