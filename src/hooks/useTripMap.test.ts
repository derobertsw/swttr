import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tripMapFixture } from "@/test/tripMap";
import { useTripMap } from "./useTripMap";

const snapshot = await tripMapFixture();
afterEach(() => vi.unstubAllGlobals());

describe("Private trip map loading", () => {
  it("loads the saved projection without requesting geometry, and reloads on editor return", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(snapshot));
    vi.stubGlobal("fetch", fetcher);
    const { result, rerender } = renderHook(({ revision }) => useTripMap(snapshot.trip.id, revision), { initialProps: { revision: 1 } });
    await waitFor(() => expect(result.current.data).toEqual(snapshot));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/v1/trips/${snapshot.trip.id}/map`);
    rerender({ revision: 2 });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(fetcher.mock.calls.every((call) => !String(call[0]).includes("geometry"))).toBe(true);
  });

  it("drops late requests across a trip switch, including a switch away and back", async () => {
    const finish: Array<(value: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => finish.push(resolve))));
    const { result, rerender } = renderHook(({ id }) => useTripMap(id), { initialProps: { id: snapshot.trip.id as string | null } });
    rerender({ id: "other" }); rerender({ id: snapshot.trip.id });
    await act(async () => finish[2](Response.json({ ...snapshot, revision: "new" })));
    await act(async () => finish[0](Response.json(snapshot)));
    await act(async () => finish[1](Response.json({ ...snapshot, trip: { ...snapshot.trip, id: "other" } })));
    expect(result.current.data?.revision).toBe("new");
    rerender({ id: null });
    expect(result.current.data).toBeNull();
    rerender({ id: snapshot.trip.id });
    expect(result.current.data).toBeNull();
  });

  it.each([401, 403, 404])("clears protected places after access loss (%s)", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(snapshot)).mockResolvedValueOnce(Response.json({ error: "Access unavailable" }, { status })));
    const { result } = renderHook(() => useTripMap(snapshot.trip.id));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => result.current.refresh());
    expect(result.current.data).toBeNull(); expect(result.current.error).toMatchObject({ status });
  });

  it("preserves saved details on a transient failure and retries without persisting them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(snapshot)).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(Response.json({ ...snapshot, revision: "changed" })));
    const { result } = renderHook(() => useTripMap(snapshot.trip.id));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => result.current.refresh());
    expect(result.current.data).toEqual(snapshot); expect(result.current.error).not.toBeNull();
    await act(async () => result.current.refresh());
    expect(result.current.data?.revision).toBe("changed"); expect(result.current.error).toBeNull();
  });

  it("rejects a response belonging to another trip", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...snapshot, trip: { ...snapshot.trip, id: "foreign" } })));
    const { result } = renderHook(() => useTripMap(snapshot.trip.id));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.data).toBeNull();
  });
});
