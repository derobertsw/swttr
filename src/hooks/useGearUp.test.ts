import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readGearUpDraft, saveGearUpDraft } from "@/lib/gearUpDraft";
import type { Outing } from "@/types/outing";
import { useGearUp } from "./useGearUp";

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "test-user", isLoaded: true }) }));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({
    sensitivity: "neutral", defaultActivity: "alpine_skiing", hasStoredDefaultActivity: true,
    bodyMetrics: { heightInches: 70, weightLbs: 170 }, loading: false,
  }),
}));
vi.mock("@/lib/logger", () => ({ logWarn: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const STOWE = { id: 1, name: "Stowe", country: "US", latitude: 44.47, longitude: -72.69 };
const BEND = { id: 2, name: "Bend", country: "US", latitude: 44.06, longitude: -121.31 };
const WEATHER = { temperature: 30, windSpeed: 7 };
const ADVICE = { recommendation: { score: 80, garments: [] } };

function weatherAt(url: string) {
  const datetime = new URL(url, "http://localhost").searchParams.get("datetime");
  return datetime ? {
    ...WEATHER, isForecast: true, forecastTime: `${datetime.slice(0, 13)}:00-07:00`, timeZone: "America/Los_Angeles",
  } : WEATHER;
}

describe("useGearUp request completion", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    searchParams.delete("resume");
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => Response.json(url.includes("/api/weather") ? weatherAt(url) : ADVICE));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function seeInitialResult() {
    const hook = renderHook(() => useGearUp());
    await waitFor(() => expect(hook.result.current.activityInitializing).toBe(false));
    act(() => hook.result.current.locationSearch.handleSelectLocation(STOWE));
    await act(() => hook.result.current.handleSubmit());
    expect(hook.result.current.result?.outing.place).toEqual(STOWE);
    return hook;
  }

  it.each(["weather", "recommendation"])(
    "resolves a weather change as false when it is retired during its %s request",
    async (stage) => {
      const { result } = await seeInitialResult();
      const held = Promise.withResolvers<Response>();
      fetchMock.mockImplementation(async (url: string) => {
        if (stage === "weather" ? url.includes("/api/weather") : url.includes("/api/v1/recommendations/")) {
          return held.promise;
        }
        return Response.json(weatherAt(url));
      });
      fetchMock.mockClear();
      let pending!: Promise<boolean>;
      act(() => { pending = result.current.handleWeatherChange(BEND, "2026-10-08T09:15"); });
      expect(result.current.request).toMatchObject({ status: "loading", outing: { place: BEND, when: { time: "09:15" } } });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(stage === "weather" ? 1 : 2));
      act(() => result.current.resetToInitialState());
      let shown: boolean | undefined;
      await act(async () => {
        held.resolve(Response.json(stage === "weather" ? WEATHER : ADVICE));
        shown = await pending;
      });
      expect(shown).toBe(false);
      expect(result.current.result).toBeNull();
      expect(result.current.request).toEqual({ status: "idle" });
      expect(result.current.locationSearch.selectedLocation).toBeNull();
      expect(readGearUpDraft("test-user")?.lastOuting).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(stage === "weather" ? 1 : 2);
    },
  );

  it("keeps the newer result and draft when two weather changes finish out of order", async () => {
    const { result } = await seeInitialResult();
    const held = Promise.withResolvers<Response>();
    let weatherCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/weather")) return ++weatherCalls === 1 ? held.promise : Response.json(weatherAt(url));
      return Response.json(ADVICE);
    });
    let older!: Promise<boolean>;
    act(() => { older = result.current.handleWeatherChange(BEND, "2026-10-08T09:15"); });
    await act(async () => {
      expect(await result.current.handleWeatherChange(STOWE, "2026-10-09T10:30")).toBe(true);
    });
    await act(async () => {
      held.resolve(Response.json({ temperature: 10, windSpeed: 30 }));
      expect(await older).toBe(false);
    });
    expect(result.current.result).toMatchObject({
      outing: { place: STOWE, when: { date: "2026-10-09", time: "10:30" } }, weather: WEATHER,
    });
    expect(readGearUpDraft("test-user")).toMatchObject({
      place: STOWE, date: "2026-10-09", time: "10:30",
      lastOuting: result.current.result?.outing,
    });
    expect(result.current.request).toEqual({ status: "idle" });
  });

  it("keeps failed inputs separate from the result and retries that exact outing", async () => {
    const { result } = await seeInitialResult();
    const previous = result.current.result;
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Forecast unavailable" }, { status: 502 }));
    await act(async () => {
      expect(await result.current.handleWeatherChange(BEND, "2026-10-08T23:15")).toBe(false);
    });
    expect(result.current.result).toBe(previous);
    expect(result.current.request).toMatchObject({
      status: "error", outing: { place: BEND, when: { mode: "later", date: "2026-10-08", time: "23:15" } },
    });
    expect(readGearUpDraft("test-user")?.lastOuting).toEqual(previous?.outing);
    fetchMock.mockClear();
    await act(async () => { expect(await result.current.handleRetryUpdate()).toBe(true); });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/weather?lat=44.06&lon=-121.31&datetime=2026-10-08T23:15");
    expect(result.current.request).toEqual({ status: "idle" });
    expect(result.current.result?.outing.place).toEqual(BEND);
    expect(result.current.time).toBe("23:15");
    expect(readGearUpDraft("test-user")?.lastOuting).toEqual(result.current.result?.outing);
  });

  it("retains the previous recommendation when new layers fail, then retries the attempted activity", async () => {
    const { result } = await seeInitialResult();
    const previous = result.current.result;
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }));
    await act(() => result.current.handleActivityChange("running"));
    expect(result.current.result).toBe(previous);
    expect(result.current.activity).toBe("alpine_skiing");
    expect(result.current.request).toMatchObject({ status: "error", outing: { activity: "running", place: STOWE } });
    await act(async () => { expect(await result.current.handleRetryUpdate()).toBe(true); });
    expect(result.current.result?.outing.activity).toBe("running");
    expect(result.current.activity).toBe("running");
  });

  it("ignores an older failure while a newer weather update is pending", async () => {
    const { result } = await seeInitialResult();
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    let older!: Promise<boolean>;
    let newer!: Promise<boolean>;
    act(() => { older = result.current.handleWeatherChange(BEND, "2026-10-08T09:15"); });
    act(() => { newer = result.current.handleWeatherChange(STOWE, "2026-10-09T10:30"); });
    await act(async () => {
      first.resolve(Response.json({}, { status: 500 }));
      expect(await older).toBe(false);
    });
    expect(result.current.request).toMatchObject({ status: "loading", outing: { place: STOWE, when: { time: "10:30" } } });
    await act(async () => {
      second.resolve(Response.json(weatherAt("/api/weather?datetime=2026-10-09T10:30")));
      expect(await newer).toBe(true);
    });
    expect(result.current.request).toEqual({ status: "idle" });
  });

  it("repairs an older return draft whose form differs from its last submitted outing", async () => {
    const outing: Outing = {
      activity: "running", exertion: "hard", place: BEND,
      when: { mode: "later", date: "2026-10-08", time: "09:15", durationDays: 1 },
    };
    saveGearUpDraft("test-user", {
      activity: "alpine_skiing", exertion: "moderate", place: STOWE,
      inputMode: "now", date: null, time: "12:00", durationDays: 3, lastOuting: outing,
    });
    searchParams.set("resume", "outing");
    const { result } = renderHook(() => useGearUp());
    await waitFor(() => expect(result.current.result?.outing).toEqual(outing));
    act(() => result.current.editOuting());
    expect(result.current).toMatchObject({ activity: "running", exertion: "hard", inputMode: "later", time: "09:15", durationDays: 1 });
    expect(result.current.locationSearch.selectedLocation).toEqual(BEND);
    expect(readGearUpDraft("test-user")).toMatchObject({
      activity: "running", exertion: "hard", place: BEND,
      inputMode: "later", date: "2026-10-08", time: "09:15", durationDays: 1, lastOuting: outing,
    });
  });
});
