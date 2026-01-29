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
        expect.stringContaining("temperature_unit=fahrenheit")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("wind_speed_unit=mph")
      );
    });
  });

  describe("forecast weather", () => {
    it("should fetch forecast when datetime is provided", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            hourly: {
              time: [
                "2024-01-15T12:00",
                "2024-01-15T13:00",
                "2024-01-15T14:00",
              ],
              temperature_2m: [28, 30, 32],
              wind_speed_10m: [5, 7, 10],
            },
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006&datetime=2024-01-15T14:00"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.temperature).toBe(32);
      expect(data.windSpeed).toBe(10);
      expect(data.isForecast).toBe(true);
    });

    it("should call Open-Meteo API with hourly parameters for forecast", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            hourly: {
              time: ["2024-01-15T14:00"],
              temperature_2m: [32],
              wind_speed_10m: [10],
            },
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006&datetime=2024-01-15T14:00"
      );

      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("hourly=")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("start_date=2024-01-15")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("end_date=2024-01-15")
      );
    });

    it("should fall back to noon when requested hour not found", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            hourly: {
              time: Array.from({ length: 24 }, (_, i) =>
                `2024-01-15T${String(i).padStart(2, "0")}:00`
              ),
              temperature_2m: Array.from({ length: 24 }, (_, i) => 20 + i),
              wind_speed_10m: Array.from({ length: 24 }, (_, i) => i),
            },
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/weather?lat=40.7128&lon=-74.006&datetime=2024-01-15T25:00"
      );

      const response = await GET(request);
      const data = await response.json();

      // Should use index 12 (noon) as fallback
      expect(data.temperature).toBe(32); // 20 + 12
      expect(data.windSpeed).toBe(12);
      expect(data.isForecast).toBe(true);
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
