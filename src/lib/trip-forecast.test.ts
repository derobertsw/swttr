// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { STOWE_STOP } from "@/test/tripApi";
import { fetchTripForecast } from "./trip-forecast";

function weatherResponse() {
  return Response.json({ timezone: "America/New_York", hourly: {
    time: [Date.parse("2026-10-10T16:00Z") / 1000],
    temperature_2m: [45], wind_speed_10m: [10], precipitation_probability: [20],
  } });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("trip forecast reuse", () => {
  it("coalesces simultaneous requests for identical coordinates across stops and trips", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const day = fetchTripForecast(STOWE_STOP);
    const packing = fetchTripForecast({ ...STOWE_STOP, id: "other-stop", trip_id: "other-trip", name: "Same location" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(weatherResponse());
    const [first, second] = await Promise.all([day, packing]);
    expect(first).not.toBeNull();
    expect(second).toEqual(first);
  });

  it("keeps different coordinates separate", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => weatherResponse());
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([fetchTripForecast(STOWE_STOP), fetchTripForecast({ ...STOWE_STOP, latitude: 45 })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const latitudes = fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get("latitude"));
    expect(latitudes).toEqual(["44.47", "45"]);
  });

  it("uses a five-minute server cache without including private trip details in the key", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => weatherResponse());
    vi.stubGlobal("fetch", fetchMock);
    await fetchTripForecast(STOWE_STOP);
    const [url, options] = fetchMock.mock.calls[0];
    expect(options).toMatchObject({ next: { revalidate: 300 }, signal: expect.any(AbortSignal) });
    expect(options.cache).not.toBe("no-store");
    expect(url).not.toContain(STOWE_STOP.id);
    expect(url).not.toContain(STOWE_STOP.trip_id);
  });

  it("releases failed requests so an immediate retry can succeed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockImplementationOnce(async () => weatherResponse());
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTripForecast(STOWE_STOP)).resolves.toBeNull();
    await expect(fetchTripForecast(STOWE_STOP)).resolves.not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("computes today's date at request time when the cached provider response crosses local midnight", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => weatherResponse());
    vi.stubGlobal("fetch", fetchMock);
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-11T03:59Z"));
    expect((await fetchTripForecast(STOWE_STOP))?.today).toBe("2026-10-10");
    now.mockReturnValue(Date.parse("2026-10-11T04:01Z"));
    expect((await fetchTripForecast(STOWE_STOP))?.today).toBe("2026-10-11");
  });
});
