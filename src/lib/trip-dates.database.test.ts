// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { previewDateChange } from "@/lib/trip-dates";
import type { Trip, TripDay, TripFull, TripMember, TripMemberDayKit, TripStop } from "@/types/trips";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const stowe = "5b7f1f7e-3c52-4c39-9d0e-0a3c1f0b6a11";
const smuggs = "8c2d6a90-1b4e-4f7a-a0c1-6d5e2b9f3c22";
const hotel = "40f9f55e-0e74-4c4a-923f-d7a3f92468a0";
let db: PGlite;
let kits: { friday: string; sunday: string };

const shiftDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
type Removed = { date: string; stop_id: string | null; activity: string | null; kit_ids: string[] };
type Change = { from?: [string, string]; to: [string, string]; mode: "move" | "keep"; user?: string; name?: string | null; lodging?: number | null; removed?: Removed[] };
const change = async ({ from = ["2026-10-09", "2026-10-11"], to, mode, user = "user-1", name = null, lodging = null, removed = [] }: Change) =>
  (await db.query<{ result: { trip: Trip; changed: boolean } }>(
    "SELECT public.change_trip_dates($1, $2, $3, $4, $5, $6, $7, 'planning', $8, $9, $10) AS result",
    [tripId, user, from[0], from[1], to[0], to[1], mode, name, lodging, JSON.stringify(removed)]
  )).rows[0].result;
const days = async () => (await db.query<{ date: string; stop_id: string | null; activity: string | null; kits: string[] }>(
  `SELECT d.date::text, d.stop_id, d.activity,
     coalesce(array_agg(k.id::text ORDER BY k.id) FILTER (WHERE k.id IS NOT NULL), '{}') AS kits
   FROM trip_days d LEFT JOIN trip_member_day_kits k ON k.trip_day_id = d.id
   WHERE d.trip_id = $1 GROUP BY d.id ORDER BY d.date`, [tripId])).rows;
const loadFull = async (): Promise<TripFull> => {
  const rows = async <T,>(sql: string) => (await db.query<T>(sql, [tripId])).rows;
  return {
    trip: (await rows<Trip>("SELECT id, owner_user_id, name, start_date::text, end_date::text, status, lodging_revision FROM trips WHERE id = $1"))[0],
    stops: await rows<TripStop>("SELECT id, name FROM trip_stops WHERE trip_id = $1 ORDER BY position"),
    members: await rows<TripMember>("SELECT id, display_name FROM trip_members WHERE trip_id = $1"),
    days: await rows<TripDay>("SELECT id, date::text, stop_id, activity FROM trip_days WHERE trip_id = $1"),
    kits: await rows<TripMemberDayKit>("SELECT k.id, k.trip_day_id, k.trip_member_id FROM trip_member_day_kits k JOIN trip_days d ON d.id = k.trip_day_id WHERE d.trip_id = $1"),
    gear: [],
  };
};
const tripDates = async () => (await db.query<{ start_date: string; end_date: string; name: string }>(
  "SELECT start_date::text, end_date::text, name FROM trips WHERE id = $1", [tripId])).rows[0];

describe("Trip date changes in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    await db.exec(await readFile("supabase/migrations/012_trips.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/017_trip_stays.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/021_trip_date_changes.sql", "utf8"));
  }, 20_000);

  // Friday–Sunday: Friday at Stowe skiing, Saturday at Smuggs hiking, Sunday
  // unplanned. You have a kit on Friday and Sam has one on Sunday.
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-1', 'Weekend', '2026-10-09', '2026-10-11')", [tripId]);
    await db.query("INSERT INTO trip_stops (id, trip_id, position, name) VALUES ($1, $3, 0, 'Stowe'), ($2, $3, 1, 'Smuggs')", [stowe, smuggs, tripId]);
    await db.query("INSERT INTO trip_days (trip_id, date, stop_id, activity) VALUES ($1, '2026-10-09', $2, 'Ski touring'), ($1, '2026-10-10', $3, 'Hiking'), ($1, '2026-10-11', NULL, NULL)", [tripId, stowe, smuggs]);
    await db.query("INSERT INTO trip_members (trip_id, user_id, display_name, role, status) VALUES ($1, 'user-1', 'You', 'organizer', 'joined'), ($1, 'user-2', 'Sam', 'member', 'joined'), ($1, 'user-3', 'Alex', 'member', 'left')", [tripId]);
    const kit = async (date: string, member: string) => (await db.query<{ id: string }>(
      "INSERT INTO trip_member_day_kits (trip_day_id, trip_member_id) SELECT d.id, m.id FROM trip_days d, trip_members m WHERE d.trip_id = $1 AND d.date = $2 AND m.trip_id = $1 AND m.display_name = $3 RETURNING id",
      [tripId, date, member])).rows[0].id;
    kits = { friday: await kit("2026-10-09", "You"), sunday: await kit("2026-10-11", "Sam") };
  });
  afterAll(async () => { await db?.close(); });

  it("moves every day with its destination, activity and kits, and keeps the length", async () => {
    const before = await days();
    const result = await change({ to: ["2026-10-16", "2026-10-18"], mode: "move" });
    expect(result).toMatchObject({ changed: true, trip: { start_date: "2026-10-16", end_date: "2026-10-18" } });
    const moved = ["2026-10-16", "2026-10-17", "2026-10-18"];
    expect(await days()).toEqual(before.map((day, i) => ({ ...day, date: moved[i] })));
  });

  it("moves a trip by one day in either direction without two days sharing a date", async () => {
    await change({ to: ["2026-10-10", "2026-10-12"], mode: "move" });
    expect((await days()).map((day) => [day.date, day.activity])).toEqual([["2026-10-10", "Ski touring"], ["2026-10-11", "Hiking"], ["2026-10-12", null]]);
    await change({ from: ["2026-10-10", "2026-10-12"], to: ["2026-10-08", "2026-10-10"], mode: "move" });
    expect((await days()).map((day) => [day.date, day.activity])).toEqual([["2026-10-08", "Ski touring"], ["2026-10-09", "Hiking"], ["2026-10-10", null]]);
    expect((await days()).flatMap((day) => day.kits).sort()).toEqual([kits.friday, kits.sunday].sort());
  });

  it("keeps plans on their dates and gives added days the nearest day's destination without an activity", async () => {
    await change({ to: ["2026-10-08", "2026-10-13"], mode: "keep" });
    expect((await days()).map(({ date, stop_id, activity }) => [date, stop_id, activity])).toEqual([
      ["2026-10-08", stowe, null],
      ["2026-10-09", stowe, "Ski touring"],
      ["2026-10-10", smuggs, "Hiking"],
      ["2026-10-11", null, null],
      ["2026-10-12", null, null],
      ["2026-10-13", null, null],
    ]);
  });

  it("removes days and their kits only when the reviewed list matches", async () => {
    const reviewed: Removed[] = [{ date: "2026-10-11", stop_id: null, activity: null, kit_ids: [kits.sunday] }];
    await expect(change({ to: ["2026-10-09", "2026-10-10"], mode: "keep" })).rejects.toMatchObject({ code: "40001" });
    expect(await days()).toHaveLength(3);
    await change({ to: ["2026-10-09", "2026-10-10"], mode: "keep", removed: reviewed });
    expect((await days()).map((day) => day.date)).toEqual(["2026-10-09", "2026-10-10"]);
    expect((await db.query("SELECT id FROM trip_member_day_kits")).rows).toEqual([{ id: kits.friday }]);
  });

  it("refuses to remove a day whose plan or kits changed after the review", async () => {
    const reviewed: Removed[] = [{ date: "2026-10-11", stop_id: null, activity: null, kit_ids: [kits.sunday] }];
    await db.query("UPDATE trip_days SET activity = 'Hiking' WHERE trip_id = $1 AND date = '2026-10-11'", [tripId]);
    await expect(change({ to: ["2026-10-09", "2026-10-10"], mode: "keep", removed: reviewed })).rejects.toMatchObject({ code: "40001" });
    await db.query("UPDATE trip_days SET activity = NULL WHERE trip_id = $1 AND date = '2026-10-11'", [tripId]);
    await db.query("INSERT INTO trip_member_day_kits (trip_day_id, trip_member_id) SELECT d.id, m.id FROM trip_days d, trip_members m WHERE d.trip_id = $1 AND d.date = '2026-10-11' AND m.display_name = 'You'", [tripId]);
    await expect(change({ to: ["2026-10-09", "2026-10-10"], mode: "keep", removed: reviewed })).rejects.toMatchObject({ code: "40001" });
    expect(await days()).toHaveLength(3);
  });

  it("requires the dates the change was reviewed for", async () => {
    await expect(change({ from: ["2026-10-09", "2026-10-12"], to: ["2026-10-16", "2026-10-18"], mode: "move" })).rejects.toMatchObject({ code: "40001" });
    expect(await tripDates()).toMatchObject({ start_date: "2026-10-09", end_date: "2026-10-11" });
  });

  it("only moves a trip when its length stays the same, and rejects invalid ranges", async () => {
    await expect(change({ to: ["2026-10-16", "2026-10-19"], mode: "move" })).rejects.toMatchObject({ code: "22023" });
    await expect(change({ to: ["2026-10-12", "2026-10-10"], mode: "keep" })).rejects.toMatchObject({ code: "22023" });
    await expect(change({ to: ["2026-10-09", "2027-10-10"], mode: "keep" })).rejects.toMatchObject({ code: "22023" });
    expect(await days()).toHaveLength(3);
  });

  it("returns the saved trip for a retry of a change that already happened", async () => {
    await change({ to: ["2026-10-16", "2026-10-18"], mode: "move", name: "Leaf peeping" });
    const before = await days();
    const retry = await change({ to: ["2026-10-16", "2026-10-18"], mode: "move", name: "Leaf peeping" });
    expect(retry).toMatchObject({ changed: false, trip: { name: "Leaf peeping", start_date: "2026-10-16" } });
    expect(await days()).toEqual(before);
  });

  it("lets any joined member change the dates, but not someone who left or isn't on the trip", async () => {
    await expect(change({ to: ["2026-10-16", "2026-10-18"], mode: "move", user: "user-3" })).rejects.toMatchObject({ code: "42501" });
    await expect(change({ to: ["2026-10-16", "2026-10-18"], mode: "move", user: "user-4" })).rejects.toMatchObject({ code: "42501" });
    expect((await change({ to: ["2026-10-16", "2026-10-18"], mode: "move", user: "user-2" })).changed).toBe(true);
  });

  it("requires the reviewed lodging revision and keeps stay dates and nights", async () => {
    await db.query("INSERT INTO trip_stays (id, trip_id, name, check_in, check_out, booking_status) VALUES ($1, $2, 'Hotel', '2026-10-09', '2026-10-11', 'booked')", [hotel, tripId]);
    await db.query("INSERT INTO trip_lodging_nights (trip_id, date, stay_id, status) VALUES ($1, '2026-10-09', $2, 'assigned'), ($1, '2026-10-10', $2, 'assigned')", [tripId, hotel]);
    await expect(change({ to: ["2026-10-16", "2026-10-18"], mode: "move" })).rejects.toMatchObject({ code: "40001" });
    await expect(change({ to: ["2026-10-16", "2026-10-18"], mode: "move", lodging: 1 })).rejects.toMatchObject({ code: "40001" });
    await change({ to: ["2026-10-16", "2026-10-18"], mode: "move", lodging: 0 });
    expect((await db.query("SELECT check_in::text, check_out::text, booking_status FROM trip_stays")).rows).toEqual([{ check_in: "2026-10-09", check_out: "2026-10-11", booking_status: "booked" }]);
    expect((await db.query("SELECT date::text FROM trip_lodging_nights ORDER BY date")).rows).toEqual([{ date: "2026-10-09" }, { date: "2026-10-10" }]);
    // The trigger from 017 invalidates old stay previews.
    expect((await db.query("SELECT lodging_revision FROM trips")).rows).toEqual([{ lodging_revision: 1 }]);
  });

  it.each([
    ["move", "2026-10-12", "2026-10-14"],
    ["keep", "2026-10-12", "2026-10-14"],
    ["keep", "2026-10-07", "2026-10-09"],
  ] as const)("applies exactly the previewed %s plan for %s to %s", async (mode, start, end) => {
    const plan = previewDateChange(await loadFull(), start, end).plans[mode]!;
    await change({ to: [start, end], mode, removed: plan.expected_removed });
    const after = await days();
    const stopNames: Record<string, string> = { [stowe]: "Stowe", [smuggs]: "Smuggs" };
    const destination = (stopId: string | null) => stopId ? stopNames[stopId] : "Stowe (base)";
    for (const day of [...plan.moved, ...plan.added]) {
      const saved = after.find((row) => row.date === day.date);
      expect(saved && [destination(saved.stop_id), saved.activity]).toEqual([day.destination, day.activity]);
    }
    expect(after.map((day) => day.date)).toEqual([start, shiftDays(start, 1), end]);
  });

  it("is executable only by the service role", async () => {
    const grants = (await db.query<{ role: string; allowed: boolean }>(
      "SELECT r AS role, has_function_privilege(r, 'public.change_trip_dates(uuid, text, date, date, date, date, text, public.trip_status, text, integer, jsonb)', 'EXECUTE') AS allowed FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r"
    )).rows;
    expect(grants).toEqual([{ role: "anon", allowed: false }, { role: "authenticated", allowed: false }, { role: "service_role", allowed: true }]);
  });
});
