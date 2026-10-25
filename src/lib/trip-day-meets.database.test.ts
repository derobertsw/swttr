// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const otherTrip = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";
const MIGRATION = "supabase/migrations/20261024230000_trip_day_meet_times.sql";

async function createDatabase() {
  const db = await PGlite.create();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
  for (const migration of ["012_trips", "017_trip_stays", "021_trip_date_changes", "026_trip_tour_plans", "20261020000407_trip_conflicts_no_retry"]) {
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
const meets = async (db: PGlite, trip = tripId) => (await db.query<Record<string, unknown>>(
  "SELECT date::text, meet_time::text, meet_day_offset, meet_time_zone FROM trip_days WHERE trip_id = $1 AND meet_time IS NOT NULL ORDER BY date", [trip])).rows;

describe("Copying tour plans' meet times onto their days", () => {
  let db: PGlite;
  beforeAll(async () => { db = await createDatabase(); await seed(db); }, 20_000);
  afterAll(async () => { await db?.close(); });

  it("moves each meet time, with its day offset and time zone, whether the plan is in use or kept", async () => {
    const plan = (date: string, meet: string | null, offset: number, zone: string | null, returnTime: string | null = null) => db.query(
      `INSERT INTO trip_day_tour_plans (trip_id, trip_day_id, objective, meet_time, meet_day_offset, return_time, time_zone, created_by, updated_by)
       SELECT trip_id, id, 'Tour', $3, $4, $5, $6, 'user-1', 'user-1' FROM trip_days WHERE trip_id = $1 AND date = $2`,
      [tripId, date, meet, offset, returnTime, zone]);
    await db.query("UPDATE trip_days SET activity = 'Backcountry' WHERE trip_id = $1 AND date = '2026-10-10'", [tripId]);
    await plan("2026-10-09", "07:30", 0, "America/New_York", "15:00");
    // Kept on a day that's Alpine now; and a plan the day before, at a hut.
    await plan("2026-10-10", "18:00", -1, null);
    // A plan without a meet time, with the day offset an older editor still sent.
    await plan("2026-10-11", null, -1, "America/New_York");

    await db.exec(await readFile(MIGRATION, "utf8"));

    expect(await meets(db)).toEqual([
      { date: "2026-10-09", meet_time: "07:30:00", meet_day_offset: 0, meet_time_zone: "America/New_York" },
      { date: "2026-10-10", meet_time: "18:00:00", meet_day_offset: -1, meet_time_zone: null },
    ]);
    expect(await meets(db, otherTrip)).toEqual([]);
    // The plans keep theirs for an older API.
    expect((await db.query("SELECT meet_time::text FROM trip_day_tour_plans ORDER BY meet_time")).rows)
      .toEqual([{ meet_time: "07:30:00" }, { meet_time: "18:00:00" }, { meet_time: null }]);
  });

  it("no longer checks a plan's return against the meet columns it keeps", async () => {
    await expect(db.query("UPDATE trip_day_tour_plans SET return_time = '06:00' WHERE meet_time = '07:30'")).resolves.toBeDefined();
  });
});

describe("Meet times on the day", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDatabase();
    await db.exec(await readFile(MIGRATION, "utf8"));
  }, 20_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await seed(db);
  });
  afterAll(async () => { await db?.close(); });

  const setMeet = async ({ date = "2026-10-10", day = undefined as string | undefined, time = "06:30" as string | null, offset = 0, zone = "America/New_York" as string | null,
    expected = { meet_time: null, meet_day_offset: 0 } as object, user = "user-1", trip = tripId, payload = undefined as object | undefined } = {}) =>
    (await db.query<{ result: unknown }>("SELECT public.set_trip_day_meet($1, $2, $3) AS result", [trip, user, JSON.stringify(payload ?? {
      date, day_id: day ?? await dayIdOn(db, date, trip), meet_time: time, meet_day_offset: offset, time_zone: zone, expected,
    })])).rows[0].result;
  const mutatePlan = async (payload: object, { date = "2026-10-10", revision = 0 } = {}) =>
    (await db.query("SELECT public.mutate_trip_tour_plan($1, 'user-1', $2, $3, $4, $5, 'save', $6) AS result",
      [tripId, date, await dayIdOn(db, date), revision, randomUUID(), JSON.stringify(payload)])).rows[0];

  it("sets a meet time for the organizer, on the day or the evening before, with the time zone", async () => {
    expect(await setMeet()).toEqual({ ok: true });
    expect(await setMeet({ date: "2026-10-11", time: "17:45", offset: -1 })).toEqual({ ok: true });
    expect(await meets(db)).toEqual([
      { date: "2026-10-10", meet_time: "06:30:00", meet_day_offset: 0, meet_time_zone: "America/New_York" },
      { date: "2026-10-11", meet_time: "17:45:00", meet_day_offset: -1, meet_time_zone: "America/New_York" },
    ]);
  });

  it("changes and clears it only as the editor showed it", async () => {
    await setMeet({ time: "18:00", offset: -1 });
    await expect(setMeet({ time: "07:00" })).rejects.toMatchObject({ code: "PT409" });
    await expect(setMeet({ time: "07:00", expected: { meet_time: "18:00", meet_day_offset: 0 } })).rejects.toMatchObject({ code: "PT409" });
    await setMeet({ time: "07:00", zone: null, expected: { meet_time: "18:00", meet_day_offset: -1 } });
    expect(await meets(db)).toEqual([{ date: "2026-10-10", meet_time: "07:00:00", meet_day_offset: 0, meet_time_zone: null }]);
    // Clearing resets the day offset and time zone, whatever the request says.
    await setMeet({ time: null, offset: -1, expected: { meet_time: "07:00:00", meet_day_offset: 0 } });
    expect((await db.query("SELECT meet_time, meet_day_offset, meet_time_zone FROM trip_days WHERE trip_id = $1 AND date = '2026-10-10'", [tripId])).rows)
      .toEqual([{ meet_time: null, meet_day_offset: 0, meet_time_zone: null }]);
  });

  it("refuses a day that no longer holds its date", async () => {
    // Saturday's editor is open; the dates move back a day, so Sunday's row is on Saturday now.
    const saturday = await dayIdOn(db, "2026-10-10");
    await db.query("SELECT public.change_trip_dates($1, 'user-1', '2026-10-09', '2026-10-11', '2026-10-08', '2026-10-10', 'move', 'planning', NULL, NULL, '[]')", [tripId]);
    await expect(setMeet({ date: "2026-10-10", day: saturday })).rejects.toMatchObject({ code: "PT409" });
    await setMeet({ date: "2026-10-09", day: saturday });
    expect((await meets(db)).map((entry) => entry.date)).toEqual(["2026-10-09"]);
  });

  it("moves with its day when the trip's dates move", async () => {
    await setMeet();
    await db.query("SELECT public.change_trip_dates($1, 'user-1', '2026-10-09', '2026-10-11', '2026-10-16', '2026-10-18', 'move', 'planning', NULL, NULL, '[]')", [tripId]);
    expect(await meets(db)).toEqual([{ date: "2026-10-17", meet_time: "06:30:00", meet_day_offset: 0, meet_time_zone: "America/New_York" }]);
  });

  it("is organizer only, for a day on this trip", async () => {
    await expect(setMeet({ user: "user-2" })).rejects.toMatchObject({ code: "42501" });
    await expect(setMeet({ trip: otherTrip })).rejects.toMatchObject({ code: "42501" });
    await expect(setMeet({ day: await dayIdOn(db, "2026-10-10", otherTrip) })).rejects.toMatchObject({ code: "PT409" });
    await expect(setMeet({ date: "2026-10-12" })).rejects.toMatchObject({ code: "P0002" });
    expect(await meets(db)).toEqual([]);
    expect(await meets(db, otherTrip)).toEqual([]);
  });

  it.each([
    { meet_time: 630, meet_day_offset: 0, expected: { meet_time: null, meet_day_offset: 0 } },
    { meet_time: "06:30", meet_day_offset: 1, expected: { meet_time: null, meet_day_offset: 0 } },
    { meet_time: "06:30", meet_day_offset: 0 },
    { meet_time: "06:30", meet_day_offset: 0, expected: { meet_time: null } },
  ])("refuses an invalid change (%#)", async (change) => {
    await expect(setMeet({ payload: { date: "2026-10-10", day_id: await dayIdOn(db, "2026-10-10"), ...change } })).rejects.toMatchObject({ code: "22023" });
  });

  it("keeps the day's meet time when a newer API saves a tour plan", async () => {
    await setMeet();
    await db.query("UPDATE trip_days SET activity = 'Backcountry' WHERE trip_id = $1", [tripId]);
    await mutatePlan({ objective: "Tuckerman", return_time: "14:00", time_zone: "America/New_York" });
    await mutatePlan({ objective: "Tuckerman", return_time: "15:00", time_zone: "America/New_York" }, { revision: 1 });
    expect(await meets(db)).toEqual([{ date: "2026-10-10", meet_time: "06:30:00", meet_day_offset: 0, meet_time_zone: "America/New_York" }]);
    expect((await db.query("SELECT meet_time, return_time::text, revision FROM trip_day_tour_plans")).rows)
      .toEqual([{ meet_time: null, return_time: "15:00:00", revision: 2 }]);
  });

  it("puts an older API's tour plan meet time on the day too", async () => {
    await mutatePlan({ objective: "Hut", meet_time: "17:00", meet_day_offset: -1, time_zone: "America/Denver" });
    expect(await meets(db)).toEqual([{ date: "2026-10-10", meet_time: "17:00:00", meet_day_offset: -1, meet_time_zone: "America/Denver" }]);
    expect((await db.query("SELECT meet_time::text, meet_day_offset FROM trip_day_tour_plans")).rows).toEqual([{ meet_time: "17:00:00", meet_day_offset: -1 }]);
    // A newer API's save leaves the plan's columns as the older one saved them.
    await mutatePlan({ objective: "Hut", time_zone: null }, { revision: 1 });
    expect((await db.query("SELECT meet_time::text, meet_day_offset FROM trip_day_tour_plans")).rows).toEqual([{ meet_time: "17:00:00", meet_day_offset: -1 }]);
    // Clearing it there clears the day's, offset and time zone included.
    await mutatePlan({ objective: "Hut", meet_time: null, meet_day_offset: -1, time_zone: "America/Denver" }, { revision: 2 });
    expect(await meets(db)).toEqual([]);
    expect((await db.query("SELECT meet_day_offset, meet_time_zone FROM trip_days WHERE trip_id = $1 AND date = '2026-10-10'", [tripId])).rows)
      .toEqual([{ meet_day_offset: 0, meet_time_zone: null }]);
  });

  it("can't store a day offset or time zone without a meet time", async () => {
    await expect(db.query("UPDATE trip_days SET meet_day_offset = -1 WHERE trip_id = $1", [tripId])).rejects.toMatchObject({ code: "23514" });
    await expect(db.query("UPDATE trip_days SET meet_time_zone = 'UTC' WHERE trip_id = $1", [tripId])).rejects.toMatchObject({ code: "23514" });
    await expect(db.query("UPDATE trip_days SET meet_time = '07:00', meet_day_offset = 1 WHERE trip_id = $1", [tripId])).rejects.toMatchObject({ code: "23514" });
  });

  it("is reachable only by the service role", async () => {
    const signature = "public.set_trip_day_meet(uuid, text, jsonb)";
    expect((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon, has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated, has_function_privilege('service_role',$1,'EXECUTE') AS service", [signature])).rows[0])
      .toEqual({ anon: false, authenticated: false, service: true });
    const replaced = "public.mutate_trip_tour_plan(uuid, text, date, uuid, integer, uuid, text, jsonb)";
    expect((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon, has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated, has_function_privilege('service_role',$1,'EXECUTE') AS service", [replaced])).rows[0])
      .toEqual({ anon: false, authenticated: false, service: true });
  });
});
