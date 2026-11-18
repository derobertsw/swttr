import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { avalancheCenterDirectory } from "@/lib/avalanche-centers";
import { STOWE_STOP, TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import type { TripLocation } from "@/types/trips";
import { GET } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));
vi.mock("@/lib/avalanche-centers", () => ({ avalancheCenterDirectory: vi.fn() }));

const DIRECTORY = { verified_on: "2026-11-16", centers: [], suggestions: { status: "none", point: "destination", checked_at: null, items: [] } };
const trailhead: TripLocation = {
  label: "Bolton Valley Nordic Center", address: null, latitude: 44.42, longitude: -72.85, precision: "exact",
  time_zone: null, source: "manual", provider: null, provider_id: null, attribution: null,
};
const day = (extra: Record<string, unknown> = {}) => ({ id: "day-1", trip_id: TRIP.id, date: "2026-10-10", stop_id: STOWE_STOP.id, activity: "Backcountry", ...extra });
const get = (date = "2026-10-10") => GET(new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}/days/${date}/conditions/centers`), {
  params: Promise.resolve({ id: TRIP.id, date }),
});

function signIn(userId: string, tables: Record<string, Record<string, unknown>[]> = {}) {
  const supabase = createFakeSupabase({
    trips: [TRIP as unknown as Record<string, unknown>], trip_members: [{ trip_id: TRIP.id, user_id: "member-user", status: "joined" }],
    trip_stops: [STOWE_STOP as unknown as Record<string, unknown>], trip_days: [day()], ...tables,
  }) as unknown as SupabaseClient;
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase });
}

describe("Official avalanche centers API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(avalancheCenterDirectory).mockResolvedValue(DIRECTORY as never);
    signIn("user-1");
  });

  it("gives the organizer the list with suggestions for the day's destination", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(DIRECTORY);
    expect(avalancheCenterDirectory).toHaveBeenCalledWith({ kind: "destination", latitude: STOWE_STOP.latitude, longitude: STOWE_STOP.longitude });
  });

  it("checks the day's access point before its destination", async () => {
    signIn("user-1", { trip_days: [day({ access_point: trailhead, access_point_stop_id: STOWE_STOP.id })] });
    await get();
    expect(avalancheCenterDirectory).toHaveBeenCalledWith({ kind: "access_point", latitude: 44.42, longitude: -72.85 });
  });

  it("uses the base for a day without a stop, and asks for a place without coordinates", async () => {
    signIn("user-1", { trip_days: [] });
    await get("2026-10-11");
    expect(avalancheCenterDirectory).toHaveBeenLastCalledWith({ kind: "destination", latitude: STOWE_STOP.latitude, longitude: STOWE_STOP.longitude });
    signIn("user-1", { trip_stops: [{ ...STOWE_STOP, latitude: null, longitude: null }] });
    await get();
    expect(avalancheCenterDirectory).toHaveBeenLastCalledWith(null);
  });

  it("is the organizer's, like adding a source", async () => {
    signIn("member-user");
    expect((await get()).status).toBe(403);
    signIn("someone-else");
    expect((await get()).status).toBe(404);
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Sign in" }, { status: 401 }));
    expect((await get()).status).toBe(401);
    expect(avalancheCenterDirectory).not.toHaveBeenCalled();
  });

  it("is 404 for a date outside the trip", async () => {
    expect((await get("2026-10-13")).status).toBe(404);
    expect((await get("not-a-date")).status).toBe(404);
    expect(avalancheCenterDirectory).not.toHaveBeenCalled();
  });
});
