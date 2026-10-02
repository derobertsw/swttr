import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("Geocode API Route", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("parameter validation", () => {
    it("should return empty results when query is missing", async () => {
      const request = new NextRequest("http://localhost:3000/api/geocode");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toEqual([]);
    });

    it("should return empty results when query is too short (1 character)", async () => {
      const request = new NextRequest("http://localhost:3000/api/geocode?q=N");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toEqual([]);
    });

    it("should return empty results when query is empty string", async () => {
      const request = new NextRequest("http://localhost:3000/api/geocode?q=");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toEqual([]);
    });
  });

  describe("successful responses", () => {
    it("should fetch and transform geocoding results", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 5128581,
                name: "New York",
                admin1: "New York",
                country: "United States",
                latitude: 40.7128,
                longitude: -74.006,
              },
            ],
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/geocode?q=New York"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toHaveLength(1);
      expect(data.results[0]).toEqual({
        id: 5128581,
        name: "New York",
        region: "New York",
        country: "United States",
        latitude: 40.7128,
        longitude: -74.006,
      });
    });

    it("passes on each place's time zone, which the client reads dates in", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { id: 2147714, name: "Sydney", admin1: "New South Wales", country: "Australia", latitude: -33.87, longitude: 151.21, timezone: "Australia/Sydney" },
              { id: 1, name: "Nowhere", country: "Nowhere", latitude: 0, longitude: 0, timezone: "Mars/Olympus" },
            ],
          }),
      });

      const response = await GET(new NextRequest("http://localhost:3000/api/geocode?q=Sydney"));
      const data = await response.json();

      expect(data.results[0].timeZone).toBe("Australia/Sydney");
      // A zone Intl doesn't know would be read as the device's own, so it's left out.
      expect(data.results[1]).not.toHaveProperty("timeZone");
    });

    it("should handle results without admin1 (region)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 1234,
                name: "Monaco",
                country: "Monaco",
                latitude: 43.7384,
                longitude: 7.4246,
              },
            ],
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/geocode?q=Monaco"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.results[0].region).toBeUndefined();
      expect(data.results[0].name).toBe("Monaco");
    });

    it("should handle multiple results", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 1,
                name: "Paris",
                admin1: "Île-de-France",
                country: "France",
                latitude: 48.8566,
                longitude: 2.3522,
              },
              {
                id: 2,
                name: "Paris",
                admin1: "Texas",
                country: "United States",
                latitude: 33.6609,
                longitude: -95.5555,
              },
            ],
          }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/geocode?q=Paris"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.results).toHaveLength(2);
      expect(data.results[0].region).toBe("Île-de-France");
      expect(data.results[1].region).toBe("Texas");
    });

    it("should handle empty results from API", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/geocode?q=xyznonexistent"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toEqual([]);
    });
  });

  describe("API call verification", () => {
    it("should call Open-Meteo geocoding API with correct parameters", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/geocode?q=Denver"
      );

      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("geocoding-api.open-meteo.com")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("name=Denver")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("count=5")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("language=en")
      );
    });

    it("should properly encode special characters in query", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/geocode?q=São Paulo"
      );

      await GET(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("S%C3%A3o%20Paulo")
      );
    });
  });

  describe("error handling", () => {
    it("should return 500 when external API fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      const request = new NextRequest(
        "http://localhost:3000/api/geocode?q=New York"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch location data");
    });

    it("should return 500 when fetch throws an error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const request = new NextRequest(
        "http://localhost:3000/api/geocode?q=New York"
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch location data");
    });
  });

  describe("query length boundary", () => {
    it("should process query with exactly 2 characters", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 1,
                name: "LA",
                admin1: "California",
                country: "United States",
                latitude: 34.0522,
                longitude: -118.2437,
              },
            ],
          }),
      });

      const request = new NextRequest("http://localhost:3000/api/geocode?q=LA");

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalled();
      expect(data.results).toHaveLength(1);
    });
  });
});
