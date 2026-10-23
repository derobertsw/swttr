// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { ORGANIZER, SAM, TRIP, tripFull } from "@/test/tripApi";
import type { TripChecklist } from "@/types/trips";
import { GET } from "./route";

vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn(), loadTripFull: vi.fn() }));

const MEMBER = { ...SAM, id: "member-blair", display_name: "Blair", status: "joined" as const, user_id: "user-blair", invite_token: null };
const full = tripFull({ members: [ORGANIZER, MEMBER], days: [{ id: "day-1", trip_id: TRIP.id, stop_id: null, date: "2026-10-10", activity: null }] });
const get = () => GET(new Request(`http://localhost/api/v1/trips/${TRIP.id}/checklist`) as never, { params: Promise.resolve({ id: TRIP.id }) });

describe("GET day checklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadTripFull).mockResolvedValue(full);
  });

  it("gives any member every day's checklist, naming them and the organizer as the crew sees them", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue({ supabase: {} as SupabaseClient, userId: "user-blair", trip: TRIP });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json() as TripChecklist;
    expect(body.viewer_member_id).toBe("member-blair");
    expect(body.trip).toEqual({ id: TRIP.id, name: TRIP.name, start_date: TRIP.start_date, end_date: TRIP.end_date });
    expect(body.days[0].people.map((person) => person.display_name)).toEqual(["Organizer", "Blair"]);
    expect(requireTripAccess).toHaveBeenCalledWith(TRIP.id);
  });

  it("returns the access check's answer to anyone not on the trip", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Not found" }, { status: 404 }));
    expect((await get()).status).toBe(404);
    expect(loadTripFull).not.toHaveBeenCalled();
  });

  it("says the checklist couldn't load rather than showing part of it", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue({ supabase: {} as SupabaseClient, userId: "user-1", trip: TRIP });
    vi.mocked(loadTripFull).mockRejectedValue(new Error("Couldn't load shared gear. Try again."));
    const response = await get();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Couldn't load the day checklist. Try again." });
  });
});
