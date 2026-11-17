// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  conditionsContext, previewConditionsAttach, previewConditionsEdit, summarizeConditions, summarizeConditionsSources, type ConditionsRows,
} from "@/lib/trip-conditions";
import { previewDateChange } from "@/lib/trip-dates";
import { parseItineraryEdit, previewItinerary } from "@/lib/trip-itinerary";
import type { Trip, TripDay, TripFull, TripItineraryRequest, TripMember, TripRemovedDayCheck } from "@/types/trips";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const otherTrip = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";

// The trip migrations prod has, with change_trip_dates as 026 wrote it and 20261021201500 changed it.
const BEFORE = ["012_trips", "016_atomic_trip_creation", "017_trip_stays", "018_trip_saved_kits", "021_trip_date_changes", "022_trip_itinerary_edits",
  "023_trip_copy_day", "025_trip_stay_locations", "026_trip_tour_plans", "027_trip_access_points", "030_trip_copy_tour_plans", "031_trip_conditions",
  "20261020000407_trip_conflicts_no_retry", "20261021201500_trip_attendance_lodging"];
const NOTES = "20261028130000_trip_day_notes";
const REUSE = "20261116210000_trip_conditions_reuse";

async function createDatabase(migrations: string[]) {
  const db = await PGlite.create();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
  for (const migration of [...BEFORE, ...migrations]) await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
  return db;
}

async function seed(db: PGlite) {
  await db.exec("TRUNCATE trips CASCADE;");
  await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-1', 'Weekend', '2026-10-09', '2026-10-11'), ($2, 'other-user', 'Other', '2026-10-09', '2026-10-11')", [tripId, otherTrip]);
  await db.query("INSERT INTO trip_days (trip_id, date, activity) SELECT t, d::date, 'Backcountry' FROM unnest(ARRAY[$1, $2]::uuid[]) AS t, generate_series('2026-10-09'::date, '2026-10-11'::date, interval '1 day') AS d", [tripId, otherTrip]);
  await db.query("INSERT INTO trip_members (trip_id, user_id, display_name, role, status) VALUES ($1, 'user-1', 'You', 'organizer', 'joined'), ($1, 'user-2', 'Sam', 'member', 'joined'), ($2, 'other-user', 'You', 'organizer', 'joined')", [tripId, otherTrip]);
}

/** The object without `key`, as a request from before a field existed sends it. */
const without = (value: object, key: string) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

const MWAC = { category: "avalanche", name: "Mount Washington Avalanche Center", region: "Presidential Range", url: "https://www.mountwashingtonavalanchecenter.org/" };
const OBS = { category: "weather", name: "Mount Washington Observatory", region: null, url: "https://www.mountwashington.org/" };

/** Database helpers bound to one database. */
function helpers(db: PGlite) {
  const rows = async <T,>(sql: string, params: unknown[] = [tripId]) => (await db.query<T>(sql, params)).rows;
  const dayId = async (date: string, trip = tripId) =>
    (await rows<{ id: string }>("SELECT id FROM trip_days WHERE trip_id = $1 AND date = $2", [trip, date]))[0]?.id ?? randomUUID();
  /** Adds a source to a day as the organizer, and returns its id. */
  const add = async (date: string, source: object = MWAC, trip = tripId, user = "user-1") =>
    (await rows<{ result: { source_id: string } }>("SELECT public.mutate_trip_conditions_source($1, $2, $3, $4, NULL, 0, $5, 'add', $6) AS result",
      [trip, user, date, await dayId(date, trip), randomUUID(), JSON.stringify(source)]))[0].result.source_id;
  const conditionRows = async (): Promise<ConditionsRows> => ({
    sources: await rows("SELECT id, trip_id, category, name, region, url, revision, created_by, updated_by, to_json(created_at) #>> '{}' AS created_at, to_json(updated_at) #>> '{}' AS updated_at FROM trip_conditions_sources WHERE trip_id = $1"),
    attachments: await rows("SELECT trip_day_id, source_id, to_json(created_at) #>> '{}' AS created_at FROM trip_day_conditions_sources WHERE trip_id = $1"),
    reviews: await rows("SELECT id, entry_number::int AS entry_number, trip_day_id, source_id, user_id, action, note, to_json(reviewed_at) #>> '{}' AS reviewed_at, to_json(created_at) #>> '{}' AS created_at, context FROM trip_conditions_reviews WHERE trip_id = $1"),
  });
  /** The trip as the API loads it, with no stops or tour plans. */
  const loadFull = async (): Promise<TripFull> => {
    const days = await rows<TripDay>("SELECT id, trip_id, date::text, stop_id, activity, access_point, access_point_stop_id FROM trip_days WHERE trip_id = $1 ORDER BY date");
    const conditions = await conditionRows();
    return {
      trip: (await rows<Trip>("SELECT id, owner_user_id, name, start_date::text, end_date::text, status, lodging_revision FROM trips WHERE id = $1"))[0],
      stops: [], kits: [], gear: [], tour_plans: [], days,
      members: await rows<TripMember>("SELECT id, trip_id, user_id, display_name, role, status FROM trip_members WHERE trip_id = $1"),
      conditions: summarizeConditions(conditions, { stops: [], days, tour_plans: [] }),
      conditions_sources: summarizeConditionsSources(conditions, { days }),
    };
  };
  /** Records `user`'s review of a source on a day against the plan as the app reads it now. */
  const review = async (sourceId: string, date: string, user = "user-2") => {
    const full = await loadFull();
    const day = full.days.find((entry) => entry.date === date)!;
    const source = full.conditions_sources!.find((entry) => entry.id === sourceId)!;
    await db.query("SELECT public.record_trip_conditions_review($1, $2, $3, $4, $5, NULL, $6, 'reviewed', 'Moderate above treeline', $7)",
      [tripId, user, date, day.id, sourceId, randomUUID(), JSON.stringify(conditionsContext(full, day, source))]);
  };
  const attach = async (sourceId: string, revision: number, days: unknown, { user = "user-1", requestId = randomUUID() } = {}) =>
    (await rows<{ result: { source_id: string; revision: number } }>("SELECT public.attach_trip_conditions_source($1, $2, $3, $4, $5, $6) AS result",
      [tripId, user, sourceId, revision, requestId, JSON.stringify(days)]))[0].result;
  /** Each date's sources by name. */
  const listed = async () => {
    const byDate: Record<string, string[]> = {};
    for (const row of await rows<{ date: string; name: string }>(`SELECT d.date::text AS date, s.name FROM trip_day_conditions_sources a
      JOIN trip_days d ON d.id = a.trip_day_id JOIN trip_conditions_sources s ON s.id = a.source_id WHERE a.trip_id = $1 ORDER BY d.date, s.name`)) {
      (byDate[row.date] ??= []).push(row.name);
    }
    return byDate;
  };
  const entriesOn = async () => rows<{ date: string; user_id: string }>(
    "SELECT d.date::text AS date, r.user_id FROM trip_conditions_reviews r JOIN trip_days d ON d.id = r.trip_day_id WHERE r.trip_id = $1 ORDER BY r.entry_number");
  const revision = async (sourceId: string) => (await rows<{ revision: number }>("SELECT revision FROM trip_conditions_sources WHERE id = $1", [sourceId]))[0].revision;
  return { rows, dayId, add, loadFull, review, attach, listed, entriesOn, revision, conditionRows };
}

describe("Reusing conditions sources in Postgres", () => {
  let db: PGlite;
  let h: ReturnType<typeof helpers>;
  beforeAll(async () => { db = await createDatabase([NOTES, REUSE]); h = helpers(db); }, 30_000);
  beforeEach(async () => { await seed(db); });
  afterAll(async () => { await db?.close(); });

  describe("listing a source on more days", () => {
    it("lists it on the days its review showed, at its revision, and adds to the revision", async () => {
      const sourceId = await h.add("2026-10-10");
      const preview = previewConditionsAttach(await h.conditionRows(), await h.loadFull(), sourceId, ["2026-10-09", "2026-10-10", "2026-10-11"]);
      if ("error" in preview) throw new Error(preview.error);
      expect(preview.summary).toBe("Lists Mount Washington Avalanche Center on Fri Oct 9 and Sun Oct 11. Sat Oct 10 already lists it. Reviews stay with the day they were recorded for, so none come from other days.");
      expect(await h.attach(sourceId, preview.revision, preview.expected_days)).toEqual({ source_id: sourceId, revision: 2 });
      expect(await h.listed()).toEqual({
        "2026-10-09": ["Mount Washington Avalanche Center"], "2026-10-10": ["Mount Washington Avalanche Center"], "2026-10-11": ["Mount Washington Avalanche Center"],
      });
      expect((await h.loadFull()).conditions_sources).toMatchObject([{ id: sourceId, dates: ["2026-10-09", "2026-10-10", "2026-10-11"], updated_by: "user-1" }]);
    });

    it("brings no review from another day, and shows a day's own earlier reviews again", async () => {
      const sourceId = await h.add("2026-10-10");
      await h.review(sourceId, "2026-10-10");
      // Removed from Saturday, then listed on Friday and Saturday again.
      await db.query("SELECT public.mutate_trip_conditions_source($1, 'user-1', '2026-10-10', $2, $3, 1, $4, 'remove', '{}')", [tripId, await h.dayId("2026-10-10"), sourceId, randomUUID()]);
      const preview = previewConditionsAttach(await h.conditionRows(), await h.loadFull(), sourceId, ["2026-10-09", "2026-10-10"]);
      if ("error" in preview) throw new Error(preview.error);
      expect(preview.days).toEqual([
        { date: "2026-10-09", date_label: "Fri Oct 9", note: "No review recorded for this day." },
        { date: "2026-10-10", date_label: "Sat Oct 10", note: "1 review recorded here before it was removed shows again." },
      ]);
      await h.attach(sourceId, 1, preview.expected_days);
      const full = await h.loadFull();
      expect(full.conditions?.map((listing) => [listing.date, listing.reviews.map((entry) => entry.user_id)])).toEqual([
        ["2026-10-09", []], ["2026-10-10", ["user-2"]],
      ]);
      expect(await h.entriesOn()).toEqual([{ date: "2026-10-10", user_id: "user-2" }]);
    });

    it("refuses a stale revision, and a day that moved or isn't on the trip", async () => {
      const sourceId = await h.add("2026-10-10");
      const friday = [{ date: "2026-10-09", day_id: await h.dayId("2026-10-09") }];
      await expect(h.attach(sourceId, 2, friday)).rejects.toMatchObject({ code: "PT409" });
      await expect(h.attach(sourceId, 1, [{ date: "2026-10-09", day_id: await h.dayId("2026-10-11") }])).rejects.toMatchObject({ code: "PT409" });
      await expect(h.attach(sourceId, 1, [{ date: "2026-10-12", day_id: randomUUID() }])).rejects.toMatchObject({ code: "PT409" });
      await expect(h.attach(sourceId, 1, [...friday, { date: "2026-10-11", day_id: await h.dayId("2026-10-11", otherTrip) }])).rejects.toMatchObject({ code: "PT409" });
      expect(await h.listed()).toEqual({ "2026-10-10": ["Mount Washington Avalanche Center"] });
    });

    it("refuses an edit reviewed before the source was listed on more days", async () => {
      const sourceId = await h.add("2026-10-10");
      const edit = previewConditionsEdit(await h.loadFull(), sourceId, { ...MWAC, category: "avalanche", url: "https://example.org/mwac" });
      if ("error" in edit) throw new Error(edit.error);
      expect(edit.expected_days).toEqual([{ date: "2026-10-10", day_id: await h.dayId("2026-10-10") }]);
      await h.attach(sourceId, 1, [{ date: "2026-10-11", day_id: await h.dayId("2026-10-11") }]);
      await expect(db.query("SELECT public.mutate_trip_conditions_source($1, 'user-1', '2026-10-10', $2, $3, $4, $5, 'save', $6)",
        [tripId, await h.dayId("2026-10-10"), sourceId, edit.revision, randomUUID(), JSON.stringify({ ...MWAC, url: "https://example.org/mwac" })])).rejects.toMatchObject({ code: "PT409" });
    });

    it("replays a retried save without repeating it, and refuses a reused identity with other input", async () => {
      const sourceId = await h.add("2026-10-10");
      const requestId = randomUUID();
      const friday = [{ date: "2026-10-09", day_id: await h.dayId("2026-10-09") }];
      const first = await h.attach(sourceId, 1, friday, { requestId });
      expect(await h.attach(sourceId, 1, friday, { requestId })).toEqual(first);
      expect(await h.revision(sourceId)).toBe(2);
      await expect(h.attach(sourceId, 1, [{ date: "2026-10-11", day_id: await h.dayId("2026-10-11") }], { requestId })).rejects.toMatchObject({ code: "22023" });
    });

    it("is organizer only, for this trip's sources, with days to list it on", async () => {
      const sourceId = await h.add("2026-10-10");
      const foreign = await h.add("2026-10-10", MWAC, otherTrip, "other-user");
      const friday = [{ date: "2026-10-09", day_id: await h.dayId("2026-10-09") }];
      await expect(h.attach(sourceId, 1, friday, { user: "user-2" })).rejects.toMatchObject({ code: "42501" });
      await expect(h.attach(sourceId, 1, friday, { user: "other-user" })).rejects.toMatchObject({ code: "42501" });
      await expect(h.attach(foreign, 1, friday)).rejects.toMatchObject({ code: "PT409" });
      await expect(h.attach(sourceId, 1, [])).rejects.toMatchObject({ code: "22000" });
      await expect(h.attach(sourceId, 1, { date: "2026-10-09" })).rejects.toMatchObject({ code: "22000" });
      await expect(h.attach(sourceId, 1, ["2026-10-09"])).rejects.toMatchObject({ code: "22000" });
      expect(await h.listed()).toEqual({ "2026-10-10": ["Mount Washington Avalanche Center"] });
    });
  });

  describe("Copy day", () => {
    /** Reviews and saves a copy as the API does: the option's payload and the checks its review saw. */
    const copy = async (request: Extract<TripItineraryRequest, { action: "copy_day" }>, { user = "user-1", before = async () => {} } = {}) => {
      const preview = previewItinerary(await h.loadFull(), request, user, await h.conditionRows());
      if ("error" in preview) throw new Error(preview.error);
      const body: Record<string, unknown> = { action: "copy_day", ...preview.options[0].payload };
      const edit = parseItineraryEdit(body);
      if ("error" in edit) throw new Error(edit.error);
      await before();
      return db.query("SELECT public.edit_trip_itinerary_reviewed($1, $2, 'copy_day', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)",
        [tripId, user, JSON.stringify(edit.payload), JSON.stringify(body.access_points), JSON.stringify(body.tour_plans), JSON.stringify(body.conditions ?? null)]);
    };

    it("lists the day's sources on each day it's copied to, with no reviews, keeping each day's own", async () => {
      const mwac = await h.add("2026-10-10");
      const obs = await h.add("2026-10-11", OBS);
      await h.review(mwac, "2026-10-10");
      await db.query("UPDATE trip_days SET activity = 'Hiking' WHERE trip_id = $1 AND date = '2026-10-10'", [tripId]);
      const preview = previewItinerary(await h.loadFull(), { action: "copy_day", from: "2026-10-10", dates: ["2026-10-09", "2026-10-11"], kit: false, sources: true }, "user-1");
      expect(preview).toMatchObject({ options: [{ label: "Copy Sat Oct 10 and its conditions sources to 2 days", changes: [
        { date: "2026-10-09", notes: ["Lists Mount Washington Avalanche Center too, with no review recorded for this day: reviews stay on Sat Oct 10."] },
        { date: "2026-10-11", notes: ["Lists Mount Washington Avalanche Center too, with no review recorded for this day: reviews stay on Sat Oct 10."] },
      ] }] });
      await copy({ action: "copy_day", from: "2026-10-10", dates: ["2026-10-09", "2026-10-11"], kit: false, sources: true });
      expect(await h.listed()).toEqual({
        "2026-10-09": ["Mount Washington Avalanche Center"],
        "2026-10-10": ["Mount Washington Avalanche Center"],
        "2026-10-11": ["Mount Washington Avalanche Center", "Mount Washington Observatory"],
      });
      expect(await h.rows("SELECT date::text, activity FROM trip_days WHERE trip_id = $1 ORDER BY date")).toEqual([
        { date: "2026-10-09", activity: "Hiking" }, { date: "2026-10-10", activity: "Hiking" }, { date: "2026-10-11", activity: "Hiking" },
      ]);
      expect(await h.entriesOn()).toEqual([{ date: "2026-10-10", user_id: "user-2" }]);
      expect([await h.revision(mwac), await h.revision(obs)]).toEqual([2, 1]);
      const copied = (await h.loadFull()).conditions!.filter((listing) => listing.date !== "2026-10-10");
      expect(copied.every((listing) => listing.reviews.length === 0)).toBe(true);
    });

    it("says a day's kept reviews show again, as the copy brings them back", async () => {
      const mwac = await h.add("2026-10-10");
      // Friday listed MWAC once; Sam reviewed it there, then it was removed from Friday.
      const friday = await h.dayId("2026-10-09");
      await h.attach(mwac, 1, [{ date: "2026-10-09", day_id: friday }]);
      await h.review(mwac, "2026-10-09");
      await db.query("SELECT public.mutate_trip_conditions_source($1, 'user-1', '2026-10-09', $2, $3, 2, $4, 'remove', '{}')", [tripId, friday, mwac, randomUUID()]);
      const request = { action: "copy_day" as const, from: "2026-10-10", dates: ["2026-10-09"], kit: false, sources: true };
      const preview = previewItinerary(await h.loadFull(), request, "user-1", await h.conditionRows());
      expect(preview).toMatchObject({ options: [{ changes: [
        { date: "2026-10-09", notes: ["Lists Mount Washington Avalanche Center too. 1 review recorded here before it was removed shows again."] },
      ] }] });
      await copy(request);
      // Friday's plan is the same as when Sam reviewed it, so the review is current again.
      expect((await h.loadFull()).conditions?.find((listing) => listing.date === "2026-10-09")?.reviews)
        .toEqual([expect.objectContaining({ user_id: "user-2", stale_reasons: [] })]);
      // Had Saturday been a hike, the review would come back marked Plan changed.
      await db.query("DELETE FROM trip_day_conditions_sources WHERE trip_day_id = $1", [friday]);
      await db.query("UPDATE trip_days SET activity = 'Hiking' WHERE trip_id = $1 AND date = '2026-10-10'", [tripId]);
      const hike = previewItinerary(await h.loadFull(), request, "user-1", await h.conditionRows());
      expect(hike).toMatchObject({ options: [{ changes: [{ date: "2026-10-09", notes: [
        "Lists Mount Washington Avalanche Center too. 1 review recorded here before it was removed shows again, marked Plan changed — review again.",
      ] }] }] });
      await copy(request);
      expect((await h.loadFull()).conditions?.find((listing) => listing.date === "2026-10-09")?.reviews)
        .toEqual([expect.objectContaining({ user_id: "user-2", stale_reasons: ["Activity changed to Hiking"] })]);
    });

    it("refuses a copy whose review is from before a source was listed or removed anywhere on the trip", async () => {
      const mwac = await h.add("2026-10-10");
      await expect(copy({ action: "copy_day", from: "2026-10-10", dates: ["2026-10-09"], kit: false, sources: true }, {
        before: async () => { await h.add("2026-10-11", OBS); },
      })).rejects.toMatchObject({ code: "PT409" });
      await expect(copy({ action: "copy_day", from: "2026-10-10", dates: ["2026-10-09"], kit: false, sources: true }, {
        before: async () => { await h.attach(mwac, 1, [{ date: "2026-10-11", day_id: await h.dayId("2026-10-11") }]); },
      })).rejects.toMatchObject({ code: "PT409" });
      expect(await h.listed()).toEqual({ "2026-10-10": ["Mount Washington Avalanche Center"], "2026-10-11": ["Mount Washington Avalanche Center", "Mount Washington Observatory"] });
    });

    it("copies sources only for the organizer, only from a day with some, and only for a copy", async () => {
      await h.add("2026-10-10");
      await db.query("UPDATE trip_days SET activity = 'Hiking' WHERE trip_id = $1 AND date = '2026-10-10'", [tripId]);
      const full = await h.loadFull();
      const reviewed = previewItinerary(full, { action: "copy_day", from: "2026-10-10", dates: ["2026-10-09"], kit: false, sources: true }, "user-1");
      if ("error" in reviewed) throw new Error(reviewed.error);
      const body: Record<string, unknown> = { action: "copy_day", ...reviewed.options[0].payload };
      const edit = parseItineraryEdit(body);
      if ("error" in edit || edit.action !== "copy_day") throw new Error("Not a copy");
      const call = (user: string, action: string, payload: object) => db.query("SELECT public.edit_trip_itinerary_reviewed($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)",
        [tripId, user, action, JSON.stringify(payload), JSON.stringify(body.access_points), JSON.stringify(body.tour_plans), JSON.stringify(body.conditions)]);
      // A member's copy is undone with it.
      await expect(call("user-2", "copy_day", edit.payload)).rejects.toMatchObject({ code: "22023" });
      await expect(call("user-1", "copy_day", { ...edit.payload, from: "2026-10-11", expected: { ...edit.payload.expected, from: { ...edit.payload.expected.from, activity: "Backcountry" } } }))
        .rejects.toMatchObject({ code: "22023" });
      await expect(call("user-1", "assign_days", { dates: ["2026-10-09"], activity: "Hiking", expected: [{ date: "2026-10-09", stop_id: null, activity: "Backcountry" }], sources: "add" }))
        .rejects.toMatchObject({ code: "22023" });
      await expect(call("user-1", "copy_day", { ...edit.payload, sources: "replace" })).rejects.toMatchObject({ code: "22023" });
      expect(await h.rows("SELECT date::text, activity FROM trip_days WHERE trip_id = $1 AND date = '2026-10-09'")).toEqual([{ date: "2026-10-09", activity: "Backcountry" }]);
      expect(await h.listed()).toEqual({ "2026-10-10": ["Mount Washington Avalanche Center"] });
      // Without sources, it's 030's copy.
      await call("user-2", "copy_day", without(edit.payload, "sources"));
      expect(await h.rows("SELECT date::text, activity FROM trip_days WHERE trip_id = $1 AND date = '2026-10-09'")).toEqual([{ date: "2026-10-09", activity: "Hiking" }]);
      expect(await h.listed()).toEqual({ "2026-10-10": ["Mount Washington Avalanche Center"] });
    });
  });

  describe("a date change that removes a day", () => {
    // Shortening the trip to Friday–Saturday removes Sunday.
    const shorten = (removed: unknown, database = db) => database.query(
      "SELECT public.change_trip_dates($1, 'user-1', '2026-10-09', '2026-10-11', '2026-10-09', '2026-10-10', 'keep', 'planning', NULL, NULL, $2) AS result",
      [tripId, JSON.stringify(removed)]);
    const removedFor = async () => previewDateChange(await h.loadFull(), "2026-10-09", "2026-10-10", await h.conditionRows()).plans.keep;
    const withoutSources = (removed: TripRemovedDayCheck[]) => removed.map((day) => without(day, "conditions"));
    /** Removes a source from a day, keeping its reviews there. */
    const detach = async (sourceId: string, date: string, revision: number) => db.query(
      "SELECT public.mutate_trip_conditions_source($1, 'user-1', $2, $3, $4, $5, $6, 'remove', '{}')", [tripId, date, await h.dayId(date), sourceId, revision, randomUUID()]);

    it("lists the reviews kept for a source removed from the day, and refuses a review that left them out", async () => {
      const mwac = await h.add("2026-10-11");
      await h.add("2026-10-11", OBS);
      await h.review(mwac, "2026-10-11");
      await detach(mwac, "2026-10-11", 1);
      const plan = await removedFor();
      expect(plan.removed.map((day) => day.conditions)).toEqual([
        "Conditions: Mount Washington Observatory · 1 review of Mount Washington Avalanche Center (no longer listed) removed with the day",
      ]);
      expect(plan.expected_removed).toEqual([expect.objectContaining({ conditions: { source_ids: [expect.any(String)], entries: 1 } })]);
      // A review that left them out, as the API's retry without conditions does, is refused.
      await expect(shorten(withoutSources(plan.expected_removed))).rejects.toMatchObject({ code: "PT409" });
      await shorten(plan.expected_removed);
      expect(await h.entriesOn()).toEqual([]);
    });

    it("lists a day whose only conditions are kept reviews, and refuses a review from before they were recorded", async () => {
      const mwac = await h.add("2026-10-11");
      const unseen = (await removedFor()).expected_removed;
      await h.review(mwac, "2026-10-11");
      await detach(mwac, "2026-10-11", 1);
      for (const stale of [unseen, withoutSources(unseen)]) await expect(shorten(stale)).rejects.toMatchObject({ code: "PT409" });
      const seen = (await removedFor()).expected_removed;
      expect(seen).toEqual([expect.objectContaining({ conditions: { source_ids: [], entries: 1 } })]);
      expect(await h.entriesOn()).toHaveLength(1);
      await shorten(seen);
      expect(await h.entriesOn()).toEqual([]);
    });

    it("refuses a review from before a source was removed from the day, with or without the API's retry", async () => {
      const mwac = await h.add("2026-10-11");
      await h.review(mwac, "2026-10-11");
      const seen = (await removedFor()).expected_removed;
      await detach(mwac, "2026-10-11", 1);
      await expect(shorten(seen)).rejects.toMatchObject({ code: "PT409" });
      await expect(shorten(withoutSources(seen))).rejects.toMatchObject({ code: "PT409" });
      expect(await h.entriesOn()).toHaveLength(1);
    });

    it("lists its sources and reviews in the review, and removes them with the day", async () => {
      const mwac = await h.add("2026-10-11");
      await h.add("2026-10-11", OBS);
      await h.review(mwac, "2026-10-11");
      const plan = await removedFor();
      expect(plan.removed.map((day) => day.conditions)).toEqual(["Conditions: Mount Washington Avalanche Center and Mount Washington Observatory · 1 review removed with the day"]);
      expect(plan.expected_removed).toEqual([expect.objectContaining({ date: "2026-10-11", conditions: { source_ids: expect.any(Array), entries: 1 } })]);
      await shorten(plan.expected_removed);
      expect(await h.listed()).toEqual({});
      expect(await h.entriesOn()).toEqual([]);
      // The sources stay on the trip.
      expect((await h.loadFull()).conditions_sources?.map((source) => [source.name, source.dates])).toEqual([
        ["Mount Washington Avalanche Center", []], ["Mount Washington Observatory", []],
      ]);
    });

    it("says moved days' reviews are to record again", async () => {
      const mwac = await h.add("2026-10-10");
      await h.review(mwac, "2026-10-10");
      const move = previewDateChange(await h.loadFull(), "2026-10-16", "2026-10-18").plans.move!;
      expect(move.moved.map((day) => day.conditions)).toEqual([null, "Conditions: Mount Washington Avalanche Center · 1 review to record again", null]);
    });

    it("refuses a review from before a source was listed or a review recorded on it", async () => {
      const unseen = (await removedFor()).expected_removed;
      const mwac = await h.add("2026-10-11");
      await expect(shorten(unseen)).rejects.toMatchObject({ code: "PT409" });
      const seen = (await removedFor()).expected_removed;
      await h.review(mwac, "2026-10-11");
      await expect(shorten(seen)).rejects.toMatchObject({ code: "PT409" });
      // The API's retry without the sources can't pass here either.
      await expect(shorten(withoutSources((await removedFor()).expected_removed))).rejects.toMatchObject({ code: "PT409" });
      expect(await h.entriesOn()).toEqual([{ date: "2026-10-11", user_id: "user-2" }]);
    });

    it("lists a day without sources as before", async () => {
      await h.add("2026-10-10");
      expect((await removedFor()).expected_removed).toEqual([{ date: "2026-10-11", stop_id: null, activity: "Backcountry", kit_ids: [] }]);
      await shorten([{ date: "2026-10-11", stop_id: null, activity: "Backcountry", kit_ids: [] }]);
      expect(await h.listed()).toEqual({ "2026-10-10": ["Mount Washington Avalanche Center"] });
    });

    it("keeps the tour plan, notes and lodging checks", async () => {
      const source = (await h.rows<{ src: string }>("SELECT prosrc AS src FROM pg_proc WHERE proname = 'change_trip_dates'", [])).map((row) => row.src);
      expect(source).toHaveLength(1);
      expect(source[0]).toContain("tour_plan_id");
      expect(source[0]).toContain("jsonb_build_object('notes', d.notes)");
      expect(source[0]).toContain("trip_member_attendance");
      expect(source[0]).toContain("trip_day_conditions_sources");
    });
  });

  it("is reachable only by the service role", async () => {
    for (const signature of ["public.attach_trip_conditions_source(uuid, text, uuid, integer, uuid, jsonb)", "public.trip_conditions_snapshot(uuid)",
      "public.edit_trip_itinerary_reviewed(uuid, text, text, jsonb, jsonb, jsonb, jsonb)"]) {
      expect((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon, has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated, has_function_privilege('service_role',$1,'EXECUTE') AS service", [signature])).rows[0])
        .toEqual({ anon: false, authenticated: false, service: true });
    }
  });
});

describe("Reusing conditions sources across migration orders", () => {
  it("adds the date change's sources check before or after day notes, and refuses nothing a review without sources would pass before it", async () => {
    // Before this migration: a review that lists a day's sources never matches, and the API's retry without them does.
    const before = await createDatabase([NOTES]);
    const h = helpers(before);
    await seed(before);
    await h.add("2026-10-11");
    const removed = previewDateChange(await h.loadFull(), "2026-10-09", "2026-10-10").plans.keep.expected_removed;
    const shorten = (days: unknown) => before.query(
      "SELECT public.change_trip_dates($1, 'user-1', '2026-10-09', '2026-10-11', '2026-10-09', '2026-10-10', 'keep', 'planning', NULL, NULL, $2)", [tripId, JSON.stringify(days)]);
    await expect(shorten(removed)).rejects.toMatchObject({ code: "PT409" });
    await shorten(removed.map((day) => without(day, "conditions")));
    expect(await h.rows("SELECT count(*)::int AS days FROM trip_days WHERE trip_id = $1")).toEqual([{ days: 2 }]);

    // Before it, the function checks no conditions, so the API compares the
    // review's with the trip's now first: a source removed from the day since
    // the review, or the reviews it keeps there, read differently.
    await seed(before);
    const mwac = await h.add("2026-10-11");
    await h.review(mwac, "2026-10-11");
    const now = async () => previewDateChange(await h.loadFull(), "2026-10-09", "2026-10-10", await h.conditionRows()).plans.keep.expected_removed;
    const seen = await now();
    await before.query("SELECT public.mutate_trip_conditions_source($1, 'user-1', '2026-10-11', $2, $3, 1, $4, 'remove', '{}')", [tripId, await h.dayId("2026-10-11"), mwac, randomUUID()]);
    const after = await now();
    expect([seen[0].conditions, after[0].conditions]).toEqual([{ source_ids: [mwac], entries: 1 }, { source_ids: [], entries: 1 }]);
    // A review that saw the kept review passes through the API's retry, as every removal did before this change.
    await expect(shorten(after)).rejects.toMatchObject({ code: "PT409" });
    await shorten(after.map((day) => without(day, "conditions")));
    expect(await h.entriesOn()).toEqual([]);
    await before.close();

    // This migration first, then day notes: both checks are there.
    const reordered = await createDatabase([REUSE, NOTES]);
    const source = (await reordered.query<{ src: string }>("SELECT prosrc AS src FROM pg_proc WHERE proname = 'change_trip_dates'")).rows[0].src;
    expect(source).toContain("trip_day_conditions_sources");
    expect(source).toContain("jsonb_build_object('notes', d.notes)");
    await reordered.close();
  }, 60_000);
});
