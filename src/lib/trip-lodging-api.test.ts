import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { loadTripFull } from "@/lib/trips";
import { POST } from "@/app/api/v1/trips/[id]/stays/route";
import { POST as preview } from "@/app/api/v1/trips/[id]/stays/preview/route";
import { PATCH, DELETE } from "@/app/api/v1/trips/[id]/stays/[stayId]/route";
import { PUT } from "@/app/api/v1/trips/[id]/lodging-nights/[date]/route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));
const stayId = "40f9f55e-0e74-4c4a-923f-d7a3f92468a0";
const mutationId = "323b232c-af2a-46b6-982b-02e247964fe0";
const rpc = vi.fn();
const request = (body: unknown) => new NextRequest("http://localhost/api/v1/trips/trip-1/stays", { method: "POST", body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id: TRIP.id }) };
const stayContext = { params: Promise.resolve({ id: TRIP.id, stayId }) };
const body = { stay: { id: stayId, name: " Hotel " }, expected_revision: 0, mutation_id: mutationId };
let supabase: SupabaseClient;
function identity(userId: string, status = "joined") {
  supabase = { ...createFakeSupabase({ trips: [TRIP as unknown as Record<string, unknown>], trip_members: [{ trip_id: TRIP.id, user_id: "member-user", status }] }), rpc } as unknown as SupabaseClient;
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase });
}
describe("Stay API authorization and validation", () => {
  beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: { revision: 1 }, error: null }); identity("user-1"); });
  it("loads old trips with an empty lodging plan", async () => {
    const full = await loadTripFull(supabase, TRIP.id);
    expect(full?.lodging).toMatchObject({ revision: 0, stays: [], assignments: [] });
    expect(full?.lodging?.days[0]).toMatchObject({ starting_from: "Not set", staying_tonight: "Not planned yet" });
  });
  it("uses the authenticated organizer and normalizes a name-only draft", async () => {
    expect((await POST(request({ ...body, user_id: "other-user", trip_id: "other-trip" }), context)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mutate_trip_lodging", expect.objectContaining({ p_trip_id: TRIP.id, p_user_id: "user-1", p_request_id: mutationId, p_expected_revision: 0,
      p_payload: expect.objectContaining({ id: stayId, name: "Hotel", check_in: null, check_out: null, existing: false, booking_status: "not_booked" }) }));
  });
  it("takes edit/remove identity from the route, not an injected ID", async () => {
    await PATCH(request({ ...body, stay: { ...body.stay, id: mutationId } }), stayContext);
    expect(rpc).toHaveBeenLastCalledWith("mutate_trip_lodging", expect.objectContaining({ p_payload: expect.objectContaining({ id: stayId, existing: true }) }));
    await DELETE(request(body), stayContext);
    expect(rpc).toHaveBeenLastCalledWith("mutate_trip_lodging", expect.objectContaining({ p_action: "remove", p_payload: { id: stayId } }));
  });
  it("lets current members read stays but rejects their writes", async () => {
    identity("member-user");
    expect((await POST(request(body), context)).status).toBe(403);
    expect((await preview(request({ ...body, action: "save" }), context)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["outsider", "left"])("doesn't disclose trips to %s users", async (kind) => {
    identity(kind === "left" ? "member-user" : "outsider", kind);
    expect((await POST(request(body), context)).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("preserves the existing signed-out access rules", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Sign in" }, { status: 401 }));
    expect((await POST(request(body), context)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ ...body, expected_revision: -1 }, { ...body, mutation_id: "bad" }, { ...body, stay: { ...body.stay, property_url: "javascript:alert(1)" } }, { ...body, stay: { ...body.stay, check_in: "2026-10-09" } }])("rejects invalid requests before the transaction (%#)", async (input) => {
    expect((await POST(request(input), context)).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  it("previews a weekend without writing and rejects foreign edit IDs", async () => {
    const response = await preview(request({ ...body, action: "save", stay: { ...body.stay, check_in: "2026-10-09", check_out: "2026-10-11" } }), context);
    expect(response.status).toBe(200);
    expect((await response.json()).nights.map((night: { date: string }) => night.date)).toEqual(["2026-10-09", "2026-10-10"]);
    expect((await preview(request({ ...body, action: "save", existing: true }), context)).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("scopes no-stay writes to the route night within the authorized itinerary", async () => {
    const ctx = { params: Promise.resolve({ id: TRIP.id, date: "2026-10-10" }) };
    expect((await PUT(request({ ...body, status: "no_stay", date: "2026-10-11" }), ctx)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mutate_trip_lodging", expect.objectContaining({ p_payload: { date: "2026-10-10", status: "no_stay" } }));
    expect((await PUT(request({ ...body, status: "no_stay" }), { params: Promise.resolve({ id: TRIP.id, date: "2026-10-20" }) })).status).toBe(400);
  });
  it.each([["40001", 409], ["23P01", 409], ["42501", 404], ["P0002", 404], ["XX000", 500]])("sanitizes %s transaction failures", async (code, status) => {
    rpc.mockResolvedValue({ error: { code, message: "Internal database details" } });
    const response = await POST(request(body), context); expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("Internal database details");
  });
});
