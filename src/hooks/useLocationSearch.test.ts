import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLocationSearch } from "./useLocationSearch";
import type { LocationSearchKind } from "@/lib/locationSuggestion";

const RESORT = {
  id: "resort:wd-Q14711916", kind: "resort", source: "openskidata", resortId: "wd-Q14711916",
  name: "Killington Resort", region: "Vermont", country: "United States", latitude: 43.6047, longitude: -72.8187,
  elevationM: 1262, pointLabel: "Top of K-1 Express Gondola", pointKind: "lift", match: "typo",
};
const ok = (results: unknown[], extra = {}) => Promise.resolve({ ok: true, json: () => Promise.resolve({ results, ...extra }) });
const urls = () => vi.mocked(fetch).mock.calls.map(([url]) => String(url));

async function typeQuery(result: { current: ReturnType<typeof useLocationSearch> }, value: string) {
  act(() => result.current.handleLocationInputChange(value));
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}

describe("useLocationSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => ok([RESORT])));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs the general search with no kind, as before", async () => {
    const { result } = renderHook(() => useLocationSearch());
    await typeQuery(result, "Stowe");
    expect(urls()).toEqual(["/api/geocode?q=Stowe"]);
  });

  it("asks for resorts in resort mode and reports results", async () => {
    const { result } = renderHook(() => useLocationSearch({ kind: "resort" }));
    await typeQuery(result, "Killngton");
    expect(urls()).toEqual(["/api/geocode?q=Killngton&kind=resort"]);
    expect(result.current.status).toBe("results");
    expect(result.current.canSearchAllPlaces).toBe(true);
  });

  it("searches again over all places when asked, and offers no fallback there", async () => {
    const { result } = renderHook(() => useLocationSearch({ kind: "resort" }));
    await typeQuery(result, "Mad River");
    act(() => result.current.searchAllPlaces());
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(urls()).toEqual(["/api/geocode?q=Mad+River&kind=resort", "/api/geocode?q=Mad+River&kind=all"]);
    expect(result.current.searchKind).toBe("all");
    expect(result.current.canSearchAllPlaces).toBe(false);
  });

  it("searches again when the activity changes the kind, and forgets Search all places", async () => {
    const { result, rerender } = renderHook(({ kind }: { kind?: LocationSearchKind }) => useLocationSearch({ kind }), { initialProps: { kind: "resort" as LocationSearchKind | undefined } });
    await typeQuery(result, "Stowe");
    act(() => result.current.searchAllPlaces());
    rerender({ kind: "all" });
    rerender({ kind: "resort" });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.searchKind).toBe("resort");
    expect(urls().at(-1)).toBe("/api/geocode?q=Stowe&kind=resort");
  });

  it("keeps a picked place when the kind changes", async () => {
    const { result, rerender } = renderHook(({ kind }: { kind?: LocationSearchKind }) => useLocationSearch({ kind }), { initialProps: { kind: "all" as LocationSearchKind | undefined } });
    act(() => result.current.handleSelectLocation(RESORT as never));
    rerender({ kind: "resort" });
    expect(result.current.selectedLocation).toMatchObject({ resortId: "wd-Q14711916", elevationM: 1262 });
    // How the search matched it isn't part of the place.
    expect(result.current.selectedLocation).not.toHaveProperty("match");
  });

  it("drops an answer to a query that was replaced while typing", async () => {
    let answer!: (value: unknown) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }) as never);
    const { result } = renderHook(() => useLocationSearch({ kind: "resort" }));
    await typeQuery(result, "Kil");
    vi.mocked(fetch).mockImplementationOnce(() => ok([]) as never);
    await typeQuery(result, "Killx");
    await act(async () => { answer({ ok: true, json: () => Promise.resolve({ results: [RESORT] }) }); });
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.status).toBe("empty");
  });

  it("waits for typing to stop before searching", async () => {
    const { result } = renderHook(() => useLocationSearch({ kind: "resort" }));
    act(() => result.current.handleLocationInputChange("Ki"));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    act(() => result.current.handleLocationInputChange("Kil"));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    act(() => result.current.handleLocationInputChange("Kill"));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(urls()).toEqual(["/api/geocode?q=Kill&kind=resort"]);
  });

  it("tells an upstream error from no matches", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "Failed" }) }) as never);
    const { result } = renderHook(() => useLocationSearch({ kind: "all" }));
    await typeQuery(result, "Stowe");
    expect(result.current.status).toBe("error");
    vi.mocked(fetch).mockImplementationOnce(() => ok([]) as never);
    await typeQuery(result, "Stowex");
    expect(result.current.status).toBe("empty");
  });

  it("passes on that only resorts came back", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => ok([RESORT], { placesUnavailable: true }) as never);
    const { result } = renderHook(() => useLocationSearch({ kind: "all" }));
    await typeQuery(result, "Killington");
    expect(result.current.placesUnavailable).toBe(true);
  });
});
