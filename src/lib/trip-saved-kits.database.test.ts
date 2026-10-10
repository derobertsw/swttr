// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Trip, TripMemberDayKit } from "@/types/trips";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const crewTrip = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";
let db: PGlite;

type Saved = { status: "saved"; trip: Trip; created: boolean; kits: Array<TripMemberDayKit & { date: string }>; replayed?: boolean };
type Conflict = { status: "conflict"; trip: Trip; conflicts: Array<{ date: string; kit: TripMemberDayKit }> };

const outfit = (name = "Merino base") => ({ version: 1, wear: name });
const day = (date = "2026-10-10", extra: object = {}) => ({ date, effort: "steady", activity: "Alpine", outfit: outfit(), ...extra });
const NEW_TRIP = {
  name: "Stowe trip", start_date: "2026-10-10", end_date: "2026-10-10", status: "planning",
  destination: { name: "Stowe, Vermont", latitude: 44.47, longitude: -72.69 }, activity: "Alpine",
};

async function save(options: {
  saveId?: string; user?: string; trip?: string; newTrip?: object | null; days?: object[]; replace?: object;
} = {}): Promise<Saved | Conflict> {
  const { saveId = randomUUID(), user = "user-1", trip = tripId, newTrip = null, days = [day()], replace = {} } = options;
  const result = await db.query<{ result: Saved | Conflict }>(
    "SELECT public.save_trip_kits($1, $2, $3, $4, $5, $6) AS result",
    [saveId, user, trip, newTrip && JSON.stringify(newTrip), JSON.stringify(days), JSON.stringify(replace)]
  );
  return result.rows[0].result;
}

const kits = async () => (await db.query<{ date: string; member: string; items: string[]; outfit: { wear: string } | null; effort: string; note: string | null }>(
  "SELECT d.date::text, m.display_name AS member, k.items, k.outfit, k.effort::text, k.note FROM trip_member_day_kits k JOIN trip_days d ON d.id = k.trip_day_id JOIN trip_members m ON m.id = k.trip_member_id ORDER BY d.date, m.display_name"
)).rows;
const counts = async () => (await db.query("SELECT (SELECT count(*)::int FROM trips) AS trips, (SELECT count(*)::int FROM trip_days) AS days, (SELECT count(*)::int FROM trip_member_day_kits) AS kits, (SELECT count(*)::int FROM trip_kit_saves) AS saves")).rows[0];

describe("Saving outing kits to a trip in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    await db.exec(await readFile("supabase/migrations/012_trips.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/016_atomic_trip_creation.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/018_trip_saved_kits.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/019_trip_kit_save_tombstones.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/020_trip_kit_save_stable_hash.sql", "utf8"));
  }, 20_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    // A crew trip organized by user-2, which user-1 joined, plus a guest and a member who left.
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-2', 'Crew weekend', '2026-10-09', '2026-10-11')", [crewTrip]);
    await db.query("INSERT INTO trip_members (trip_id, user_id, display_name, role, status) VALUES ($1, 'user-2', 'You', 'organizer', 'joined'), ($1, 'user-1', 'Ana', 'member', 'joined'), ($1, NULL, 'Sam', 'guest', 'guest'), ($1, 'user-3', 'Lee', 'member', 'left')", [crewTrip]);
    await db.query("INSERT INTO trip_days (trip_id, date, activity) VALUES ($1, '2026-10-09', NULL), ($1, '2026-10-10', 'XC')", [crewTrip]);
  });
  afterAll(async () => { await db?.close(); });

  it("creates a new solo trip and its day kit in one transaction", async () => {
    const result = await save({ newTrip: NEW_TRIP }) as Saved;
    expect(result).toMatchObject({ status: "saved", created: true, trip: { id: tripId, name: "Stowe trip" } });
    expect(result.kits).toEqual([expect.objectContaining({ date: "2026-10-10", outfit: outfit(), effort: "steady", items: [] })]);
    expect(await kits()).toEqual([{ date: "2026-10-10", member: "You", items: [], outfit: outfit(), effort: "steady", note: null }]);
    const stops = (await db.query("SELECT name FROM trip_stops WHERE trip_id = $1", [tripId])).rows;
    expect(stops).toEqual([{ name: "Stowe, Vermont" }]);
  });

  it("makes a multi-day trip with a kit for each planned day that has layers", async () => {
    const result = await save({
      newTrip: { ...NEW_TRIP, end_date: "2026-10-12" },
      days: [day("2026-10-10"), day("2026-10-11", { outfit: outfit("Wool base") })],
    }) as Saved;
    expect(result.kits.map((kit) => kit.date)).toEqual(["2026-10-10", "2026-10-11"]);
    expect((await db.query("SELECT start_date::text, end_date::text FROM trips WHERE id = $1", [tripId])).rows)
      .toEqual([{ start_date: "2026-10-10", end_date: "2026-10-12" }]);
    expect((await kits()).map(({ date, outfit: saved }) => [date, saved])).toEqual([
      ["2026-10-10", outfit()],
      ["2026-10-11", outfit("Wool base")],
    ]);
  });

  it("returns the first answer for a repeated save and never overwrites later changes", async () => {
    const saveId = randomUUID();
    const first = await save({ saveId, newTrip: NEW_TRIP }) as Saved;
    await db.exec("UPDATE trips SET name = 'Renamed'; UPDATE trip_member_day_kits SET note = 'Bring spare gloves';");
    const replay = await save({ saveId, newTrip: NEW_TRIP }) as Saved;
    expect(replay).toEqual({ ...first, replayed: true });
    expect(await counts()).toEqual({ trips: 2, days: 3, kits: 1, saves: 1 });
    expect((await kits())[0].note).toBe("Bring spare gloves");
  });

  it("replays a retry whose new trip status changed with the clock, keeping the first answer", async () => {
    const saveId = randomUUID();
    const first = await save({ saveId, newTrip: NEW_TRIP }) as Saved;
    const retry = await save({ saveId, newTrip: { ...NEW_TRIP, status: "live" } }) as Saved;
    expect(retry).toEqual({ ...first, replayed: true });
    expect(retry.trip.status).toBe("planning");
    // Anything the person sent still has to match.
    await expect(save({ saveId, newTrip: { ...NEW_TRIP, name: "Other name" } })).rejects.toMatchObject({ code: "22023" });
  });

  it("reports a deleted trip on retry instead of making it again, and keeps no copy of its kits", async () => {
    const saveId = randomUUID();
    await save({ saveId, newTrip: NEW_TRIP });
    await db.query("DELETE FROM trips WHERE id = $1", [tripId]);
    await expect(save({ saveId, newTrip: NEW_TRIP })).rejects.toMatchObject({ code: "P0002" });
    expect(await counts()).toEqual({ trips: 1, days: 2, kits: 0, saves: 1 });
    expect((await db.query("SELECT trip_id, result FROM trip_kit_saves")).rows).toEqual([{ trip_id: null, result: null }]);
  });

  it("refuses a save identity reused with other input or by another account", async () => {
    const saveId = randomUUID();
    await save({ saveId, newTrip: NEW_TRIP });
    await expect(save({ saveId, newTrip: NEW_TRIP, days: [day("2026-10-10", { effort: "hard" })] })).rejects.toMatchObject({ code: "22023" });
    await expect(save({ saveId, trip: crewTrip })).rejects.toMatchObject({ code: "22023" });
    // Another account can't take over the new trip's identity, or the save's.
    await expect(save({ saveId, user: "user-2", newTrip: NEW_TRIP })).rejects.toMatchObject({ code: "42501" });
  });

  it("saves into an existing crew day for the signed-in member only, filling an empty activity", async () => {
    await save({ trip: crewTrip, days: [day("2026-10-09"), day("2026-10-10")] });
    expect(await kits()).toEqual([
      { date: "2026-10-09", member: "Ana", items: [], outfit: outfit(), effort: "steady", note: null },
      { date: "2026-10-10", member: "Ana", items: [], outfit: outfit(), effort: "steady", note: null },
    ]);
    const days = (await db.query("SELECT date::text, activity FROM trip_days WHERE trip_id = $1 ORDER BY date", [crewTrip])).rows;
    expect(days).toEqual([{ date: "2026-10-09", activity: "Alpine" }, { date: "2026-10-10", activity: "XC" }]);
  });

  it("restores a missing trip day before saving its kit", async () => {
    const result = await save({ trip: crewTrip, days: [day("2026-10-11")] }) as Saved;
    expect(result.status).toBe("saved");
    expect((await db.query("SELECT activity FROM trip_days WHERE trip_id = $1 AND date = '2026-10-11'", [crewTrip])).rows).toEqual([{ activity: "Alpine" }]);
  });

  it("reports existing kits without saving anything, then replaces only the confirmed version", async () => {
    await save({ trip: crewTrip, days: [day("2026-10-09")] });
    // A checklist made from the category chips counts as a kit too.
    await db.query("INSERT INTO trip_member_day_kits (trip_day_id, trip_member_id, items, note) SELECT d.id, m.id, '[\"shell\"]', 'Old note' FROM trip_days d, trip_members m WHERE d.trip_id = $1 AND d.date = '2026-10-10' AND m.trip_id = $1 AND m.user_id = 'user-1'", [crewTrip]);
    const before = await kits();
    const next = [day("2026-10-09", { outfit: outfit("Wool base") }), day("2026-10-10", { outfit: outfit("Wool base") })];

    const conflict = await save({ trip: crewTrip, days: next }) as Conflict;
    expect(conflict.status).toBe("conflict");
    expect(conflict.conflicts.map((c) => [c.date, c.kit.items, c.kit.outfit])).toEqual([
      ["2026-10-09", [], outfit()],
      ["2026-10-10", ["shell"], null],
    ]);
    expect(await kits()).toEqual(before);

    // Confirming only one day still saves nothing.
    const partly = await save({ trip: crewTrip, days: next, replace: { "2026-10-09": conflict.conflicts[0].kit.updated_at } }) as Conflict;
    expect(partly.conflicts.map((c) => c.date)).toEqual(["2026-10-10"]);
    expect(await kits()).toEqual(before);

    const replace = Object.fromEntries(conflict.conflicts.map((c) => [c.date, c.kit.updated_at]));
    expect((await save({ trip: crewTrip, days: next, replace })).status).toBe("saved");
    expect(await kits()).toEqual([
      { date: "2026-10-09", member: "Ana", items: [], outfit: outfit("Wool base"), effort: "steady", note: null },
      { date: "2026-10-10", member: "Ana", items: [], outfit: outfit("Wool base"), effort: "steady", note: "Old note" },
    ]);
  });

  it("asks again when the kit changed after the one that was confirmed", async () => {
    await save({ trip: crewTrip, days: [day("2026-10-09")] });
    const conflict = await save({ trip: crewTrip, days: [day("2026-10-09", { outfit: outfit("Wool base") })] }) as Conflict;
    await db.exec("UPDATE trip_member_day_kits SET items = '[\"gloves\"]';");
    const stale = await save({ trip: crewTrip, days: [day("2026-10-09", { outfit: outfit("Wool base") })], replace: { "2026-10-09": conflict.conflicts[0].kit.updated_at } }) as Conflict;
    expect(stale.status).toBe("conflict");
    expect(stale.conflicts[0].kit.items).toEqual(["gloves"]);
  });

  it("doesn't save for someone who isn't on the trip, has left it, or picked a date outside it", async () => {
    await expect(save({ trip: crewTrip, user: "user-9" })).rejects.toMatchObject({ code: "P0002" });
    await expect(save({ trip: crewTrip, user: "user-3" })).rejects.toMatchObject({ code: "P0002" });
    await expect(save({ trip: randomUUID() })).rejects.toMatchObject({ code: "P0002" });
    await expect(save({ trip: crewTrip, days: [day("2026-10-12")] })).rejects.toMatchObject({ code: "22008" });
    await expect(save({ trip: crewTrip, days: [] })).rejects.toMatchObject({ code: "22023" });
    expect(await counts()).toEqual({ trips: 1, days: 2, kits: 0, saves: 0 });
  });

  it("rolls back a new trip when its kit can't be saved, then retries safely", async () => {
    await expect(save({ newTrip: NEW_TRIP, days: [day("2026-10-10", { effort: "extreme" })] })).rejects.toMatchObject({ code: "22P02" });
    expect(await counts()).toEqual({ trips: 1, days: 2, kits: 0, saves: 0 });
    expect((await save({ newTrip: NEW_TRIP })).status).toBe("saved");
  });

  it("grants execution and the save receipts only to the service role", async () => {
    const signature = "public.save_trip_kits(uuid,text,uuid,jsonb,jsonb,jsonb)";
    const fn = await db.query("SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon, has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated, has_function_privilege('service_role', $1, 'EXECUTE') AS service", [signature]);
    expect(fn.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
    const table = await db.query("SELECT has_table_privilege('anon', 'public.trip_kit_saves', 'SELECT') AS anon, has_table_privilege('authenticated', 'public.trip_kit_saves', 'SELECT') AS authenticated");
    expect(table.rows[0]).toEqual({ anon: false, authenticated: false });
    const trigger = await db.query("SELECT has_function_privilege('anon', 'public.forget_trip_kit_save_results()', 'EXECUTE') AS anon, has_function_privilege('authenticated', 'public.forget_trip_kit_save_results()', 'EXECUTE') AS authenticated");
    expect(trigger.rows[0]).toEqual({ anon: false, authenticated: false });
  });
});
