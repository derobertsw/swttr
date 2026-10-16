// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closuresFor, closuresOn } from "./closures";
import { driveMatrix, RoutingUnavailable } from "./routing";

// Answers Geoapify gave on 2026-10-15: Spruce Peak and Lake Placid to
// Smugglers' Notch Resort and Johns Brook Lodge, a hut with no road.
const SPRUCE_PEAK = { latitude: 44.53, longitude: -72.7816 };
const LAKE_PLACID = { latitude: 44.2795, longitude: -73.9799 };
const SMUGGS = { latitude: 44.587, longitude: -72.7837 };
const JOHNS_BROOK = { latitude: 44.1931, longitude: -73.854 };
const LIVE_ANSWER = { sources_to_targets: [
  [{ distance: 8016, time: 557, source_index: 0, target_index: 0 }, { distance: null, time: null, source_index: 0, target_index: 1 }],
  [{ distance: 162628, time: 10895, source_index: 1, target_index: 0 }, { distance: null, time: null, source_index: 1, target_index: 1 }],
] };

describe("Drive estimates from Geoapify's Route Matrix", () => {
  const fetchMock = vi.fn();
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEOAPIFY_API_KEY", "test-key");
    fetchMock.mockReset(); info.mockClear();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("drives every source to every target with typical traffic, and a hut has no road route", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(LIVE_ANSWER)));
    expect(await driveMatrix([SPRUCE_PEAK, LAKE_PLACID], [SMUGGS, JOHNS_BROOK])).toEqual([
      [{ seconds: 557, meters: 8016 }, null],
      [{ seconds: 10895, meters: 162628 }, null],
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).searchParams.get("apiKey")).toBe("test-key");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      mode: "drive", traffic: "approximated",
      sources: [{ location: [-72.7816, 44.53] }, { location: [-73.9799, 44.2795] }],
      targets: [{ location: [-72.7837, 44.587] }, { location: [-73.854, 44.1931] }],
    });
    expect(info).toHaveBeenCalledWith(JSON.stringify({ event: "drive_matrix", provider: "geoapify", outcome: "ok", cells: 4, no_route: 2 }));
    expect(JSON.stringify(info.mock.calls)).not.toContain("44.53");
  });
  it("avoids closed roads as locations", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ sources_to_targets: [[{ distance: 61410, time: 4508, source_index: 0, target_index: 0 }]] })));
    const notch = closuresOn("2027-01-09").flatMap((closure) => closure.points);
    expect(await driveMatrix([SPRUCE_PEAK], [SMUGGS], notch)).toEqual([[{ seconds: 4508, meters: 61410 }]]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).avoid).toEqual([{ type: "locations", values: [
      { lon: -72.7947, lat: 44.5555 }, { lon: -73.1646, lat: 42.6354 }, { lon: -73.205, lat: 42.5752 }, { lon: -73.1611, lat: 42.6505 },
    ] }]);
  });
  it("calls nothing when there's nothing to estimate", async () => {
    expect(await driveMatrix([], [SMUGGS])).toEqual([]);
    expect(await driveMatrix([SPRUCE_PEAK], [])).toEqual([[]]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("is unavailable without a key, and never calls the provider", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");
    await expect(driveMatrix([SPRUCE_PEAK], [SMUGGS])).rejects.toBeInstanceOf(RoutingUnavailable);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    ["the daily quota is spent", () => Promise.resolve(new Response("{}", { status: 429 }))],
    ["the key is rejected", () => Promise.resolve(new Response("{}", { status: 401 }))],
    ["the provider times out", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
    ["the answer isn't JSON", () => Promise.resolve(new Response("<html>"))],
    ["a pair is missing", () => Promise.resolve(new Response(JSON.stringify({ sources_to_targets: [[LIVE_ANSWER.sources_to_targets[0][0]]] })))],
    ["an index is out of range", () => Promise.resolve(new Response(JSON.stringify({ sources_to_targets: [[{ distance: 1, time: 1, source_index: 3, target_index: 0 }]] })))],
  ])("is unavailable when %s", async (_, answer) => {
    fetchMock.mockImplementation(answer);
    await expect(driveMatrix([SPRUCE_PEAK], [SMUGGS, JOHNS_BROOK])).rejects.toBeInstanceOf(RoutingUnavailable);
  });
});

describe("Winter closures", () => {
  const ids = (date: string) => closuresOn(date).map((closure) => closure.id);
  it("applies each closure only in its season, across the new year", () => {
    expect(ids("2026-10-30")).toEqual([]);
    expect(ids("2026-10-31")).toEqual(["ma-mount-greylock-summit-roads"]);
    expect(ids("2026-11-01")).toEqual(["vt-108-smugglers-notch", "ma-mount-greylock-summit-roads"]);
    expect(ids("2027-02-14")).toEqual(["vt-108-smugglers-notch", "ma-mount-greylock-summit-roads"]);
    expect(ids("2027-05-15")).toEqual(["vt-108-smugglers-notch", "ma-mount-greylock-summit-roads"]);
    expect(ids("2027-05-16")).toEqual([]);
    expect(ids("2027-07-04")).toEqual([]);
  });
  it("avoids only the closures near the drive", () => {
    const near = (from: typeof SPRUCE_PEAK, to: typeof SMUGGS) => closuresFor("2027-01-09", from, to).map((closure) => closure.id);
    expect(near(SPRUCE_PEAK, SMUGGS)).toEqual(["vt-108-smugglers-notch"]);
    expect(near(LAKE_PLACID, JOHNS_BROOK)).toEqual([]);
    const williamstown = { latitude: 42.712, longitude: -73.2037 }, summit = { latitude: 42.6375, longitude: -73.166 };
    expect(near(williamstown, summit)).toEqual(["ma-mount-greylock-summit-roads"]);
    expect(closuresFor("2027-07-04", SPRUCE_PEAK, SMUGGS)).toEqual([]);
  });
});
