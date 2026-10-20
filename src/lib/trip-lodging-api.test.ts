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
  describe("stay locations (#208)", () => {
    const topnotch = { label: " Topnotch Resort ", address: "4000 Mountain Road, Stowe, VT", latitude: 44.49391234, longitude: -72.7391801, precision: "exact",
      time_zone: "America/New_York", source: "search", provider: "geoapify", provider_id: "51a8d60cba4e", attribution: "© OpenStreetMap contributors", extra: "dropped" };
    const payload = () => rpc.mock.lastCall![1].p_payload as Record<string, unknown>;
    it("saves a confirmed place, trimmed to the known fields", async () => {
      expect((await POST(request({ ...body, stay: { ...body.stay, location: topnotch } }), context)).status).toBe(200);
      expect(payload().location).toEqual({ label: "Topnotch Resort", address: "4000 Mountain Road, Stowe, VT", latitude: 44.493912, longitude: -72.73918,
        precision: "exact", time_zone: "America/New_York", source: "search", provider: "geoapify", provider_id: "51a8d60cba4e", attribution: "© OpenStreetMap contributors" });
    });
    it("leaves the saved place alone when a save doesn't mention it, and clears it on null", async () => {
      await PATCH(request(body), stayContext);
      expect(payload()).not.toHaveProperty("location");
      await PATCH(request({ ...body, stay: { ...body.stay, location: null } }), stayContext);
      expect(payload()).toHaveProperty("location", null);
    });
    it.each([
      ["0, 0", { ...topnotch, latitude: 0, longitude: 0 }],
      ["latitude out of range", { ...topnotch, latitude: 91 }],
      ["longitude as text", { ...topnotch, longitude: "-72.7" }],
      ["no label", { ...topnotch, label: " " }],
      ["unknown precision", { ...topnotch, precision: "rooftop" }],
      ["unknown provider", { ...topnotch, provider: "google" }],
      ["typed coordinates claiming a provider ID", { ...topnotch, source: "manual", provider: null }],
      ["a list", [topnotch]],
    ])("rejects a location with %s before the transaction", async (_, location) => {
      const response = await POST(request({ ...body, stay: { ...body.stay, location } }), context);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ field: "location" });
      expect(rpc).not.toHaveBeenCalled();
    });
    it("refuses a place before migration 025 instead of saving the stay without it", async () => {
      const from = supabase.from.bind(supabase);
      const select = vi.fn(() => ({ limit: async () => ({ data: null, error: { code: "42703", message: "column trip_stays.location does not exist" } }) }));
      supabase.from = ((table: string) => table === "trip_stays" ? { select } : from(table)) as typeof supabase.from;
      const response = await POST(request({ ...body, stay: { ...body.stay, location: topnotch } }), context);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Stay locations can't be saved yet. Remove the location to save the stay now.", field: "location" });
      expect(rpc).not.toHaveBeenCalled();
      // Saves without a place don't need the column.
      expect((await POST(request({ ...body, stay: { ...body.stay, location: null } }), context)).status).toBe(200);
      expect(select).toHaveBeenCalledOnce();
    });
    it("drops an unknown time zone rather than the place", async () => {
      await POST(request({ ...body, stay: { ...body.stay, location: { ...topnotch, time_zone: "Mars/Olympus" } } }), context);
      expect(payload().location).toMatchObject({ label: "Topnotch Resort", time_zone: null });
    });
  });
  it.each([["40001", 409], ["PT409", 409], ["23P01", 409], ["42501", 404], ["P0002", 404], ["XX000", 500]])("sanitizes %s transaction failures", async (code, status) => {
    rpc.mockResolvedValue({ error: { code, message: "Internal database details" } });
    const response = await POST(request(body), context); expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("Internal database details");
  });
});
