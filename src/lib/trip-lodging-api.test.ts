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
import { PUT as assign } from "@/app/api/v1/trips/[id]/lodging-assignments/route";
import { PUT as attendance } from "@/app/api/v1/trips/[id]/members/[memberId]/attendance/route";
import { peopleKey } from "@/lib/trip-lodging";
import { ALEX, BLAIR, CASEY, DANA, FRAN, FRI, PINE, SAT, SPLIT_MEMBERS, SPLIT_TRIP, SUN, VILLAGE, splitRows } from "@/test/splitStays";
import type { TripMember } from "@/types/trips";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));
const stayId = "40f9f55e-0e74-4c4a-923f-d7a3f92468a0";
const mutationId = "323b232c-af2a-46b6-982b-02e247964fe0";
const rpc = vi.fn();
const request = (body: unknown) => new NextRequest("http://localhost/api/v1/trips/trip-1/stays", { method: "POST", body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id: TRIP.id }) };
const stayContext = { params: Promise.resolve({ id: TRIP.id, stayId }) };
const crewKey = "0123456789abcdef0123456789abcdef";
const body = { stay: { id: stayId, name: " Hotel " }, expected_revision: 0, expected_people_key: crewKey, mutation_id: mutationId };
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
    expect(rpc).toHaveBeenLastCalledWith("mutate_trip_lodging", expect.objectContaining({ p_action: "remove", p_payload: { id: stayId, people_key: crewKey } }));
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
    // A preview's crew key is optional: it's the review a save then names.
    const response = await preview(request({ ...body, expected_people_key: undefined, action: "save", stay: { ...body.stay, check_in: "2026-10-09", check_out: "2026-10-11" } }), context);
    expect(response.status).toBe(200);
    expect((await response.json()).nights.map((night: { date: string }) => night.date)).toEqual(["2026-10-09", "2026-10-10"]);
    expect((await preview(request({ ...body, expected_people_key: undefined, action: "save", existing: true }), context)).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("scopes no-stay writes to the route night within the authorized itinerary", async () => {
    const ctx = { params: Promise.resolve({ id: TRIP.id, date: "2026-10-10" }) };
    expect((await PUT(request({ ...body, status: "no_stay", date: "2026-10-11" }), ctx)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mutate_trip_lodging", expect.objectContaining({ p_payload: { date: "2026-10-10", status: "no_stay", people_key: crewKey } }));
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

describe("Per-person lodging API (#331)", () => {
  const key = (members: Array<{ id: string; status: TripMember["status"] }>) => peopleKey(members);
  const route = (path: string, body: unknown) => new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}/${path}`, { method: "PUT", body: JSON.stringify(body) });
  const members = SPLIT_MEMBERS.map((member) => ({ ...member, trip_id: TRIP.id, invite_token: null,
    user_id: member.id === ALEX.id ? "user-1" : member.id === BLAIR.id ? "member-user" : null }));
  let tables: Record<string, Record<string, unknown>[]>;
  function crew(userId = "user-1", missing: string[] = []) {
    const rows = splitRows();
    tables = { trips: [SPLIT_TRIP as unknown as Record<string, unknown>], trip_members: members, trip_stays: rows.stays as unknown as Record<string, unknown>[],
      trip_member_lodging_nights: rows.assignments as unknown as Record<string, unknown>[], trip_member_attendance: rows.attendance as unknown as Record<string, unknown>[],
      trip_lodging_nights: [{ trip_id: TRIP.id, date: FRI, stay_id: PINE.id, status: "assigned" }] };
    supabase = { ...createFakeSupabase(tables, { missing }), rpc } as unknown as SupabaseClient;
    vi.mocked(requireUser).mockResolvedValue({ userId, supabase });
  }
  const move = { assignments: [{ member_id: BLAIR.id.toUpperCase(), status: "assigned", stay_id: VILLAGE.id, dates: [SAT] }], expected_revision: 4, expected_people_key: crewKey, mutation_id: mutationId };
  const attendanceContext = (memberId = CASEY.id) => ({ params: Promise.resolve({ id: TRIP.id, memberId }) });
  const evening = { attendance: { arrival_date: SAT, departure_date: null, skipped_dates: [SAT] }, expected_revision: 4, expected_people_key: crewKey, mutation_id: mutationId };
  beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: { revision: 5 }, error: null }); crew(); });

  it("loads each person's nights with the trip, and the crew's before the migration", async () => {
    const full = await loadTripFull(supabase, TRIP.id);
    expect(full?.lodging).toMatchObject({ per_member: true, revision: 4, people_key: key(members) });
    expect(full?.lodging?.people.map((person) => person.display_name)).toEqual(["Alex", "Blair", "Casey", "Dana", "Eli", "Fran"]);
    expect(full?.lodging?.nights[1].label).toBe("Pine rental (3) · Village hotel (2)");
    crew("user-1", ["trip_member_lodging_nights", "trip_member_attendance"]);
    const legacy = await loadTripFull(supabase, TRIP.id);
    expect(legacy?.lodging).toMatchObject({ per_member: false, attendance: [] });
    expect(legacy?.lodging?.nights[1]).toMatchObject({ label: "Pine rental", stay_id: PINE.id });
    expect(legacy?.lodging?.people.find((person) => person.member_id === FRAN.id)?.nights[1].state).toBe("unplanned");
  });

  it("saves only the listed people's nights through the organizer's transaction", async () => {
    expect((await assign(route("lodging-assignments", { ...move, user_id: "member-user", replace_nights: true }), context)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mutate_trip_lodging", { p_trip_id: TRIP.id, p_user_id: "user-1", p_expected_revision: 4, p_request_id: mutationId,
      p_action: "assign", p_payload: { assignments: [{ member_id: BLAIR.id, status: "assigned", stay_id: VILLAGE.id, dates: [SAT] }], people_key: crewKey }, p_replace_nights: true });
  });

  it("takes the person whose dates change from the route", async () => {
    await attendance(route(`members/${CASEY.id}/attendance`, { ...evening, member_id: DANA.id }), attendanceContext());
    expect(rpc).toHaveBeenCalledWith("mutate_trip_lodging", expect.objectContaining({ p_action: "attendance",
      p_payload: { member_id: CASEY.id, arrival_date: SAT, departure_date: null, skipped_dates: [SAT], people_key: crewKey } }));
  });

  it("lets members read the plan but not change anyone's nights or dates", async () => {
    crew("member-user");
    expect((await assign(route("lodging-assignments", move), context)).status).toBe(403);
    expect((await attendance(route(`members/${BLAIR.id}/attendance`, evening), attendanceContext(BLAIR.id))).status).toBe(403);
    expect((await preview(request({ ...move, action: "assign" }), context)).status).toBe(403);
    crew("outsider");
    expect((await assign(route("lodging-assignments", move), context)).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["no assignments", { ...move, assignments: [] }],
    ["a stay for a cleared night", { ...move, assignments: [{ member_id: BLAIR.id, status: "unplanned", stay_id: VILLAGE.id, dates: [SAT] }] }],
    ["an invalid crew key", { ...move, expected_people_key: "not-a-key" }],
    ["no save identity", { ...move, mutation_id: undefined }],
    ["no reviewed crew key", { ...move, expected_people_key: undefined }],
    ["more than 2,000 person/nights", { ...move, assignments: SPLIT_MEMBERS.map((member) => ({ member_id: member.id, status: "unplanned",
      dates: Array.from({ length: 400 }, (_, day) => new Date(Date.UTC(2026, 9, 1 + day)).toISOString().slice(0, 10)) })) }],
  ])("rejects %s before the transaction", async (_, body) => {
    expect((await assign(route("lodging-assignments", body), context)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("previews a one-night move with each person and night, and refuses a stale review", async () => {
    const response = await preview(request({ ...move, expected_people_key: key(members), action: "assign" }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ conflicts: [SAT], people_key: key(members),
      changes: [{ member_id: BLAIR.id, display_name: "Blair", date: SAT, before: "Pine rental", after: "Village hotel", morning: "Sun Oct 11", morning_origin: "Village hotel", conflict: true }] });
    expect((await preview(request({ ...move, action: "assign", expected_revision: 3 }), context)).status).toBe(409);
    expect((await preview(request({ ...move, action: "assign", expected_people_key: key([]) }), context)).status).toBe(409);
    const refused = await preview(request({ ...move, expected_people_key: undefined, action: "assign", assignments: [{ member_id: CASEY.id, status: "assigned", stay_id: PINE.id, dates: [FRI] }] }), context);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "Casey isn't on the trip the night of Fri Oct 9. Change their dates first.", field: "assignments" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("previews attendance with the days it changes and the kits it keeps", async () => {
    tables.trip_days = [{ id: "day-fri", trip_id: TRIP.id, date: FRI }];
    tables.trip_member_day_kits = [{ id: "kit-1", trip_day_id: "day-fri", trip_member_id: DANA.id }];
    const response = await preview(request({ action: "attendance", member_id: DANA.id, attendance: { arrival_date: SAT, departure_date: null }, expected_revision: 4 }), context);
    expect(await response.json()).toMatchObject({ conflicts: [FRI], date_label: "Arrives Sat Oct 10",
      day_changes: [{ date: FRI, before: "Taking part", after: "Not on trip", kit_saved: true }] });
  });

  it("passes the reviewed crew key to the transaction", async () => {
    await assign(route("lodging-assignments", { ...move, expected_people_key: key(members) }), context);
    expect(rpc.mock.lastCall![1].p_payload).toMatchObject({ people_key: key(members) });
  });

  it("sends a retry to the transaction even after the plan moved on, so it gets its first result", async () => {
    rpc.mockResolvedValue({ data: { revision: 3 }, error: null });
    const retry = await POST(request({ stay: { id: PINE.id, name: "Pine rental", check_in: FRI, check_out: SUN }, expected_revision: 2, expected_people_key: crewKey, mutation_id: mutationId }), context);
    expect(await retry.json()).toEqual({ revision: 3 });
  });

  it("explains a rejected night from the saved plan, and names a missing person", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "22023", hint: "night", message: "Night not available for this person" } });
    const night = await assign(route("lodging-assignments", { ...move, assignments: [{ member_id: CASEY.id, status: "assigned", stay_id: PINE.id, dates: [FRI] }] }), context);
    expect(night.status).toBe(400);
    expect(await night.json()).toEqual({ error: "Casey isn't on the trip the night of Fri Oct 9. Change their dates first.", field: "assignments" });
    rpc.mockResolvedValue({ data: null, error: { code: "42501", hint: "member", message: "Person not found" } });
    const missing = await attendance(route(`members/${CASEY.id}/attendance`, evening), attendanceContext());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Person not found in this trip." });
  });

  it("refuses per-person saves before the migration, and keeps the crew's working", async () => {
    crew("user-1", ["trip_member_lodging_nights", "trip_member_attendance"]);
    expect((await assign(route("lodging-assignments", move), context)).status).toBe(503);
    expect((await attendance(route(`members/${CASEY.id}/attendance`, evening), attendanceContext())).status).toBe(503);
    expect((await POST(request({ ...body, occupants: [ALEX.id] }), context)).status).toBe(503);
    expect((await preview(request({ ...move, action: "assign" }), context)).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
    const crewPreview = await preview(request({ action: "remove", stay_id: PINE.id, expected_revision: 4 }), context);
    expect(await crewPreview.json()).toMatchObject({ nights: [{ date: FRI, before: "Pine rental", after: "Not planned yet" }], changes: [] });
    expect((await POST(request(body), context)).status).toBe(200);
  });
});
