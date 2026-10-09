import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess } from "@/lib/trips";
import { ORGANIZER, SAM, STOWE_STOP, TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import type { TripDateChangePreview } from "@/types/trips";
import { PATCH } from "./route";

vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn() }));

// Saturday–Monday: Saturday touring at Stowe, Sunday at Jay Peak, Monday on
// the base with Sam's kit on it. A booked hotel covers Saturday to Tuesday.
const JAY = { ...STOWE_STOP, id: "stop-jay", position: 1, name: "Jay Peak" };
const days = [
  { id: "day-10", trip_id: TRIP.id, date: "2026-10-10", stop_id: STOWE_STOP.id, activity: "Ski touring" },
  { id: "day-11", trip_id: TRIP.id, date: "2026-10-11", stop_id: JAY.id, activity: null },
  { id: "day-12", trip_id: TRIP.id, date: "2026-10-12", stop_id: null, activity: null },
];
const samKit = { id: "kit-sam", trip_day_id: "day-12", trip_member_id: SAM.id, effort: "steady", items: [], note: null, state: "ok", updated_at: TRIP.updated_at };
const hotel = { id: "40f9f55e-0e74-4c4a-923f-d7a3f92468a0", trip_id: TRIP.id, name: "Hotel", check_in: "2026-10-10", check_out: "2026-10-13", booking_status: "booked", created_at: TRIP.created_at };
const rpc = vi.fn();
const save = (body: unknown) => PATCH(new NextRequest("http://localhost/api/v1/trips/trip-1", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: TRIP.id }) });
let tables: ReturnType<typeof tablesWith>;
const tablesWith = (lodging: boolean) => ({
  trips: [{ ...TRIP, lodging_revision: 2 }], trip_stops: [STOWE_STOP, JAY], trip_members: [ORGANIZER, SAM],
  trip_days: structuredClone(days), trip_member_day_kits: [samKit], trip_group_gear: [],
  trip_stays: lodging ? [hotel] : [], trip_lodging_nights: lodging ? [{ trip_id: TRIP.id, date: "2026-10-10", stay_id: hotel.id, status: "assigned" }] : [],
});
const useTables = (lodging = false) => {
  tables = tablesWith(lodging);
  const supabase = { ...createFakeSupabase(tables as unknown as Parameters<typeof createFakeSupabase>[0]), rpc } as unknown as SupabaseClient;
  vi.mocked(requireTripAccess).mockResolvedValue({ supabase, userId: "user-1", trip: { ...TRIP, lodging_revision: 2 } });
};

describe("Changing a trip's name and dates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTables();
    rpc.mockResolvedValue({ data: { trip: { ...TRIP, start_date: "2026-10-17", end_date: "2026-10-19" }, changed: true }, error: null });
  });

  it("renames the trip without a date review, and lets any trip member do it", async () => {
    const response = await save({ name: "  Leaf peeping " });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ trip: { name: "Leaf peeping" } });
    expect(tables.trips[0].name).toBe("Leaf peeping");
    expect(rpc).not.toHaveBeenCalled();
    expect(requireTripAccess).toHaveBeenCalledWith(TRIP.id);
  });

  it("names the field to fix before loading or changing anything", async () => {
    expect(await (await save({ name: " " })).json()).toMatchObject({ field: "name" });
    expect(await (await save({ end_date: "2026-02-30" })).json()).toMatchObject({ field: "end_date" });
    expect(await (await save({ start_date: "2026-10-13", end_date: "2026-10-12" })).json()).toMatchObject({ field: "end_date" });
    expect((await save({ end_date: "2027-10-12" })).status).toBe(400);
    expect(tables.trips[0].name).toBe(TRIP.name);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("previews a shorter trip: the removed day, whose kits go with it, and the stays kept", async () => {
    useTables(true);
    const response = await save({ end_date: "2026-10-11", preview: true });
    const preview = await response.json() as TripDateChangePreview;
    expect(preview.plans.move).toBeUndefined();
    expect(preview.plans.keep).toMatchObject({
      kept: 2, moved: [], added: [],
      removed: [{ date: "2026-10-12", date_label: "Mon Oct 12", destination: "Stowe, Vermont (base)", activity: null, kits: ["Sam"] }],
      expected_removed: [{ date: "2026-10-12", stop_id: null, activity: null, kit_ids: ["kit-sam"] }],
    });
    expect(preview.lodging_after.stays[0]).toMatchObject({ booking_status: "booked", review_dates: ["2026-10-12"] });
    expect(preview).toMatchObject({ lodging_revision: 2, from: { label: "Sat Oct 10 – Mon Oct 12 · 3 days" }, to: { label: "Sat Oct 10 – Sun Oct 11 · 2 days" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("offers moving the plan when the trip keeps its length", async () => {
    const preview = await (await save({ start_date: "2026-10-11", end_date: "2026-10-13", preview: true })).json() as TripDateChangePreview;
    expect(preview.plans.move).toMatchObject({
      kept: 0, removed: [], added: [], expected_removed: [],
      moved: [
        { date: "2026-10-11", from_date_label: "Sat Oct 10", destination: "Stowe, Vermont", activity: "Ski touring", kits: [] },
        { date: "2026-10-12", from_date_label: "Sun Oct 11", destination: "Jay Peak" },
        { date: "2026-10-13", from_date_label: "Mon Oct 12", kits: ["Sam"] },
      ],
    });
    // Keeping instead drops Saturday and adds Tuesday with Monday's destination.
    expect(preview.plans.keep).toMatchObject({
      kept: 2,
      removed: [{ date: "2026-10-10", activity: "Ski touring" }],
      added: [{ date: "2026-10-13", destination: "Stowe, Vermont (base)", activity: null, kits: [] }],
    });
  });

  it("gives an added day the nearest day's destination", async () => {
    const preview = await (await save({ start_date: "2026-10-08", preview: true })).json() as TripDateChangePreview;
    expect(preview.plans.keep.added.map((day) => [day.date, day.destination])).toEqual([["2026-10-08", "Stowe, Vermont"], ["2026-10-09", "Stowe, Vermont"]]);
  });

  it("asks which way to change the plan before moving dates of the same length", async () => {
    const response = await save({ start_date: "2026-10-17", end_date: "2026-10-19" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "Choose whether to move the plan or keep it on its dates.", plans: { move: expect.any(Object) } });
    expect((await save({ end_date: "2026-10-13", mode: "move" })).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends the reviewed change to the transaction with the server's status", async () => {
    const expected = [{ date: "2026-10-12", stop_id: null, activity: null, kit_ids: ["kit-sam"] }];
    const response = await save({ name: "Long weekend", end_date: "2026-10-11", mode: "keep", lodging_revision: 2, expected_removed: expected, from: { start_date: "2026-10-10", end_date: "2026-10-12" } });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("change_trip_dates", {
      p_trip_id: TRIP.id, p_user_id: "user-1", p_from_start: "2026-10-10", p_from_end: "2026-10-12",
      p_start: "2026-10-10", p_end: "2026-10-11", p_mode: "keep", p_status: expect.any(String),
      p_name: "Long weekend", p_lodging_revision: 2, p_expected_removed: expected,
    });
  });

  it("returns the current preview when the trip changed after the review", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "Days to remove changed." } });
    const response = await save({ end_date: "2026-10-11", mode: "keep", expected_removed: [] });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "The trip changed since you reviewed it. Review the changes again.",
      plans: { keep: { expected_removed: [{ date: "2026-10-12", kit_ids: ["kit-sam"] }] } },
    });
  });

  it("reports a trip the user can no longer reach as not found, and a failed save as unchanged", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Not found" } });
    expect((await save({ end_date: "2026-10-13" })).status).toBe(404);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    const failed = await save({ end_date: "2026-10-13" });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "Couldn't change the dates. Nothing was changed; try again." });
  });

  it("rejects a malformed review before calling the transaction", async () => {
    expect((await save({ end_date: "2026-10-13", expected_removed: "all" })).status).toBe(400);
    expect((await save({ end_date: "2026-10-13", lodging_revision: "2" })).status).toBe(400);
    expect((await save({ end_date: "2026-10-13", from: { start_date: "soon" } })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
