import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess } from "@/lib/trips";
import { TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { PATCH } from "./route";

vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn() }));
const hotel = { id: "40f9f55e-0e74-4c4a-923f-d7a3f92468a0", trip_id: TRIP.id, name: "Hotel", check_in: "2026-10-09", check_out: "2026-10-13", booking_status: "booked", created_at: TRIP.created_at };
const update = vi.fn();
const single = vi.fn();
const save = (body: unknown) => PATCH(new NextRequest("http://localhost/api/v1/trips/trip-1", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: TRIP.id }) });

describe("Trip date changes with saved accommodation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const fake = createFakeSupabase({ trip_stays: [hotel], trip_lodging_nights: [{ trip_id: TRIP.id, date: "2026-10-10", stay_id: hotel.id, status: "assigned" }] });
    const query = { update, eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single };
    update.mockReturnValue(query); single.mockResolvedValue({ data: { ...TRIP, end_date: "2026-10-11" }, error: null });
    const supabase = { from: (table: string) => table === "trips" ? query : fake.from(table) } as unknown as SupabaseClient;
    vi.mocked(requireTripAccess).mockResolvedValue({ supabase, userId: "user-1", trip: { ...TRIP, lodging_revision: 2 } });
  });
  it("previews shortened dates, preserved bookings and future origins without writing", async () => {
    const response = await save({ end_date: "2026-10-11", preview_lodging: true });
    expect(response.status).toBe(200);
    const preview = await response.json();
    expect(preview.lodging_after.stays[0]).toMatchObject({ booking_status: "booked", check_out: "2026-10-13", review_dates: ["2026-10-12"] });
    expect(preview.lodging_after.days[1]).toMatchObject({ starting_from: "Hotel" });
    expect(update).not.toHaveBeenCalled();
  });
  it("requires review before changing dates when stays exist", async () => {
    const response = await save({ end_date: "2026-10-11" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ lodging_revision: 2, lodging_after: { stays: [expect.objectContaining({ name: "Hotel" })] } });
    expect(update).not.toHaveBeenCalled();
  });
  it("accepts the reviewed lodging revision but rejects an older one", async () => {
    expect((await save({ end_date: "2026-10-11", lodging_revision: 1 })).status).toBe(409);
    expect(update).not.toHaveBeenCalled();
    expect((await save({ end_date: "2026-10-11", lodging_revision: 2 })).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ end_date: "2026-10-11" }));
  });
  it("rejects a competing change between preview and update", async () => {
    single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    expect((await save({ end_date: "2026-10-11", lodging_revision: 2 })).status).toBe(409);
  });
  it("doesn't require accommodation review for a name-only edit", async () => {
    expect((await save({ name: "Renamed" })).status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed" }));
  });
  it("rejects nonexistent calendar dates before loading stays or changing the trip", async () => {
    expect((await save({ end_date: "2026-02-30" })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
