// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { TRIP } from "@/test/tripApi";
import pilot from "@/test/fixtures/geoapify-pilot.json";
import { GET } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));

const fetchMock = vi.fn();
const context = { params: Promise.resolve({ id: TRIP.id }) };
const search = (q: string | null) => GET(new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}/locations${q === null ? "" : `?q=${encodeURIComponent(q)}`}`), context);
let clock = Date.now();
const OTHER_TRIP = { ...TRIP, id: "trip-2", owner_user_id: "other-user" };

function signIn(userId: string) {
  const supabase = createFakeSupabase({
    trips: [TRIP, OTHER_TRIP] as unknown as Record<string, unknown>[],
    trip_members: [{ trip_id: TRIP.id, user_id: "member-user", status: "joined" }],
    trip_stops: [
      { trip_id: TRIP.id, latitude: 44.938, longitude: -72.505 },
      { trip_id: TRIP.id, latitude: null, longitude: null },
      { trip_id: OTHER_TRIP.id, latitude: 35.68, longitude: 139.69 },
    ],
  }) as unknown as SupabaseClient;
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase });
}

describe("Trip location search API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    // Each test starts with an empty search allowance.
    clock += 10 * 60_000;
    vi.setSystemTime(clock);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEOAPIFY_API_KEY", "test-key");
    vi.spyOn(console, "info").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(pilot.hotel_jay)));
    signIn("user-1");
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("returns places near this trip's destinations for the organizer", async () => {
    const response = await search("Hotel Jay");
    expect(response.status).toBe(200);
    const { results } = await response.json();
    expect(results.map((result: { label: string }) => result.label)).toEqual(["Hotel Jay & Conference Center", "Stateside Hotel & Base Lodge"]);
    // Only this trip's stops with coordinates bias the search.
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("bias")).toBe("proximity:-72.505,44.938");
  });
  it("tells members that logistics are the organizer's, without searching", async () => {
    signIn("member-user");
    expect((await search("Hotel Jay")).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("doesn't disclose another trip", async () => {
    signIn("user-1");
    const response = await GET(new NextRequest("http://localhost/api/v1/trips/trip-2/locations?q=Hotel"), { params: Promise.resolve({ id: "trip-2" }) });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires sign-in", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Authentication required" }, { status: 401 }));
    expect((await search("Hotel Jay")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([[null], ["  ab "], ["x".repeat(201)]])("rejects a query that is missing, too short or too long (%#)", async (q) => {
    expect((await search(q)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("answers no matches with an empty list", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ results: [] })));
    const response = await search("Nowhere Inn");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [] });
  });
  it.each([
    ["the provider fails", () => { fetchMock.mockImplementation(async () => new Response("Internal provider details", { status: 500 })); }],
    ["the quota is spent", () => { fetchMock.mockImplementation(async () => new Response("{}", { status: 429 })); }],
    ["no key is configured", () => { vi.stubEnv("GEOAPIFY_API_KEY", ""); }],
  ])("says search is unavailable when %s, without provider details", async (_, arrange) => {
    arrange();
    const response = await search("Hotel Jay");
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: "Location search isn't available right now.", code: "unavailable" });
  });
  it("limits each person to 30 searches a minute", async () => {
    for (let i = 0; i < 30; i += 1) expect((await search(`Hotel ${i}`)).status).toBe(200);
    const limited = await search("Hotel 31");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "rate_limited" });
    expect(fetchMock).toHaveBeenCalledTimes(30);
    vi.setSystemTime(Date.now() + 61_000);
    expect((await search("Hotel 32")).status).toBe(200);
  });
});
