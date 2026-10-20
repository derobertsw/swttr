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
const rpc = vi.fn();
const request = (body: unknown) => new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}/days/2026-10-10/conditions`, { method: "POST", body: JSON.stringify(body) });
const context = (date = "2026-10-10") => ({ params: Promise.resolve({ id: TRIP.id, date }) });
const source = { category: "avalanche", name: " Mount Washington Avalanche Center ", region: "", url: "https://www.mountwashingtonavalanchecenter.org/" };
const add = { action: "add", source, day_id: dayId, mutation_id: mutationId };
let supabase: SupabaseClient;

function identity(userId: string, { status = "joined", tables = {} as Record<string, Record<string, unknown>[]> } = {}) {
  supabase = { ...createFakeSupabase({
    trips: [TRIP as unknown as Record<string, unknown>], trip_members: [{ trip_id: TRIP.id, user_id: "member-user", status }],
    trip_days: [{ id: dayId, trip_id: TRIP.id, date: "2026-10-10", stop_id: null, activity: "Backcountry" }], ...tables,
  }), rpc } as unknown as SupabaseClient;
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase });
}

describe("Conditions sources API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: { source_id: sourceId, revision: 1 }, error: null });
    identity("user-1");
  });

  it("adds the organizer's source to the route's day", async () => {
    const response = await POST(request({ ...add, user_id: "other-user", date: "2026-10-11" }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ source_id: sourceId, revision: 1 });
    expect(rpc).toHaveBeenCalledWith("mutate_trip_conditions_source", {
      p_trip_id: TRIP.id, p_user_id: "user-1", p_date: "2026-10-10", p_day_id: dayId, p_source_id: null, p_expected_revision: 0,
      p_request_id: mutationId, p_action: "add",
      p_payload: { category: "avalanche", name: "Mount Washington Avalanche Center", region: null, url: "https://www.mountwashingtonavalanchecenter.org/" },
    });
  });

  it("saves and removes a source at the revision the editor opened with", async () => {
    await POST(request({ ...add, action: "save", source_id: sourceId, expected_revision: 2 }), context());
    expect(rpc).toHaveBeenLastCalledWith("mutate_trip_conditions_source", expect.objectContaining({ p_action: "save", p_source_id: sourceId, p_expected_revision: 2 }));
    await POST(request({ action: "remove", day_id: dayId, source_id: sourceId, expected_revision: 3, mutation_id: mutationId }), context());
    expect(rpc).toHaveBeenLastCalledWith("mutate_trip_conditions_source", expect.objectContaining({ p_action: "remove", p_expected_revision: 3, p_payload: {} }));
  });

  it("lets members read but not change sources", async () => {
    identity("member-user");
    expect((await POST(request(add), context())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["outsider", "left"])("doesn't disclose the trip to %s users", async (kind) => {
    identity(kind === "left" ? "member-user" : "outsider", { status: kind });
    expect((await POST(request(add), context())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the signed-out access rules", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Sign in" }, { status: 401 }));
    expect((await POST(request(add), context())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...add, source: { ...source, url: "javascript:alert(1)" } }, "url"],
    [{ ...add, source: { ...source, name: "" } }, "name"],
    [{ ...add, source: { ...source, category: "snowpack" } }, "category"],
    [{ ...add, action: "rename" }, undefined],
    [{ ...add, action: "save", source_id: sourceId, expected_revision: 0 }, undefined],
    [{ ...add, action: "save", expected_revision: 1 }, undefined],
    [{ action: "remove", day_id: dayId, source_id: sourceId, mutation_id: mutationId }, undefined],
    [{ ...add, mutation_id: "bad" }, undefined],
    [{ ...add, day_id: "day-1" }, undefined],
  ])("rejects invalid requests before the transaction (%#)", async (input, field) => {
    const response = await POST(request(input), context());
    expect(response.status).toBe(400);
    if (field) expect(await response.json()).toMatchObject({ field });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats a date that isn't a calendar date as not found", async () => {
    expect((await POST(request(add), context("2026-02-30"))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([["40001", 409], ["PT409", 409], ["P0002", 404], ["42501", 404], ["22023", 409], ["23514", 400], ["22000", 400], ["PGRST202", 503], ["XX000", 500]])(
    "sanitizes %s transaction failures", async (code, status) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: "Internal database details" } });
      const response = await POST(request(add), context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain("Internal database details");
    });

  it("loads trips before migration 031 with no sources, but fails rather than hide sources on other errors", async () => {
    const failing = (code: string) => ({ ...supabase, from: (table: string) => table.includes("conditions") ? {
      select: () => ({ eq: () => {
        const result = Promise.resolve({ data: null, error: { code, message: "missing" } });
        return Object.assign(result, { order: () => result });
      } }),
    } : supabase.from(table) }) as unknown as SupabaseClient;
    expect((await loadTripFull(failing("PGRST205"), TRIP.id))?.conditions).toEqual([]);
    expect((await loadTripFull(failing("42P01"), TRIP.id))?.conditions).toEqual([]);
    await expect(loadTripFull(failing("57014"), TRIP.id)).rejects.toThrow("Couldn't load conditions sources");
  });

  it("loads each day's sources with the crew's reviews", async () => {
    identity("user-1", { tables: {
      trip_conditions_sources: [{ id: sourceId, trip_id: TRIP.id, category: "avalanche", name: "MWAC", region: null, url: "https://example.org/", revision: 1 }],
      trip_day_conditions_sources: [{ trip_id: TRIP.id, trip_day_id: dayId, source_id: sourceId, created_at: "2026-10-01T00:00:00Z" }],
      trip_conditions_reviews: [{ id: "entry-1", entry_number: 1, trip_id: TRIP.id, trip_day_id: dayId, source_id: sourceId, user_id: "member-user",
        action: "reviewed", note: "Low", reviewed_at: "2026-10-09T12:00:00Z", created_at: "2026-10-09T12:00:00Z",
        context: { date: "2026-10-09", stop: null, activity: "Backcountry", access_point: null, route: null, source: { url: "https://example.org/", region: null } } }],
    } });
    const full = await loadTripFull(supabase, TRIP.id);
    expect(full?.conditions).toEqual([expect.objectContaining({
      id: sourceId, date: "2026-10-10", trip_day_id: dayId,
      reviews: [expect.objectContaining({ user_id: "member-user", stale_reasons: ["Date changed from Fri Oct 9"] })],
    })]);
  });
});
