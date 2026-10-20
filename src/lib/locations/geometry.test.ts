// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { driveGeometry } from "./geometry";

const origin = { latitude: 44.5, longitude: -72.7 }, access = { latitude: 44.6, longitude: -72.8 };
const geometry = { type: "MultiLineString", coordinates: [[[-72.7, 44.5], [-72.75, 44.55], [-72.8, 44.6]]] };
const answer = (shape: unknown = geometry) => ({ type: "FeatureCollection", features: [{ type: "Feature", geometry: shape, properties: { apiKey: "do-not-return", instructions: "private road" } }] });

describe("Geoapify selected-day road geometry", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal("fetch", fetchMock); vi.stubEnv("GEOAPIFY_API_KEY", "test-secret"); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("requests one drive with typical traffic and the current closure points; returns only real GeoJSON geometry", async () => {
    fetchMock.mockResolvedValue(Response.json(answer()));
    expect(await driveGeometry(origin, access, [{ latitude: 44.5555, longitude: -72.7947 }])).toEqual(geometry);
    const [url, options] = fetchMock.mock.calls[0];
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ apiKey: "test-secret", mode: "drive", traffic: "approximated", format: "geojson",
      waypoints: "44.5,-72.7|44.6,-72.8", avoid: "location:44.5555,-72.7947" });
    expect(options.cache).toBe("no-store"); expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it("has no provider call without configuration", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");
    await expect(driveGeometry(origin, access)).rejects.toThrow("configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["No suitable edges near location. Please check waypoint coordinate order (lat/lon).", "No route found."])("recognizes an explicit no-road answer: %s", async (message) => {
    fetchMock.mockResolvedValue(Response.json({ message }, { status: 400 }));
    expect(await driveGeometry(origin, access)).toBeNull();
  });
  it.each([
    [400, { message: "Invalid parameter" }], [401, { message: "Invalid API key" }], [429, {}], [500, {}],
    [200, {}], [200, { type: "FeatureCollection", features: [] }], [200, answer(null)],
    [200, answer({ type: "LineString", coordinates: [[-72, 44], [-73, 45]] })],
    [200, answer({ type: "MultiLineString", coordinates: [[[181, 44], [-73, 45]]] })],
    [200, answer({ type: "MultiLineString", coordinates: [[[-72, 44]]] })],
    [200, answer({ type: "MultiLineString", coordinates: [[[-72, null], [-73, 45]]] })],
  ])("treats failed/malformed answers as unavailable (%s)", async (status, body) => {
    fetchMock.mockResolvedValue(Response.json(body, { status }));
    await expect(driveGeometry(origin, access)).rejects.toThrow("Route line unavailable");
  });
  it("bounds both response size and geometry vertices", async () => {
    fetchMock.mockResolvedValue(new Response(" ".repeat(2_000_001)));
    await expect(driveGeometry(origin, access)).rejects.toThrow("unavailable");
    fetchMock.mockResolvedValue(Response.json(answer({ type: "MultiLineString", coordinates: [Array.from({ length: 20_001 }, () => [-72, 44])] })));
    await expect(driveGeometry(origin, access)).rejects.toThrow("unavailable");
  });
  it("handles network/timeout failures without disclosing provider details", async () => {
    fetchMock.mockRejectedValue(new Error("secret url or key"));
    await expect(driveGeometry(origin, access)).rejects.toThrow(/^Route line unavailable\.$/);
  });
});
