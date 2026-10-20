// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const otherTrip = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";
let db: PGlite;

const plan = (extra: object = {}) => ({ objective: "Mount Washington via Tuckerman", ...extra });
const dayId = async (date: string, trip = tripId) =>
  (await db.query<{ id: string }>("SELECT id FROM trip_days WHERE trip_id = $1 AND date = $2", [trip, date])).rows[0]?.id ?? randomUUID();
const mutate = async ({ date = "2026-10-10", day = undefined as string | undefined, revision = 0, action = "save", payload = plan() as object, requestId = randomUUID(), user = "user-1", trip = tripId } = {}) =>
  (await db.query<{ result: { revision: number } }>("SELECT public.mutate_trip_tour_plan($1,$2,$3,$4,$5,$6,$7,$8) AS result",
    [trip, user, date, day ?? await dayId(date, trip), revision, requestId, action, JSON.stringify(payload)])).rows[0].result;
const saved = async () => (await db.query<Record<string, unknown>>(
  `SELECT d.date::text, t.objective, t.meet_time::text, t.meet_day_offset, t.return_time::text, t.return_day_offset,
     t.time_zone, t.revision, t.created_by, t.updated_by
   FROM trip_day_tour_plans t JOIN trip_days d ON d.id = t.trip_day_id WHERE t.trip_id = $1 ORDER BY d.date`, [tripId])).rows;
const change = async (to: [string, string], mode: "move" | "keep", removed: object[] = []) =>
  (await db.query("SELECT public.change_trip_dates($1, 'user-1', '2026-10-09', '2026-10-11', $2, $3, $4, 'planning', NULL, NULL, $5) AS result",
    [tripId, to[0], to[1], mode, JSON.stringify(removed)])).rows[0];

describe("Tour plan transactions in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    for (const migration of ["012_trips", "017_trip_stays", "021_trip_date_changes", "026_trip_tour_plans"]) {
      await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
    }
    await db.exec(await readFile("supabase/migrations/20261020000407_trip_conflicts_no_retry.sql", "utf8"));
  }, 20_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-1', 'Weekend', '2026-10-09', '2026-10-11'), ($2, 'other-user', 'Other', '2026-10-09', '2026-10-11')", [tripId, otherTrip]);
    await db.query("INSERT INTO trip_days (trip_id, date, activity) SELECT t, d::date, 'Backcountry' FROM unnest(ARRAY[$1, $2]::uuid[]) AS t, generate_series('2026-10-09'::date, '2026-10-11'::date, interval '1 day') AS d", [tripId, otherTrip]);
    await db.query("INSERT INTO trip_members (trip_id, user_id, display_name, role, status) VALUES ($1, 'user-1', 'You', 'organizer', 'joined'), ($1, 'user-2', 'Sam', 'member', 'joined')", [tripId]);
  });
  afterAll(async () => { await db?.close(); });

  it("saves a route-only draft for the day, by the organizer, at revision 1", async () => {
    expect(await mutate()).toEqual({ revision: 1 });
    expect(await saved()).toEqual([{ date: "2026-10-10", objective: "Mount Washington via Tuckerman", meet_time: null, meet_day_offset: 0,
      return_time: null, return_day_offset: 0, time_zone: null, revision: 1, created_by: "user-1", updated_by: "user-1" }]);
  });

  it("keeps a meet the day before, a return the day after and the destination's time zone", async () => {
    await mutate({ payload: plan({ meet_time: "18:00", meet_day_offset: -1, return_time: "11:00", return_day_offset: 1, time_zone: "America/New_York" }) });
    expect((await saved())[0]).toMatchObject({ meet_time: "18:00:00", meet_day_offset: -1, return_time: "11:00:00", return_day_offset: 1, time_zone: "America/New_York" });
  });

  it("refuses a return before the meet, figures without units and other day offsets", async () => {
    await expect(mutate({ payload: plan({ meet_time: "08:00", return_time: "07:00" }) })).rejects.toMatchObject({ code: "23514" });
    await expect(mutate({ payload: plan({ distance: 12 }) })).rejects.toMatchObject({ code: "23514" });
    await expect(mutate({ payload: plan({ meet_day_offset: 1 }) })).rejects.toMatchObject({ code: "23514" });
    expect(await saved()).toEqual([]);
  });

  it("increments the revision on each change and refuses a stale second session", async () => {
    await mutate();
    expect(await mutate({ revision: 1, payload: plan({ backup_plan: "Lion Head if the bowl is loaded" }) })).toEqual({ revision: 2 });
    await expect(mutate({ revision: 1, payload: plan({ objective: "Stale" }) })).rejects.toMatchObject({ code: "PT409" });
    await expect(mutate({ revision: 0, payload: plan({ objective: "Another new plan" }) })).rejects.toMatchObject({ code: "PT409" });
    expect((await saved())[0]).toMatchObject({ objective: "Mount Washington via Tuckerman", revision: 2 });
  });

  it("replays a retried save without overwriting newer work, even with another time zone", async () => {
    const requestId = randomUUID();
    const first = await mutate({ requestId, payload: plan({ meet_time: "07:00", time_zone: "America/New_York" }) });
    await mutate({ revision: 1, payload: plan({ objective: "Newer" }) });
    expect(await mutate({ requestId, payload: plan({ meet_time: "07:00", time_zone: null }) })).toEqual(first);
    expect((await saved())[0]).toMatchObject({ objective: "Newer", revision: 2 });
    await expect(mutate({ requestId, payload: plan({ objective: "Different input" }) })).rejects.toMatchObject({ code: "22023" });
  });

  it("removes a plan only at its reviewed revision, and replays the removal", async () => {
    await mutate();
    await expect(mutate({ revision: 0, action: "remove", payload: {} })).rejects.toMatchObject({ code: "PT409" });
    const requestId = randomUUID();
    expect(await mutate({ revision: 1, action: "remove", payload: {}, requestId })).toEqual({ revision: 0 });
    expect(await saved()).toEqual([]);
    expect(await mutate({ revision: 1, action: "remove", payload: {}, requestId })).toEqual({ revision: 0 });
    await expect(mutate({ revision: 0, action: "remove", payload: {} })).rejects.toMatchObject({ code: "22000" });
  });

  it("is organizer only, for a day on this trip", async () => {
    await expect(mutate({ user: "user-2" })).rejects.toMatchObject({ code: "42501" });
    await expect(mutate({ user: "other-user" })).rejects.toMatchObject({ code: "42501" });
    await expect(mutate({ date: "2026-10-12" })).rejects.toMatchObject({ code: "P0002" });
    await expect(mutate({ action: "rename" })).rejects.toMatchObject({ code: "22000" });
    expect(await saved()).toEqual([]);
  });

  it("can't attach a plan to another trip's day", async () => {
    const foreignDay = (await db.query<{ id: string }>("SELECT id FROM trip_days WHERE trip_id = $1 LIMIT 1", [otherTrip])).rows[0].id;
    await expect(db.query("INSERT INTO trip_day_tour_plans (trip_id, trip_day_id, objective, created_by, updated_by) VALUES ($1, $2, 'X', 'user-1', 'user-1')", [tripId, foreignDay]))
      .rejects.toMatchObject({ code: "23503" });
  });

  it("moves with its day when the trip's dates move", async () => {
    await mutate();
    await change(["2026-10-16", "2026-10-18"], "move");
    expect((await saved()).map((entry) => entry.date)).toEqual(["2026-10-17"]);
  });

  it("refuses a save for a day that no longer holds its date", async () => {
    // Saturday's editor is open; the dates move back a day, so Sunday's row is on Saturday now.
    const saturday = await dayId("2026-10-10");
    await db.query("SELECT public.change_trip_dates($1, 'user-1', '2026-10-09', '2026-10-11', '2026-10-08', '2026-10-10', 'move', 'planning', NULL, NULL, '[]')", [tripId]);
    await expect(mutate({ date: "2026-10-10", day: saturday })).rejects.toMatchObject({ code: "PT409" });
    await mutate({ date: "2026-10-09", day: saturday, payload: plan({ objective: "Saturday's tour" }) });
    await mutate({ date: "2026-10-10" });
    await expect(mutate({ date: "2026-10-10", day: saturday, revision: 1, payload: plan({ objective: "Overwrite" }) })).rejects.toMatchObject({ code: "PT409" });
    expect((await saved()).map((entry) => [entry.date, entry.objective])).toEqual([["2026-10-09", "Saturday's tour"], ["2026-10-10", "Mount Washington via Tuckerman"]]);
  });

  it("isn't removed with its day unless the review listed it", async () => {
    const { rows: [day] } = await db.query<{ id: string }>("SELECT id FROM trip_days WHERE trip_id = $1 AND date = '2026-10-11'", [tripId]);
    const removed = { date: "2026-10-11", stop_id: null, activity: "Backcountry", kit_ids: [] };
    // A day without a plan is listed exactly as before 026.
    await mutate({ date: "2026-10-10" });
    await mutate({ date: "2026-10-11" });
    const { rows: [sundayPlan] } = await db.query<{ id: string }>("SELECT id FROM trip_day_tour_plans WHERE trip_day_id = $1", [day.id]);
    await expect(change(["2026-10-09", "2026-10-10"], "keep", [removed])).rejects.toMatchObject({ code: "PT409" });
    expect(await saved()).toHaveLength(2);
    // A plan changed since the review (same id, newer revision) isn't removed either.
    const reviewed = { ...removed, tour_plan_id: sundayPlan.id, tour_plan_revision: 1 };
    await mutate({ date: "2026-10-11", revision: 1, payload: plan({ backup_plan: "Added after the review" }) });
    await expect(change(["2026-10-09", "2026-10-10"], "keep", [reviewed])).rejects.toMatchObject({ code: "PT409" });
    await expect(change(["2026-10-09", "2026-10-10"], "keep", [{ ...removed, tour_plan_id: sundayPlan.id }])).rejects.toMatchObject({ code: "PT409" });
    expect(await saved()).toHaveLength(2);
    await change(["2026-10-09", "2026-10-10"], "keep", [{ ...reviewed, tour_plan_revision: 2 }]);
    expect((await saved()).map((entry) => entry.date)).toEqual(["2026-10-10"]);
  });

  it("removes a day without a plan as before", async () => {
    await change(["2026-10-09", "2026-10-10"], "keep", [{ date: "2026-10-11", stop_id: null, activity: "Backcountry", kit_ids: [] }]);
    expect((await db.query("SELECT count(*)::int AS n FROM trip_days WHERE trip_id = $1", [tripId])).rows[0]).toEqual({ n: 2 });
  });

  it("is reachable only by the service role", async () => {
    const signature = "public.mutate_trip_tour_plan(uuid, text, date, uuid, integer, uuid, text, jsonb)";
    expect((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon, has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated, has_function_privilege('service_role',$1,'EXECUTE') AS service", [signature])).rows[0])
      .toEqual({ anon: false, authenticated: false, service: true });
    for (const table of ["public.trip_day_tour_plans", "public.trip_tour_plan_mutations"]) {
      expect((await db.query("SELECT has_table_privilege('anon',$1,'SELECT') AS anon, has_table_privilege('authenticated',$1,'INSERT') AS authenticated, has_table_privilege('service_role',$1,'SELECT,INSERT,UPDATE,DELETE') AS service", [table])).rows[0])
        .toEqual({ anon: false, authenticated: false, service: true });
    }
  });
});
