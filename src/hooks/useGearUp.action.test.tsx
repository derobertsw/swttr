import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGearUp } from "./useGearUp";
import type { Outing } from "@/types/outing";
import { ACTIVITIES } from "@/data/activities";
import type { OutingActionOutcome } from "@/types/outingAction";
import { yourLocation } from "@/hooks/useDeviceLocation";

const auth = vi.hoisted(() => ({ userId: "user-one" as string | null, isLoaded: true }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/usePreferences", () => ({ usePreferences: () => ({
  sensitivity: "neutral", defaultActivity: "alpine_skiing", hasStoredDefaultActivity: true,
  bodyMetrics: { heightInches: 70, weightLbs: 170 }, loading: false,
}) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logWarn: vi.fn() }));

const input: Outing = { activity: "running", exertion: "easy",
  place: { id: 1, name: "Stowe", country: "US", latitude: 44.47, longitude: -72.69 },
  when: { mode: "later", date: "2026-10-22", time: "09:15", durationDays: 1 },
};
const weather = { temperature: 30, windSpeed: 7, isForecast: true, forecastTime: "2026-10-22T09:00-04:00", timeZone: "America/New_York" };
const advice = { recommendation: { score: 80, garments: [] } };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  auth.userId = "user-one";
  auth.isLoaded = true;
  fetchMock = vi.fn(async (url: string) => Response.json(url.startsWith("/api/weather") ? weather : advice));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("localStorage", { setItem: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const hook = renderHook(() => useGearUp());
  await waitFor(() => expect(hook.result.current.activityInitializing).toBe(false));
  return hook;
}

describe("atomic one-day outing action", () => {
  it("uses every explicit input and returns the committed result with destination time", async () => {
    const { result } = await setup();
    let outcome!: OutingActionOutcome;
    await act(async () => { outcome = await result.current.submitOuting(input); });
    expect(outcome.status).toBe("completed");
    expect(result.current.result?.outing).toEqual(input);
    expect(outcome.snapshot).toEqual(result.current.getCurrentOuting());
    expect(outcome.snapshot.displayed).toMatchObject({ outing: input, advice: { kind: "personalized" }, weather: { context: { timeZone: "America/New_York", forecastTime: weather.forecastTime } } });
    expect(fetchMock.mock.calls[0][0]).toContain("datetime=2026-10-22T09:15");
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.exertion).toBe("easy");
    expect(fetchMock.mock.calls[1][0]).toContain("/running");
    expect(JSON.stringify(outcome)).not.toMatch(/user-one|heightInches|weightLbs|height_inches/);
  });

  it.each(ACTIVITIES.flatMap(a => [true, false].map(signedIn => ({ activity: a.value, signedIn }))))(
    "preserves the support matrix for $activity, signedIn=$signedIn", async ({ activity, signedIn }) => {
      auth.userId = signedIn ? "user-one" : null;
      fetchMock.mockImplementation(async (url: string) => url.startsWith("/api/weather") ? Response.json(weather)
        : signedIn ? Response.json(advice) : Response.json({}, { status: 401 }));
      const { result } = await setup();
      let outcome!: OutingActionOutcome;
      await act(async () => { outcome = await result.current.submitOuting({ ...input, activity }); });
      const kind = activity === "hiking_snowshoeing" ? "general" : signedIn ? "personalized"
        : ["alpine_skiing", "xc_skiing"].includes(activity) ? "general" : "none";
      expect(outcome).toMatchObject({ status: "completed", snapshot: { displayed: { advice: { kind,
        ...(kind === "personalized" ? {} : { reason: activity === "hiking_snowshoeing" ? "unsupported" : "auth_required" }),
      } } } });
    },
  );

  it("distinguishes targets-only and a failed personalization update while retaining displayed advice", async () => {
    const { result } = await setup();
    fetchMock.mockImplementation(async (url: string) => Response.json(url.startsWith("/api/weather") ? weather : { ireq: { min: 0.4 } }));
    let outcome!: OutingActionOutcome;
    await act(async () => { outcome = await result.current.submitOuting(input); });
    expect(outcome).toMatchObject({ status: "completed", snapshot: { displayed: { advice: { kind: "none", reason: "no_gear" } } } });
    const previous = result.current.result;
    fetchMock.mockImplementation(async (url: string) => Response.json(url.startsWith("/api/weather") ? weather : {}, { status: url.startsWith("/api/weather") ? 200 : 500 }));
    await act(async () => { outcome = await result.current.submitOuting({ ...input, exertion: "hard" }); });
    expect(outcome).toMatchObject({ status: "error", code: "recommendation_unavailable", snapshot: { request: { status: "error", outing: { exertion: "hard" } }, displayed: { outing: { exertion: "easy" } } } });
    expect(result.current.result).toBe(previous);
  });

  it("cancels active work on an account switch without returning either account's private result", async () => {
    const { result, rerender } = await setup();
    const held = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => held.promise);
    let pending!: Promise<OutingActionOutcome>;
    act(() => { pending = result.current.submitOuting(input); });
    auth.userId = "user-two";
    rerender();
    await expect(pending).resolves.toMatchObject({ code: "cancelled", snapshot: { displayed: null, pending: null } });
    await act(async () => held.resolve(Response.json(weather)));
    expect(result.current.result).toBeNull();
  });

  it("finishes a human request made before sign-in loads", async () => {
    auth.isLoaded = false;
    const held = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => held.promise);
    const { result, rerender } = await setup();
    act(() => result.current.locationSearch.handleSelectLocation(input.place));
    let human!: Promise<void>;
    act(() => { human = result.current.handleSubmit(); });
    auth.isLoaded = true;
    rerender();
    await act(async () => { held.resolve(Response.json({ temperature: 30, windSpeed: 7 })); await human; });
    expect(result.current.request).toEqual({ status: "idle" });
    expect(result.current.result?.outing.place).toEqual(input.place);
  });

  it("reads back that the device's position was used, never its coordinates", async () => {
    const held = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => held.promise);
    const { result } = await setup();
    act(() => result.current.locationSearch.handleSelectLocation(yourLocation({ latitude: 44.123456, longitude: -72.654321 })));
    let human!: Promise<void>;
    act(() => { human = result.current.handleSubmit(); });
    const device = { kind: "device_location", name: "Your location" };
    const loading = result.current.getCurrentOuting();
    expect(loading).toMatchObject({ pending: { place: device }, request: { status: "loading", outing: { place: device } } });
    await act(async () => { held.resolve(Response.json({ temperature: 30, windSpeed: 7 })); await human; });
    const shown = result.current.getCurrentOuting();
    expect(shown.displayed?.outing.place).toEqual(device);
    expect(JSON.stringify([loading, shown])).not.toMatch(/44\.12|72\.65/);
  });

  it("uses the same result path as a human submission with the same fixture weather and gear", async () => {
    const agent = await setup();
    await act(() => agent.result.current.submitOuting(input));
    const expected = agent.result.current.result;
    agent.unmount();
    const human = await setup();
    act(() => {
      human.result.current.setActivity(input.activity);
      human.result.current.setExertion(input.exertion);
      human.result.current.locationSearch.handleSelectLocation(input.place);
      human.result.current.setInputMode("later");
      human.result.current.setDate(new Date(2026, 9, 22));
      human.result.current.setTime("09:15");
    });
    await act(() => human.result.current.handleSubmit());
    expect(human.result.current.result).toEqual(expected);
  });

  it("lets a newer human submission cancel an agent request without clearing the new loading state", async () => {
    const held = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => held.promise);
    const { result } = await setup();
    let pending!: Promise<OutingActionOutcome>;
    act(() => { pending = result.current.submitOuting(input); });
    await act(() => result.current.handleSubmit());
    expect(await pending).toMatchObject({ code: "cancelled" });
    expect(result.current.result?.outing).toEqual(input);
    const shown = result.current.result;
    await act(async () => held.resolve(Response.json({ ...weather, temperature: -50 })));
    expect(result.current.result).toBe(shown);
  });

  it("rejects an agent call in the same tick that a human request starts", async () => {
    const held = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => held.promise);
    const { result } = await setup();
    act(() => result.current.locationSearch.handleSelectLocation(input.place));
    let human!: Promise<void>;
    let agent!: Promise<OutingActionOutcome>;
    act(() => {
      human = result.current.handleSubmit();
      agent = result.current.submitOuting(input);
    });
    expect(await agent).toMatchObject({ code: "busy" });
    expect(result.current.request).toMatchObject({ status: "loading", outing: { activity: "alpine_skiing" } });
    await act(async () => { held.resolve(Response.json({ temperature: 30, windSpeed: 7 })); await human; });
    expect(result.current.result?.outing.activity).toBe("alpine_skiing");
  });

  it("rejects invalid inputs before any state change or fetch", async () => {
    const { result } = await setup();
    const before = result.current.getCurrentOuting();
    for (const invalid of [
      { ...input, accountId: "other" }, { ...input, activity: "unknown" },
      { ...input, when: { ...input.when, date: "2026-02-30" } },
      { ...input, place: { ...input.place, latitude: 91 } },
      { ...input, when: { ...input.when, durationDays: 2 } },
    ]) expect(await result.current.submitOuting(invalid)).toMatchObject({ status: "error", code: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.getCurrentOuting()).toEqual(before);
  });

  it.each(["weather", "recommendation"])("rejects busy calls and cancels promptly during %s even if transport ignores abort", async stage => {
    const held = Promise.withResolvers<Response>();
    fetchMock.mockImplementation(async (url: string) => stage === "weather" || !url.startsWith("/api/weather") ? held.promise : Response.json(weather));
    const { result } = await setup();
    const controller = new AbortController();
    let pending!: Promise<OutingActionOutcome>;
    act(() => { pending = result.current.submitOuting(input, { signal: controller.signal }); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(stage === "weather" ? 1 : 2));
    expect(await result.current.submitOuting(input)).toMatchObject({ code: "busy" });
    await act(async () => { controller.abort(); expect(await pending).toMatchObject({ code: "cancelled" }); });
    expect(result.current.loading).toBe(false);
    const signal = fetchMock.mock.calls.at(-1)![1].signal;
    expect(signal.aborted).toBe(true);
    await act(async () => { held.resolve(Response.json(stage === "weather" ? weather : advice)); });
    expect(result.current.result).toBeNull();
  });

  it("retires tool work when a person edits, and lets a human request replace it", async () => {
    const held = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => held.promise);
    const { result } = await setup();
    let pending!: Promise<OutingActionOutcome>;
    act(() => { pending = result.current.submitOuting(input); });
    act(() => result.current.setExertion("hard"));
    await act(async () => { expect(await pending).toMatchObject({ code: "cancelled" }); });
    expect(result.current.loading).toBe(false);
    await act(() => result.current.handleSubmit());
    expect(result.current.result?.outing.exertion).toBe("hard");
    await act(async () => { held.resolve(Response.json(weather)); });
    expect(result.current.result?.outing.exertion).toBe("hard");
  });

  it("clears private readback and cancels old callbacks on account changes and unmount", async () => {
    const { result, rerender, unmount } = await setup();
    await act(() => result.current.submitOuting(input));
    const stale = result.current.submitOuting;
    auth.userId = "user-two";
    rerender();
    expect(result.current.getCurrentOuting().displayed).toBeNull();
    expect(await stale(input)).toMatchObject({ code: "not_ready", snapshot: { displayed: null } });
    const held = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => held.promise);
    let pending!: Promise<OutingActionOutcome>;
    act(() => { pending = result.current.submitOuting(input); });
    unmount();
    expect(await pending).toMatchObject({ code: "cancelled", snapshot: { displayed: null } });
  });

  it("keeps recommendation limitations separate from request success and weather errors", async () => {
    const { result } = await setup();
    fetchMock.mockImplementation(async (url: string) => Response.json(url.startsWith("/api/weather") ? weather : {}, { status: url.startsWith("/api/weather") ? 200 : 401 }));
    let outcome!: OutingActionOutcome;
    await act(async () => { outcome = await result.current.submitOuting(input); });
    expect(outcome).toMatchObject({ status: "completed", snapshot: { displayed: { advice: { kind: "none", reason: "auth_required" } } } });
    const previous = result.current.result;
    fetchMock.mockResolvedValue(Response.json({ error: "Out of forecast range" }, { status: 400 }));
    await act(async () => { outcome = await result.current.submitOuting(input); });
    expect(outcome).toMatchObject({ status: "error", code: "weather_unavailable" });
    expect(result.current.result).toBe(previous);
  });
});
