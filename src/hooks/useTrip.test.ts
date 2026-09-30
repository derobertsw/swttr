import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { TRIP, fakeTripApi, reply, tripFull } from "@/test/tripApi";
import { useTrip } from "./useTrip";

/**
 * Trip loads that each wait for the test to answer them, so they can finish
 * in any order. Loads are numbered in the order they started.
 */
function heldLoads() {
  const answers: Array<(snapshot: ReturnType<typeof reply>) => void> = [];
  const fetchMock = fakeTripApi({
    "GET /api/v1/trips/trip-1": () => new Promise((resolve) => answers.push(resolve)),
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    /** Finishes load `index` with a trip snapshot named `name`. */
    finish: (index: number, name: string) =>
      act(async () => answers[index](reply(200, tripFull({ trip: { ...TRIP, name } })))),
  };
}

describe("useTrip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the newest reload when an older one finishes last", async () => {
    const loads = heldLoads();
    const { result } = renderHook(() => useTrip(TRIP.id));
    await loads.finish(0, "Initial");

    let reloads: Promise<void>[] = [];
    act(() => {
      reloads = [result.current.refresh(), result.current.refresh()];
    });
    await loads.finish(2, "After both saves");
    await loads.finish(1, "After the first save");
    await act(async () => {
      await Promise.all(reloads);
    });

    expect(result.current.data?.trip.name).toBe("After both saves");
    expect(result.current.loading).toBe(false);
  });

  it("finishes an older reload only once the newest one has loaded", async () => {
    const loads = heldLoads();
    const { result } = renderHook(() => useTrip(TRIP.id));
    await loads.finish(0, "Initial");

    let olderDone = false;
    act(() => {
      void result.current.refresh().then(() => {
        olderDone = true;
      });
      void result.current.refresh();
    });

    await loads.finish(1, "After the first save");
    expect(olderDone).toBe(false);
    expect(result.current.data?.trip.name).toBe("Initial");
    expect(result.current.loading).toBe(true);

    await loads.finish(2, "After both saves");
    await waitFor(() => expect(olderDone).toBe(true));
    expect(result.current.data?.trip.name).toBe("After both saves");
  });

  it("drops a load still running when the trip is cleared", async () => {
    const loads = heldLoads();
    const { result, rerender } = renderHook(({ tripId }) => useTrip(tripId), {
      initialProps: { tripId: TRIP.id as string | null },
    });

    rerender({ tripId: null });
    await loads.finish(0, "The previous trip");

    expect(result.current.data).toBeNull();
  });

  it("drops a reload still running when the trip is cleared", async () => {
    const loads = heldLoads();
    const { result, rerender } = renderHook(({ tripId }) => useTrip(tripId), {
      initialProps: { tripId: TRIP.id as string | null },
    });
    await loads.finish(0, "Initial");

    act(() => {
      void result.current.refresh();
    });
    rerender({ tripId: null });
    await loads.finish(1, "The previous trip, reloaded");

    expect(result.current.data?.trip.name).toBe("Initial");
  });
});
