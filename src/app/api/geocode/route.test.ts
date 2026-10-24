import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/data/ski-resorts.json", async () => ({
  default: {
    source: { snapshotDate: "2026-10-01", attribution: "© OpenStreetMap contributors, Skimap.org (OpenSkiData)" },
    redirects: {},
    resorts: (await import("@/test/skiResorts")).RESORT_FIXTURES,
  },
}));

const STOWE_TOWN = { id: 5241248, name: "Stowe", admin1: "Vermont", country: "United States", latitude: 44.46, longitude: -72.68, timezone: "America/New_York" };

function geocoderReturns(results: object[]) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ results }) });
}

const search = async (params: string) => {
  const response = await GET(new NextRequest(`http://localhost:3000/api/geocode?${params}`));
  return { status: response.status, body: await response.json() };
};

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

  describe("search kind", () => {
    it("refuses an unknown kind", async () => {
      expect(await search("q=Stowe&kind=resorts")).toEqual({ status: 400, body: { error: "Unknown search kind" } });
    });

    it("searches places only when no kind is given, as before", async () => {
      geocoderReturns([STOWE_TOWN]);

      const { body } = await search("q=Stowe");

      expect(body.results).toEqual([{
        id: 5241248, name: "Stowe", region: "Vermont", country: "United States",
        latitude: 44.46, longitude: -72.68, timeZone: "America/New_York",
      }]);
    });

    it("searches only the resort catalog for kind=resort, without calling the geocoder", async () => {
      global.fetch = vi.fn();

      const { status, body } = await search("q=Killington&kind=resort");

      expect(status).toBe(200);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(body.results).toEqual([{
        id: "resort:killington", kind: "resort", source: "openskidata", resortId: "killington",
        name: "Killington Resort", region: "Vermont", country: "United States",
        latitude: 43.6, longitude: -72.8, timeZone: "America/New_York",
        elevationM: 1260, pointLabel: "Top of K-1 Express Gondola", match: "exact",
        attribution: "© OpenStreetMap contributors, Skimap.org (OpenSkiData)",
      }]);
    });

    it("returns a typo suggestion for a misspelled resort, marked as one", async () => {
      const { body } = await search("q=Killngton&kind=resort");

      expect(body.results.map((result: { resortId: string; match: string }) => [result.resortId, result.match])).toEqual([["killington", "typo"]]);
    });

    it("keeps an unknown forecast elevation null and labels a reference point", async () => {
      const { body } = await search("q=Mad River Glen&kind=resort");

      expect(body.results[0]).toMatchObject({ resortId: "mad-river-glen", elevationM: null, pointLabel: "Resort reference point" });
    });

    it("finds nothing for a short query in resort search", async () => {
      expect((await search("q=K&kind=resort")).body).toEqual({ results: [] });
    });

    it("keeps a town and its resort apart in all-places search", async () => {
      geocoderReturns([STOWE_TOWN]);

      const { body } = await search("q=Stowe&kind=all");

      expect(body.results.map((result: { id: unknown; kind: string; name: string }) => [result.id, result.kind, result.name])).toEqual([
        [5241248, "place", "Stowe"],
        ["resort:stowe", "resort", "Stowe Mountain Resort"],
      ]);
      expect(body.results[0].source).toBe("open-meteo");
    });

    it("puts a resort named exactly as typed before places", async () => {
      geocoderReturns([{ id: 5442727, name: "Vail", admin1: "Colorado", country: "United States", latitude: 39.64, longitude: -106.37 }]);

      const { body } = await search("q=Vail&kind=all");

      expect(body.results.map((result: { id: unknown }) => result.id)).toEqual(["resort:vail", 5442727]);
    });

    it("keeps resort matches when the geocoder fails, marked partial", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });

      const { status, body } = await search("q=Whistler&kind=all");

      expect(status).toBe(200);
      expect(body.partial).toBe(true);
      expect(body.results.map((result: { id: string }) => result.id)).toEqual(["resort:whistler-blackcomb"]);
    });

    it("fails as before when the geocoder fails and no resort matches", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      expect(await search("q=Denver&kind=all")).toEqual({ status: 500, body: { error: "Failed to fetch location data" } });
    });
  });
});
