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
    expect(url).toContain("start_date=2026-10-08&end_date=2026-10-09");
    expect(url).toContain("timezone=auto&timeformat=unixtime");
    // The first day starts at noon there; the second day's morning starts at 6am there.
    expect(plan.days.map((day: { date: string }) => day.date)).toEqual(["2026-10-08", "2026-10-09"]);
    expect(plan.days[0].dayparts.map((part: { id: string; minTemp: number }) => [part.id, part.minTemp])).toEqual([
      ["midday", 52],
      ["evening", 56],
    ]);
    expect(plan.days[1].dayparts[0]).toMatchObject({ id: "morning", minTemp: 46 });
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
});
