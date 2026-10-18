import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess } from "@/lib/trips";
import { TRIP } from "@/test/tripApi";
import { POST } from "@/app/api/v1/trips/[id]/gear/route";
import { PATCH, DELETE } from "@/app/api/v1/trips/[id]/gear/[gearId]/route";
vi.mock("@/lib/trips", () => ({ requireTripAccess: vi.fn() }));
const id = "a171593c-5c29-4c09-96c4-c27e65b641e8";
const revision = "b171593c-5c29-4c09-96c4-c27e65b641e8";
const ctx = { params: Promise.resolve({ id: TRIP.id, gearId: id }) };
const rpc = vi.fn();
const request = (body: unknown) => new NextRequest("http://localhost/api/v1/trips/trip-1/gear", { method: "POST", body: JSON.stringify(body) });

describe("Shared gear API authorization and conflict responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: { id, revision }, error: null });
    vi.mocked(requireTripAccess).mockResolvedValue({ userId: "actual-user", trip: TRIP, supabase: { rpc } as unknown as SupabaseClient });
  });
  it("uses the authenticated actor and URL item, never a payload's claimed actor or item", async () => {
    expect((await PATCH(request({ action: "accept", expected_revision: revision, userId: "owner", id: "another" }), ctx)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("update_trip_shared_gear", expect.objectContaining({ p_trip: TRIP.id, p_user: "actual-user", p_id: id }));
  });
  it("requires authorization before invoking the RPC", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "No" }, { status: 401 }));
    expect((await PATCH(request({ action: "accept", expected_revision: revision }), ctx)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { action: "create" }, { action: "pack" }, { action: "assign", expected_revision: revision, assignee_member_id: "not-an-id" }])("rejects malformed/stale-free edits before the RPC: %j", async (body) => {
    expect((await PATCH(request(body), ctx)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("creates with a stable client id for response-loss retries", async () => {
    expect((await POST(request({ id, description: "Stove", assignee_member_id: null }), ctx)).status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("update_trip_shared_gear", expect.objectContaining({ p_id: id, p_change: expect.objectContaining({ action: "create" }) }));
    expect((await POST(request({ description: "Stove" }), ctx)).status).toBe(400);
  });
  it.each([["P0409", 409], ["42501", 403], ["P0002", 404], ["22023", 400], ["XX000", 500]])("returns actionable status %s", async (code, status) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "Reload shared gear" } });
    const result = await PATCH(request({ action: "pack", expected_revision: revision }), ctx);
    expect(result.status).toBe(status);
    expect((await result.json()).error).toMatch(/Reload/);
  });
  it("requires a revision for deletion", async () => {
    expect((await DELETE(request({}), ctx)).status).toBe(400);
    expect((await DELETE(request({ expected_revision: revision }), ctx)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("update_trip_shared_gear", expect.objectContaining({ p_change: { action: "delete", expected_revision: revision } }));
  });
});
