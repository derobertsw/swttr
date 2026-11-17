import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveGearUpDraft } from "@/lib/gearUpDraft";
import type { Outing } from "@/types/outing";
import type { TemperatureSensitivity } from "@/types/preferences";
import { useGearUp } from "./useGearUp";

const prefs = vi.hoisted(() => ({ sensitivity: "neutral" as TemperatureSensitivity }));
const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "test-user", isLoaded: true }) }));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({
    sensitivity: prefs.sensitivity, defaultActivity: "running", hasStoredDefaultActivity: true,
    bodyMetrics: { heightInches: 70, weightLbs: 170 }, loading: false,
  }),
}));
vi.mock("@/lib/logger", () => ({ logWarn: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const STOWE = { id: 1, name: "Stowe", country: "US", latitude: 44.47, longitude: -72.69 };
const WEATHER = { temperature: 45, windSpeed: 4 };

/** A personalized answer naming the setting it was asked with. */
function advice(sensitivity: unknown) {
  return { recommendation: { score: 80, garments: [] }, guidance: [`asked ${sensitivity}`] };
}

const recommendationBodies = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls
  .filter(([url]) => String(url).includes("/api/v1/recommendations/"))
  .map(([, init]) => JSON.parse(init.body));

describe("useGearUp with Run Warm/Run Cold (#251)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    prefs.sensitivity = "neutral";
    searchParams.delete("resume");
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/weather")) return Response.json(WEATHER);
      if (url.includes("/api/plan-ahead")) {
        return Response.json({ plan: { days: [], asked: JSON.parse(String(init?.body)).sensitivity } });
      }
      return Response.json(advice(JSON.parse(String(init?.body)).temperature_sensitivity));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function seeResult() {
    const hook = renderHook(() => useGearUp());
    await waitFor(() => expect(hook.result.current.activityInitializing).toBe(false));
    act(() => hook.result.current.locationSearch.handleSelectLocation(STOWE));
    await act(() => hook.result.current.handleSubmit());
    expect(hook.result.current.result).toMatchObject({ sensitivity: "neutral" });
    return hook;
  }

  const shownAdvice = (result: { current: ReturnType<typeof useGearUp> }) => {
    const shown = result.current.result;
    return shown?.kind === "layers" && shown.advice.kind === "personalized" ? shown.advice.recommendation.guidance : null;
  };

  it("sends the setting with each personalized request", async () => {
    prefs.sensitivity = "cold";
    const { result } = await (async () => {
      const hook = renderHook(() => useGearUp());
      await waitFor(() => expect(hook.result.current.activityInitializing).toBe(false));
      act(() => hook.result.current.locationSearch.handleSelectLocation(STOWE));
      await act(() => hook.result.current.handleSubmit());
      return hook;
    })();
    expect(recommendationBodies(fetchMock)).toEqual([expect.objectContaining({ temperature_sensitivity: "cold" })]);
    expect(result.current.result).toMatchObject({ sensitivity: "cold" });
  });

  it("asks again for the shown result's outing and weather when the setting changes", async () => {
    const { result, rerender } = await seeResult();
    const outing = result.current.result!.outing;
    fetchMock.mockClear();
    prefs.sensitivity = "hot";
    rerender();
    await waitFor(() => expect(result.current.result).toMatchObject({ sensitivity: "hot" }));
    // Same weather: only the recommendation is asked for again.
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/v1/recommendations/running"]);
    expect(recommendationBodies(fetchMock)[0]).toMatchObject({ temperature_sensitivity: "hot" });
    expect(result.current.result?.outing).toEqual(outing);
    expect(shownAdvice(result)).toEqual(["asked hot"]);
    expect(result.current.request).toEqual({ status: "idle" });
  });

  it("never shows a late answer for the previous setting", async () => {
    const hook = renderHook(() => useGearUp());
    await waitFor(() => expect(hook.result.current.activityInitializing).toBe(false));
    act(() => hook.result.current.locationSearch.handleSelectLocation(STOWE));
    const held = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(async () => Response.json(WEATHER)).mockImplementationOnce(() => held.promise);
    let submitted!: Promise<void>;
    act(() => { submitted = hook.result.current.handleSubmit(); });
    await waitFor(() => expect(recommendationBodies(fetchMock)).toHaveLength(1));
    prefs.sensitivity = "cold";
    hook.rerender();
    await act(async () => {
      held.resolve(Response.json(advice("neutral")));
      await submitted;
    });
    expect(recommendationBodies(fetchMock).map(body => body.temperature_sensitivity)).toEqual(["neutral", "cold"]);
    expect(hook.result.current.result).toMatchObject({ sensitivity: "cold" });
    expect(shownAdvice(hook.result)).toEqual(["asked cold"]);
  });

  it("keeps the result after a failed update for a new setting, without asking again by itself", async () => {
    const { result, rerender } = await seeResult();
    const previous = result.current.result;
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }));
    prefs.sensitivity = "cold";
    rerender();
    await waitFor(() => expect(result.current.request.status).toBe("error"));
    rerender();
    await act(async () => {});
    expect(recommendationBodies(fetchMock)).toHaveLength(1);
    expect(result.current.result).toBe(previous);
    // Try again uses the new setting.
    await act(async () => { expect(await result.current.handleRetryUpdate()).toBe(true); });
    expect(recommendationBodies(fetchMock).at(-1)).toMatchObject({ temperature_sensitivity: "cold" });
    expect(result.current.result).toMatchObject({ sensitivity: "cold" });
  });

  it("asks for a shown multi-day plan again with the new setting", async () => {
    const hook = renderHook(() => useGearUp());
    await waitFor(() => expect(hook.result.current.activityInitializing).toBe(false));
    act(() => {
      hook.result.current.setInputMode("later");
      hook.result.current.setDate(new Date(2026, 10, 20));
      hook.result.current.setTime("09:00");
      hook.result.current.setDurationDays(3);
      hook.result.current.locationSearch.handleSelectLocation(STOWE);
    });
    await act(() => hook.result.current.handleSubmit());
    expect(hook.result.current.result).toMatchObject({ kind: "plan", sensitivity: "neutral" });
    prefs.sensitivity = "hot";
    hook.rerender();
    await waitFor(() => expect(hook.result.current.result).toMatchObject({ kind: "plan", sensitivity: "hot", plan: { asked: "hot" } }));
  });

  it("asks with the current setting when the last outing comes back", async () => {
    const outing: Outing = { activity: "running", exertion: "moderate", place: STOWE, when: { mode: "now" } };
    saveGearUpDraft("test-user", {
      activity: "running", exertion: "moderate", place: STOWE,
      inputMode: "now", date: null, time: "12:00", durationDays: 1, lastOuting: outing,
    });
    prefs.sensitivity = "hot";
    searchParams.set("resume", "outing");
    const { result } = renderHook(() => useGearUp());
    await waitFor(() => expect(result.current.result).toMatchObject({ outing, sensitivity: "hot" }));
    expect(recommendationBodies(fetchMock)).toEqual([expect.objectContaining({ temperature_sensitivity: "hot" })]);
  });
});
