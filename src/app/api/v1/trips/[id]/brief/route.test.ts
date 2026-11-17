import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess } from "@/lib/trips";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { ORGANIZER, SAM, STOWE_STOP, TRIP } from "@/test/tripApi";
import { savedOutfit } from "@/test/savedKit";
import type { TripOfflineBriefResponse } from "@/types/trip-offline-brief";
import { GET } from "./route";

vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn() }));

// Saturday–Monday at Stowe. Alex has joined; Sam's invitation is pending.
const ALEX = { ...SAM, id: "member-alex", user_id: "user-2", display_name: "Alex", status: "joined", invite_token: null };
const days = [
  { id: "day-10", trip_id: TRIP.id, date: "2026-10-10", stop_id: STOWE_STOP.id, activity: "Alpine", notes: "Lift tickets at the window" },
  { id: "day-11", trip_id: TRIP.id, date: "2026-10-11", stop_id: STOWE_STOP.id, activity: "Hike" },
  { id: "day-12", trip_id: TRIP.id, date: "2026-10-12", stop_id: null, activity: "Travel" },
];
const kits = [
  { id: "kit-you", trip_day_id: "day-10", trip_member_id: ORGANIZER.id, effort: "steady", items: [], note: null, state: "ok", updated_at: TRIP.updated_at, outfit: savedOutfit() },
  { id: "kit-alex", trip_day_id: "day-10", trip_member_id: ALEX.id, effort: "easy", items: ["gloves"], note: "Alex only", state: "ok", updated_at: TRIP.updated_at },
];
const get = (query = "") => GET(
  new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}/brief${query}`),
  { params: Promise.resolve({ id: TRIP.id }) },
);
const signIn = (userId: string) => {
  const supabase = createFakeSupabase({
    trips: [TRIP], trip_stops: [STOWE_STOP], trip_members: [ORGANIZER, SAM, ALEX],
    trip_days: structuredClone(days), trip_member_day_kits: structuredClone(kits), trip_group_gear: [],
  } as unknown as Parameters<typeof createFakeSupabase>[0]) as unknown as SupabaseClient;
  vi.mocked(requireTripAccess).mockResolvedValue({ supabase, userId, trip: TRIP });
};

describe("GET /api/v1/trips/:id/brief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-01T12:00:00Z"));
  });

  it("answers someone who isn't on the trip as the trip API does, and keeps the answer out of every cache", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Not found" }, { status: 404 }));
    const response = await get();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(requireTripAccess).toHaveBeenCalledWith(TRIP.id);
  });

  it("builds the signed-in member's brief of the trip's days ahead, from the trip's own reads", async () => {
    signIn("user-2");
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie, Authorization");
    const body = await response.json() as TripOfflineBriefResponse;
    expect(body.default_dates).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
    expect(body.trip_days.map((day) => day.activity_label)).toEqual(["Downhill skiing", "Hike", "Travel"]);
    expect(body.brief).toMatchObject({
      viewer: { user_id: "user-2", member_id: "member-alex" },
      covered: { dates: ["2026-10-10", "2026-10-11", "2026-10-12"], label: "Sat Oct 10 – Mon Oct 12" },
    });
    expect(body.brief.days[0]).toMatchObject({ notes: "Lift tickets at the window", kit: { kind: "checklist", items: ["Gloves"] } });
    // Nobody else's kit, and no invitation links, in a member's copy.
    const text = JSON.stringify(body);
    expect(text).not.toContain("invite-sam");
    expect(text).not.toContain("Merino crew");
  });

  it("covers the chosen days only", async () => {
    signIn("user-1");
    const body = await (await get("?dates=2026-10-11,2026-10-10")).json() as TripOfflineBriefResponse;
    expect(body.brief.covered.dates).toEqual(["2026-10-10", "2026-10-11"]);
    expect(body.brief.days[0].kit).toMatchObject({ kind: "outfit" });
    expect(JSON.stringify(body)).not.toContain("Alex only");
  });

  it("refuses days it can't read, and days the trip no longer has", async () => {
    signIn("user-1");
    expect((await get("?dates=2026-10-32")).status).toBe(400);
    expect((await get("?dates=")).status).toBe(400);
    const gone = await get("?dates=2026-11-01");
    expect(gone.status).toBe(409);
    expect(await gone.json()).toEqual({ error: "None of these days are on the trip any more. Choose the days to save again." });
  });
});
