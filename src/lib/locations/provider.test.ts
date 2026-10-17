// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pilot from "@/test/fixtures/geoapify-pilot.json";
import { LocationSearchUnavailable, rankResults, searchLocations } from "./provider";

const JAY_PEAK = { latitude: 44.938, longitude: -72.505 };
const KEENE_VALLEY = { latitude: 44.19, longitude: -73.79 };
const LAKE_PLACID = { latitude: 44.28, longitude: -73.98 };
const labels = (results: { label: string }[]) => results.map((result) => result.label);

describe("Ranking Geoapify results (pilot answers)", () => {
  it("drops far-away namesakes and keeps the nearby hotel first", () => {
    const results = rankResults(pilot.hotel_jay.results, [JAY_PEAK]);
    // Osaka, Nepal, India, Guatemala and Grand Rapids are gone.
    expect(labels(results)).toEqual(["Hotel Jay & Conference Center", "Stateside Hotel & Base Lodge"]);
    expect(results[0]).toEqual({
      label: "Hotel Jay & Conference Center", address: "830 Jay Peak Road, Jay, VT 05859, United States of America",
      latitude: expect.any(Number), longitude: expect.any(Number), precision: "exact", time_zone: "America/New_York",
      source: "search", provider: "geoapify", provider_id: expect.any(String), attribution: "© OpenStreetMap contributors",
    });
  });
  it("keeps a hut as an exact place and marks the bare street match approximate", () => {
    const results = rankResults(pilot.johns_brook_lodge.results, [KEENE_VALLEY]);
    expect(results.map((result) => [result.label, result.precision])).toEqual([
      ["Johns Brook Lodge", "exact"], ["Johns Brook Lodge", "approximate"],
    ]);
  });
  it("labels towns approximate and doesn't repeat the town in its address", () => {
    const results = rankResults(pilot.lake_placid.results, []);
    expect(results.map((result) => [result.label, result.address, result.precision])).toEqual([
      ["Village of Lake Placid", "NY, United States of America", "approximate"],
      ["Lake Placid", "FL, United States of America", "approximate"],
      ["Lake Placid", "Cairns, QLD, Australia", "approximate"],
    ]);
    expect(labels(rankResults(pilot.lake_placid.results, [LAKE_PLACID]))).toEqual(["Village of Lake Placid"]);
  });
  it("treats a named place with a non-area category as exact, and drops a duplicate pin", () => {
    const results = rankResults(pilot.jay_peak_nordic.results, [JAY_PEAK]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ label: "Jay Peak Nordic Center", address: "844 Jay Peak Road, Jay, VT 05859, United States of America", precision: "exact" });
    expect(rankResults([{ ...pilot.jay_peak_nordic.results[0], result_type: "postcode" }], [])[0].precision).toBe("exact");
  });
  it("matches a street address to the building", () => {
    expect(rankResults(pilot.rental_address.results, [{ latitude: 44.47, longitude: -72.69 }])[0])
      .toMatchObject({ label: "Topnotch Resort", address: "4000 Mountain Road, Stowe, VT 05672, United States of America", precision: "exact", latitude: 44.49391, longitude: -72.73918 });
  });
  it("drops results with zero, missing or out-of-range coordinates, or no name", () => {
    const base = pilot.rental_address.results[0];
    expect(rankResults([
      { ...base, lat: 0, lon: 0 }, { ...base, lat: undefined }, { ...base, lat: 91 }, { ...base, lon: -181 },
      { ...base, lat: "44.4" }, { ...base, name: null, address_line1: null, formatted: null },
    ], [])).toEqual([]);
  });
  it("sorts by confidence, then distance, and returns at most six", () => {
    const base = pilot.hotel_jay.results[0];
    const near = (index: number, confidence: number) => ({ ...base, name: `Place ${index}`, lat: 44.94 + index / 100, rank: { confidence } });
    expect(labels(rankResults([near(5, 0), near(4, 0.2), near(1, 1), near(3, 1), near(2, 0), near(6, 0.95), near(7, 0)], [JAY_PEAK])))
      .toEqual(["Place 1", "Place 3", "Place 6", "Place 4", "Place 2", "Place 5"]);
  });
  it("never puts a less confident place first, however near it is", () => {
    const base = pilot.hotel_jay.results[0];
    expect(labels(rankResults([
      { ...base, name: "Next door", lat: 44.939, rank: { confidence: 0.95 } },
      { ...base, name: "Across the valley", lat: 45.2, rank: { confidence: 1 } },
      { ...base, name: "No score", lat: 44.938, rank: { confidence: Number.NaN } },
    ], [JAY_PEAK]))).toEqual(["Across the valley", "Next door", "No score"]);
  });
  it("keeps an unknown time zone out and keeps the source's own credit", () => {
    const [result] = rankResults([{ ...pilot.rental_address.results[0], timezone: { name: "Mars/Olympus" }, datasource: { attribution: "© Example data" } }], []);
    expect(result).toMatchObject({ time_zone: null, attribution: "© Example data" });
  });
});

describe("Searching Geoapify", () => {
  const fetchMock = vi.fn();
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEOAPIFY_API_KEY", "test-key");
    fetchMock.mockReset(); info.mockClear();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("searches near the trip's destinations and logs counts, not the query", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(pilot.hotel_jay)));
    const results = await searchLocations("Hotel Jay", [JAY_PEAK, { latitude: 44.94, longitude: -72.51 }]);
    expect(labels(results)).toEqual(["Hotel Jay & Conference Center", "Stateside Hotel & Base Lodge"]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({ text: "Hotel Jay", format: "json", lang: "en", limit: "10", bias: "proximity:-72.5075,44.939", apiKey: "test-key" });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(info).toHaveBeenCalledWith(JSON.stringify({ event: "location_search", provider: "geoapify", outcome: "ok", results: 2 }));
    expect(JSON.stringify(info.mock.calls)).not.toContain("Hotel Jay");
  });
  it("searches without a bias when no destination has coordinates", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ results: [] })));
    expect(await searchLocations("Nowhere Inn", [])).toEqual([]);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.has("bias")).toBe(false);
  });
  it("is unavailable without a key, and never calls the provider", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");
    await expect(searchLocations("Hotel Jay", [])).rejects.toBeInstanceOf(LocationSearchUnavailable);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    ["Geoapify limits the account", () => Promise.resolve(new Response("{}", { status: 429 }))],
    ["the key is rejected", () => Promise.resolve(new Response("{}", { status: 401 }))],
    ["the provider times out", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
    ["the answer isn't JSON", () => Promise.resolve(new Response("<html>"))],
    ["the answer has no results list", () => Promise.resolve(new Response(JSON.stringify({ features: [] })))],
  ])("is unavailable when %s", async (_, reply) => {
    fetchMock.mockImplementation(reply);
    await expect(searchLocations("Hotel Jay", [JAY_PEAK])).rejects.toBeInstanceOf(LocationSearchUnavailable);
  });
});
