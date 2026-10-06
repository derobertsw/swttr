import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeatherAt } from "./useCurrentWeather";

const STOWE = { id: 1, name: "Stowe", region: "Vermont", country: "United States", latitude: 44.47, longitude: -72.69 };

function mockFetch(response: Response) {
  const fetch = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("fetchWeatherAt", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gets the forecast for a local time at the place, and says where and when it applies", async () => {
    const fetch = mockFetch(
      Response.json({
        temperature: 28,
        windSpeed: 12,
        precipitation: true,
        precipitationType: "snow",
        isForecast: true,
        forecastTime: "2026-10-08T14:00-04:00",
        timeZone: "America/New_York",
      })
    );

    const result = await fetchWeatherAt(STOWE, "2026-10-08T14:30");

    expect(fetch).toHaveBeenCalledWith("/api/weather?lat=44.47&lon=-72.69&datetime=2026-10-08T14:30");
    expect(result).toEqual({
      data: {
        temperature: 28,
        windSpeed: 12,
        precipitation: true,
        precipitationType: "snow",
        context: {
          source: "forecast",
          place: "Stowe, Vermont, United States",
          forecastTime: "2026-10-08T14:00-04:00",
          timeZone: "America/New_York",
        },
      },
    });
  });

  it("gets current weather at the place without a time", async () => {
    const fetch = mockFetch(Response.json({ temperature: 30, windSpeed: 7, isForecast: false }));

    const result = await fetchWeatherAt(STOWE);

    expect(fetch).toHaveBeenCalledWith("/api/weather?lat=44.47&lon=-72.69");
    expect(result.data?.context).toEqual({ source: "current", place: "Stowe, Vermont, United States" });
  });

  it("passes on what to change when the API turns the request down", async () => {
    const error = "The forecast for this place covers Oct 1 to Oct 16. Pick a date in that range.";
    mockFetch(Response.json({ error }, { status: 422 }));

    expect(await fetchWeatherAt(STOWE, "2026-10-20T09:00")).toEqual({ data: null, error });
  });

  it("asks to try again when the forecast fails, even without a JSON error", async () => {
    mockFetch(new Response("<html>Bad gateway</html>", { status: 502 }));

    expect(await fetchWeatherAt(STOWE, "2026-10-08T09:00")).toEqual({
      data: null,
      error: "Couldn't get the forecast for this place. Try again.",
    });
  });

  it.each([
    {}, { temperature: null, windSpeed: 7 }, { temperature: 30, windSpeed: null },
    { temperature: "30", windSpeed: 7 }, { temperature: 30 },
  ])("rejects incomplete weather instead of showing zero or invalid advice: %j", async (body) => {
    mockFetch(Response.json(body));
    expect((await fetchWeatherAt(STOWE)).data).toBeNull();
  });

  it.each([
    { temperature: 30, windSpeed: 7 },
    { temperature: 30, windSpeed: 7, isForecast: false },
    { temperature: 30, windSpeed: 7, forecastTime: "2026-10-08T14:00-04:00", timeZone: "missing" },
    { temperature: 30, windSpeed: 7, forecastTime: "missing", timeZone: "America/New_York" },
  ])("never labels an unusable forecast response as current conditions: %j", async (body) => {
    mockFetch(Response.json(body));
    expect((await fetchWeatherAt(STOWE, "2026-10-08T14:30")).data).toBeNull();
  });

  it.each(["", "2026-02-31T12:00", "2026-10-08T25:00"])("rejects invalid requested time %s without fetching current weather", async (datetime) => {
    const fetch = mockFetch(Response.json({ temperature: 30, windSpeed: 7 }));
    expect((await fetchWeatherAt(STOWE, datetime)).data).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps available source facts and leaves absent freshness and precipitation unknown", async () => {
    const provenance = {
      provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" },
      timeZone: "America/New_York", observedTime: "2026-10-05T08:15-04:00",
    };
    mockFetch(Response.json({ temperature: 0, windSpeed: 0, provenance }));
    const { data } = await fetchWeatherAt(STOWE);
    expect(data).toMatchObject({ temperature: 0, windSpeed: 0, context: { source: "current", provenance } });
    expect(data?.precipitation).toBeUndefined();
    mockFetch(Response.json({ temperature: 30, windSpeed: 7 }));
    expect((await fetchWeatherAt(STOWE)).data?.context?.provenance).toBeUndefined();
  });
});
