// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { requireUser } from "@/lib/api";
import { GET } from "@/app/api/v1/trips/[id]/route";
import { ORGANIZER, SAM, STOWE_STOP, TRIP } from "@/test/tripApi";
import type { TripFull } from "@/types/trips";
import { listTripsForUser, loadTripFull, tripFullFor } from "./trips";

vi.mock("@/lib/api", async (original) => ({
  ...await original<typeof import("@/lib/api")>(),
  requireUser: vi.fn(),
}));

const day = { id: "day-1", trip_id: TRIP.id, date: TRIP.start_date, stop_id: null, activity: null };
const kit = { id: "kit-1", trip_day_id: day.id, trip_member_id: ORGANIZER.id, items: [], effort: "steady", state: "ok", note: null, updated_at: TRIP.updated_at };

/** Real query builder with a delayed HTTP transport, so tests cover request waterfalls. */
function database(
  tables: Record<string, Record<string, unknown>[]> = {},
  delays: Record<string, number> = {},
  failures: string[] = []
) {
  const requests: Array<{ table: string; started: number }> = [];
  const supabase = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        const table = url.pathname.split("/").at(-1)!;
        requests.push({ table, started: Date.now() });
        await new Promise((resolve) => setTimeout(resolve, delays[table] ?? 100));
        if (failures.includes(table)) {
          return Response.json({ message: "Database unavailable", code: "XX000" }, { status: 500 });
        }
        const rows = (tables[table] ?? []).filter((row) => {
          for (const [column, filter] of url.searchParams) {
            if (filter.startsWith("eq.") && String(row[column]) !== filter.slice(3)) return false;
            if (filter.startsWith("neq.") && String(row[column]) === filter.slice(4)) return false;
            if (filter.startsWith("in.(") && !filter.slice(4, -1).split(",").includes(String(row[column]))) return false;
          }
          return true;
        });
        return Response.json(rows);
      },
    },
  });
  return { supabase, requests };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Trip loading", () => {
  it("loads an authorized trip in two network stages and preserves its data", async () => {
    vi.useFakeTimers();
    const { supabase, requests } = database({
      trip_days: [day], trip_member_day_kits: [kit], trip_members: [{ ...ORGANIZER }], trip_stops: [{ ...STOWE_STOP }],
    });
    const started = Date.now();
    const pending = loadTripFull(supabase, TRIP);
    await vi.runAllTimersAsync();
    const full = await pending;

    expect(Date.now() - started).toBe(200);
    expect(requests.map((r) => r.table)).not.toContain("trips");
    // Tour plans (#210) start with the first stage rather than waiting for days.
    expect(requests.find((r) => r.table === "trip_day_tour_plans")?.started).toBe(started);
    // So do conditions sources and reviews (#211).
    expect(requests.filter((r) => r.table.includes("conditions")).map((r) => r.started)).toEqual([started, started, started]);
    expect(full).toMatchObject({ trip: TRIP, days: [day], kits: [kit], members: [ORGANIZER], stops: [STOWE_STOP], lodging: { stays: [], assignments: [] }, tour_plans: [], conditions: [] });
  });

  it("does not turn failed shared gear reads into an empty confirmed list", async () => {
    const { supabase } = database({}, {}, ["trip_group_gear"]);
    await expect(loadTripFull(supabase, TRIP)).rejects.toThrow("Couldn't load shared gear");
  });

  it("starts kits as soon as days load even when another trip query is slow", async () => {
    vi.useFakeTimers();
    const { supabase, requests } = database({ trip_days: [day], trip_member_day_kits: [kit] }, { trip_stops: 500 });
    const started = Date.now();
    const pending = loadTripFull(supabase, TRIP);
    await vi.runAllTimersAsync();
    await pending;

    expect(Date.now() - started).toBe(500);
    expect(requests.find((r) => r.table === "trip_member_day_kits")?.started).toBe(started + 100);
    expect(requests.find((r) => r.table === "trip_stays")?.started).toBe(started);
  });

  it("still supports loading by ID, skips kits without days, and handles missing trips", async () => {
    vi.useFakeTimers();
    const { supabase, requests } = database({ trips: [{ ...TRIP }] });
    const pending = loadTripFull(supabase, TRIP.id);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ trip: TRIP, days: [], kits: [] });
    expect(requests.map((r) => r.table)).not.toContain("trip_member_day_kits");

    const missing = database();
    const absent = loadTripFull(missing.supabase, "missing-trip");
    await vi.runAllTimersAsync();
    expect(await absent).toBeNull();
    expect(missing.requests.map((r) => r.table)).toEqual(["trips"]);
  });

  it("parallelizes list lookups while deduplicating owned trips and excluding left memberships", async () => {
    vi.useFakeTimers();
    const shared = { ...TRIP, id: "shared-trip", owner_user_id: "other-user", start_date: "2026-10-09" };
    const left = { ...TRIP, id: "left-trip", owner_user_id: "other-user" };
    const { supabase } = database({
      trips: [{ ...TRIP }, shared, left],
      trip_stops: [{ ...STOWE_STOP }],
      trip_members: [{ ...ORGANIZER },
        { ...ORGANIZER, id: "shared-member", trip_id: shared.id },
        { ...ORGANIZER, id: "left-member", trip_id: left.id, status: "left" }],
    });
    const started = Date.now();
    const pending = listTripsForUser(supabase, ORGANIZER.user_id!);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual([
      { ...shared, member_count: 1, stop_count: 0, crew_counts: { joined: 1, pending: 0, guests: 0 } },
      { ...TRIP, member_count: 1, stop_count: 1, crew_counts: { joined: 1, pending: 0, guests: 0 } },
    ]);
    expect(Date.now() - started).toBe(300);
  });

  it("counts accounts, invitations and managed guests separately, omitting left members", async () => {
    const { supabase } = database({
      trips: [{ ...TRIP }], trip_members: [{ ...ORGANIZER },
        { ...ORGANIZER, id: "pending", user_id: null, status: "invited" },
        { ...ORGANIZER, id: "guest", user_id: null, status: "guest" },
        { ...ORGANIZER, id: "left", user_id: "left-user", status: "left" }],
    });
    expect((await listTripsForUser(supabase, ORGANIZER.user_id!))[0]).toMatchObject({
      member_count: 3, crew_counts: { joined: 1, pending: 1, guests: 1 },
    });
  });

  it.each(["owner", "member", "left", "outsider"])("keeps GET access checks for %s users before reading related data", async (kind) => {
    vi.useFakeTimers();
    const { supabase, requests } = database({
      trips: [{ ...TRIP, owner_user_id: kind === "owner" ? TRIP.owner_user_id : "another-owner" }],
      trip_members: [{ ...ORGANIZER, status: kind === "left" ? "left" : "joined" }],
    });
    vi.mocked(requireUser).mockResolvedValue({ supabase, userId: kind === "owner" ? TRIP.owner_user_id : kind === "outsider" ? "outsider" : ORGANIZER.user_id! });
    const pending = GET(new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}`), { params: Promise.resolve({ id: TRIP.id }) });
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(kind === "left" || kind === "outsider" ? 404 : 200);
    expect(requests.filter((r) => r.table === "trips")).toHaveLength(1);
    if (kind === "left" || kind === "outsider") {
      expect(requests.every((r) => ["trips", "trip_members"].includes(r.table))).toBe(true);
    }
  });

  it.each([true, false])("never exposes used recovery tokens, and scopes pending tokens to the owner (%s)", async (owner) => {
    vi.useFakeTimers();
    const trip = { ...TRIP, owner_user_id: owner ? ORGANIZER.user_id! : "other-owner" };
    const { supabase } = database({
      trips: [trip], trip_members: [{ ...ORGANIZER, invite_token: "used-recovery-token" }, { ...SAM }],
    });
    vi.mocked(requireUser).mockResolvedValue({ supabase, userId: ORGANIZER.user_id! });
    const pending = GET(new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}`), { params: Promise.resolve({ id: TRIP.id }) });
    await vi.runAllTimersAsync();
    const result = await (await pending).json();
    expect(result).toMatchObject({ crew_counts: { joined: 1, pending: 1, guests: 0 }, conditions: [] });
    expect(result.members.find((m: { id: string }) => m.id === ORGANIZER.id).invite_token).toBeNull();
    expect(result.members.find((m: { id: string }) => m.id === SAM.id).invite_token).toBe(owner ? SAM.invite_token : null);
  });

  it.each([
    ["the organizer", "You", ORGANIZER.user_id!],
    ["a member", "Organizer", "user-2"],
  ])("names the organizer's own row for %s as %s", async (_viewer, name, userId) => {
    vi.useFakeTimers();
    const { supabase } = database({
      trips: [{ ...TRIP }], trip_members: [{ ...ORGANIZER }, { ...SAM, user_id: "user-2", status: "joined" }],
    });
    vi.mocked(requireUser).mockResolvedValue({ supabase, userId });
    const pending = GET(new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}`), { params: Promise.resolve({ id: TRIP.id }) });
    await vi.runAllTimersAsync();
    const result = await (await pending).json();
    expect(result.members.map((m: { display_name: string }) => m.display_name)).toEqual([name, SAM.display_name]);
  });

  it("keeps a name the organizer gave their row, and a guest's name, for everyone", () => {
    const full = { trip: TRIP, members: [{ ...ORGANIZER, display_name: "Will" }, { ...SAM, role: "guest", status: "guest", user_id: null, display_name: "You" }] } as TripFull;
    expect(tripFullFor(full, "user-2").members.map((m) => m.display_name)).toEqual(["Will", "You"]);
    expect(tripFullFor(full, TRIP.owner_user_id)).toBe(full);
  });

  it("returns the existing error response when accommodation fails in parallel", async () => {
    vi.useFakeTimers();
    const { supabase } = database({ trips: [{ ...TRIP }] }, {}, ["trip_stays"]);
    vi.mocked(requireUser).mockResolvedValue({ supabase, userId: TRIP.owner_user_id });
    const pending = GET(new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}`), { params: Promise.resolve({ id: TRIP.id }) });
    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Couldn't load the trip. Try again." });
  });
});
