import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { GET } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));

const dayId = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const memberId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const stop = { id: "stop-1", trip_id: TRIP.id, position: 0, name: "Pinkham Notch", latitude: 44.26, longitude: -71.25, activities: ["Backcountry"] };
const context = (date = "2026-10-10") => ({ params: Promise.resolve({ id: TRIP.id, date }) });
const get = (date?: string) => GET(new Request(`http://localhost/api/v1/trips/${TRIP.id}/days/${date ?? "2026-10-10"}/outing`), context(date));

function signIn(userId: string, day: Record<string, unknown> = {}) {
  const tables = {
    trips: [TRIP as unknown as Record<string, unknown>],
    trip_members: [{ id: memberId, trip_id: TRIP.id, user_id: "user-1", display_name: "You", role: "organizer", status: "joined" }],
    trip_days: [{ id: dayId, trip_id: TRIP.id, date: "2026-10-10", stop_id: null, activity: null, meet_time: "06:30:00", meet_day_offset: 0, meet_time_zone: "America/New_York", ...day }],
    trip_stops: [stop],
  };
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase: createFakeSupabase(tables) as unknown as SupabaseClient });
}

describe("A trip day's outing for Gear up (#335)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-07T12:00:00Z") });
    // The destination's zone comes from the meet time here; nothing is looked up.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected request"))));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("gives the signed-in person's outing for the day, at its meet time, on the destination's clock", async () => {
    signIn("user-1");
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ready",
      outing: {
        activity: "backcountry_skiing",
        place: { name: "Pinkham Notch", latitude: 44.26, longitude: -71.25, timeZone: "America/New_York" },
        when: { mode: "later", date: "2026-10-10", time: "06:30", durationDays: 1 },
      },
      context: { trip_id: TRIP.id, date: "2026-10-10", member_id: memberId, planned: { day_id: dayId, activity: "Backcountry" } },
    });
  });

  it("looks the zone up from the stop when the day doesn't say", async () => {
    signIn("user-1", { meet_time: null, meet_time_zone: null });
    const lookup = vi.fn(async () => Response.json({ timezone: "America/New_York" }));
    vi.stubGlobal("fetch", lookup);
    expect((await (await get()).json()).outing.place.timeZone).toBe("America/New_York");
    expect(lookup).toHaveBeenCalledOnce();
  });

  it("says why layers can't be planned, still naming the day", async () => {
    signIn("user-1", { activity: "Travel" });
    expect(await (await get()).json()).toMatchObject({ status: "no_clothing", outing: null, context: { date: "2026-10-10" } });
  });

  it("is not found for a day off the trip, a malformed date, or someone not on it", async () => {
    signIn("user-1");
    expect((await get("2026-10-12")).status).toBe(404);
    expect((await get("Oct 10")).status).toBe(404);
    signIn("user-2");
    expect((await get()).status).toBe(404);
  });

  it("needs a signed-in user", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Authentication required" }, { status: 401 }));
    expect((await get()).status).toBe(401);
  });
});
