import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { loadTripFull } from "@/lib/trips";
import { TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { DELETE, PUT } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));

const mutationId = "323b232c-af2a-46b6-982b-02e247964fe0";
const dayId = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const rpc = vi.fn();
const fetchMock = vi.fn();
const request = (body: unknown, method = "PUT") => new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}/days/2026-10-10/tour-plan`, { method, body: JSON.stringify(body) });
const context = (date = "2026-10-10") => ({ params: Promise.resolve({ id: TRIP.id, date }) });
const body = { plan: { objective: " Tuckerman Ravine " }, day_id: dayId, expected_revision: 0, mutation_id: mutationId };
const stop = { id: "stop-1", trip_id: TRIP.id, position: 0, name: "Pinkham Notch", latitude: 44.257, longitude: -71.253, activities: ["Backcountry"] };
// The day before migration 20261024230000, without meet columns, and after it.
const dayBefore = { id: dayId, trip_id: TRIP.id, date: "2026-10-10", stop_id: null, activity: "Backcountry" };
const day = { ...dayBefore, meet_time: null, meet_day_offset: 0, meet_time_zone: null };
let supabase: SupabaseClient;

function identity(userId: string, { status = "joined", stops = [stop] as Record<string, unknown>[], plans = [] as Record<string, unknown>[], days = [day] as Record<string, unknown>[] } = {}) {
  supabase = { ...createFakeSupabase({
    trips: [TRIP as unknown as Record<string, unknown>], trip_members: [{ trip_id: TRIP.id, user_id: "member-user", status }],
    trip_days: days, trip_stops: stops, trip_day_tour_plans: plans,
  }), rpc } as unknown as SupabaseClient;
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase });
}

describe("Tour plan API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: { revision: 1 }, error: null });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(Response.json({ timezone: "America/New_York" }));
    identity("user-1");
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("saves the organizer's route-only draft for the route's day, without a time zone lookup", async () => {
    const response = await PUT(request({ ...body, user_id: "other-user", date: "2026-10-11" }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 1 });
    expect(rpc).toHaveBeenCalledWith("mutate_trip_tour_plan", expect.objectContaining({
      p_trip_id: TRIP.id, p_user_id: "user-1", p_date: "2026-10-10", p_day_id: dayId, p_expected_revision: 0, p_request_id: mutationId, p_action: "save",
      p_payload: expect.objectContaining({ objective: "Tuckerman Ravine", return_time: null, time_zone: null }),
    }));
    // The meet time is the day's (#333), so the plan's payload leaves it out.
    expect(rpc.mock.calls[0][1].p_payload).not.toHaveProperty("meet_time");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves a return time with the time zone of the day's destination", async () => {
    await PUT(request({ ...body, plan: { objective: "Tuckerman", return_time: "15:30" } }), context());
    expect(String(fetchMock.mock.calls[0][0])).toContain("latitude=44.257&longitude=-71.253&timezone=auto");
    expect(rpc).toHaveBeenCalledWith("mutate_trip_tour_plan", expect.objectContaining({
      p_payload: expect.objectContaining({ return_time: "15:30", time_zone: "America/New_York" }),
    }));
  });

  it("keeps the return after the day's meet time, unless it's the next day", async () => {
    identity("user-1", { days: [{ ...day, meet_time: "09:00:00" }] });
    const response = await PUT(request({ ...body, plan: { objective: "A", return_time: "08:00" } }), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ field: "return_time" });
    expect(rpc).not.toHaveBeenCalled();
    expect((await PUT(request({ ...body, plan: { objective: "A", return_time: "08:00", return_day_offset: 1 } }), context())).status).toBe(200);
    identity("user-1", { days: [{ ...day, meet_time: "18:00:00", meet_day_offset: -1 }] });
    expect((await PUT(request({ ...body, plan: { objective: "A", return_time: "08:00" } }), context())).status).toBe(200);
  });

  it("asks an app from before #333, which sends the meet time with the plan, to reload", async () => {
    const response = await PUT(request({ ...body, plan: { objective: "A", meet_time: null, meet_day_offset: 0 } }), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "This page is out of date. Reload it, then save the tour plan again." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("changes nothing before the meet time moves to the day, so a plan's meet time isn't cleared", async () => {
    identity("user-1", { days: [dayBefore] });
    expect((await PUT(request(body), context())).status).toBe(503);
    expect((await DELETE(request({ day_id: dayId, expected_revision: 1, mutation_id: mutationId }, "DELETE"), context())).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says the day is gone without a transaction", async () => {
    identity("user-1", { days: [] });
    expect((await PUT(request(body), context())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["the lookup fails", () => fetchMock.mockRejectedValue(new Error("offline")), [stop]],
    ["the answer isn't a time zone", () => fetchMock.mockResolvedValue(Response.json({ timezone: "Nowhere/Land" })), [stop]],
    ["the destination has no coordinates", () => undefined, [{ ...stop, latitude: null, longitude: null }]],
  ])("still saves the times when %s", async (_case, setup, stops) => {
    identity("user-1", { stops });
    setup();
    expect((await PUT(request({ ...body, plan: { objective: "Tuckerman", return_time: "15:00" } }), context())).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mutate_trip_tour_plan", expect.objectContaining({ p_payload: expect.objectContaining({ time_zone: null }) }));
  });

  it("removes with the reviewed revision only", async () => {
    expect((await DELETE(request({ day_id: dayId, expected_revision: 2, mutation_id: mutationId }, "DELETE"), context())).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mutate_trip_tour_plan", expect.objectContaining({ p_action: "remove", p_expected_revision: 2, p_payload: {} }));
    expect((await DELETE(request({ day_id: dayId, expected_revision: 0, mutation_id: mutationId }, "DELETE"), context())).status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("lets members read but not write", async () => {
    identity("member-user");
    expect((await PUT(request(body), context())).status).toBe(403);
    expect((await DELETE(request({ day_id: dayId, expected_revision: 1, mutation_id: mutationId }, "DELETE"), context())).status).toBe(403);
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
    [{ ...body, plan: { objective: "" } }, "objective"],
    [{ ...body, plan: { objective: "A", route_url: "javascript:alert(1)" } }, "route_url"],
    [{ ...body, plan: { objective: "A", return_time: "8:00" } }, "return_time"],
    [{ ...body, expected_revision: -1 }, undefined],
    [{ ...body, expected_revision: "0" }, undefined],
    [{ ...body, mutation_id: "bad" }, undefined],
    [{ ...body, day_id: undefined }, undefined],
    [{ ...body, day_id: "day-1" }, undefined],
  ])("rejects invalid requests before the transaction (%#)", async (input, field) => {
    const response = await PUT(request(input), context());
    expect(response.status).toBe(400);
    if (field) expect(await response.json()).toMatchObject({ field });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats a date that isn't a calendar date as not found", async () => {
    expect((await PUT(request(body), context("2026-02-30"))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([["40001", 409], ["PT409", 409], ["P0002", 404], ["42501", 404], ["22023", 409], ["23514", 400], ["22000", 400], ["XX000", 500]])(
    "sanitizes %s transaction failures", async (code, status) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: "Internal database details" } });
      const response = await PUT(request(body), context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain("Internal database details");
    });

  it("loads trips before migration 026 with no plans, but fails rather than hide plans on other errors", async () => {
    const failing = (code: string) => ({ ...supabase, from: (table: string) => table === "trip_day_tour_plans"
      ? { select: () => ({ eq: async () => ({ data: null, error: { code, message: "missing" } }) }) }
      : supabase.from(table) }) as unknown as SupabaseClient;
    expect((await loadTripFull(failing("PGRST205"), TRIP.id))?.tour_plans).toEqual([]);
    expect((await loadTripFull(failing("42P01"), TRIP.id))?.tour_plans).toEqual([]);
    await expect(loadTripFull(failing("57014"), TRIP.id)).rejects.toThrow("Couldn't load tour plans");
  });

  it("loads saved plans with the trip, labelled for their day, and the day's meet time", async () => {
    const plan = { id: "plan-1", trip_id: TRIP.id, trip_day_id: dayId, objective: "Tuckerman", meet_time: "05:00:00",
      meet_day_offset: 0, return_time: "14:00:00", return_day_offset: 0, distance: null, distance_unit: null, ascent: null, ascent_unit: null,
      duration_minutes: null, metrics_source: null, time_zone: "America/New_York", updated_at: "2026-10-14T20:00:00Z" };
    identity("user-1", { plans: [plan], days: [{ ...day, meet_time: "06:30:00", meet_time_zone: "America/New_York" }] });
    const full = await loadTripFull(supabase, TRIP.id);
    expect(full?.tour_plans).toEqual([expect.objectContaining({ date: "2026-10-10", objective: "Tuckerman", return_label: "2:00 PM EDT · Sat Oct 10" })]);
    expect(full?.tour_plans?.[0]).not.toHaveProperty("meet_time");
    expect(full?.meets).toEqual([{ date: "2026-10-10", meet_label: "6:30 AM EDT · Sat Oct 10", time_zone_label: "Local time at the destination (America/New_York)." }]);
  });

  it("loads a tour plan's meet time as the day's before the migration", async () => {
    identity("user-1", { days: [dayBefore], plans: [{ id: "plan-1", trip_id: TRIP.id, trip_day_id: dayId, objective: "Tuckerman", meet_time: "05:00:00",
      meet_day_offset: 0, return_time: null, return_day_offset: 0, time_zone: null, updated_at: "2026-10-14T20:00:00Z" }] });
    expect((await loadTripFull(supabase, TRIP.id))?.meets).toEqual([expect.objectContaining({ date: "2026-10-10", meet_label: "5:00 AM destination time · Sat Oct 10" })]);
  });
});
