import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("Weather API Route", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("parameter validation", () => {
    it("should return 400 when latitude is missing", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/weather?lon=-74.006"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Missing latitude or longitude");
    });

    it("should return 400 when longitude is missing", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Missing latitude or longitude");
    });

    it("should return 400 when both lat and lon are missing", async () => {
      const request = new NextRequest("http://localhost:3000/api/weather");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Missing latitude or longitude");
    });
  });

  describe("current weather", () => {
    it("should fetch current weather when no datetime provided", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            current: {
              temperature_2m: 32.5,
              wind_speed_10m: 10.3,
              weather_code: 1,
            },
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.temperature).toBe(33); // Rounded
      expect(data.windSpeed).toBe(10); // Rounded
      expect(data.weatherCode).toBe(1);
      expect(data.precipitation).toBe(false);
      expect(data.precipitationType).toBeUndefined();
      expect(data.isForecast).toBe(false);
    });

    it("should call Open-Meteo API with correct parameters for current weather", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            current: {
              temperature_2m: 50,
              wind_speed_10m: 5,
              weather_code: 0,
            },
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006"
      );

      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("latitude=40.7128")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("longitude=-74.006")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("current=")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("weather_code")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("temperature_unit=fahrenheit")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("wind_speed_unit=mph")
      );
    });
  });

  describe("forecast weather", () => {
    /**
     * Open-Meteo's response for `forecast_days=16&timezone=auto&timeformat=unixtime`:
     * 16 days of hours from local midnight on Sep 27, 2026, as Unix times. Each
     * hour's temperature is its index, so a test can tell which hour was used.
     */
    function forecastFixture(timezone: string, firstHourStart: string) {
      const first = Date.parse(firstHourStart) / 1000;
      const time = Array.from({ length: 16 * 24 }, (_, index) => first + index * 3600);
      return {
        timezone,
        hourly: {
          time,
          temperature_2m: time.map((_, index) => index) as (number | null)[],
          wind_speed_10m: time.map(() => 10.4),
          weather_code: time.map(() => 0) as (number | null)[],
        },
      };
    }

    // Stowe's first forecast hour is midnight EDT; Sydney's is midnight AEST (UTC+10).
    const stowe = () => forecastFixture("America/New_York", "2026-09-27T04:00Z");
    const sydney = () => forecastFixture("Australia/Sydney", "2026-09-26T14:00Z");

    /** The index, and so the temperature, of the fixture hour starting at an instant. */
    const hourAt = (fixture: ReturnType<typeof forecastFixture>, instant: string) =>
      fixture.hourly.time.indexOf(Date.parse(instant) / 1000);

    function mockForecast(fixture: ReturnType<typeof forecastFixture>) {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fixture) });
    }

    const getForecast = (datetime: string, place = "lat=44.47&lon=-72.69") =>
      GET(new NextRequest(`http://localhost:3000/api/weather?${place}&datetime=${datetime}`));

    it("uses the forecast hour the time falls in, on the place's clock", async () => {
      const fixture = stowe();
      fixture.hourly.weather_code[hourAt(fixture, "2026-10-08T18:00Z")] = 71;
      mockForecast(fixture);

      const response = await getForecast("2026-10-08T14:30");
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        temperature: hourAt(fixture, "2026-10-08T18:00Z"),
        windSpeed: 10,
        weatherCode: 71,
        precipitation: true,
        precipitationType: "snow",
        isForecast: true,
        forecastTime: "2026-10-08T14:00-04:00",
        timeZone: "America/New_York",
      });
    });

    it("asks Open-Meteo for the whole forecast with exact times and the place's time zone", async () => {
      mockForecast(stowe());

      await getForecast("2026-10-08T14:00");

      const url = vi.mocked(global.fetch).mock.calls[0][0] as string;
      expect(url).toContain("latitude=44.47&longitude=-72.69");
      expect(url).toContain("hourly=temperature_2m,wind_speed_10m,weather_code");
      expect(url).toContain("forecast_days=16");
      expect(url).toContain("timezone=auto");
      expect(url).toContain("timeformat=unixtime");
      expect(url).toContain("temperature_unit=fahrenheit");
      expect(url).toContain("wind_speed_unit=mph");
    });

    it("doesn't depend on the server's time zone", async () => {
      vi.stubEnv("TZ", "Asia/Tokyo");
      try {
        const fixture = stowe();
        mockForecast(fixture);

        const data = await (await getForecast("2026-10-08T14:00")).json();

        expect(data.temperature).toBe(hourAt(fixture, "2026-10-08T18:00Z"));
        expect(data.forecastTime).toBe("2026-10-08T14:00-04:00");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("uses the right hour after a daylight saving change", async () => {
      // Clocks in Sydney go from UTC+10 to UTC+11 at 2:00 on October 4, but
      // Open-Meteo labels every hour with the offset of the day it answers.
      const fixture = sydney();
      mockForecast(fixture);

      const data = await (await getForecast("2026-10-04T14:00", "lat=-33.87&lon=151.21")).json();

      expect(data.temperature).toBe(hourAt(fixture, "2026-10-04T03:00Z"));
      expect(data.forecastTime).toBe("2026-10-04T14:00+11:00");
      expect(data.timeZone).toBe("Australia/Sydney");
    });

    it("uses the hour after the jump for a time the clocks skip", async () => {
      const fixture = sydney();
      mockForecast(fixture);

      const data = await (await getForecast("2026-10-04T02:30", "lat=-33.87&lon=151.21")).json();

      expect(data.temperature).toBe(hourAt(fixture, "2026-10-03T16:00Z"));
      expect(data.forecastTime).toBe("2026-10-04T03:00+11:00");
    });

    it("leaves out a weather code the forecast doesn't have, rather than calling it clear", async () => {
      const fixture = stowe();
      fixture.hourly.weather_code[hourAt(fixture, "2026-10-08T18:00Z")] = null;
      mockForecast(fixture);

      const data = await (await getForecast("2026-10-08T14:00")).json();

      expect(data.weatherCode).toBeUndefined();
      expect(data.precipitation).toBe(false);
      expect(data.forecastTime).toBe("2026-10-08T14:00-04:00");
    });

    it("says which dates the forecast covers for a time outside it", async () => {
      for (const datetime of ["2026-10-13T09:00", "2026-09-26T12:00"]) {
        mockForecast(stowe());

        const response = await getForecast(datetime);

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({
          error: "The forecast for this place covers Sep 27 to Oct 12. Pick a date in that range.",
        });
      }
    });

    it("ends the covered range at the last hour with data", async () => {
      const fixture = stowe();
      fixture.hourly.temperature_2m.fill(null, hourAt(fixture, "2026-10-12T04:00Z"));
      mockForecast(fixture);

      const response = await getForecast("2026-10-12T09:00");

      expect(response.status).toBe(422);
      expect((await response.json()).error).toContain("covers Sep 27 to Oct 11");
    });

    it("fails rather than guess when the forecast has no usable time zone", async () => {
      for (const timezone of [undefined, "Mars/Olympus"]) {
        mockForecast({ ...stowe(), timezone: timezone as string });

        const response = await getForecast("2026-10-08T14:00");

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Failed to fetch weather data" });
      }
    });

    it("rejects a datetime that isn't a local date and time", async () => {
      global.fetch = vi.fn();

      for (const datetime of ["2026-10-15", "2026-10-15T14:00Z", "2026-02-30T10:00"]) {
        const response = await getForecast(datetime);
        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe("Invalid datetime. Use YYYY-MM-DDTHH:mm.");
      }
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("multi-day forecast weather", () => {
    it("should fetch hourly forecast range when startDate is provided", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            timezone: "America/New_York",
            hourly: {
              time: [
                Date.parse("2024-01-15T11:00Z") / 1000,
                Date.parse("2024-01-15T12:00Z") / 1000,
              ],
              temperature_2m: [28.4, 30.2],
              wind_speed_10m: [5.1, 7.8],
              precipitation_probability: [10, 65],
            },
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006&startDate=2024-01-15&days=3"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isForecast).toBe(true);
      expect(data.isMultiDay).toBe(true);
      expect(data.startDate).toBe("2024-01-15");
      expect(data.endDate).toBe("2024-01-17");
      expect(data.hourly).toEqual([
        {
          time: "2024-01-15T06:00",
          temperature: 28,
          windSpeed: 5,
          precipitationProbability: 10,
        },
        {
          time: "2024-01-15T07:00",
          temperature: 30,
          windSpeed: 8,
          precipitationProbability: 65,
        },
      ]);
    });

    it("should call Open-Meteo API with range dates for multi-day requests", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            timezone: "America/New_York",
            hourly: {
              time: [Date.parse("2024-01-15T11:00Z") / 1000],
              temperature_2m: [30],
              wind_speed_10m: [5],
              precipitation_probability: [10],
            },
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006&startDate=2024-01-15&days=2"
      );

      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("start_date=2024-01-15")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("end_date=2024-01-16")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("precipitation_probability")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("timezone=auto&timeformat=unixtime")
      );
    });

    it.each([
      {
        label: "Vermont's local date and daytime hours",
        timezone: "America/New_York",
        firstHour: "2026-10-08T04:00Z",
        startDate: "2026-10-08",
        count: 24,
        daytimeIndices: [8, 18],
      },
      {
        label: "Sydney's skipped hour when daylight saving starts",
        timezone: "Australia/Sydney",
        firstHour: "2026-10-03T14:00Z",
        startDate: "2026-10-04",
        count: 23,
        daytimeIndices: [7, 17],
      },
      {
        label: "Sydney's hours after daylight saving starts, with Open-Meteo's old offset",
        timezone: "Australia/Sydney",
        firstHour: "2026-10-04T14:00Z",
        startDate: "2026-10-05",
        count: 23,
        daytimeIndices: [7, 17],
      },
      {
        label: "Vermont's repeated hour when daylight saving ends",
        timezone: "America/New_York",
        firstHour: "2026-11-01T04:00Z",
        startDate: "2026-11-01",
        count: 25,
        daytimeIndices: [9, 19],
      },
    ])("returns $label", async ({ timezone, firstHour, startDate, count, daytimeIndices }) => {
      // Unix timestamps are independent of the server's zone and of the
      // fixed offset Open-Meteo would use for ISO local-time labels.
      const time = Array.from({ length: 48 }, (_, index) => Date.parse(firstHour) / 1000 + index * 3600);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          timezone,
          hourly: {
            time,
            temperature_2m: time.map((_, index) => index),
            wind_speed_10m: time.map(() => 5),
            precipitation_probability: time.map(() => 10),
          },
        }),
      });

      const response = await GET(new NextRequest(
        `http://localhost:3000/api/weather?lat=44.47&lon=-72.69&startDate=${startDate}&days=1`
      ));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.hourly).toHaveLength(count);
      expect(data.hourly.every((hour: { time: string }) => hour.time.startsWith(startDate))).toBe(true);
      for (const [index, hour] of [8, 18].entries()) {
        expect(data.hourly.find((entry: { time: string }) => entry.time === `${startDate}T${String(hour).padStart(2, "0")}:00`))
          .toMatchObject({ temperature: daytimeIndices[index], windSpeed: 5, precipitationProbability: 10 });
      }
      if (count === 25) {
        expect(data.hourly.filter((hour: { time: string }) => hour.time.endsWith("T01:00"))).toHaveLength(2);
      }
      if (startDate === "2026-10-04") {
        expect(data.hourly.some((hour: { time: string }) => hour.time.endsWith("T02:00"))).toBe(false);
      }
    });

    it.each([undefined, "Mars/Olympus"])("rejects a multi-day forecast with unusable time zone %s", async (timezone) => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ timezone, hourly: {} }) });

      const response = await GET(new NextRequest(
        "http://localhost:3000/api/weather?lat=44.47&lon=-72.69&startDate=2026-10-08&days=1"
      ));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Failed to fetch weather data" });
    });

    it("should return 400 for invalid days in multi-day requests", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006&startDate=2024-01-15&days=0"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid days. Must be an integer between 1 and 7.");
    });
  });

  describe("error handling", () => {
    it("should return 500 when external API fails for current weather", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch weather data");
    });

    it("should return 500 when external API fails for forecast", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006&datetime=2024-01-15T14:00"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch weather data");
    });

    it("should return 500 when fetch throws an error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch weather data");
    });
  });

  describe("temperature rounding", () => {
    it("should round temperature up from .5", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            current: {
              temperature_2m: 32.5,
              wind_speed_10m: 10,
              weather_code: 0,
            },
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.temperature).toBe(33);
    });

    it("should round temperature down from .4", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            current: {
              temperature_2m: 32.4,
              wind_speed_10m: 10,
              weather_code: 0,
            },
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.temperature).toBe(32);
    });
  });
});
