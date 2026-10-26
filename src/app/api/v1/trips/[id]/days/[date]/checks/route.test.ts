import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { loadTripFull } from "@/lib/trips";
import { TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { POST } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));

const mutationId = "323b232c-af2a-46b6-982b-02e247964fe0";
const dayId = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const entryId = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
const members = { organizer: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", sam: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", gus: "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d" };
const rpc = vi.fn();
const request = (body: unknown) => new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}/days/2026-10-10/checks`, { method: "POST", body: JSON.stringify(body) });
const context = (date = "2026-10-10") => ({ params: Promise.resolve({ id: TRIP.id, date }) });
const stop = { id: "stop-1", trip_id: TRIP.id, position: 0, name: "Pinkham Notch", latitude: 44.26, longitude: -71.25, activities: ["Backcountry"] };
let supabase: SupabaseClient;
let tables: Record<string, Record<string, unknown>[]>;

function identity(userId: string, { objective = "Tuckerman Ravine", activity = "Backcountry", zone = "America/New_York" as string | null, plan = true } = {}) {
  tables = {
    trips: [TRIP as unknown as Record<string, unknown>],
    trip_members: [
      { id: members.organizer, trip_id: TRIP.id, user_id: "user-1", display_name: "You", role: "organizer", status: "joined" },
      { id: members.sam, trip_id: TRIP.id, user_id: "member-user", display_name: "Sam", role: "member", status: "joined" },
      { id: members.gus, trip_id: TRIP.id, user_id: null, display_name: "Gus", role: "member", status: "guest" },
    ],
    // The meet time is the day's (#333).
    trip_days: [{ id: dayId, trip_id: TRIP.id, date: "2026-10-10", stop_id: null, activity, meet_time: "06:30:00", meet_day_offset: 0, meet_time_zone: zone }],
    trip_stops: [stop],
    trip_day_tour_plans: plan ? [{ id: "plan-1", trip_id: TRIP.id, trip_day_id: dayId, objective, route_url: null, backup_plan: null,
      return_time: null, return_day_offset: 0, time_zone: zone, revision: 1, updated_at: "2026-10-01T00:00:00Z" }] : [],
    trip_member_packing: [{ trip_member_id: members.sam, trip_id: TRIP.id, equipment: { transceiver: { status: "added", quantity: 1, added_at: "2026-10-01T12:00:00Z" } } }],
  };
  supabase = { ...createFakeSupabase(tables), rpc } as unknown as SupabaseClient;
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase });
}

/** The key the day page showed for a check, from the trip as loaded with `options`. */
async function contextKey(kind: string, member: string, options: Parameters<typeof identity>[1] = {}) {
  identity("member-user", options);
  const key = (await loadTripFull(supabase, TRIP.id))!.day_checks![0].checks.find((check) => check.member_id === member && check.kind === kind)!.context_key;
  identity("member-user");
  return key;
}

describe("Day checks API", () => {
  let record: Record<string, unknown>;
  beforeEach(async () => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: { entry_id: entryId }, error: null });
    record = { action: "record", kind: "plan_review", day_id: dayId, member_id: members.sam, expected_entry_id: null, mutation_id: mutationId,
      context_key: await contextKey("plan_review", members.sam) };
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("records a member's own plan review against the tour plan as it is now, in the destination's zone", async () => {
    const response = await POST(request(record), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entry_id: entryId });
    expect(rpc).toHaveBeenCalledWith("record_trip_day_check", {
      p_trip_id: TRIP.id, p_user_id: "member-user", p_date: "2026-10-10", p_day_id: dayId, p_member_id: members.sam, p_kind: "plan_review",
      p_expected_entry: null, p_request_id: mutationId, p_action: "recorded", p_time_zone: "America/New_York",
      p_context: { date: "2026-10-10", meeting_point: null, plan: { objective: "Tuckerman Ravine", route_url: null, backup_plan: null,
        meet_time: "06:30", meet_day_offset: 0, return_time: null, return_day_offset: 0 } },
    });
  });

  it("records a transceiver check against the transceiver in the person's list", async () => {
    const response = await POST(request({ ...record, kind: "transceiver", context_key: await contextKey("transceiver", members.sam) }), context());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_trip_day_check", expect.objectContaining({
      p_kind: "transceiver", p_context: { date: "2026-10-10", transceiver: { added_at: "2026-10-01T12:00:00Z" } } }));
  });

  it("refuses a check of what changed since the person saw it", async () => {
    const response = await POST(request({ ...record, context_key: await contextKey("plan_review", members.sam, { objective: "Gulf of Slides" }) }), context());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("changed since you opened the day");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a plan review without a tour plan", async () => {
    identity("member-user", { plan: false });
    expect((await POST(request(record), context())).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("withdraws a check without rebuilding what it covers", async () => {
    const response = await POST(request({ action: "withdraw", kind: "transceiver", day_id: dayId, member_id: members.sam, expected_entry_id: entryId, mutation_id: mutationId }), context());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_trip_day_check", expect.objectContaining({ p_action: "withdrawn", p_expected_entry: entryId, p_context: null }));
  });

  it("lets the organizer record a managed guest's check", async () => {
    const key = await contextKey("transceiver", members.gus);
    identity("user-1");
    expect((await POST(request({ ...record, kind: "transceiver", member_id: members.gus, context_key: key }), context())).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_trip_day_check", expect.objectContaining({ p_user_id: "user-1", p_member_id: members.gus,
      p_context: { date: "2026-10-10", transceiver: null } }));
  });

  it("refuses anyone else's check, and someone who isn't on the trip", async () => {
    expect((await POST(request({ ...record, member_id: members.gus }), context())).status).toBe(403);
    identity("user-1");
    expect((await POST(request(record), context())).status).toBe(403);
    expect((await POST(request({ ...record, member_id: "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a" }), context())).status).toBe(404);
    identity("stranger");
    expect((await POST(request(record), context())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["the day the page opened for no longer holds the date", {}, { day_id: "0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b" }],
    ["the day isn't Backcountry now", { activity: "Alpine" }, {}],
  ])("refuses a check when %s", async (_case, options, change) => {
    identity("member-user", options);
    expect((await POST(request({ ...record, ...change }), context())).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ action: "correct" }],
    [{ kind: "helmet" }],
    [{ mutation_id: "retry" }],
    [{ member_id: "sam" }],
    [{ expected_entry_id: "latest" }],
    [{ context_key: undefined }],
  ])("refuses an invalid request: %o", async (change) => {
    expect((await POST(request({ ...record, ...change }), context())).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("looks up the destination's zone when the day has none", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ timezone: "America/New_York" }) });
    vi.stubGlobal("fetch", fetch);
    const key = await contextKey("plan_review", members.sam, { zone: null });
    identity("member-user", { zone: null });
    expect((await POST(request({ ...record, context_key: key }), context())).status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("record_trip_day_check", expect.objectContaining({ p_time_zone: "America/New_York" }));
  });

  it("says checks can't be recorded before the migration, without calling the database", async () => {
    identity("member-user");
    supabase = { ...createFakeSupabase(tables, { missing: ["trip_day_checks"] }), rpc } as unknown as SupabaseClient;
    vi.mocked(requireUser).mockResolvedValue({ userId: "member-user", supabase });
    expect((await POST(request(record), context())).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["PT409", 409], ["40001", 409], ["P0002", 404], ["42501", 403], ["22023", 409], ["22000", 400],
    ["42883", 503], ["PGRST202", 503], ["XX000", 500],
  ])("maps a database error %s to %i", async (code, status) => {
    rpc.mockResolvedValue({ data: null, error: { code } });
    expect((await POST(request(record), context())).status).toBe(status);
  });
});
