import { act, render } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { tripMapFixture } from "@/test/tripMap";
import TripMapCanvas from "./TripMapCanvas";

const sdk = vi.hoisted(() => ({ map: null as unknown as FakeMap, fail: false, worker: vi.fn() }));
type Callback = (event?: unknown) => unknown;
class FakeMap {
  events: Record<string, Callback> = {};
  sources: Record<string, { setData: ReturnType<typeof vi.fn>; getClusterLeaves: ReturnType<typeof vi.fn> }> = {};
  layers: Array<{ id: string; type: string; paint?: Record<string, unknown> }> = [];
  canvas = document.createElement("canvas");
  dragRotate = { disable: vi.fn() }; touchZoomRotate = { disableRotation: vi.fn() };
  fitBounds = vi.fn(); remove = vi.fn(); resize = vi.fn(); zoomIn = vi.fn(); zoomOut = vi.fn(); addImage = vi.fn();
  on(event: string, layer: string | Callback, cb?: Callback) { this.events[`${event}:${typeof layer === "string" ? layer : ""}`] = cb ?? layer as Callback; }
  getCanvas() { return this.canvas; }
  addSource(id: string) { this.sources[id] = { setData: vi.fn(), getClusterLeaves: vi.fn() }; }
  getSource(id: string) { return this.sources[id]; }
  addLayer(layer: { id: string; type: string }) { this.layers.push(layer); }
}
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl", () => ({
  Map: function () { if (sdk.fail) throw new Error("No WebGL"); sdk.map = new FakeMap(); return sdk.map; },
  LngLatBounds: class { extend = vi.fn(); }, setWorkerUrl: sdk.worker,
}));
const data = await tripMapFixture();
const props = () => ({ places: data.places, provider: data.provider, scope: "all", date: "", selectedId: null as string | null, fitRequest: 0, onSelect: vi.fn(), onGroup: vi.fn(), onError: vi.fn() });
async function loaded() { await act(async () => { sdk.map.events["load:"](); }); }
beforeEach(() => {
  sdk.fail = false;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), rect: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(48 * 48 * 4), width: 48, height: 48 }) } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Lazy map canvas", () => {
  it.each([0, 1, 6])("fits zero/one/many points (%s) and never creates connecting routes", async (count) => {
    const input = props(); input.places = data.places.filter((place) => place.coordinates).slice(0, count);
    const view = render(<TripMapCanvas {...input} />); await loaded();
    expect(sdk.map.fitBounds).toHaveBeenCalledTimes(count === 0 ? 0 : 1);
    if (count) expect(sdk.map.fitBounds.mock.calls[0][1]).toMatchObject({ maxZoom: 12, duration: 0 });
    expect(sdk.map.layers.some((layer) => layer.type === "line")).toBe(false);
    expect(sdk.worker).toHaveBeenCalledWith(expect.stringContaining("maplibre-gl-worker.mjs"));
    view.unmount(); expect(sdk.map.remove).toHaveBeenCalled();
  });
  it("preserves user pan on background updates and selection; refits on scope or explicit extent", async () => {
    const input = props(); const view = render(<TripMapCanvas {...input} />); await loaded();
    view.rerender(<TripMapCanvas {...input} places={structuredClone(data.places)} selectedId={data.places[0].id} />);
    expect(sdk.map.fitBounds).toHaveBeenCalledTimes(1);
    const selected = sdk.map.sources.selection.setData.mock.calls.at(-1)?.[0];
    expect(selected.features[0].properties.id).toBe(data.places[0].id);
    view.rerender(<TripMapCanvas {...input} scope="new-date" />);
    expect(sdk.map.fitBounds).toHaveBeenCalledTimes(2);
    view.rerender(<TripMapCanvas {...input} scope="new-date" fitRequest={1} />);
    expect(sdk.map.fitBounds).toHaveBeenCalledTimes(3);
  });
  it("resolves coincident points individually even at maximum cluster zoom", async () => {
    const input = props(); render(<TripMapCanvas {...input} />); await loaded();
    const same = data.places.filter((place) => place.source.slot === "destination");
    await act(async () => sdk.map.events["click:point-targets"]({ features: [{ geometry: { type: "Point", coordinates: [same[0].coordinates!.longitude + 0.00001, same[0].coordinates!.latitude] }, properties: { id: same[0].id } }] }));
    expect(input.onGroup).toHaveBeenCalledWith(same.map((place) => place.id));
    expect(input.onSelect).not.toHaveBeenCalled();
  });
  it("drops group worker results when scope changes while they load", async () => {
    const input = props(); const view = render(<TripMapCanvas {...input} />); await loaded();
    let finish!: (value: unknown) => void;
    sdk.map.sources.places.getClusterLeaves.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    let request: unknown;
    act(() => { request = sdk.map.events["click:groups"]({ features: [{ properties: { cluster_id: 1 } }] }); });
    view.rerender(<TripMapCanvas {...input} scope="next-date" />);
    await act(async () => { finish([{ properties: { id: data.places[0].id } }]); await request; });
    expect(input.onGroup).not.toHaveBeenCalled();
  });
  it("keeps a loaded map through transient resource errors but reports lost WebGL", async () => {
    const input = props(); render(<TripMapCanvas {...input} />); await loaded();
    act(() => { for (let failure = 0; failure < 5; failure++) sdk.map.events["error:"](); });
    expect(input.onError).not.toHaveBeenCalled();
    expect(sdk.map.remove).not.toHaveBeenCalled();
    act(() => sdk.map.getCanvas().dispatchEvent(new Event("webglcontextlost")));
    expect(input.onError).toHaveBeenCalledOnce();
  });
  it("reports worker/tile/WebGL errors and initialization timeout for list recovery", async () => {
    vi.useFakeTimers(); const input = props(); const view = render(<TripMapCanvas {...input} />);
    act(() => sdk.map.events["error:"]()); expect(input.onError).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(20_000)); expect(input.onError).toHaveBeenCalledTimes(2);
    view.unmount();
    sdk.fail = true;
    render(<TripMapCanvas {...input} />); expect(input.onError).toHaveBeenCalledTimes(3);
  });
});
