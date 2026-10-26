import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { PUT } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));

const dayId = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const rpc = vi.fn();
const fetchMock = vi.fn();
const request = (body: unknown) => new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}/days/2026-10-10/meet`, { method: "PUT", body: JSON.stringify(body) });
const context = (date = "2026-10-10") => ({ params: Promise.resolve({ id: TRIP.id, date }) });
const body = { day_id: dayId, meet_time: "06:30", meet_day_offset: 0, expected: { meet_time: null, meet_day_offset: 0 } };
const stop = { id: "stop-1", trip_id: TRIP.id, position: 0, name: "Stowe", latitude: 44.53, longitude: -72.78, activities: ["Alpine"] };
const day = { id: dayId, trip_id: TRIP.id, date: "2026-10-10", stop_id: null, activity: null, meet_time: null, meet_day_offset: 0, meet_time_zone: null };

function identity(userId: string, { status = "joined", stops = [stop] as Record<string, unknown>[], days = [day] as Record<string, unknown>[], plans = [] as Record<string, unknown>[] } = {}) {
  const supabase = { ...createFakeSupabase({
    trips: [TRIP as unknown as Record<string, unknown>], trip_members: [{ trip_id: TRIP.id, user_id: "member-user", status }],
    trip_days: days, trip_stops: stops, trip_day_tour_plans: plans,
  }), rpc } as unknown as SupabaseClient;
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase });
}

describe("Day meet time API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(Response.json({ timezone: "America/New_York" }));
    identity("user-1");
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("saves the organizer's meet time for any sport, with the destination's time zone", async () => {
    const response = await PUT(request({ ...body, user_id: "other-user", date: "2026-10-11" }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain("latitude=44.53&longitude=-72.78&timezone=auto");
    expect(rpc).toHaveBeenCalledWith("set_trip_day_meet", { p_trip_id: TRIP.id, p_user_id: "user-1", p_payload: {
      date: "2026-10-10", day_id: dayId, meet_time: "06:30", meet_day_offset: 0, expected: { meet_time: null, meet_day_offset: 0 }, time_zone: "America/New_York",
    } });
  });

  it("clears it without a time zone lookup", async () => {
    await PUT(request({ ...body, meet_time: null, meet_day_offset: -1, expected: { meet_time: "06:30:00", meet_day_offset: 0 } }), context());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("set_trip_day_meet", expect.objectContaining({ p_payload: expect.objectContaining({
      meet_time: null, meet_day_offset: 0, time_zone: null, expected: { meet_time: "06:30", meet_day_offset: 0 },
    }) }));
  });

  it.each([
    ["the lookup fails", () => fetchMock.mockRejectedValue(new Error("offline")), [stop]],
    ["the destination has no coordinates", () => undefined, [{ ...stop, latitude: null, longitude: null }]],
  ])("still saves it when %s", async (_case, setup, stops) => {
    identity("user-1", { stops });
    setup();
    expect((await PUT(request(body), context())).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_trip_day_meet", expect.objectContaining({ p_payload: expect.objectContaining({ time_zone: null }) }));
  });

  it("keeps a tour plan in use returning after the meet", async () => {
    const plan = { id: "plan-1", trip_id: TRIP.id, trip_day_id: dayId, objective: "Tuckerman", return_time: "08:00:00", return_day_offset: 0 };
    identity("user-1", { days: [{ ...day, activity: "Backcountry" }], plans: [plan] });
    const response = await PUT(request({ ...body, meet_time: "09:00" }), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ field: "meet_time" });
    expect(rpc).not.toHaveBeenCalled();
    expect((await PUT(request({ ...body, meet_time: "07:00" }), context())).status).toBe(200);
    // A plan kept on a day with another activity isn't in use.
    identity("user-1", { days: [{ ...day, activity: "Alpine" }], plans: [plan] });
    expect((await PUT(request({ ...body, meet_time: "09:00" }), context())).status).toBe(200);
  });

  it("judges a day without its own activity by its destination's first", async () => {
    const plan = { id: "plan-1", trip_id: TRIP.id, trip_day_id: dayId, objective: "Tuckerman", return_time: "08:00:00", return_day_offset: 0 };
    identity("user-1", { stops: [{ ...stop, activities: ["Backcountry"] }], plans: [plan] });
    expect((await PUT(request({ ...body, meet_time: "09:00" }), context())).status).toBe(400);
  });

  it("lets members read but not write", async () => {
    identity("member-user");
    expect((await PUT(request(body), context())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["outsider", "left"])("doesn't disclose the trip to %s users", async (kind) => {
    identity(kind === "left" ? "member-user" : "outsider", { status: kind });
    expect((await PUT(request(body), context())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the signed-out access rules", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Sign in" }, { status: 401 }));
    expect((await PUT(request(body), context())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...body, meet_time: "6:30" }, "meet_time"],
    [{ ...body, meet_day_offset: 1 }, "meet_day_offset"],
    [{ ...body, day_id: "day-1" }, undefined],
    [{ ...body, expected: undefined }, undefined],
    [[], undefined],
  ])("rejects invalid requests before the transaction (%#)", async (input, field) => {
    const response = await PUT(request(input), context());
    expect(response.status).toBe(400);
    if (field) expect(await response.json()).toMatchObject({ field });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats a date that isn't a calendar date, or isn't on the trip, as not found", async () => {
    expect((await PUT(request(body), context("2026-02-30"))).status).toBe(404);
    identity("user-1", { days: [] });
    expect((await PUT(request(body), context())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([["PT409", 409], ["40001", 409], ["PGRST202", 503], ["42883", 503], ["42501", 403], ["P0002", 404], ["22023", 400], ["XX000", 500]])(
    "sanitizes %s transaction failures", async (code, status) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: "Internal database details" } });
      const response = await PUT(request(body), context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain("Internal database details");
    });
});
