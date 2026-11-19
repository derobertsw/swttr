// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avalancheCenterDirectory, clearAvalancheCanadaAreas } from "./avalanche-centers";
import { parseConditionsSource } from "./trip-conditions";

const API = "https://avcan-services-api.prod.avalanche.ca/forecasts/en";
const square = (west: number, south: number, east: number, north: number) =>
  [[west, south], [east, south], [east, north], [west, north], [west, south]];
const COMBINED = "Akamina-Badshot-Battle-Birkenhead-Blue River-Bonnington-Boundary-Brandywine-Bull-Central Selkirk";

const AREAS = {
  type: "FeatureCollection",
  features: [
    // Rogers Pass is inside; a hole cuts out the northeast corner.
    { id: "glacier", type: "Feature", geometry: { type: "Polygon", coordinates: [square(-118, 51, -117, 51.6), square(-117.3, 51.4, -117.1, 51.5)] } },
    { id: "combined", type: "Feature", geometry: { type: "MultiPolygon", coordinates: [[square(-125, 49, -120, 50)], [square(-130, 55, -128, 56)]] } },
    { id: "kananaskis", type: "Feature", geometry: { type: "Polygon", coordinates: [square(-115.5, 50.5, -114.8, 51.1)] } },
    { id: "chic-chocs", type: "Feature", geometry: { type: "Polygon", coordinates: [square(-66.3, 48.7, -65.9, 49.1)] } },
    // No metadata, so no name or forecaster to suggest.
    { id: "orphan", type: "Feature", geometry: { type: "Polygon", coordinates: [square(-140, 60, -139, 61)] } },
  ],
};
const meta = (id: string, name: string, value: string, display: string) => ({
  product: { type: "avalancheforecast", title: name }, area: { id, name },
  owner: { value, display, isExternal: false, url: display },
  // Ratings come with the metadata; SWTTR never reads or shows them.
  icons: [{ type: "ratings", ratings: { alp: "considerable", tln: "moderate", btl: "low" } }],
  highestDanger: { value: "considerable", display: "Considerable", colour: "orange" },
});
const METADATA = [
  meta("glacier", "Glacier", "parks-glacier", "Parks Canada"),
  meta("combined", COMBINED, "avalanche-canada", "Avalanche Canada"),
  meta("kananaskis", "Bow Valley-Highwood Pass-North 40-Spray - KLakes", "kananaskis", "Kananaskis"),
  meta("chic-chocs", "Chic-Chocs", "avalanche-quebec", "Avalanche Québec"),
];

const ROGERS_PASS = { kind: "access_point" as const, latitude: 51.3, longitude: -117.52 };
const respond = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
function stubAvalancheCanada(areas: unknown = AREAS, metadata: unknown = METADATA) {
  const fetchMock = vi.fn(async (url: string) => url === `${API}/areas` ? respond(areas) : url === `${API}/metadata` ? respond(metadata) : respond({}, 404));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Official avalanche center list", () => {
  it("has unique centers, each one a valid avalanche source with an official https link", async () => {
    const { centers, verified_on } = await avalancheCenterDirectory(null);
    expect(verified_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Set(centers.map((center) => center.id)).size).toBe(centers.length);
    for (const center of centers) {
      expect(new URL(center.url).protocol).toBe("https:");
      expect(parseConditionsSource({ category: "avalanche", name: center.name, region: null, url: center.url }))
        .toEqual({ category: "avalanche", name: center.name, region: null, url: center.url });
      expect(center.area).not.toBe("");
      expect(center.listed_on).not.toBe("");
    }
    expect(centers.map((center) => center.name)).toEqual(expect.arrayContaining([
      "Mount Washington Avalanche Center", "Utah Avalanche Center", "Northwest Avalanche Center",
      "Avalanche Canada", "Parks Canada avalanche forecast", "Avalanche Québec",
    ]));
  });
});

describe("Suggested centers for a day's place", () => {
  beforeEach(() => { clearAvalancheCanadaAreas(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("suggests the forecaster whose published area holds the place, and says when it checked", async () => {
    const fetchMock = stubAvalancheCanada();
    const { suggestions } = await avalancheCenterDirectory(ROGERS_PASS);
    expect(suggestions).toEqual({
      status: "found", point: "access_point", checked_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      items: [{ center_id: "parks-canada", area: "Glacier", forecaster: "Parks Canada" }],
    });
    // The place never leaves SWTTR: both requests are the whole public lists.
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([`${API}/areas`, `${API}/metadata`]);
  });

  it("never reads ratings into a suggestion", async () => {
    stubAvalancheCanada();
    expect(JSON.stringify((await avalancheCenterDirectory(ROGERS_PASS)).suggestions)).not.toMatch(/considerable|moderate|danger|rating/i);
  });

  it("suggests nothing for a place just outside an area or in a hole: never the nearest one", async () => {
    stubAvalancheCanada();
    expect((await avalancheCenterDirectory({ ...ROGERS_PASS, longitude: -116.99 })).suggestions)
      .toMatchObject({ status: "none", items: [] });
    expect((await avalancheCenterDirectory({ kind: "destination", latitude: 51.45, longitude: -117.2 })).suggestions)
      .toMatchObject({ status: "none", point: "destination", items: [] });
    // An area without its name and forecaster is never suggested.
    expect((await avalancheCenterDirectory({ ...ROGERS_PASS, latitude: 60.5, longitude: -139.5 })).suggestions.status).toBe("none");
  });

  it("names combined areas generically and maps every forecaster to the center that publishes it", async () => {
    stubAvalancheCanada();
    const items = async (latitude: number, longitude: number) => (await avalancheCenterDirectory({ kind: "destination", latitude, longitude })).suggestions.items;
    expect(await items(49.5, -122)).toEqual([{ center_id: "avalanche-canada", area: null, forecaster: "Avalanche Canada" }]);
    expect(await items(55.5, -129)).toEqual([{ center_id: "avalanche-canada", area: null, forecaster: "Avalanche Canada" }]);
    expect(await items(50.9, -115.2)).toEqual([
      { center_id: "avalanche-canada", area: "Bow Valley-Highwood Pass-North 40-Spray - KLakes", forecaster: "Kananaskis" },
    ]);
    expect(await items(48.95, -66.1)).toEqual([{ center_id: "avalanche-quebec", area: "Chic-Chocs", forecaster: "Avalanche Québec" }]);
  });

  it("suggests nothing out of season, when Avalanche Canada publishes no forecast areas", async () => {
    stubAvalancheCanada({ type: "FeatureCollection", features: [] }, []);
    expect((await avalancheCenterDirectory(ROGERS_PASS)).suggestions)
      .toEqual({ status: "none", point: "access_point", checked_at: expect.any(String), items: [] });
  });

  it("doesn't suggest a U.S. center, even in the U.S.", async () => {
    stubAvalancheCanada();
    // Mount Washington, New Hampshire.
    expect((await avalancheCenterDirectory({ kind: "destination", latitude: 44.27, longitude: -71.3 })).suggestions)
      .toMatchObject({ status: "none", items: [] });
  });

  it("asks for a place without coordinates, without calling Avalanche Canada", async () => {
    const fetchMock = stubAvalancheCanada();
    expect((await avalancheCenterDirectory(null)).suggestions).toEqual({ status: "no_location", point: null, checked_at: null, items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["the request fails", () => vi.fn().mockRejectedValue(new Error("Offline"))],
    ["Avalanche Canada errors", () => vi.fn().mockResolvedValue(respond({}, 503))],
    ["the areas aren't GeoJSON", () => vi.fn().mockResolvedValue(respond({ features: "nope" }))],
  ])("says suggestions are unavailable when %s, and tries again next time", async (_, makeFetch) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", makeFetch());
    expect((await avalancheCenterDirectory(ROGERS_PASS)).suggestions).toEqual({ status: "unavailable", point: "access_point", checked_at: null, items: [] });
    stubAvalancheCanada();
    expect((await avalancheCenterDirectory(ROGERS_PASS)).suggestions.status).toBe("found");
  });

  it("reads the areas again after half an hour, not on every request", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-16T12:00:00Z"));
    const fetchMock = stubAvalancheCanada();
    await Promise.all([avalancheCenterDirectory(ROGERS_PASS), avalancheCenterDirectory(ROGERS_PASS)]);
    await avalancheCenterDirectory(ROGERS_PASS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    now.mockReturnValue(Date.parse("2026-11-16T12:31:00Z"));
    const { suggestions } = await avalancheCenterDirectory(ROGERS_PASS);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(suggestions.checked_at).toBe("2026-11-16T12:31:00.000Z");
  });
});
