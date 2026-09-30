import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const HOUR_SECONDS = 3600;

/**
 * Open-Meteo's `timeformat=unixtime` response: hours from `firstHourStart`,
 * each 40°F plus the hour on the place's clock, so the coldest daytime hour
 * of a window is its first.
 */
function forecastFixture(
  timezone: string,
  firstHourStart: string,
  hourCount: number,
  utcOffsetHoursAt: (start: number) => number
) {
  const first = Date.parse(firstHourStart) / 1000;
  const time = Array.from({ length: hourCount }, (_, index) => first + index * HOUR_SECONDS);
  return {
    timezone,
    hourly: {
      time,
      temperature_2m: time.map((start) => 40 + ((start / HOUR_SECONDS + utcOffsetHoursAt(start)) % 24)),
      wind_speed_10m: time.map(() => 0),
      precipitation_probability: time.map(() => 0),
    },
  };
}

function planAhead(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost:3000/api/plan-ahead", {
      method: "POST",
      body: JSON.stringify({ activity: "alpine_skiing", sensitivity: "neutral", lat: 44.47, lon: -72.69, ...body }),
    })
  );
}

describe("POST /api/plan-ahead", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("builds daytime windows on the place's clock, from the start time there", async () => {
    // Stowe, from midnight EDT (UTC-4) on October 8.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(forecastFixture("America/New_York", "2026-10-08T04:00Z", 48, () => -4)),
    });

    const response = await planAhead({ startDate: "2026-10-08", durationDays: 2, startHour: 12 });
    const { plan } = await response.json();

    const url = vi.mocked(global.fetch).mock.calls[0][0] as string;
    expect(url).toContain("forecast_days=16");
    expect(url).toContain("timezone=auto&timeformat=unixtime");
    // The first day starts at noon there; the second day's morning starts at 6am there.
    expect(plan.days.map((day: { date: string }) => day.date)).toEqual(["2026-10-08", "2026-10-09"]);
    expect(plan.days[0].dayparts.map((part: { id: string; minTemp: number }) => [part.id, part.minTemp])).toEqual([
      ["midday", 52],
      ["evening", 56],
    ]);
    expect(plan.days[1].dayparts[0]).toMatchObject({ id: "morning", minTemp: 46 });
  });

  it("leaves out hours with a missing value rather than read them as zero", async () => {
    // Near the end of its window Open-Meteo returns null for some hours.
    const forecast = forecastFixture("America/New_York", "2026-10-08T04:00Z", 48, () => -4);
    forecast.hourly.temperature_2m[30] = null as unknown as number; // 6am Oct 9
    forecast.hourly.precipitation_probability[31] = null as unknown as number; // 7am
    forecast.hourly.wind_speed_10m[32] = null as unknown as number; // 8am
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(forecast) });

    const response = await planAhead({ startDate: "2026-10-08", durationDays: 2 });
    const { plan } = await response.json();

    // The morning's coldest complete hour is 9am (49°F), not a 0°F placeholder.
    expect(plan.days[1].dayparts[0]).toMatchObject({ id: "morning", minTemp: 49 });
  });

  it("fails rather than use UTC hours when the forecast has no time zone", async () => {
    const withoutTimeZone = { ...forecastFixture("America/New_York", "2026-10-08T04:00Z", 48, () => -4), timezone: undefined };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(withoutTimeZone) });

    const response = await planAhead({ startDate: "2026-10-08", durationDays: 2 });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Failed to fetch weather data" });
  });

  it("keeps daytime windows on the place's clock across a daylight saving change", async () => {
    // Sydney moves from UTC+10 to UTC+11 at 2:00 on October 4. Open-Meteo
    // starts at midnight UTC+10 on October 3 and labels every hour UTC+10.
    const change = Date.parse("2026-10-03T16:00Z") / 1000;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          forecastFixture("Australia/Sydney", "2026-10-02T14:00Z", 72, (start) => (start < change ? 10 : 11))
        ),
    });

    const response = await planAhead({ lat: -33.87, lon: 151.21, startDate: "2026-10-03", durationDays: 3 });
    const { plan } = await response.json();

    for (const day of plan.days) {
      expect(day.dayparts[0]).toMatchObject({ id: "morning", minTemp: 46 });
    }
    expect(plan.days).toHaveLength(3);
  });

  it("says which start dates the forecast covers for a plan that runs past it", async () => {
    // Stowe, Sep 27 to Oct 12 on its calendar: Open-Meteo's 16 days, today included.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(forecastFixture("America/New_York", "2026-09-27T04:00Z", 16 * 24, () => -4)),
    });

    for (const startDate of ["2026-10-08", "2026-09-26"]) {
      const response = await planAhead({ startDate, durationDays: 7 });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: "The forecast for this place covers Sep 27 to Oct 12. A 7-day plan can start from Sep 27 to Oct 6.",
        field: "startDate",
      });
    }

    const lastWeek = await planAhead({ startDate: "2026-10-06", durationDays: 7 });
    expect(lastWeek.status).toBe(200);
  });

  it("reports a forecast service failure as one", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: true, reason: "Parameter 'start_date' is out of allowed range" }),
    });

    const response = await planAhead({ startDate: "2026-10-08", durationDays: 2 });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Failed to fetch weather data" });
  });
});
