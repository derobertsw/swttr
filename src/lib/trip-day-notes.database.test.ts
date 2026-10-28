// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const otherTrip = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";

async function createDatabase() {
  const db = await PGlite.create();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
  for (const migration of ["012_trips", "017_trip_stays", "021_trip_date_changes", "023_trip_copy_day", "20261028130000_trip_day_notes"]) {
    await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
  }
  return db;
}

async function seed(db: PGlite) {
  await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-1', 'Weekend', '2026-10-09', '2026-10-11'), ($2, 'other-user', 'Other', '2026-10-09', '2026-10-11')", [tripId, otherTrip]);
  await db.query("INSERT INTO trip_days (trip_id, date, activity) SELECT t, d::date, 'Alpine' FROM unnest(ARRAY[$1, $2]::uuid[]) AS t, generate_series('2026-10-09'::date, '2026-10-11'::date, interval '1 day') AS d", [tripId, otherTrip]);
  await db.query("INSERT INTO trip_members (trip_id, user_id, display_name, role, status) VALUES ($1, 'user-1', 'You', 'organizer', 'joined'), ($1, 'user-2', 'Sam', 'member', 'joined')", [tripId]);
}

const dayIdOn = async (db: PGlite, date: string, trip = tripId) =>
  (await db.query<{ id: string }>("SELECT id FROM trip_days WHERE trip_id = $1 AND date = $2", [trip, date])).rows[0]?.id ?? randomUUID();
const notes = async (db: PGlite, trip = tripId) => (await db.query<Record<string, unknown>>(
  "SELECT date::text, notes FROM trip_days WHERE trip_id = $1 AND notes IS NOT NULL ORDER BY date", [trip])).rows;

describe("Day notes", () => {
  let db: PGlite;
  beforeAll(async () => { db = await createDatabase(); }, 20_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await seed(db);
  });
  afterAll(async () => { await db?.close(); });

  const setNotes = async ({ date = "2026-10-10", day = undefined as string | undefined, text = "Tickets at will-call." as unknown,
    expected = { notes: null } as object, user = "user-1", trip = tripId, payload = undefined as object | undefined } = {}) =>
    (await db.query<{ result: unknown }>("SELECT public.set_trip_day_notes($1, $2, $3) AS result", [trip, user, JSON.stringify(payload ?? {
      date, day_id: day ?? await dayIdOn(db, date, trip), notes: text, expected,
    })])).rows[0].result;

  it("sets the organizer's notes on a day", async () => {
    expect(await setNotes()).toEqual({ ok: true });
    expect(await setNotes({ date: "2026-10-11", text: "Rentals at Base Lodge.\nLockers by the café." })).toEqual({ ok: true });
    expect(await notes(db)).toEqual([
      { date: "2026-10-10", notes: "Tickets at will-call." },
      { date: "2026-10-11", notes: "Rentals at Base Lodge.\nLockers by the café." },
    ]);
  });

  it("changes and clears them only as the editor showed them", async () => {
    await setNotes();
    await expect(setNotes({ text: "Meet at the clock tower." })).rejects.toMatchObject({ code: "PT409" });
    await expect(setNotes({ text: "Meet at the clock tower.", expected: { notes: "Tickets at will-call" } })).rejects.toMatchObject({ code: "PT409" });
    await setNotes({ text: "Meet at the clock tower.", expected: { notes: "Tickets at will-call." } });
    expect(await notes(db)).toEqual([{ date: "2026-10-10", notes: "Meet at the clock tower." }]);
    await setNotes({ text: null, expected: { notes: "Meet at the clock tower." } });
    expect(await notes(db)).toEqual([]);
  });

  it("refuses a day that no longer holds its date", async () => {
    // Saturday's editor is open; the dates move back a day, so Sunday's row is on Saturday now.
    const saturday = await dayIdOn(db, "2026-10-10");
    await db.query("SELECT public.change_trip_dates($1, 'user-1', '2026-10-09', '2026-10-11', '2026-10-08', '2026-10-10', 'move', 'planning', NULL, NULL, '[]')", [tripId]);
    await expect(setNotes({ date: "2026-10-10", day: saturday })).rejects.toMatchObject({ code: "PT409" });
    await setNotes({ date: "2026-10-09", day: saturday });
    expect((await notes(db)).map((entry) => entry.date)).toEqual(["2026-10-09"]);
  });

  it("moves with its day when the trip's dates move", async () => {
    await setNotes();
    await db.query("SELECT public.change_trip_dates($1, 'user-1', '2026-10-09', '2026-10-11', '2026-10-16', '2026-10-18', 'move', 'planning', NULL, NULL, '[]')", [tripId]);
    expect(await notes(db)).toEqual([{ date: "2026-10-17", notes: "Tickets at will-call." }]);
  });

  it("stays on its day when another day is copied onto it", async () => {
    await setNotes({ date: "2026-10-09", text: "Friday's notes" });
    await setNotes({ date: "2026-10-10", text: "Saturday's notes" });
    await db.query("UPDATE trip_days SET activity = 'Backcountry' WHERE trip_id = $1 AND date = '2026-10-09'", [tripId]);
    await db.query("SELECT public.copy_trip_day($1, 'user-1', $2)", [tripId, JSON.stringify({
      from: "2026-10-09", dates: ["2026-10-10"], kit: "none",
      expected: { from: { stop_id: null, stop: null, activity: "Backcountry" }, days: [{ date: "2026-10-10", stop_id: null, stop: null, activity: "Alpine" }] },
    })]);
    expect((await db.query("SELECT activity, notes FROM trip_days WHERE trip_id = $1 AND date = '2026-10-10'", [tripId])).rows)
      .toEqual([{ activity: "Backcountry", notes: "Saturday's notes" }]);
    expect(await notes(db)).toEqual([{ date: "2026-10-09", notes: "Friday's notes" }, { date: "2026-10-10", notes: "Saturday's notes" }]);
  });

  it("is organizer only, for a day on this trip", async () => {
    await expect(setNotes({ user: "user-2" })).rejects.toMatchObject({ code: "42501" });
    await expect(setNotes({ trip: otherTrip })).rejects.toMatchObject({ code: "42501" });
    await expect(setNotes({ day: await dayIdOn(db, "2026-10-10", otherTrip) })).rejects.toMatchObject({ code: "PT409" });
    await expect(setNotes({ date: "2026-10-12" })).rejects.toMatchObject({ code: "P0002" });
    expect(await notes(db)).toEqual([]);
    expect(await notes(db, otherTrip)).toEqual([]);
  });

  it.each([
    { notes: 42, expected: { notes: null } },
    { notes: "", expected: { notes: null } },
    { notes: "a".repeat(2001), expected: { notes: null } },
    { notes: "Tickets" },
    { notes: "Tickets", expected: {} },
  ])("refuses an invalid change (%#)", async (change) => {
    await expect(setNotes({ payload: { date: "2026-10-10", day_id: await dayIdOn(db, "2026-10-10"), ...change } })).rejects.toMatchObject({ code: "22023" });
  });

  it("can't store empty or overlong notes", async () => {
    await expect(db.query("UPDATE trip_days SET notes = '' WHERE trip_id = $1", [tripId])).rejects.toMatchObject({ code: "23514" });
    await expect(db.query("UPDATE trip_days SET notes = repeat('a', 2001) WHERE trip_id = $1", [tripId])).rejects.toMatchObject({ code: "23514" });
  });

  it("is reachable only by the service role", async () => {
    const signature = "public.set_trip_day_notes(uuid, text, jsonb)";
    expect((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon, has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated, has_function_privilege('service_role',$1,'EXECUTE') AS service", [signature])).rows[0])
      .toEqual({ anon: false, authenticated: false, service: true });
  });
});
