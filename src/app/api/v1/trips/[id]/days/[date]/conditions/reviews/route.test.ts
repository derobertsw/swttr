import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { loadTripFull } from "@/lib/trips";
import { TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { POST } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));

const mutationId = "323b232c-af2a-46b6-982b-02e247964fe0";
const dayId = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const sourceId = "8a7b6c5d-4e3f-4a1b-9c8d-7e6f5a4b3c2d";
const entryId = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
const rpc = vi.fn();
const request = (body: unknown) => new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}/days/2026-10-10/conditions/reviews`, { method: "POST", body: JSON.stringify(body) });
const context = (date = "2026-10-10") => ({ params: Promise.resolve({ id: TRIP.id, date }) });
const stop = { id: "stop-1", trip_id: TRIP.id, position: 0, name: "Pinkham Notch", latitude: 44.26, longitude: -71.25, activities: ["Backcountry"] };
let supabase: SupabaseClient;
let tables: Record<string, Record<string, unknown>[]>;

function identity(userId: string, { status = "joined", objective = "Tuckerman Ravine" } = {}) {
  tables = {
    trips: [TRIP as unknown as Record<string, unknown>], trip_members: [{ trip_id: TRIP.id, user_id: "member-user", status }],
    trip_days: [{ id: dayId, trip_id: TRIP.id, date: "2026-10-10", stop_id: null, activity: "Backcountry" }], trip_stops: [stop],
    trip_day_tour_plans: [{ id: "plan-1", trip_id: TRIP.id, trip_day_id: dayId, objective, route_url: null, meet_day_offset: 0, return_day_offset: 0, updated_at: "2026-10-14T20:00:00Z" }],
    trip_conditions_sources: [{ id: sourceId, trip_id: TRIP.id, category: "avalanche", name: "MWAC", region: "Presidential Range", url: "https://example.org/", revision: 1 }],
    trip_day_conditions_sources: [{ trip_id: TRIP.id, trip_day_id: dayId, source_id: sourceId, created_at: "2026-10-01T00:00:00Z" }],
  };
  supabase = { ...createFakeSupabase(tables), rpc } as unknown as SupabaseClient;
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase });
}

/** The context key the day page showed, from the trip as loaded with `objective`. */
async function contextKey(objective = "Tuckerman Ravine") {
  identity("member-user", { objective });
  const key = (await loadTripFull(supabase, TRIP.id))!.conditions![0].context_key;
  identity("member-user");
  return key;
}

describe("Conditions reviews API", () => {
  let record: Record<string, unknown>;
  beforeEach(async () => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: { entry_id: entryId }, error: null });
    record = { action: "record", day_id: dayId, source_id: sourceId, expected_entry_id: null, mutation_id: mutationId,
      note: " Checked at 6 AM ", context_key: await contextKey() };
  });

  it("records a member's own review against the day's plan as it is now", async () => {
    const response = await POST(request({ ...record, user_id: "user-1" }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entry_id: entryId });
    expect(rpc).toHaveBeenCalledWith("record_trip_conditions_review", {
      p_trip_id: TRIP.id, p_user_id: "member-user", p_date: "2026-10-10", p_day_id: dayId, p_source_id: sourceId,
      p_expected_entry: null, p_request_id: mutationId, p_action: "reviewed", p_note: "Checked at 6 AM",
      p_context: { date: "2026-10-10", stop: { id: "stop-1", latitude: 44.26, longitude: -71.25 }, activity: "Backcountry", access_point: null,
        route: { objective: "Tuckerman Ravine", route_url: null }, source: { url: "https://example.org/", region: "Presidential Range" } },
    });
  });

  it("refuses a review of a plan that changed since the person saw it", async () => {
    const response = await POST(request({ ...record, context_key: await contextKey("Gulf of Slides") }), context());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("changed since you opened it");
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["the day the page opened for no longer holds the date", { day_id: "0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b" }],
    ["the source isn't on the day", { source_id: "0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b" }],
  ])("refuses a review when %s", async (_case, change) => {
    expect((await POST(request({ ...record, ...change }), context())).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("corrects and withdraws the person's own review without rebuilding the context", async () => {
    await POST(request({ action: "correct", day_id: dayId, source_id: sourceId, expected_entry_id: entryId, mutation_id: mutationId, note: "Moderate" }), context());
    expect(rpc).toHaveBeenLastCalledWith("record_trip_conditions_review", expect.objectContaining({
      p_action: "corrected", p_expected_entry: entryId, p_note: "Moderate", p_context: null }));
    await POST(request({ action: "withdraw", day_id: dayId, source_id: sourceId, expected_entry_id: entryId, mutation_id: mutationId, note: "ignored" }), context());
    expect(rpc).toHaveBeenLastCalledWith("record_trip_conditions_review", expect.objectContaining({ p_action: "withdrawn", p_note: null }));
  });

  it("lets the organizer record their own review", async () => {
    identity("user-1");
    expect((await POST(request(record), context())).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_trip_conditions_review", expect.objectContaining({ p_user_id: "user-1" }));
  });

  it.each(["outsider", "left"])("doesn't disclose the trip to %s users", async (kind) => {
    identity(kind === "left" ? "member-user" : "outsider", { status: kind });
    expect((await POST(request(record), context())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the signed-out access rules", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Sign in" }, { status: 401 }));
    expect((await POST(request(record), context())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ note: "x".repeat(1001) }, "note"],
    [{ action: "approve" }, undefined],
    [{ context_key: undefined }, undefined],
    [{ expected_entry_id: undefined }, undefined],
    [{ expected_entry_id: "entry-1" }, undefined],
    [{ source_id: "source-1" }, undefined],
    [{ day_id: undefined }, undefined],
    [{ mutation_id: "bad" }, undefined],
  ])("rejects invalid requests before the transaction (%#)", async (change, field) => {
    const response = await POST(request({ ...record, ...change }), context());
    expect(response.status).toBe(400);
    if (field) expect(await response.json()).toMatchObject({ field });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats a date that isn't a calendar date, or isn't on the trip, as not found", async () => {
    expect((await POST(request(record), context("2026-02-30"))).status).toBe(404);
    expect((await POST(request(record), context("2026-10-11"))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([["40001", 409], ["PT409", 409], ["P0002", 404], ["42501", 404], ["22023", 409], ["22000", 400], ["PGRST202", 503], ["XX000", 500]])(
    "sanitizes %s transaction failures", async (code, status) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: "Internal database details" } });
      const response = await POST(request(record), context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain("Internal database details");
    });
});
