import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess } from "@/lib/trips";
import { STOWE_STOP, TRIP } from "@/test/tripApi";
import { PATCH } from "./route";
vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn() }));
const from = vi.fn();
const single = vi.fn();
const assign = vi.fn();
const update = vi.fn();
const save = (body: unknown) => PATCH(new NextRequest("http://localhost/api/v1/trips/trip-1/stops/stop-stowe", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: TRIP.id, stopId: STOWE_STOP.id }) });

describe("Saving a stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const stopQuery = { update, eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single };
    update.mockReturnValue(stopQuery); single.mockResolvedValue({ data: STOWE_STOP, error: null });
    from.mockImplementation((table) => table === "trip_stops" ? stopQuery : { update: assign });
    vi.mocked(requireTripAccess).mockResolvedValue({ trip: TRIP, userId: "user-1", supabase: { from } as unknown as SupabaseClient });
  });
  it("saves the stop's activities without touching any day", async () => {
    expect((await save({ activities: ["Alpine"] })).status).toBe(200);
    expect(update).toHaveBeenCalledWith({ activities: ["Alpine"] });
    expect(from).not.toHaveBeenCalledWith("trip_days");
  });
  it.each([[["2026-10-11"]], [[]]])("refuses day assignments, which go through the itinerary review, before any change (%#)", async (dayDates) => {
    const response = await save({ activities: ["Alpine"], day_dates: dayDates });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("itinerary review") });
    expect(from).not.toHaveBeenCalled();
  });
});
