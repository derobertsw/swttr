import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess } from "@/lib/trips";
import { ORGANIZER, STOWE_STOP, TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import type { TripItineraryPreview, TripLocation } from "@/types/trips";
import { POST } from "./route";

vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn() }));

const LOT: TripLocation = { label: "Mountain Road lot", address: "Mountain Road, Stowe, VT", latitude: 44.528, longitude: -72.7853, precision: "exact",
  time_zone: "America/New_York", source: "search", provider: "geoapify", provider_id: "51a8d6", attribution: "© OpenStreetMap contributors" };
// Saturday on the base (Stowe), Sunday at Jay Peak, Monday at Stowe.
const STOWE = { ...STOWE_STOP, id: "5b7f1f7e-3c52-4c39-9d0e-0a3c1f0b6a11", access_point: null };
const JAY = { ...STOWE_STOP, id: "2e4b8f1a-7c3d-4e5f-9a6b-1c2d3e4f5a66", position: 1, name: "Jay Peak", access_point: LOT };
const days = [
  { id: "day-10", trip_id: TRIP.id, date: "2026-10-10", stop_id: null, activity: null, access_point: null, access_point_stop_id: null },
  { id: "day-11", trip_id: TRIP.id, date: "2026-10-11", stop_id: JAY.id, activity: null, access_point: null, access_point_stop_id: null },
  { id: "day-12", trip_id: TRIP.id, date: "2026-10-12", stop_id: STOWE.id, activity: null, access_point: null, access_point_stop_id: null },
];
const rpc = vi.fn();
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/v1/trips/trip-1/access-points", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: TRIP.id }) });
const previewOf = async (body: object) => await (await post({ action: "set_access_point", ...body, preview: true })).json() as TripItineraryPreview;

describe("Reviewing and saving access points", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tables = { trips: [TRIP], trip_stops: [STOWE, JAY], trip_members: [ORGANIZER], trip_days: structuredClone(days), trip_member_day_kits: [], trip_group_gear: [], trip_stays: [], trip_lodging_nights: [] };
    const supabase = { ...createFakeSupabase(tables as unknown as Parameters<typeof createFakeSupabase>[0]), rpc } as unknown as SupabaseClient;
    vi.mocked(requireTripAccess).mockResolvedValue({ supabase, userId: "user-1", trip: TRIP });
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("previews only this day or every day at its stop, with their dates, for the organizer only", async () => {
    const preview = await previewOf({ date: "2026-10-10", location: LOT });
    expect(requireTripAccess).toHaveBeenCalledWith(TRIP.id, { organizerOnly: true });
    expect(preview.options).toEqual([
      expect.objectContaining({ key: "day", label: "Only Sat Oct 10", changes: [expect.objectContaining({ date: "2026-10-10", after: "Mountain Road lot · this day only" })] }),
      expect.objectContaining({ key: "stop", label: "All days at Stowe, Vermont (2 days)", detail: "Sat Oct 10 and Mon Oct 12.", unchanged: 0 }),
    ]);
    expect(preview.options[1].payload).toEqual({
      date: "2026-10-10", scope: "stop", location: LOT,
      expected: { stop_id: STOWE.id, point: null, days: [{ date: "2026-10-10", point: null }, { date: "2026-10-12", point: null }] },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses members and anyone else as requireTripAccess does", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Organizer only" }, { status: 403 }));
    expect((await post({ action: "set_access_point", date: "2026-10-10", location: LOT, preview: true })).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a change it can't review", async () => {
    expect(await (await post({ preview: true, date: "2026-10-10", location: { ...LOT, latitude: 0, longitude: 0 } })).json()).toMatchObject({ field: "location" });
    expect((await post({ preview: true, date: "2026-10-10" })).status).toBe(400);
    expect((await post({ preview: true, date: "2026-10-13", location: LOT })).status).toBe(404);
    expect(await (await post({ preview: true, date: "2026-10-10", location: null })).json()).toEqual({ error: "This day has no access point to remove." });
    expect((await post({ date: "2026-10-11", scope: "everywhere", location: LOT, expected: { stop_id: JAY.id, point: LOT, days: [] } })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves the chosen option rebuilt from its checked fields", async () => {
    const [option] = (await previewOf({ date: "2026-10-11", location: null })).options;
    expect(option).toMatchObject({ label: "Only Sun Oct 11", changes: [{ before: "Mountain Road lot", after: "Not set" }] });
    const response = await post({ action: "set_access_point", ...option.payload, extra: "ignored" });
    expect(await response.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("set_trip_access_point", {
      p_trip_id: TRIP.id, p_user_id: "user-1",
      p_payload: { date: "2026-10-11", scope: "stop", location: null, expected: { stop_id: JAY.id, point: LOT, days: [{ date: "2026-10-11", point: null }] } },
    });
  });

  it.each(["40001", "PT409"])("returns the current review when the trip changed since, and says when the database isn't ready (%s)", async (code) => {
    const [, everyDay] = (await previewOf({ date: "2026-10-10", location: LOT })).options;
    rpc.mockResolvedValueOnce({ data: null, error: { code } });
    const stale = await post({ action: "set_access_point", ...everyDay.payload });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: "The trip changed since you reviewed it. Review the access point again.", options: [{ key: "day" }, { key: "stop" }] });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    const missing = await post({ action: "set_access_point", ...everyDay.payload });
    expect(missing.status).toBe(503);
    expect(await missing.json()).toEqual({ error: "Access points can't be saved yet. Try again later.", field: "location" });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "secret detail" } });
    expect(await (await post({ action: "set_access_point", ...everyDay.payload })).json()).toEqual({ error: "Couldn't save the access point. Nothing was changed; try again." });
  });
});
