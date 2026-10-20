import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tripMapData } from "@/lib/trip-map";
import { driveTrip } from "@/test/driveTrip";
import type { TripMapDay, TripMapGeometry } from "@/types/trip-map";
import { useTripMapGeometry } from "./useTripMapGeometry";

const map = await tripMapData(driveTrip(), { read: async () => [], write: async () => {} });
const day = map.days[1], other = map.days[2];
const answer = (selected: TripMapDay, tripId = map.trip_id): TripMapGeometry => ({ trip_id: tripId, day_id: selected.id, date: selected.date,
  revision: selected.revision, mode: "drive", origin: selected.origin, access: selected.access, state: "available",
  geometry: { type: "MultiLineString", coordinates: [[[-72, 44], [-73, 45]]] }, provider: "geoapify", calculated_at: "2027-01-07T12:00:00Z", attribution: [] });

describe("On-demand trip geometry loading", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("does not fetch on mount, selection or repeated camera renders; fetches only on load", async () => {
    const fetchMock = vi.fn(async () => Response.json(answer(other)));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ selected }) => useTripMapGeometry(map.trip_id, selected), { initialProps: { selected: day } });
    rerender({ selected: other }); rerender({ selected: { ...other } });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { await result.current.load(); });
    expect(result.current.data).toEqual(answer(other));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hides old geometry immediately when endpoints/revision change", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(answer(day))));
    const { result, rerender } = renderHook(({ selected }) => useTripMapGeometry(map.trip_id, selected), { initialProps: { selected: day } });
    await act(async () => { await result.current.load(); });
    expect(result.current.data?.state).toBe("available");
    rerender({ selected: { ...day, revision: "new-revision" } });
    expect(result.current.data).toBeNull();
  });

  it("drops out-of-order responses, including a switch away and back to the same revision", async () => {
    const resolve: Array<(value: Response) => void> = [];
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>((finish) => resolve.push(finish)));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ selected }) => useTripMapGeometry(map.trip_id, selected), { initialProps: { selected: day } });
    let first!: Promise<void>, latest!: Promise<void>;
    act(() => { first = result.current.load(); });
    rerender({ selected: other }); rerender({ selected: day });
    act(() => { latest = result.current.load(); });
    await act(async () => { resolve[1](Response.json({ ...answer(day), calculated_at: "newest" })); await latest; });
    await act(async () => { resolve[0](Response.json({ ...answer(day), calculated_at: "older" })); await first; });
    expect(result.current.data).toMatchObject({ calculated_at: "newest" });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it.each([401, 404, 409, 503])("clears a line on an authorization, revision or provider error (%s)", async (status) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(answer(day))).mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useTripMapGeometry(map.trip_id, day));
    await act(async () => { await result.current.load(); });
    await act(async () => { await result.current.load(); });
    expect(result.current.data).toBeNull(); expect(result.current.error).toMatchObject({ status });
  });

  it("rejects a mismatched response revision and clears protected state when the trip is cleared", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...answer(day), revision: "old" })));
    const { result, rerender } = renderHook(({ tripId }) => useTripMapGeometry(tripId, day), { initialProps: { tripId: map.trip_id as string | null } });
    await act(async () => { await result.current.load(); });
    expect(result.current.data).toBeNull(); expect(result.current.error?.message).toContain("changed");
    rerender({ tripId: null });
    expect(result.current.data).toBeNull(); expect(result.current.error).toBeNull();
  });

  it("doesn't resurrect a protected snapshot when the same trip returns after access was cleared", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(answer(day))));
    const { result, rerender } = renderHook(({ tripId }) => useTripMapGeometry(tripId, day), { initialProps: { tripId: map.trip_id as string | null } });
    await act(async () => { await result.current.load(); });
    expect(result.current.data?.state).toBe("available");
    rerender({ tripId: null }); rerender({ tripId: map.trip_id });
    expect(result.current.data).toBeNull();
  });
});
