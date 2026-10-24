// @vitest-environment node
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/api";
import { driveTrip } from "@/test/driveTrip";
import { GET } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));
const full = driveTrip();
const get = (query = "", id = full.trip.id) => GET(new Request(`https://example.com/api/v1/trips/${id}/map${query}`), { params: Promise.resolve({ id }) });

/**
 * Exercise actual access helper, PostgREST query builder, loading and projection together.
 * Without `perMember`, the database is from before per-person nights (#331) and has only the crew's.
 */
function database(status = "joined", userId = "member", failures: string[] = [], perMember = true) {
  const requests: URL[] = [];
  const tables: Record<string, unknown[]> = {
    trips: [full.trip], trip_stops: full.stops, trip_days: full.days, trip_stays: full.lodging!.stays,
    ...perMember ? { trip_member_lodging_nights: full.lodging!.assignments.map((night) => ({ ...night, member_id: "membership" })) }
      : { trip_lodging_nights: full.lodging!.assignments },
    trip_members: [{ id: "membership", trip_id: full.trip.id, user_id: "member", display_name: "Sam", role: "member", status, invite_token: "SECRET" }],
  };
  const supabase = createClient("https://example.supabase.co", "test-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push(url);
      expect(init?.method ?? "GET").toBe("GET");
      const table = url.pathname.split("/").at(-1)!;
      if (failures.includes(table)) return Response.json({ code: "XX000", message: "database secret" }, { status: 500 });
      if (!perMember && table.startsWith("trip_member_")) return Response.json({ code: "PGRST205", message: "missing table" }, { status: 404 });
      const rows = (tables[table] ?? []).filter((value) => {
        const row = value as Record<string, unknown>;
        return [...url.searchParams].every(([column, filter]) => !filter.startsWith("eq.") && !filter.startsWith("neq.")
          || (filter.startsWith("eq.") ? String(row[column]) === filter.slice(3) : String(row[column]) !== filter.slice(4)));
      });
      return Response.json(rows);
    } },
  });
  vi.mocked(requireUser).mockResolvedValue({ supabase, userId });
  return { requests, tables };
}

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Provider calls forbidden")); });
afterEach(() => vi.restoreAllMocks());

describe("GET trip map", () => {
  it.each([["user-1", true], ["member", true], ["member", false]])("loads for an authorized %s with private headers, no provider and no kit/invite reads (per person: %s)", async (user, perMember) => {
    const { requests } = database("joined", user as string, [], perMember as boolean);
    const response = await get("?date=2027-01-10");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toContain("Authorization");
    expect(await response.json()).toMatchObject({ scope: { date: "2027-01-10" }, days: [{ starting_from: "Stowe Motel", staying_tonight: "Village Inn" }] });
    expect(requests.some((url) => /kits|gear|conditions/.test(url.pathname))).toBe(false);
    // The access check, and lodging's names and memberships: never invitation links.
    const members = requests.filter((url) => url.pathname.endsWith("trip_members"));
    expect(members).toHaveLength(user === "member" ? 2 : 1);
    expect(members.every((url) => !/\*|invite_token/.test(url.searchParams.get("select") ?? "*"))).toBe(true);
    for (const url of requests.filter((url) => !url.pathname.endsWith("trips"))) expect(url.searchParams.get("trip_id")).toBe(`eq.${full.trip.id}`);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it.each([["joined", "outsider"], ["left", "member"]])("denies %s/%s before loading places", async (status, user) => {
    const { requests } = database(status, user);
    const response = await get();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(requests.every((url) => /\/(trips|trip_members)$/.test(url.pathname))).toBe(true);
  });
  it("denies a cross-trip ID without loading the original trip's places", async () => {
    const { requests } = database();
    expect((await get("", "another-trip")).status).toBe(404);
    expect(requests.every((url) => url.pathname.endsWith("/trips"))).toBe(true);
  });
  it("rejects invalid or absent dates without guessing another day", async () => {
    database();
    expect((await get("?date=2027-02-30")).status).toBe(400);
    expect((await get("?date=2028-01-01")).status).toBe(404);
  });
  it("sanitizes failures and fails closed when the itinerary cannot load", async () => {
    database("joined", "member", ["trip_stops"]);
    const response = await get();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("database secret");
  });
  it("keeps places available when the estimate tables fail", async () => {
    database("joined", "member", ["trip_drive_estimates", "trip_drive_manual_estimates"]);
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ days: [expect.anything(), { drive: { state: "unavailable" } }, expect.anything(), expect.anything()] });
  });
  it("returns a private 401 when signed out", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Authentication required" }, { status: 401 }));
    const response = await get();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("bounds reads with the existing per-user limiter", async () => {
    const { tables } = database("joined", "rate-user");
    tables.trips = [{ ...full.trip, owner_user_id: "rate-user" }];
    for (let i = 0; i < 60; i++) expect((await get()).status).toBe(200);
    const response = await get();
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("refuses a tour that references a different trip's day before summarization", async () => {
    const { tables } = database();
    tables.trip_day_tour_plans = [{ trip_id: full.trip.id, trip_day_id: "foreign-day" }];
    expect((await get()).status).toBe(500);
  });
  it("refuses foreign source rows even if a database transport returns them", async () => {
    const { tables } = database();
    tables.trip_days = [{ ...full.days[0], stop_id: "foreign-stop" }];
    expect((await get()).status).toBe(500);
  });
});
