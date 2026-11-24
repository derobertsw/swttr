// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { POST } from "../plan-ahead/route";

/**
 * Every forecast mode reads a resort at its catalog point and elevation (#7).
 * Killington's point is the top of the K-1 Express Gondola, 1,262 m.
 */
const KILLINGTON = { resort: "wd-Q14711916", latitude: 43.6047, longitude: -72.8187, elevation: 1262, label: "Top of K-1 Express Gondola" };
const HOURS = Array.from({ length: 48 }, (_, index) => Date.parse("2026-12-01T05:00Z") / 1000 + index * 3600);

/** One response that answers every mode, at the elevation Open-Meteo says it used. */
const answer = (elevation: number) => ({
  timezone: "America/New_York",
  elevation,
  current: { time: HOURS[0], temperature_2m: 12.4, wind_speed_10m: 20.6, weather_code: 71 },
  hourly: {
    time: HOURS,
    temperature_2m: HOURS.map(() => 12.4),
    wind_speed_10m: HOURS.map(() => 20.6),
    weather_code: HOURS.map(() => 71),
    precipitation_probability: HOURS.map(() => 40),
  },
});
const mockOpenMeteo = (elevation = KILLINGTON.elevation) =>
  vi.spyOn(global, "fetch").mockImplementation(async () => Response.json(answer(elevation)));
const urls = (spy: ReturnType<typeof mockOpenMeteo>) => spy.mock.calls.map(([url]) => new URL(String(url)));
const weather = async (query: string) => {
  const response = await GET(new NextRequest(`http://localhost/api/weather?${query}`));
  return { status: response.status, data: await response.json() };
};
const pointProvenance = {
  latitude: KILLINGTON.latitude, longitude: KILLINGTON.longitude, label: KILLINGTON.label,
  resortId: KILLINGTON.resort, elevationM: 1262, elevationSource: "requested",
};

afterEach(() => vi.restoreAllMocks());

describe("Weather at a resort's forecast point", () => {
  it.each([
    ["current", ""],
    ["hourly forecast", "&datetime=2026-12-01T10:00"],
    ["date range", "&startDate=2026-12-01&days=1"],
  ])("reads %s at the catalog point and elevation, whatever coordinates the browser sent", async (_mode, extra) => {
    const spy = mockOpenMeteo();
    const { status, data } = await weather(`lat=44.1&lon=-72.1&resort=${KILLINGTON.resort}${extra}`);
    expect(status).toBe(200);
    for (const url of urls(spy)) {
      expect(url.searchParams.get("latitude")).toBe(String(KILLINGTON.latitude));
      expect(url.searchParams.get("longitude")).toBe(String(KILLINGTON.longitude));
      expect(url.searchParams.get("elevation")).toBe("1262");
      expect(url.searchParams.get("temperature_unit")).toBe("fahrenheit");
      expect(url.searchParams.get("wind_speed_unit")).toBe("mph");
    }
    expect(data.provenance.point).toEqual(pointProvenance);
  });

  it("passes the provider's downscaled temperature and wind through with no lapse-rate correction", async () => {
    mockOpenMeteo();
    const current = await weather(`lat=0&lon=0&resort=${KILLINGTON.resort}`);
    expect(current.data).toMatchObject({ temperature: 12, windSpeed: 21 });
    const hourly = await weather(`resort=${KILLINGTON.resort}&datetime=2026-12-01T10:00`);
    expect(hourly.data).toMatchObject({ temperature: 12, windSpeed: 21, timeZone: "America/New_York" });
    const range = await weather(`resort=${KILLINGTON.resort}&startDate=2026-12-01&days=1`);
    expect(range.data.hourly[0]).toMatchObject({ temperature: 12, windSpeed: 21 });
  });

  it("keeps the point and elevation on every retry of a date range", async () => {
    const spy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 400 }))
      .mockResolvedValueOnce(new Response("{}", { status: 400 }))
      .mockResolvedValueOnce(Response.json(answer(1262)));
    const { status } = await weather(`resort=${KILLINGTON.resort}&startDate=2026-12-01&days=1`);
    expect(status).toBe(200);
    expect(urls(spy)).toHaveLength(3);
    expect(urls(spy).every((url) => url.searchParams.get("elevation") === "1262" && url.searchParams.get("latitude") === "43.6047")).toBe(true);
  });

  it("leaves the elevation to the provider for an ordinary place, and says so", async () => {
    const spy = mockOpenMeteo(431);
    const { data } = await weather("lat=44.47&lon=-72.69");
    expect(urls(spy)[0].searchParams.has("elevation")).toBe(false);
    expect(data.provenance.point).toEqual({ latitude: 44.47, longitude: -72.69, elevationM: 431, elevationSource: "terrain" });
  });

  it("uses a known point's elevation in meters when one is given", async () => {
    const spy = mockOpenMeteo(1500);
    await weather("lat=44.47&lon=-72.69&elevation=1500");
    expect(urls(spy)[0].searchParams.get("elevation")).toBe("1500");
  });

  it.each(["elevation=abc", "elevation=12000", "elevation=-900", "lat=abc&lon=1", "lat=95&lon=1"])("refuses %s before calling the provider", async (query) => {
    const spy = mockOpenMeteo();
    const { status } = await weather(query.startsWith("lat") ? query : `lat=44.47&lon=-72.69&${query}`);
    expect(status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it("reads a trip stop's saved point where the trip saved it, with its label, even if the catalog moved or dropped the resort", async () => {
    const spy = mockOpenMeteo(1250);
    const { status, data } = await weather("lat=43.6&lon=-72.82&elevation=1250&label=Top%20of%20K-1%20Express%20Gondola");
    expect(status).toBe(200);
    const [url] = urls(spy);
    expect([url.searchParams.get("latitude"), url.searchParams.get("longitude"), url.searchParams.get("elevation")]).toEqual(["43.6", "-72.82", "1250"]);
    expect(data.provenance.point).toEqual({
      latitude: 43.6, longitude: -72.82, label: "Top of K-1 Express Gondola", elevationM: 1250, elevationSource: "requested",
    });
  });

  it("refuses a resort the catalog doesn't know rather than read the weather somewhere else", async () => {
    const spy = mockOpenMeteo();
    const { status, data } = await weather("lat=44.47&lon=-72.69&resort=skimap-999999999");
    expect(status).toBe(400);
    expect(data.error).toMatch(/resort/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fails a mountain forecast instead of falling back to current weather or the town", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 502 }));
    const { status } = await weather(`resort=${KILLINGTON.resort}&datetime=2026-12-01T10:00`);
    expect(status).toBe(500);
    expect(spy).toHaveBeenCalledOnce();
    expect(urls(spy)[0].searchParams.has("current")).toBe(false);
  });

  it("reads a multi-day plan at the resort's point and elevation", async () => {
    const spy = mockOpenMeteo();
    const response = await POST(new NextRequest("http://localhost/api/plan-ahead", {
      method: "POST",
      body: JSON.stringify({ activity: "alpine_skiing", sensitivity: "neutral", lat: 1, lon: 2, resortId: KILLINGTON.resort, startDate: "2026-12-01", durationDays: 1, startHour: 9 }),
    }));
    expect(urls(spy)[0].searchParams.get("elevation")).toBe("1262");
    expect(urls(spy)[0].searchParams.get("latitude")).toBe("43.6047");
    const { plan } = await response.json();
    expect(plan.provenance.point).toEqual(pointProvenance);
  });

  it("reads a trip stop's saved point for a multi-day plan, as the trip's forecast does", async () => {
    const spy = mockOpenMeteo(1250);
    const response = await POST(new NextRequest("http://localhost/api/plan-ahead", {
      method: "POST",
      body: JSON.stringify({ activity: "alpine_skiing", sensitivity: "neutral", lat: 43.6, lon: -72.82, elevationM: 1250, pointLabel: "Top of K-1 Express Gondola", startDate: "2026-12-01", durationDays: 1, startHour: 9 }),
    }));
    expect(urls(spy)[0].searchParams.get("elevation")).toBe("1250");
    expect((await response.json()).plan.provenance.point).toMatchObject({ latitude: 43.6, label: "Top of K-1 Express Gondola", elevationM: 1250 });
  });

  it("refuses a plan for an unknown resort", async () => {
    const spy = mockOpenMeteo();
    const response = await POST(new NextRequest("http://localhost/api/plan-ahead", {
      method: "POST",
      body: JSON.stringify({ activity: "alpine_skiing", sensitivity: "neutral", resortId: "wd-Q1", startDate: "2026-12-01", durationDays: 1 }),
    }));
    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});
