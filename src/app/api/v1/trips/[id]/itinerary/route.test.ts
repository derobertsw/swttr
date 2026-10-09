import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess } from "@/lib/trips";
import { ORGANIZER, STOWE_STOP, TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import type { TripItineraryPreview } from "@/types/trips";
import { POST } from "./route";

vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn() }));

// Saturday–Monday: Saturday on the base (Stowe) touring, Sunday at Jay Peak,
// Monday at Stowe.
const STOWE = { ...STOWE_STOP, id: "5b7f1f7e-3c52-4c39-9d0e-0a3c1f0b6a11" };
const JAY = { ...STOWE_STOP, id: "2e4b8f1a-7c3d-4e5f-9a6b-1c2d3e4f5a66", position: 1, name: "Jay Peak" };
const days = [
  { id: "day-10", trip_id: TRIP.id, date: "2026-10-10", stop_id: null, activity: "Ski touring" },
  { id: "day-11", trip_id: TRIP.id, date: "2026-10-11", stop_id: JAY.id, activity: null },
  { id: "day-12", trip_id: TRIP.id, date: "2026-10-12", stop_id: STOWE.id, activity: null },
];
const BURLINGTON = { name: "Burlington, Vermont", latitude: 44.48, longitude: -73.21 };
const rpc = vi.fn();
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/v1/trips/trip-1/itinerary", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: TRIP.id }) });
const previewOf = async (body: object) => await (await post({ ...body, preview: true })).json() as TripItineraryPreview;

describe("Reviewing and saving itinerary changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tables = { trips: [TRIP], trip_stops: [STOWE, JAY], trip_members: [ORGANIZER], trip_days: structuredClone(days), trip_member_day_kits: [], trip_group_gear: [], trip_stays: [], trip_lodging_nights: [] };
    const supabase = { ...createFakeSupabase(tables as unknown as Parameters<typeof createFakeSupabase>[0]), rpc } as unknown as SupabaseClient;
    vi.mocked(requireTripAccess).mockResolvedValue({ supabase, userId: "user-2", trip: TRIP });
    rpc.mockResolvedValue({ data: { action: "assign_days" }, error: null });
  });

  it("previews removing the base: its own and inherited days go to the stop chosen, for any trip member", async () => {
    const preview = await previewOf({ action: "remove_stop", stop_id: STOWE.id });
    expect(preview.options).toEqual([{
      key: JAY.id, label: "Jay Peak", detail: null, unchanged: 1,
      changes: [
        { date: "2026-10-10", date_label: "Sat Oct 10", before: "Stowe, Vermont (base) · Ski touring", after: "Jay Peak · Ski touring" },
        { date: "2026-10-12", date_label: "Mon Oct 12", before: "Stowe, Vermont · No activity", after: "Jay Peak · No activity" },
      ],
      payload: { stop_id: STOWE.id, reassign_to: JAY.id, expected: ["2026-10-10", "2026-10-12"] },
    }]);
    expect(requireTripAccess).toHaveBeenCalledWith(TRIP.id);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("previews a new place for one day or for every day at its stop, with the exact dates", async () => {
    const preview = await previewOf({ action: "set_day_place", date: "2026-10-10", place: BURLINGTON });
    expect(preview.options.map(({ key, label, changes }) => [key, label, changes.map((change) => change.date)])).toEqual([
      ["day", "Only Sat Oct 10", ["2026-10-10"]],
      ["stop", "Every day at Stowe, Vermont (2 days)", ["2026-10-10", "2026-10-12"]],
    ]);
    expect(preview.options[1].changes[0].after).toBe("Burlington, Vermont (base) · Ski touring");
    // Jay Peak serves only Sunday, so moving it is the one choice.
    const sunday = await previewOf({ action: "set_day_place", date: "2026-10-11", place: BURLINGTON });
    expect(sunday.options).toMatchObject([{ key: "stop", label: "Only Sun Oct 11", payload: { scope: "stop", expected: { stop_id: JAY.id, stop: { name: "Jay Peak" }, dates: ["2026-10-11"] } } }]);
  });

  it("previews assigning several days, including clearing their activity", async () => {
    const preview = await previewOf({ action: "assign_days", dates: ["2026-10-12", "2026-10-10"], stop_id: JAY.id, activity: null });
    expect(preview.options).toMatchObject([{
      label: "Jay Peak and No activity for 2 days", unchanged: 1,
      changes: [{ date: "2026-10-10", after: "Jay Peak · No activity" }, { date: "2026-10-12", after: "Jay Peak · No activity" }],
      payload: { dates: ["2026-10-10", "2026-10-12"], stop_id: JAY.id, activity: null, expected: [
        { date: "2026-10-10", stop_id: null, activity: "Ski touring" }, { date: "2026-10-12", stop_id: STOWE.id, activity: null },
      ] },
    }]);
  });

  it("rejects a change it can't review", async () => {
    expect((await post({ preview: true, action: "rename_trip" })).status).toBe(400);
    expect(await (await post({ preview: true, action: "assign_days", dates: ["2026-10-10"] })).json()).toEqual({ error: "Choose a destination or an activity." });
    expect((await post({ preview: true, action: "assign_days", dates: ["2026-10-13"], activity: null })).status).toBe(400);
    expect((await post({ preview: true, action: "remove_stop", stop_id: "stop-gone" })).status).toBe(404);
    expect((await post({ preview: true, action: "set_day_place", date: "2026-10-10", place: { name: "Nowhere" } })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves the chosen option with only its validated fields", async () => {
    const response = await post({
      action: "assign_days", dates: ["2026-10-11"], activity: " Hiking ", owner_user_id: "user-9",
      expected: [{ date: "2026-10-11", stop_id: JAY.id.toUpperCase(), activity: null, extra: true }],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("edit_trip_itinerary", {
      p_trip_id: TRIP.id, p_user_id: "user-2", p_action: "assign_days",
      p_payload: { dates: ["2026-10-11"], activity: "Hiking", expected: [{ date: "2026-10-11", stop_id: JAY.id, activity: null }] },
    });
  });

  it("rejects a malformed save before calling the transaction", async () => {
    expect((await post({ action: "remove_stop", stop_id: "stop-stowe", reassign_to: JAY.id, expected: [] })).status).toBe(400);
    expect((await post({ action: "reorder_stops", order: [JAY.id, STOWE.id] })).status).toBe(400);
    expect((await post({ action: "assign_days", dates: ["2026-10-11"], expected: [] })).status).toBe(400);
    expect((await post({ action: "set_day_place", date: "2026-10-11", place: BURLINGTON, scope: "trip", expected: { stop_id: null, stop: null, dates: [] } })).status).toBe(400);
    // A day's stop is checked with the place the review showed for it.
    expect((await post({ action: "set_day_place", date: "2026-10-11", place: BURLINGTON, scope: "stop", expected: { stop_id: JAY.id, dates: ["2026-10-11"] } })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the current review when the trip changed after the review", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "Days at this stop changed." } });
    const response = await post({ action: "remove_stop", stop_id: STOWE.id, reassign_to: JAY.id, expected: ["2026-10-10"] });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "The trip changed since you reviewed it. Review the changes again.",
      options: [{ key: JAY.id, payload: { expected: ["2026-10-10", "2026-10-12"] } }],
    });
  });

  it.each([
    ["42501", 404, "Not found"],
    ["P0002", 404, "That stop or day isn't on this trip anymore. Reload the trip."],
    ["22023", 400, "Check the change and try again."],
    ["XX000", 500, "Couldn't save the change. Nothing was changed; try again."],
  ])("reports a %s error as %i", async (code, status, error) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "boom" } });
    const response = await post({ action: "reorder_stops", order: [JAY.id, STOWE.id], expected: [STOWE.id, JAY.id] });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });
});
