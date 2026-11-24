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

  describe("search modes (#7)", () => {
    const stoweTown = { id: 5241803, name: "Stowe", admin1: "Vermont", country: "United States", latitude: 44.4654, longitude: -72.6874, timezone: "America/New_York" };
    const geocoder = (results: unknown[]) => vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ results }) });
    const search = async (query: string) => {
      const response = await GET(new NextRequest(`http://localhost:3000/api/geocode?${query}`));
      return { status: response.status, data: await response.json() };
    };

    it("rejects an unknown mode", async () => {
      global.fetch = geocoder([]);
      const { status, data } = await search("q=Stowe&kind=towns");
      expect(status).toBe(400);
      expect(data.error).toMatch(/kind/);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("searches only the resort catalog in resort mode, without calling the geocoder", async () => {
      global.fetch = geocoder([stoweTown]);
      const { status, data } = await search("q=Stowe&kind=resort");
      expect(status).toBe(200);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(data.results[0]).toMatchObject({
        id: "resort:wd-Q7620695", kind: "resort", resortId: "wd-Q7620695", name: "Stowe Mountain Resort",
        region: "Vermont", country: "United States", timeZone: "America/New_York",
        pointKind: "lift", elevationM: expect.any(Number), pointLabel: expect.stringMatching(/^Top of /),
      });
      expect(data.results.every((result: { kind: string }) => result.kind === "resort")).toBe(true);
    });

    it("offers a misspelled resort as a typo match", async () => {
      const { data } = await search("q=Killngton&kind=resort");
      expect(data.results[0]).toMatchObject({ name: "Killington Resort", match: "typo" });
    });

    it("keeps the town and the resort apart in all-places mode", async () => {
      global.fetch = geocoder([stoweTown]);
      const { data } = await search("q=Stowe&kind=all");
      expect(data.results.map((result: { name: string; kind?: string }) => [result.name, result.kind ?? "place"])).toEqual([
        ["Stowe Mountain Resort", "resort"], ["Stowe", "place"], ["Smugglers' Notch Resort", "resort"],
      ]);
      // The town keeps its own coordinates; it isn't collapsed into the resort.
      expect(data.results[1]).toMatchObject({ id: 5241803, latitude: 44.4654, longitude: -72.6874 });
    });

    it("drops a place the geocoder repeats", async () => {
      global.fetch = geocoder([stoweTown, stoweTown]);
      const { data } = await search("q=Stowe&kind=all");
      expect(data.results.filter((result: { id: unknown }) => result.id === 5241803)).toHaveLength(1);
    });

    it("still returns resorts when the geocoder fails in all-places mode", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      const { status, data } = await search("q=Stowe&kind=all");
      expect(status).toBe(200);
      expect(data.placesUnavailable).toBe(true);
      expect(data.results[0].name).toBe("Stowe Mountain Resort");
    });

    it("fails in all-places mode when the geocoder fails and no resort matches", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
      const { status } = await search("q=Montpelier&kind=all");
      expect(status).toBe(500);
    });

    it("keeps the general search as the default, with no resorts", async () => {
      global.fetch = geocoder([stoweTown]);
      const { data } = await search("q=Stowe");
      expect(data.results).toEqual([{
        id: 5241803, name: "Stowe", region: "Vermont", country: "United States",
        latitude: 44.4654, longitude: -72.6874, timeZone: "America/New_York",
      }]);
    });

    it("returns nothing for a one-letter query in any mode", async () => {
      global.fetch = geocoder([stoweTown]);
      expect((await search("q=S&kind=resort")).data.results).toEqual([]);
      expect((await search("q=S&kind=all")).data.results).toEqual([]);
    });
  });
});
