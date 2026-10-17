// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const otherTrip = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";
let db: PGlite;

const source = (extra: object = {}) => ({ category: "avalanche", name: "Mount Washington Avalanche Center", region: "Presidential Range",
  url: "https://www.mountwashingtonavalanchecenter.org/", ...extra });
const context = (extra: object = {}) => ({ date: "2026-10-10", route: { objective: "Tuckerman", route_url: null }, ...extra });
const dayId = async (date: string, trip = tripId) =>
  (await db.query<{ id: string }>("SELECT id FROM trip_days WHERE trip_id = $1 AND date = $2", [trip, date])).rows[0]?.id ?? randomUUID();
const mutate = async ({ date = "2026-10-10", day = undefined as string | undefined, sourceId = null as string | null, revision = 0,
  action = "add", payload = source() as object, requestId = randomUUID(), user = "user-1", trip = tripId } = {}) =>
  (await db.query<{ result: { source_id: string; revision: number } }>("SELECT public.mutate_trip_conditions_source($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result",
    [trip, user, date, day ?? await dayId(date, trip), sourceId, revision, requestId, action, JSON.stringify(payload)])).rows[0].result;
type ReviewArgs = { sourceId: string; date?: string; day?: string; expected?: string | null; action?: string; note?: string | null;
  ctx?: object | null; requestId?: string; user?: string; trip?: string };
const review = async ({ sourceId, date = "2026-10-10", day, expected = null, action = "reviewed", note = null, ctx = context(),
  requestId = randomUUID(), user = "user-2", trip = tripId }: ReviewArgs) =>
  (await db.query<{ result: { entry_id: string } }>("SELECT public.record_trip_conditions_review($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result",
    [trip, user, date, day ?? await dayId(date, trip), sourceId, expected, requestId, action, note, ctx === null ? null : JSON.stringify(ctx)])).rows[0].result;
const daySources = async () => (await db.query<Record<string, unknown>>(
  `SELECT d.date::text, s.name, s.region, s.url, s.revision FROM trip_day_conditions_sources a
     JOIN trip_days d ON d.id = a.trip_day_id JOIN trip_conditions_sources s ON s.id = a.source_id
   WHERE a.trip_id = $1 ORDER BY d.date, s.name`, [tripId])).rows;
const entries = async () => (await db.query<Record<string, unknown>>(
  `SELECT d.date::text, r.user_id, r.action, r.note, r.context, r.reviewed_at = (SELECT min(reviewed_at) FROM trip_conditions_reviews) AS kept_time
   FROM trip_conditions_reviews r JOIN trip_days d ON d.id = r.trip_day_id WHERE r.trip_id = $1 ORDER BY r.entry_number`, [tripId])).rows;

describe("Conditions sources and reviews in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    for (const migration of ["012_trips", "017_trip_stays", "021_trip_date_changes", "026_trip_tour_plans", "031_trip_conditions"]) {
      await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
    }
  }, 20_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-1', 'Weekend', '2026-10-09', '2026-10-11'), ($2, 'other-user', 'Other', '2026-10-09', '2026-10-11')", [tripId, otherTrip]);
    await db.query("INSERT INTO trip_days (trip_id, date, activity) SELECT t, d::date, 'Backcountry' FROM unnest(ARRAY[$1, $2]::uuid[]) AS t, generate_series('2026-10-09'::date, '2026-10-11'::date, interval '1 day') AS d", [tripId, otherTrip]);
    await db.query("INSERT INTO trip_members (trip_id, user_id, display_name, role, status) VALUES ($1, 'user-1', 'You', 'organizer', 'joined'), ($1, 'user-2', 'Sam', 'member', 'joined'), ($1, 'user-3', 'Alex', 'member', 'left')", [tripId]);
  });
  afterAll(async () => { await db?.close(); });

  describe("sources", () => {
    it("adds a source to the trip and the day, by the organizer, at revision 1", async () => {
      const { source_id, revision } = await mutate();
      expect(revision).toBe(1);
      expect(await daySources()).toEqual([{ date: "2026-10-10", name: "Mount Washington Avalanche Center", region: "Presidential Range",
        url: "https://www.mountwashingtonavalanchecenter.org/", revision: 1 }]);
      expect((await db.query("SELECT trip_id, created_by, updated_by FROM trip_conditions_sources WHERE id = $1", [source_id])).rows[0])
        .toEqual({ trip_id: tripId, created_by: "user-1", updated_by: "user-1" });
    });

    it("refuses another category, a blank name and a link that isn't http or https", async () => {
      await expect(mutate({ payload: source({ category: "snowpack" }) })).rejects.toMatchObject({ code: "23514" });
      await expect(mutate({ payload: source({ name: " " }) })).rejects.toMatchObject({ code: "23514" });
      await expect(mutate({ payload: source({ url: "javascript:alert(1)" }) })).rejects.toMatchObject({ code: "23514" });
      await expect(mutate({ payload: source({ url: null }) })).rejects.toMatchObject({ code: "23502" });
      expect(await daySources()).toEqual([]);
    });

    it("saves a change at the revision the editor opened with, and refuses a stale one", async () => {
      const { source_id } = await mutate();
      expect(await mutate({ action: "save", sourceId: source_id, revision: 1, payload: source({ region: null }) })).toEqual({ source_id, revision: 2 });
      await expect(mutate({ action: "save", sourceId: source_id, revision: 1, payload: source({ name: "Stale" }) })).rejects.toMatchObject({ code: "40001" });
      expect(await daySources()).toMatchObject([{ name: "Mount Washington Avalanche Center", region: null, revision: 2 }]);
    });

    it("changes or removes only a source on the day it was opened for", async () => {
      const { source_id } = await mutate({ date: "2026-10-10" });
      await expect(mutate({ date: "2026-10-11", action: "save", sourceId: source_id, revision: 1 })).rejects.toMatchObject({ code: "40001" });
      await expect(mutate({ date: "2026-10-11", action: "remove", sourceId: source_id, revision: 1, payload: {} })).rejects.toMatchObject({ code: "40001" });
      expect(await daySources()).toHaveLength(1);
    });

    it("removes a source from the day but keeps it and its reviews", async () => {
      const { source_id } = await mutate();
      await review({ sourceId: source_id, note: "Moderate above treeline" });
      expect(await mutate({ action: "remove", sourceId: source_id, revision: 1, payload: {} })).toEqual({ source_id, revision: 0 });
      expect(await daySources()).toEqual([]);
      expect((await db.query("SELECT count(*)::int AS n FROM trip_conditions_sources")).rows[0]).toEqual({ n: 1 });
      expect(await entries()).toMatchObject([{ date: "2026-10-10", user_id: "user-2", action: "reviewed", note: "Moderate above treeline" }]);
      // With the source off the day, nobody records a review of it there.
      await expect(review({ sourceId: source_id })).rejects.toMatchObject({ code: "40001" });
    });

    it("replays a retried change without repeating it, and refuses a reused identity with other input", async () => {
      const requestId = randomUUID();
      const first = await mutate({ requestId });
      expect(await mutate({ requestId })).toEqual(first);
      expect(await daySources()).toHaveLength(1);
      await expect(mutate({ requestId, payload: source({ name: "Other" }) })).rejects.toMatchObject({ code: "22023" });
    });

    it("is organizer only, for a day on this trip that still holds its date", async () => {
      await expect(mutate({ user: "user-2" })).rejects.toMatchObject({ code: "42501" });
      await expect(mutate({ user: "other-user" })).rejects.toMatchObject({ code: "42501" });
      await expect(mutate({ date: "2026-10-12" })).rejects.toMatchObject({ code: "P0002" });
      await expect(mutate({ day: await dayId("2026-10-11") })).rejects.toMatchObject({ code: "40001" });
      await expect(mutate({ action: "rename" })).rejects.toMatchObject({ code: "22000" });
      expect(await daySources()).toEqual([]);
    });

    it("can't attach another trip's source or day", async () => {
      const { source_id } = await mutate();
      const foreignDay = await dayId("2026-10-10", otherTrip);
      await expect(db.query("INSERT INTO trip_day_conditions_sources (trip_id, trip_day_id, source_id, added_by) VALUES ($1, $2, $3, 'user-1')", [tripId, foreignDay, source_id]))
        .rejects.toMatchObject({ code: "23503" });
      await expect(db.query("INSERT INTO trip_day_conditions_sources (trip_id, trip_day_id, source_id, added_by) VALUES ($1, $2, $3, 'other-user')", [otherTrip, foreignDay, source_id]))
        .rejects.toMatchObject({ code: "23503" });
    });
  });

  describe("reviews", () => {
    let sourceId: string;
    beforeEach(async () => { sourceId = (await mutate()).source_id; });

    it("records a member's review with its note, the time and the plan it was recorded against", async () => {
      const { entry_id } = await review({ sourceId, note: "Considerable on east aspects" });
      expect(entry_id).toEqual(expect.any(String));
      expect(await entries()).toEqual([{ date: "2026-10-10", user_id: "user-2", action: "reviewed", note: "Considerable on east aspects",
        context: context(), kept_time: true }]);
    });

    it("keeps each person's reviews apart, organizer included", async () => {
      await review({ sourceId, user: "user-2" });
      await review({ sourceId, user: "user-1" });
      expect((await entries()).map((entry) => entry.user_id)).toEqual(["user-2", "user-1"]);
      // Sam's latest entry is still the one they started from.
      const { rows: [sams] } = await db.query<{ id: string }>("SELECT id FROM trip_conditions_reviews WHERE user_id = 'user-2'");
      await review({ sourceId, user: "user-2", expected: sams.id, action: "withdrawn" });
      expect((await entries()).map((entry) => [entry.user_id, entry.action])).toEqual([["user-2", "reviewed"], ["user-1", "reviewed"], ["user-2", "withdrawn"]]);
    });

    it("corrects the note and withdraws as new entries that keep the review's time and plan", async () => {
      const first = await review({ sourceId, note: "Low" });
      const corrected = await review({ sourceId, expected: first.entry_id, action: "corrected", note: "Moderate, not low", ctx: null });
      await review({ sourceId, expected: corrected.entry_id, action: "withdrawn", ctx: null });
      expect(await entries()).toEqual([
        { date: "2026-10-10", user_id: "user-2", action: "reviewed", note: "Low", context: context(), kept_time: true },
        { date: "2026-10-10", user_id: "user-2", action: "corrected", note: "Moderate, not low", context: context(), kept_time: true },
        { date: "2026-10-10", user_id: "user-2", action: "withdrawn", note: null, context: context(), kept_time: true },
      ]);
    });

    it("records again after a withdrawal, but corrects or withdraws only a current review", async () => {
      await expect(review({ sourceId, action: "corrected", note: "x" })).rejects.toMatchObject({ code: "22000" });
      const first = await review({ sourceId });
      const withdrawn = await review({ sourceId, expected: first.entry_id, action: "withdrawn" });
      await expect(review({ sourceId, expected: withdrawn.entry_id, action: "withdrawn" })).rejects.toMatchObject({ code: "22000" });
      await review({ sourceId, expected: withdrawn.entry_id, note: "again" });
      expect((await entries()).map((entry) => entry.action)).toEqual(["reviewed", "withdrawn", "reviewed"]);
    });

    it("refuses a change from a window that didn't see the latest entry", async () => {
      const first = await review({ sourceId });
      await expect(review({ sourceId })).rejects.toMatchObject({ code: "40001" });
      await review({ sourceId, expected: first.entry_id, action: "corrected", note: "From window A" });
      await expect(review({ sourceId, expected: first.entry_id, action: "withdrawn" })).rejects.toMatchObject({ code: "40001" });
      expect(await entries()).toHaveLength(2);
    });

    it("needs a context to record, and refuses another action", async () => {
      await expect(review({ sourceId, ctx: null })).rejects.toMatchObject({ code: "22000" });
      await expect(review({ sourceId, action: "approved" })).rejects.toMatchObject({ code: "22000" });
      expect(await entries()).toEqual([]);
    });

    it("replays a retry even when the app built the context again, and refuses other input", async () => {
      const requestId = randomUUID();
      const first = await review({ sourceId, requestId, note: "Checked at 6" });
      expect(await review({ sourceId, requestId, note: "Checked at 6", ctx: context({ route: null }) })).toEqual(first);
      await expect(review({ sourceId, requestId, note: "Other" })).rejects.toMatchObject({ code: "22023" });
      expect(await entries()).toHaveLength(1);
    });

    it("is for the organizer and current members, on a source on this day", async () => {
      await expect(review({ sourceId, user: "user-3" })).rejects.toMatchObject({ code: "42501" });
      await expect(review({ sourceId, user: "other-user" })).rejects.toMatchObject({ code: "42501" });
      await expect(review({ sourceId, user: "user-2", trip: otherTrip })).rejects.toMatchObject({ code: "42501" });
      await expect(review({ sourceId, date: "2026-10-11" })).rejects.toMatchObject({ code: "40001" });
      await expect(review({ sourceId, date: "2026-10-12" })).rejects.toMatchObject({ code: "P0002" });
      await expect(review({ sourceId, day: await dayId("2026-10-11") })).rejects.toMatchObject({ code: "40001" });
      expect(await entries()).toEqual([]);
    });

    it("stays with its day when the trip's dates move, and goes with a removed day", async () => {
      await review({ sourceId });
      await db.query("SELECT public.change_trip_dates($1, 'user-1', '2026-10-09', '2026-10-11', '2026-10-16', '2026-10-18', 'move', 'planning', NULL, NULL, '[]')", [tripId]);
      expect((await entries()).map((entry) => entry.date)).toEqual(["2026-10-17"]);
      expect(await daySources()).toMatchObject([{ date: "2026-10-17" }]);
      await db.query("SELECT public.change_trip_dates($1, 'user-1', '2026-10-16', '2026-10-18', '2026-10-16', '2026-10-16', 'keep', 'planning', NULL, NULL, $2)",
        [tripId, JSON.stringify([{ date: "2026-10-17", stop_id: null, activity: "Backcountry", kit_ids: [] }, { date: "2026-10-18", stop_id: null, activity: "Backcountry", kit_ids: [] }])]);
      expect(await entries()).toEqual([]);
      expect(await daySources()).toEqual([]);
    });
  });

  it("is reachable only by the service role", async () => {
    for (const signature of [
      "public.mutate_trip_conditions_source(uuid, text, date, uuid, uuid, integer, uuid, text, jsonb)",
      "public.record_trip_conditions_review(uuid, text, date, uuid, uuid, uuid, uuid, text, text, jsonb)",
    ]) {
      expect((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon, has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated, has_function_privilege('service_role',$1,'EXECUTE') AS service", [signature])).rows[0])
        .toEqual({ anon: false, authenticated: false, service: true });
    }
    for (const table of ["public.trip_conditions_sources", "public.trip_day_conditions_sources", "public.trip_conditions_reviews", "public.trip_conditions_mutations"]) {
      expect((await db.query("SELECT has_table_privilege('anon',$1,'SELECT') AS anon, has_table_privilege('authenticated',$1,'INSERT') AS authenticated, has_table_privilege('service_role',$1,'SELECT,INSERT,UPDATE,DELETE') AS service", [table])).rows[0])
        .toEqual({ anon: false, authenticated: false, service: true });
    }
  });
});
