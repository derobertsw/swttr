// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess } from "@/lib/trips";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { place } from "@/test/driveTrip";
import { ALEX, BLAIR, CASEY, DANA, ELI, FRAN, FRI, LODGE, PINE, SAT, SPLIT_MEMBERS, SPLIT_TRIP, splitRows, SUN, VILLAGE } from "@/test/splitStays";
import type { TripStayUsePreview } from "@/types/trips";
import { POST } from "./route";

vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn() }));

const optionId = "3c000000-0000-4000-8000-000000000001";
const RIDGE = place("Ridge chalet", 44.5012, -72.7519);
const params = { params: Promise.resolve({ id: SPLIT_TRIP.id }) };
const option = { id: optionId, trip_id: SPLIT_TRIP.id, name: "Ridge chalet", check_in: FRI, check_out: SUN, address: "12 Ridge Rd", property_url: "https://example.com/ridge",
  notes: "Hot tub", location: RIDGE, cost_amount: 840, cost_currency: "USD", revision: 2, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };
const use = (body: Record<string, unknown>) => POST(new Request(`http://localhost/api/v1/trips/${SPLIT_TRIP.id}/stay-candidates/use`, { method: "POST", body: JSON.stringify(body) }), params);
const ids = (...people: Array<{ id: string }>) => people.map((person) => person.id);

describe("Use for these nights (#213)", () => {
  let rpc: ReturnType<typeof vi.fn>;
  let tables: Record<string, Record<string, unknown>[]>;
  let missing: string[];
  beforeEach(() => {
    vi.clearAllMocks();
    const rows = splitRows();
    tables = {
      trips: [{ ...SPLIT_TRIP }],
      trip_stays: rows.stays.map((stay) => ({ ...stay })),
      trip_member_lodging_nights: rows.assignments.map((row) => ({ ...row })),
      trip_member_attendance: rows.attendance.map((row) => ({ ...row })),
      trip_members: SPLIT_MEMBERS.map((member) => ({ ...member, trip_id: SPLIT_TRIP.id })),
      trip_stay_candidates: [{ ...option }],
    };
    missing = [];
    rpc = vi.fn().mockResolvedValue({ data: { revision: 5 }, error: null });
    vi.mocked(requireTripAccess).mockImplementation(async () => ({
      supabase: { ...createFakeSupabase(tables, { missing }), rpc } as unknown as SupabaseClient, userId: "user-1", trip: SPLIT_TRIP,
    }));
  });

  it("previews an option as a new stay for everyone on the trip those nights, saying which booked stays they leave", async () => {
    const response = await use({ option: `candidate:${optionId}`, first_night: FRI, checkout: SUN, preview: true });
    expect(requireTripAccess).toHaveBeenCalledWith(SPLIT_TRIP.id, { organizerOnly: true });
    expect(response.status).toBe(200);
    const preview = await response.json() as TripStayUsePreview;
    // The crew, Casey from Saturday, and Fran, a pending invitation already planned for those nights.
    expect(preview.member_ids).toEqual(ids(ALEX, BLAIR, CASEY, DANA, ELI, FRAN));
    expect(preview).toMatchObject({ stay_name: "Ridge chalet", new_stay: true, booked_kept: ["Pine rental", "Village hotel"], date_label: "Fri Oct 9 → Sun Oct 11 · 2 nights" });
    expect(preview.summary).toEqual([
      "Move Alex, Blair and Dana from Pine rental to Ridge chalet for the nights of Fri Oct 9 and Sat Oct 10.",
      "Move Eli and Fran (invitation pending) from Village hotel to Ridge chalet for the nights of Fri Oct 9 and Sat Oct 10.",
      "Move Casey from Pine rental to Ridge chalet for the night of Sat Oct 10.",
    ]);
    expect(preview.changes.find((entry) => entry.member_id === ALEX.id && entry.date === SAT)).toMatchObject({ before: "Pine rental", after: "Ridge chalet", morning: "Sun Oct 11", morning_origin: "Ridge chalet", conflict: true });
    expect(preview.conflicts).toEqual([FRI, SAT]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves the option as a stay with the chosen people only, keeps bookings, and takes it off the options", async () => {
    const response = await use({ option: `candidate:${optionId}`, first_night: FRI, checkout: SUN, member_ids: ids(ALEX, BLAIR), preview: false,
      expected_revision: 4, expected_people_key: "0".repeat(32), mutation_id: "5d000000-0000-4000-8000-000000000001", replace_nights: true });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(1, "mutate_trip_lodging", expect.objectContaining({
      p_action: "save", p_expected_revision: 4, p_request_id: "5d000000-0000-4000-8000-000000000001", p_replace_nights: true,
      p_payload: expect.objectContaining({ id: optionId, name: "Ridge chalet", check_in: FRI, check_out: SUN, booking_status: "not_booked", location: RIDGE,
        address: "12 Ridge Rd", notes: "Hot tub", existing: false, occupants: ids(ALEX, BLAIR), people_key: "0".repeat(32) }),
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, "mutate_trip_stay_candidate", { p_trip_id: SPLIT_TRIP.id, p_user_id: "user-1", p_action: "remove", p_payload: { id: optionId, expected_revision: 2 } });
  });

  it("moves people into a saved stay for nights within its dates", async () => {
    const preview = await (await use({ option: `stay:${PINE.id}`, first_night: SAT, checkout: SUN, member_ids: ids(ELI), preview: true })).json() as TripStayUsePreview;
    expect(preview).toMatchObject({ new_stay: false, booked_kept: ["Village hotel"], summary: ["Move Eli from Village hotel to Pine rental for the night of Sat Oct 10."], conflicts: [SAT] });
    const saved = await use({ option: `stay:${PINE.id}`, first_night: SAT, checkout: SUN, member_ids: ids(ELI), preview: false,
      expected_revision: 4, expected_people_key: preview.people_key, mutation_id: "5d000000-0000-4000-8000-000000000002", replace_nights: true });
    expect(saved.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_action: "assign", p_payload: { assignments: [{ member_id: ELI.id, status: "assigned", stay_id: PINE.id, dates: [SAT] }] } });
  });

  it("refuses nights a saved stay doesn't cover, and people or stays from elsewhere", async () => {
    const outside = await use({ option: `stay:${LODGE.id}`, first_night: FRI, checkout: SUN, preview: true });
    expect(outside.status).toBe(400);
    expect(await outside.json()).toEqual({ error: "Mountain lodge's dates don't include the nights of Fri Oct 9 and Sat Oct 10. Change its dates on Stays first, or choose nights within them.", field: "first_night" });
    expect((await use({ option: `stay:${VILLAGE.id}`, first_night: FRI, checkout: SUN, member_ids: ["9e000000-0000-4000-8000-000000000001"], preview: true })).status).toBe(404);
    expect((await use({ option: `candidate:9e000000-0000-4000-8000-000000000002`, first_night: FRI, checkout: SUN, preview: true })).status).toBe(404);
    expect((await use({ option: `candidate:${optionId}`, first_night: FRI, checkout: SUN, member_ids: [], preview: true })).status).toBe(400);
    expect((await use({ option: `candidate:${optionId}`, first_night: SUN, checkout: FRI, preview: true })).status).toBe(400);
  });

  it("waits for per-person nights", async () => {
    missing = ["trip_member_lodging_nights"];
    tables.trip_lodging_nights = [];
    const response = await use({ option: `candidate:${optionId}`, first_night: FRI, checkout: SUN, preview: true });
    expect(response.status).toBe(503);
  });

  it("refuses a save the plan changed under", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409" } });
    const response = await use({ option: `candidate:${optionId}`, first_night: FRI, checkout: SUN, member_ids: ids(ALEX), preview: false,
      expected_revision: 3, expected_people_key: "0".repeat(32), mutation_id: "5d000000-0000-4000-8000-000000000003" });
    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
