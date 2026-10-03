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
const assignSelect = vi.fn();
const update = vi.fn();
const assignEq = vi.fn();
const save = (body: unknown) => PATCH(new NextRequest("http://localhost/api/v1/trips/trip-1/stops/stop-stowe", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: TRIP.id, stopId: STOWE_STOP.id }) });

describe("Scoped stop assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const stopQuery = { update, eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single };
    update.mockReturnValue(stopQuery); single.mockResolvedValue({ data: STOWE_STOP, error: null });
    const dayQuery = { update: vi.fn().mockReturnThis(), eq: assignEq, in: assign, select: assignSelect };
    assignEq.mockReturnValue(dayQuery); assign.mockReturnValue(dayQuery); assignSelect.mockResolvedValue({ data: [{ date: "2026-10-11" }], error: null });
    from.mockImplementation((table) => table === "trip_stops" ? stopQuery : dayQuery);
    vi.mocked(requireTripAccess).mockResolvedValue({ trip: TRIP, userId: "user-1", supabase: { from } as unknown as SupabaseClient });
  });
  it("assigns only the selected dates within the authorized trip", async () => {
    expect((await save({ activities: ["Alpine"], day_dates: ["2026-10-11"] })).status).toBe(200);
    expect(assignEq).toHaveBeenCalledWith("trip_id", "trip-1"); expect(assign).toHaveBeenCalledWith("date", ["2026-10-11"]);
  });
  it("reports a failed day assignment instead of claiming the whole save succeeded", async () => {
    assignSelect.mockResolvedValue({ error: { message: "Save failed" } });
    const response = await save({ day_dates: ["2026-10-11"] }); expect(response.status).toBe(500); expect(await response.json()).toMatchObject({ error: expect.stringContaining("Stop details saved, but day assignments failed") });
  });
  it.each([{ data: [] }, { data: [{ date: "2026-10-11" }] }])("reports missing requested day rows instead of claiming success (%#)", async ({ data }) => {
    assignSelect.mockResolvedValue({ data, error: null });
    const response = await save({ day_dates: ["2026-10-10", "2026-10-11"] });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("some selected days are missing") });
  });
  it("accepts repeated dates without treating them as missing rows", async () => {
    expect((await save({ day_dates: ["2026-10-11", "2026-10-11"] })).status).toBe(200);
    expect(assign).toHaveBeenCalledWith("date", ["2026-10-11"]);
  });
  it("rejects dates outside the trip before making any changes", async () => {
    expect((await save({ day_dates: ["2026-10-09"] })).status).toBe(400); expect(from).not.toHaveBeenCalled();
  });
  it("leaves day assignments untouched when saving only stop details", async () => {
    expect((await save({ activities: ["Hike"], day_dates: [] })).status).toBe(200); expect(assign).not.toHaveBeenCalled();
  });
});
