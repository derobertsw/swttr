// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { drivePlans } from "@/lib/trip-drive";
import { driveTrip, MOTEL, SMUGGS_LOT as SMUGGS, splitDriveTrip, SPRUCE_LOT, VILLAGE_PLACE } from "@/test/driveTrip";
import { DELETE, PATCH, PUT } from "./route";

vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn(), loadTripFull: vi.fn() }));

const SAT = "2027-01-09", SUN = "2027-01-10";
const PAIR = `drive|${MOTEL.latitude},${MOTEL.longitude}>${SPRUCE_LOT.latitude},${SPRUCE_LOT.longitude}`;
const ENTERED = "2027-01-04T12:00:00.000000+00:00";
const none = (date: string, pair = PAIR) => ({ date, pair_key: pair, entered_at: null, use_calculated: null });
const rpc = vi.fn();
const call = (handler: typeof PUT, method: string, body: unknown, date = SAT) => handler(
  new Request(`http://localhost/api/v1/trips/trip-drive/days/${date}/drive-estimate`, { method, body: JSON.stringify(body) }),
  { params: Promise.resolve({ id: "trip-drive", date }) });
const save = (body: Record<string, unknown>, date = SAT) =>
  call(PUT, "PUT", { pair_key: PAIR, duration_seconds: 2400, note: " Resort directions page ", dates: [date], expected: [none(date)], ...body }, date);

describe("Saving your own drive estimate", () => {
  let full = driveTrip();
  beforeEach(() => {
    vi.clearAllMocks();
    full = driveTrip();
    // Sunday drives from the motel to Spruce Peak lot too.
    full.stops[1] = { ...full.stops[1], access_point: SPRUCE_LOT };
    vi.mocked(requireTripAccess).mockResolvedValue({ supabase: { rpc } as unknown as SupabaseClient, userId: "user-1", trip: full.trip });
    vi.mocked(loadTripFull).mockImplementation(async () => full);
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("saves it for the days with the drive the organizer saw, labeled by the server", async () => {
    const response = await save({ dates: [SAT, SUN], expected: [none(SAT), none(SUN)] });
    expect(response.status).toBe(200);
    expect(requireTripAccess).toHaveBeenCalledWith("trip-drive", { organizerOnly: true });
    expect(rpc).toHaveBeenCalledWith("set_trip_drive_pair_estimate", {
      p_trip_id: "trip-drive", p_user_id: "user-1", p_action: "save",
      p_payload: {
        estimate: { pair_key: PAIR, origin_label: "Stowe Motel", destination_label: "Spruce Peak lot", duration_seconds: 2400, note: "Resort directions page" },
        dates: [SAT, SUN], clear: [], expected: [none(SAT), none(SUN)],
      },
    });
  });
  it("refuses a drive that changed since, before touching the database", async () => {
    full.stops[0] = { ...full.stops[0], access_point: SMUGGS };
    const response = await save({});
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Your estimate or this day's drive changed since you opened it. Check it, then try again." });
    // A day with another drive can't share it either.
    full = driveTrip();
    expect((await save({ dates: [SAT, SUN], expected: [none(SAT), none(SUN)] })).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("removes it from the days that shared it, and chooses the calculated estimate on one day", async () => {
    const seen = [SAT, SUN].map((date) => ({ date, pair_key: PAIR, entered_at: ENTERED, use_calculated: false }));
    expect((await call(DELETE, "DELETE", { pair_key: PAIR, dates: [SAT, SUN], expected: seen })).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("set_trip_drive_pair_estimate", expect.objectContaining({ p_action: "remove", p_payload: { pair_key: PAIR, dates: [SAT, SUN], expected: seen } }));
    expect((await call(PATCH, "PATCH", { pair_key: PAIR, use_calculated: true, expected: seen })).status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("set_trip_drive_pair_estimate", expect.objectContaining({
      p_action: "prefer", p_payload: { pair_key: PAIR, use_calculated: true, expected: [seen[0]], dates: [SAT] },
    }));
    expect(loadTripFull).not.toHaveBeenCalled();
  });
  it("saves one for another departure's drive, replacing an estimate for a drive the day no longer has (#333)", async () => {
    full = splitDriveTrip();
    vi.mocked(requireTripAccess).mockResolvedValue({ supabase: { rpc } as unknown as SupabaseClient, userId: "user-1", trip: full.trip });
    const saturday = "2026-10-10";
    const hotel = `drive|${VILLAGE_PLACE.latitude},${VILLAGE_PLACE.longitude}>${SPRUCE_LOT.latitude},${SPRUCE_LOT.longitude}`;
    const earlier = { date: saturday, pair_key: "drive|1,1>2,2" };
    const response = await save({ pair_key: hotel, dates: [saturday], clear: [earlier],
      expected: [none(saturday, hotel), { ...earlier, entered_at: ENTERED, use_calculated: false }] }, saturday);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_trip_drive_pair_estimate", expect.objectContaining({ p_action: "save", p_payload: expect.objectContaining({
      estimate: expect.objectContaining({ pair_key: hotel, origin_label: "Village hotel", destination_label: "Spruce Peak lot" }), clear: [earlier],
    }) }));
    // The crew's drive is still there too, but not on a day nobody drives it.
    expect(drivePlans(full).find((plan) => plan.date === saturday)?.pair_key).not.toBe(hotel);
    expect((await save({ pair_key: hotel, dates: ["2026-10-12"], expected: [none("2026-10-12", hotel)] }, "2026-10-12")).status).toBe(409);
  });
  it("refuses members as requireTripAccess does", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Organizer only" }, { status: 403 }));
    expect((await save({})).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects what it can't save, naming the field", async () => {
    expect(await (await save({ duration_seconds: 0 })).json()).toMatchObject({ field: "duration" });
    expect(await (await save({ duration_seconds: 90 })).json()).toMatchObject({ field: "duration" });
    expect(await (await save({ duration_seconds: 86_460 })).json()).toMatchObject({ field: "duration" });
    expect(await (await save({ note: "x".repeat(201) })).json()).toMatchObject({ field: "note" });
    for (const body of [
      { dates: [SUN], expected: [none(SUN)] },
      { dates: [SAT, SAT], expected: [none(SAT)] },
      { clear: [{ date: SAT, pair_key: PAIR }] },
      { clear: [SUN], expected: [none(SAT), none(SUN)] },
      { expected: [] },
      { expected: [{ date: SAT, entered_at: null, use_calculated: null }] },
      { expected: [none(SAT, "drive|other")] },
      { expected: [{ ...none(SAT), entered_at: "yesterday", use_calculated: false }] },
      { expected: [{ ...none(SAT), entered_at: ENTERED, use_calculated: null }] },
      { pair_key: "" },
    ]) expect((await save(body)).status).toBe(400);
    expect((await call(PATCH, "PATCH", { pair_key: PAIR, use_calculated: "yes", expected: [none(SAT)] })).status).toBe(400);
    // An app from before #333 sends no pair: it's asked to reload.
    expect((await call(PATCH, "PATCH", { use_calculated: true, expected: [none(SAT)] })).status).toBe(400);
    expect((await call(DELETE, "DELETE", { pair_key: PAIR, dates: [SUN], expected: [none(SUN)] })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["40001", 409, "Your estimate or this day's drive changed since you opened it. Check it, then try again."], ["PT409", 409, "Your estimate or this day's drive changed since you opened it. Check it, then try again."],
    ["PGRST202", 503, "Your own estimates can't be saved yet. Try again later."],
    ["23514", 400, "Check your estimate and try again."],
    ["XX000", 500, "Couldn't save your estimate. Your entry is still here; try again."],
  ])("answers a %s from the database with %i", async (code, status, error) => {
    rpc.mockResolvedValue({ data: null, error: { code } });
    const response = await save({});
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error });
  });
});
