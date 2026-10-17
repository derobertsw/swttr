// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess } from "@/lib/trips";
import { driveTrip, place } from "@/test/driveTrip";
import { PUT } from "./route";

vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn() }));

const full = driveTrip();
const CABIN = place("Ridge cabin", 44.51, -72.75);
const STAY = "40f9f55e-0e74-4c4a-923f-d7a3f92468a0";
const NONE = { origin: null, origin_stay_id: null, no_drive: false };
const rpc = vi.fn();
const put = (body: unknown, date = "2027-01-08") => PUT(
  new Request(`http://localhost/api/v1/trips/trip-drive/days/${date}/origin`, { method: "PUT", body: JSON.stringify(body) }),
  { params: Promise.resolve({ id: full.trip.id, date }) });

describe("Saving a day's starting point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTripAccess).mockResolvedValue({ supabase: { rpc } as unknown as SupabaseClient, userId: "user-1", trip: full.trip });
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("saves a saved stay, any place or the crew stay again, with No drive planned, for the organizer only", async () => {
    expect((await put({ origin: { stay_id: STAY.toUpperCase() }, no_drive: false, expected: NONE })).status).toBe(200);
    expect(requireTripAccess).toHaveBeenCalledWith(full.trip.id, { organizerOnly: true });
    expect(rpc).toHaveBeenLastCalledWith("set_trip_day_origin", {
      p_trip_id: full.trip.id, p_user_id: "user-1", p_payload: { date: "2027-01-08", origin: { stay_id: STAY }, no_drive: false, expected: NONE },
    });
    await put({ origin: { location: { ...CABIN, extra: "dropped" } }, no_drive: true, expected: NONE });
    expect(rpc.mock.lastCall![1].p_payload).toMatchObject({ origin: { location: CABIN }, no_drive: true });
    expect(rpc.mock.lastCall![1].p_payload.origin.location).not.toHaveProperty("extra");
    const seen = { origin: CABIN, origin_stay_id: null, no_drive: true };
    await put({ origin: null, no_drive: true, expected: seen });
    expect(rpc.mock.lastCall![1].p_payload).toEqual({ date: "2027-01-08", origin: null, no_drive: true, expected: seen });
  });
  it("refuses members as requireTripAccess does", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Organizer only" }, { status: 403 }));
    expect((await put({ origin: null, no_drive: false, expected: NONE })).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a change it can't save, naming the place when that's the problem", async () => {
    expect(await (await put({ origin: { location: { ...CABIN, latitude: 0, longitude: 0 } }, no_drive: false, expected: NONE })).json()).toMatchObject({ field: "origin" });
    for (const body of [
      { origin: { stay_id: "motel" }, no_drive: false, expected: NONE },
      { origin: "Ridge cabin", no_drive: false, expected: NONE },
      { origin: null, expected: NONE },
      { origin: null, no_drive: false },
      { origin: null, no_drive: false, expected: { ...NONE, origin_stay_id: "motel" } },
    ]) expect((await put(body)).status).toBe(400);
    expect((await put({ origin: null, no_drive: false, expected: NONE }, "2027-02-30")).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["40001", 409, "The starting point changed since you opened this. Check it, then try again."],
    ["PGRST202", 503, "Starting points can't be saved yet. Try again later."],
    ["P0002", 404, "This day isn't on the trip anymore. Reload the trip."],
    ["22023", 400, "Check the starting point and try again."],
    ["XX000", 500, "Couldn't save the starting point. Nothing was changed; try again."],
  ])("answers a %s from the database with %i", async (code, status, error) => {
    rpc.mockResolvedValue({ data: null, error: { code } });
    const response = await put({ origin: null, no_drive: false, expected: NONE });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error });
  });
});
