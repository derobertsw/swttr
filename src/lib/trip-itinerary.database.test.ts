// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dayLabels, previewItinerary } from "@/lib/trip-itinerary";
import type { Trip, TripDay, TripFull, TripItineraryRequest, TripMember, TripMemberDayKit, TripStop } from "@/types/trips";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const stowe = "5b7f1f7e-3c52-4c39-9d0e-0a3c1f0b6a11";
const smuggs = "8c2d6a90-1b4e-4f7a-a0c1-6d5e2b9f3c22";
const jay = "2e4b8f1a-7c3d-4e5f-9a6b-1c2d3e4f5a66";
const elsewhere = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const JAY_PLACE = { name: "Jay Peak, Vermont", latitude: 44.9379, longitude: -72.5045 };
const BURLINGTON = { name: "Burlington, Vermont", latitude: 44.4759, longitude: -73.2121 };
// Each stop's place as a review shows it.
const AT_STOWE = { name: "Stowe, Vermont", latitude: 44.4654, longitude: -72.6874 };
const AT_SMUGGS = { name: "Smuggs, Vermont", latitude: 44.5884, longitude: -72.7834 };
let db: PGlite;

const edit = async (action: string, payload: unknown, user = "user-1") => action === "copy_day"
  ? (await db.query<{ result: unknown }>("SELECT public.copy_trip_day($1, $2, $3::jsonb) AS result", [tripId, user, JSON.stringify(payload)])).rows[0].result
  : (await db.query<{ result: unknown }>("SELECT public.edit_trip_itinerary($1, $2, $3, $4::jsonb) AS result", [tripId, user, action, JSON.stringify(payload)])).rows[0].result;
const loadFull = async (): Promise<TripFull> => {
  const rows = async <T,>(sql: string) => (await db.query<T>(sql, [tripId])).rows;
  return {
    trip: (await rows<Trip>("SELECT id, owner_user_id, name, start_date::text, end_date::text, status FROM trips WHERE id = $1"))[0],
    stops: await rows<TripStop>("SELECT id, position, name, latitude::float8 AS latitude, longitude::float8 AS longitude FROM trip_stops WHERE trip_id = $1 ORDER BY position"),
    days: await rows<TripDay>("SELECT id, date::text, stop_id, activity FROM trip_days WHERE trip_id = $1 ORDER BY date"),
    members: await rows<TripMember>("SELECT id, trip_id, user_id, display_name, role, status FROM trip_members WHERE trip_id = $1 ORDER BY created_at, display_name"),
    // Timestamps as the API sends them (ISO 8601), so reviews carry them that way.
    kits: await rows<TripMemberDayKit>(`SELECT k.id, k.trip_day_id, k.trip_member_id, k.effort, k.items, k.note, k.state, k.outfit,
      to_json(k.updated_at) #>> '{}' AS updated_at, to_json(k.outfit_saved_at) #>> '{}' AS outfit_saved_at
      FROM trip_member_day_kits k JOIN trip_days d ON d.id = k.trip_day_id WHERE d.trip_id = $1`),
    gear: [],
  };
};
const labels = async () => Object.fromEntries(dayLabels(await loadFull()));
/** Each day's stop after following NULL to the base, which must survive reordering. */
const effectiveStops = async () => {
  const { stops, days } = await loadFull();
  return Object.fromEntries(days.map((day) => [day.date, day.stop_id ?? stops[0]?.id ?? null]));
};
const stopNames = async () => (await loadFull()).stops.map((stop) => stop.name);
/** Adds a member's kit on a date: an outfit, checklist items, a note, or any of them. */
const addKit = async (date: string, user: string, kit: { outfit?: object; items?: string[]; note?: string }) => {
  await db.query(`INSERT INTO trip_member_day_kits (trip_day_id, trip_member_id, effort, items, note, outfit, outfit_saved_at)
    SELECT d.id, m.id, 'hard', $4::jsonb, $5, $6::jsonb, CASE WHEN $6::jsonb IS NULL THEN NULL ELSE '2026-10-08T12:00:00Z'::timestamptz END
      FROM trip_days d JOIN trip_members m ON m.trip_id = d.trip_id
      WHERE d.trip_id = $1 AND d.date = $2 AND m.user_id = $3`,
  [tripId, date, user, JSON.stringify(kit.items ?? []), kit.note ?? null, kit.outfit ? JSON.stringify(kit.outfit) : null]);
};
/** Each member's kit on each date, without its row id and update time. */
const kitsByDay = async () => {
  const full = await loadFull();
  return Object.fromEntries(full.kits.map(({ trip_day_id, trip_member_id, effort, items, note, state, outfit, outfit_saved_at }) => [
    `${full.days.find((day) => day.id === trip_day_id)!.date} ${full.members.find((member) => member.id === trip_member_id)!.user_id}`,
    { effort, items, note, state, outfit, outfit_saved_at },
  ]));
};
/** The payload of a previewed option, as the review would send it. */
const reviewed = async (request: TripItineraryRequest, key?: string) => {
  const preview = previewItinerary(await loadFull(), request, "user-1");
  if ("error" in preview) throw new Error(preview.error);
  return (key ? preview.options.find((option) => option.key === key)! : preview.options[0]).payload;
};
const OUTFIT = { version: 1, outing: { activity: "backcountry_skiing" } };

describe("Itinerary edits in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    for (const migration of ["012_trips", "016_atomic_trip_creation", "018_trip_saved_kits", "022_trip_itinerary_edits", "023_trip_copy_day"]) {
      await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
    }
  }, 20_000);

  // Friday–Monday at Stowe (the base), Smuggs and Jay Peak. Friday inherits the
  // base and is a ski touring day, Saturday is hiking at Smuggs, Sunday is at
  // Stowe and Monday at Jay Peak.
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-1', 'Weekend', '2026-10-09', '2026-10-12')", [tripId]);
    await db.query(`INSERT INTO trip_stops (id, trip_id, position, name, latitude, longitude) VALUES
      ($1, $4, 0, 'Stowe, Vermont', 44.4654, -72.6874), ($2, $4, 1, 'Smuggs, Vermont', 44.5884, -72.7834), ($3, $4, 2, 'Jay Peak, Vermont', 44.9379, -72.5045)`, [stowe, smuggs, jay, tripId]);
    await db.query(`INSERT INTO trip_days (trip_id, date, stop_id, activity) VALUES
      ($1, '2026-10-09', NULL, 'Ski touring'), ($1, '2026-10-10', $2, 'Hiking'), ($1, '2026-10-11', $3, NULL), ($1, '2026-10-12', $4, NULL)`, [tripId, smuggs, stowe, jay]);
    await db.query("INSERT INTO trip_members (trip_id, user_id, display_name, role, status) VALUES ($1, 'user-1', 'You', 'organizer', 'joined'), ($1, 'user-2', 'Sam', 'member', 'joined'), ($1, 'user-3', 'Alex', 'member', 'left')", [tripId]);
  });
  afterAll(async () => { await db?.close(); });

  describe("removing a stop", () => {
    it("moves its days to the chosen stop and keeps every other day", async () => {
      await edit("remove_stop", { stop_id: smuggs, reassign_to: jay, expected: ["2026-10-10"] });
      expect(await labels()).toEqual({
        "2026-10-09": "Stowe, Vermont (base) · Ski touring",
        "2026-10-10": "Jay Peak, Vermont · Hiking",
        "2026-10-11": "Stowe, Vermont · No activity",
        "2026-10-12": "Jay Peak, Vermont · No activity",
      });
      expect(await stopNames()).toEqual(["Stowe, Vermont", "Jay Peak, Vermont"]);
    });

    it("moves the base's own and inherited days when the base is removed", async () => {
      await edit("remove_stop", { stop_id: stowe, reassign_to: jay, expected: ["2026-10-09", "2026-10-11"] });
      expect(await labels()).toEqual({
        "2026-10-09": "Jay Peak, Vermont · Ski touring",
        "2026-10-10": "Smuggs, Vermont · Hiking",
        "2026-10-11": "Jay Peak, Vermont · No activity",
        "2026-10-12": "Jay Peak, Vermont · No activity",
      });
    });

    it("leaves days with no destination only when the last stop is removed", async () => {
      await db.query("DELETE FROM trip_stops WHERE id IN ($1, $2)", [smuggs, jay]);
      await edit("remove_stop", { stop_id: stowe, reassign_to: null, expected: ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"] });
      expect(Object.values(await labels())).toEqual(["No destination · Ski touring", "No destination · Hiking", "No destination · No activity", "No destination · No activity"]);
    });

    it("needs another stop on this trip for its days while other stops remain", async () => {
      const remove = (payload: object) => edit("remove_stop", { stop_id: smuggs, expected: ["2026-10-10"], ...payload });
      await expect(remove({ reassign_to: null })).rejects.toMatchObject({ code: "22023" });
      await expect(remove({ reassign_to: smuggs })).rejects.toMatchObject({ code: "22023" });
      await expect(remove({ reassign_to: elsewhere })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("remove_stop", { stop_id: elsewhere, reassign_to: jay, expected: [] })).rejects.toMatchObject({ code: "P0002" });
      await db.query("DELETE FROM trip_stops WHERE id IN ($1, $2)", [smuggs, jay]);
      await expect(edit("remove_stop", { stop_id: stowe, reassign_to: jay, expected: [] })).rejects.toMatchObject({ code: "22023" });
      expect(await stopNames()).toEqual(["Stowe, Vermont"]);
    });

    it("refuses the removal when the days using the stop changed after the review", async () => {
      await db.query("UPDATE trip_days SET stop_id = $1 WHERE date = '2026-10-12'", [smuggs]);
      await expect(edit("remove_stop", { stop_id: smuggs, reassign_to: jay, expected: ["2026-10-10"] })).rejects.toMatchObject({ code: "40001" });
      // Inherited days count as the base's days.
      await expect(edit("remove_stop", { stop_id: stowe, reassign_to: jay, expected: ["2026-10-11"] })).rejects.toMatchObject({ code: "40001" });
      expect(await stopNames()).toHaveLength(3);
    });
  });

  describe("reordering stops", () => {
    it("pins days without a stop to the old base when another stop becomes first", async () => {
      const before = await effectiveStops();
      await edit("reorder_stops", { order: [jay, stowe, smuggs], expected: [stowe, smuggs, jay] });
      expect(await stopNames()).toEqual(["Jay Peak, Vermont", "Stowe, Vermont", "Smuggs, Vermont"]);
      expect(await effectiveStops()).toEqual(before);
      expect((await db.query("SELECT position FROM trip_stops ORDER BY position")).rows).toEqual([{ position: 0 }, { position: 1 }, { position: 2 }]);
    });

    it("leaves days without a stop on the base when the first stop stays first", async () => {
      await edit("reorder_stops", { order: [stowe, jay, smuggs], expected: [stowe, smuggs, jay] });
      expect((await loadFull()).days[0].stop_id).toBeNull();
      expect(await stopNames()).toEqual(["Stowe, Vermont", "Jay Peak, Vermont", "Smuggs, Vermont"]);
    });

    it("works from gapped and negative positions", async () => {
      await db.query("UPDATE trip_stops SET position = CASE id WHEN $1 THEN -2 WHEN $2 THEN 5 ELSE -1 END", [stowe, smuggs]);
      await edit("reorder_stops", { order: [smuggs, jay, stowe], expected: [stowe, jay, smuggs] });
      expect(await stopNames()).toEqual(["Smuggs, Vermont", "Jay Peak, Vermont", "Stowe, Vermont"]);
    });

    it("needs every stop once, in an order reviewed against the saved one", async () => {
      const expected = [stowe, smuggs, jay];
      await expect(edit("reorder_stops", { order: [jay, stowe], expected })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("reorder_stops", { order: [jay, jay, stowe], expected })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("reorder_stops", { order: [jay, stowe, elsewhere], expected })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("reorder_stops", { order: [jay, stowe, smuggs], expected: [smuggs, stowe, jay] })).rejects.toMatchObject({ code: "40001" });
      expect(await stopNames()).toEqual(["Stowe, Vermont", "Smuggs, Vermont", "Jay Peak, Vermont"]);
    });
  });

  describe("assigning days", () => {
    const expectedFor = async (dates: string[]) => (await loadFull()).days.filter((day) => dates.includes(day.date)).map(({ date, stop_id, activity }) => ({ date, stop_id, activity }));

    it("sets only the fields it's given, and a null activity clears it", async () => {
      await edit("assign_days", { dates: ["2026-10-09", "2026-10-10"], stop_id: jay, expected: await expectedFor(["2026-10-09", "2026-10-10"]) });
      await edit("assign_days", { dates: ["2026-10-10", "2026-10-11"], activity: null, expected: await expectedFor(["2026-10-10", "2026-10-11"]) });
      await edit("assign_days", { dates: ["2026-10-12"], activity: "Ski touring", expected: await expectedFor(["2026-10-12"]) });
      expect(await labels()).toEqual({
        "2026-10-09": "Jay Peak, Vermont · Ski touring",
        "2026-10-10": "Jay Peak, Vermont · No activity",
        "2026-10-11": "Stowe, Vermont · No activity",
        "2026-10-12": "Jay Peak, Vermont · Ski touring",
      });
    });

    it("refuses a date without a day even when the expected list leaves it out", async () => {
      await db.query("DELETE FROM trip_days WHERE date = '2026-10-12'");
      const expected = await expectedFor(["2026-10-11"]);
      await expect(edit("assign_days", { dates: ["2026-10-11", "2026-10-12"], activity: "Hiking", expected })).rejects.toMatchObject({ code: "40001" });
      expect((await labels())["2026-10-11"]).toBe("Stowe, Vermont · No activity");
    });

    it("refuses days whose destination or activity changed after the review", async () => {
      const expected = await expectedFor(["2026-10-09", "2026-10-10"]);
      await db.query("UPDATE trip_days SET activity = 'Biking' WHERE date = '2026-10-10'");
      await expect(edit("assign_days", { dates: ["2026-10-09", "2026-10-10"], stop_id: jay, expected })).rejects.toMatchObject({ code: "40001" });
      await expect(edit("assign_days", { dates: ["2026-10-09"], stop_id: jay, expected })).rejects.toMatchObject({ code: "40001" });
      expect((await labels())["2026-10-09"]).toBe("Stowe, Vermont (base) · Ski touring");
    });

    it("rejects a change without a field, a stop from elsewhere or an activity that's too long", async () => {
      const expected = await expectedFor(["2026-10-09"]);
      await expect(edit("assign_days", { dates: ["2026-10-09"], expected })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("assign_days", { dates: [], activity: "Hiking", expected: [] })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("assign_days", { dates: ["2026-10-09"], stop_id: elsewhere, expected })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("assign_days", { dates: ["2026-10-09"], stop_id: null, expected })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("assign_days", { dates: ["2026-10-09"], activity: "x".repeat(81), expected })).rejects.toMatchObject({ code: "22023" });
    });
  });

  describe("changing a day's place", () => {
    it("gives only this day a new last stop", async () => {
      await edit("set_day_place", { date: "2026-10-09", place: BURLINGTON, scope: "day", expected: { stop_id: stowe, stop: AT_STOWE, dates: ["2026-10-09"] } });
      expect(await stopNames()).toEqual(["Stowe, Vermont", "Smuggs, Vermont", "Jay Peak, Vermont", "Burlington, Vermont"]);
      expect(await labels()).toMatchObject({ "2026-10-09": "Burlington, Vermont · Ski touring", "2026-10-11": "Stowe, Vermont · No activity" });
    });

    it("uses a stop already at the place instead of adding another", async () => {
      await edit("set_day_place", { date: "2026-10-11", place: { ...JAY_PLACE, latitude: 44.93791 }, scope: "day", expected: { stop_id: stowe, stop: AT_STOWE, dates: ["2026-10-11"] } });
      expect(await stopNames()).toHaveLength(3);
      expect((await labels())["2026-10-11"]).toBe("Jay Peak, Vermont · No activity");
    });

    it("moves the stop to the place for every day at it", async () => {
      await edit("set_day_place", { date: "2026-10-11", place: BURLINGTON, scope: "stop", expected: { stop_id: stowe, stop: AT_STOWE, dates: ["2026-10-09", "2026-10-11"] } });
      expect(await labels()).toMatchObject({ "2026-10-09": "Burlington, Vermont (base) · Ski touring", "2026-10-11": "Burlington, Vermont · No activity" });
      expect((await loadFull()).stops[0]).toMatchObject({ id: stowe, latitude: BURLINGTON.latitude, longitude: BURLINGTON.longitude });
    });

    it("moves every day at the stop to another stop already at the place, rather than duplicating it", async () => {
      await edit("set_day_place", { date: "2026-10-11", place: JAY_PLACE, scope: "stop", expected: { stop_id: stowe, stop: AT_STOWE, dates: ["2026-10-09", "2026-10-11"] } });
      expect(await stopNames()).toEqual(["Stowe, Vermont", "Smuggs, Vermont", "Jay Peak, Vermont"]);
      expect(await labels()).toMatchObject({ "2026-10-09": "Jay Peak, Vermont · Ski touring", "2026-10-11": "Jay Peak, Vermont · No activity" });
    });

    it("refuses to overwrite a stop whose place changed after the review", async () => {
      await db.query("UPDATE trip_stops SET name = 'Stowe Mountain Resort, Vermont' WHERE id = $1", [stowe]);
      await expect(edit("set_day_place", { date: "2026-10-11", place: BURLINGTON, scope: "stop", expected: { stop_id: stowe, stop: AT_STOWE, dates: ["2026-10-09", "2026-10-11"] } })).rejects.toMatchObject({ code: "40001" });
      await db.query("UPDATE trip_stops SET name = $2, latitude = 44.5 WHERE id = $1", [stowe, AT_STOWE.name]);
      await expect(edit("set_day_place", { date: "2026-10-11", place: BURLINGTON, scope: "day", expected: { stop_id: stowe, stop: AT_STOWE, dates: ["2026-10-11"] } })).rejects.toMatchObject({ code: "40001" });
      expect((await loadFull()).stops[0]).toMatchObject({ name: "Stowe, Vermont", latitude: 44.5 });
    });

    it("adds the place as the base for every day when the trip has no stops", async () => {
      await db.query("UPDATE trip_days SET stop_id = NULL");
      await db.query("DELETE FROM trip_stops");
      const dates = ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"];
      await expect(edit("set_day_place", { date: "2026-10-10", place: BURLINGTON, scope: "day", expected: { stop_id: null, stop: null, dates: ["2026-10-10"] } })).rejects.toMatchObject({ code: "22023" });
      await edit("set_day_place", { date: "2026-10-10", place: BURLINGTON, scope: "stop", expected: { stop_id: null, stop: null, dates } });
      expect(Object.values(await labels()).every((label) => label.startsWith("Burlington, Vermont (base) · "))).toBe(true);
    });

    it("refuses a missing day, and a stop or its days that changed after the review", async () => {
      await expect(edit("set_day_place", { date: "2026-10-13", place: BURLINGTON, scope: "day", expected: { stop_id: stowe, stop: AT_STOWE, dates: ["2026-10-13"] } })).rejects.toMatchObject({ code: "P0002" });
      await expect(edit("set_day_place", { date: "2026-10-09", place: BURLINGTON, scope: "day", expected: { stop_id: smuggs, stop: AT_SMUGGS, dates: ["2026-10-09"] } })).rejects.toMatchObject({ code: "40001" });
      await expect(edit("set_day_place", { date: "2026-10-09", place: BURLINGTON, scope: "stop", expected: { stop_id: stowe, stop: AT_STOWE, dates: ["2026-10-09"] } })).rejects.toMatchObject({ code: "40001" });
      await expect(edit("set_day_place", { date: "2026-10-09", place: { ...BURLINGTON, latitude: 91 }, scope: "day", expected: { stop_id: stowe, stop: AT_STOWE, dates: ["2026-10-09"] } })).rejects.toMatchObject({ code: "22023" });
      expect(await stopNames()).toHaveLength(3);
    });
  });

  describe("copying a day", () => {
    const copy = (dates: string[], kit = false): TripItineraryRequest => ({ action: "copy_day", from: "2026-10-09", dates, kit });

    it("gives each date the day's destination and activity, keeping a day without a stop on the base", async () => {
      await edit("copy_day", await reviewed(copy(["2026-10-11", "2026-10-12"])));
      expect(await labels()).toEqual({
        "2026-10-09": "Stowe, Vermont (base) · Ski touring",
        "2026-10-10": "Smuggs, Vermont · Hiking",
        "2026-10-11": "Stowe, Vermont (base) · Ski touring",
        "2026-10-12": "Stowe, Vermont (base) · Ski touring",
      });
      expect((await loadFull()).days.map((day) => day.stop_id)).toEqual([null, smuggs, null, null]);
    });

    it("copies your kit and nobody else's, and each day keeps its note", async () => {
      await addKit("2026-10-09", "user-1", { outfit: OUTFIT, items: ["shell"], note: "Beacon" });
      await addKit("2026-10-10", "user-1", { note: "Lunch at the hut" });
      await addKit("2026-10-10", "user-2", { items: ["gloves"] });
      await addKit("2026-10-09", "user-2", { items: ["helmet"] });
      const before = await kitsByDay();
      await edit("copy_day", await reviewed(copy(["2026-10-10"], true)));
      const after = await kitsByDay();
      expect(after["2026-10-10 user-1"]).toEqual({ ...before["2026-10-09 user-1"], note: "Lunch at the hut" });
      expect(after["2026-10-10 user-2"]).toEqual(before["2026-10-10 user-2"]);
      expect(after["2026-10-09 user-1"]).toEqual(before["2026-10-09 user-1"]);
    });

    it("keeps your kit where you already have one when asked, and replaces it when asked", async () => {
      await addKit("2026-10-09", "user-1", { outfit: OUTFIT });
      await addKit("2026-10-11", "user-1", { items: ["jacket"] });
      const before = await kitsByDay();
      await db.exec("BEGIN");
      await edit("copy_day", await reviewed(copy(["2026-10-11", "2026-10-12"], true), "keep"));
      let after = await kitsByDay();
      expect(after["2026-10-11 user-1"]).toEqual(before["2026-10-11 user-1"]);
      expect(after["2026-10-12 user-1"]).toMatchObject({ outfit: OUTFIT, items: [] });
      await db.exec("ROLLBACK");
      await edit("copy_day", await reviewed(copy(["2026-10-11", "2026-10-12"], true), "replace"));
      after = await kitsByDay();
      expect(after["2026-10-11 user-1"]).toMatchObject({ outfit: OUTFIT, items: [] });
      expect(after["2026-10-12 user-1"]).toMatchObject({ outfit: OUTFIT });
    });

    it("refuses a copy when the day, the days or your kits changed after the review", async () => {
      await addKit("2026-10-09", "user-1", { outfit: OUTFIT });
      await addKit("2026-10-11", "user-1", { items: ["jacket"] });
      const request = copy(["2026-10-11", "2026-10-12"], true);
      for (const change of [
        "UPDATE trip_days SET activity = 'Biking' WHERE date = '2026-10-09'",
        "UPDATE trip_days SET stop_id = NULL WHERE date = '2026-10-12'",
        "DELETE FROM trip_days WHERE date = '2026-10-12'",
        "UPDATE trip_member_day_kits SET items = '[\"shell\"]' WHERE trip_day_id = (SELECT id FROM trip_days WHERE date = '2026-10-11')",
        "UPDATE trip_member_day_kits SET items = '[\"shell\"]' WHERE trip_day_id = (SELECT id FROM trip_days WHERE date = '2026-10-09')",
        `INSERT INTO trip_member_day_kits (trip_day_id, trip_member_id, items) SELECT d.id, m.id, '["pole"]' FROM trip_days d, trip_members m WHERE d.date = '2026-10-12' AND m.user_id = 'user-1'`,
        // The source goes to the base, so a renamed base or a new first stop changes what it copies.
        `UPDATE trip_stops SET name = 'Stowe Mountain Resort, Vermont' WHERE id = '${stowe}'`,
        `UPDATE trip_stops SET position = -1 WHERE id = '${smuggs}'`,
        // A target's stop moved after the review.
        `UPDATE trip_stops SET latitude = 45 WHERE id = '${jay}'`,
      ]) {
        const payload = await reviewed(request, "replace");
        await db.exec("BEGIN");
        try {
          await db.exec(change);
          await expect(edit("copy_day", payload)).rejects.toMatchObject({ code: "40001" });
        } finally {
          await db.exec("ROLLBACK");
        }
      }
      // Without your kit, a change to it doesn't matter.
      const payload = await reviewed(copy(["2026-10-11"]));
      await db.exec("UPDATE trip_member_day_kits SET items = '[\"shell\"]'");
      await edit("copy_day", payload);
      expect((await labels())["2026-10-11"]).toBe("Stowe, Vermont (base) · Ski touring");
    });

    it("reviews and applies a copy between two stops with the same name", async () => {
      const otherStowe = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
      await db.query("INSERT INTO trip_stops (id, trip_id, position, name, latitude, longitude) VALUES ($1, $2, 3, 'Stowe, Vermont', 44.6, -72.8)", [otherStowe, tripId]);
      await db.query("UPDATE trip_days SET stop_id = $1 WHERE date = '2026-10-12'", [otherStowe]);
      await addKit("2026-10-12", "user-2", { items: ["shell"] });
      const preview = previewItinerary(await loadFull(), { action: "copy_day", from: "2026-10-11", dates: ["2026-10-12"], kit: false }, "user-1");
      if ("error" in preview) throw new Error(preview.error);
      expect(preview.options[0].changes).toEqual([expect.objectContaining({
        before: "Stowe, Vermont (stop 4) · No activity", after: "Stowe, Vermont (stop 1) · No activity",
        notes: ["Kept as saved for the old plan: Sam's checklist."],
      })]);
      await edit("copy_day", preview.options[0].payload);
      expect((await loadFull()).days.find((day) => day.date === "2026-10-12")?.stop_id).toBe(stowe);
    });

    it("rejects copying onto the same day, to no days, in an unknown way, or a kit you don't have", async () => {
      const payload = await reviewed(copy(["2026-10-11"]));
      await expect(edit("copy_day", { ...payload, dates: ["2026-10-09", "2026-10-11"] })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("copy_day", { ...payload, dates: [] })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("copy_day", { ...payload, kit: "merge" })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("copy_day", { ...payload, kit: "replace" })).rejects.toMatchObject({ code: "22023" });
      await expect(edit("copy_day", { ...payload, from: "2026-10-13" })).rejects.toMatchObject({ code: "P0002" });
      expect((await labels())["2026-10-11"]).toBe("Stowe, Vermont · No activity");
    });

    it("lets joined members copy, but not someone who left or isn't on the trip", async () => {
      const payload = await reviewed(copy(["2026-10-12"]));
      await expect(edit("copy_day", payload, "user-3")).rejects.toMatchObject({ code: "42501" });
      await expect(edit("copy_day", payload, "user-4")).rejects.toMatchObject({ code: "42501" });
      await edit("copy_day", payload, "user-2");
      expect((await labels())["2026-10-12"]).toBe("Stowe, Vermont (base) · Ski touring");
    });
  });

  it("lets the owner and joined members edit, but not someone who left or isn't on the trip", async () => {
    const assign = async (user: string) => edit("assign_days", { dates: ["2026-10-12"], activity: user, expected: [{ date: "2026-10-12", stop_id: jay, activity: (await loadFull()).days[3].activity }] }, user);
    await expect(assign("user-3")).rejects.toMatchObject({ code: "42501" });
    await expect(assign("user-4")).rejects.toMatchObject({ code: "42501" });
    await assign("user-2");
    await assign("user-1");
    expect((await labels())["2026-10-12"]).toBe("Jay Peak, Vermont · user-1");
  });

  it("is executable only by the service role", async () => {
    const grants = (await db.query<{ role: string; allowed: boolean }>(
      `SELECT r AS role, has_function_privilege(r, 'public.edit_trip_itinerary(uuid, text, text, jsonb)', 'EXECUTE')
          AND has_function_privilege(r, 'public.copy_trip_day(uuid, text, jsonb)', 'EXECUTE') AS allowed,
        has_function_privilege(r, 'public.edit_trip_itinerary(uuid, text, text, jsonb)', 'EXECUTE')
          OR has_function_privilege(r, 'public.copy_trip_day(uuid, text, jsonb)', 'EXECUTE') AS any
        FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r`
    )).rows;
    expect(grants).toEqual([{ role: "anon", allowed: false, any: false }, { role: "authenticated", allowed: false, any: false }, { role: "service_role", allowed: true, any: true }]);
  });

  describe("applies exactly what the review previewed", () => {
    const check = async (request: TripItineraryRequest) => {
      const full = await loadFull();
      const before = dayLabels(full);
      const kitsBefore = await kitsByDay();
      const preview = previewItinerary(full, request, "user-1");
      if ("error" in preview) throw new Error(preview.error);
      expect(preview.options.length).toBeGreaterThan(0);
      for (const option of preview.options) {
        await db.exec("BEGIN");
        try {
          await edit(request.action, option.payload);
          const after = dayLabels(await loadFull());
          const changed = new Map(option.changes.map((change) => [change.date, change.after]));
          for (const [date, label] of after) expect([option.key, date, label]).toEqual([option.key, date, changed.get(date) ?? before.get(date)]);
          expect(option.unchanged).toBe(after.size - option.changes.length);
          // Only the days whose review says they get your kit do, with each day's note kept.
          const copiedTo = option.changes.filter((change) => change.notes?.some((note) => /^(Gets your|Your kit here is replaced)/.test(note))).map((change) => change.date);
          const source = request.action === "copy_day" ? kitsBefore[`${request.from} user-1`] : undefined;
          const kitsAfter = await kitsByDay();
          for (const key of new Set([...Object.keys(kitsBefore), ...Object.keys(kitsAfter)])) {
            const [date, user] = key.split(" ");
            const expected = user === "user-1" && copiedTo.includes(date) ? { ...source, note: kitsBefore[key]?.note ?? null } : kitsBefore[key];
            expect([option.key, key, kitsAfter[key]]).toEqual([option.key, key, expected]);
          }
        } finally {
          await db.exec("ROLLBACK");
        }
      }
    };

    it.each<TripItineraryRequest>([
      { action: "remove_stop", stop_id: stowe },
      { action: "remove_stop", stop_id: smuggs },
      { action: "reorder_stops", order: [jay, smuggs, stowe] },
      { action: "reorder_stops", order: [stowe, jay, smuggs] },
      { action: "assign_days", dates: ["2026-10-09", "2026-10-12"], stop_id: smuggs, activity: null },
      { action: "assign_days", dates: ["2026-10-10"], activity: "Ski touring" },
      { action: "set_day_place", date: "2026-10-09", place: BURLINGTON },
      { action: "set_day_place", date: "2026-10-10", place: BURLINGTON },
      { action: "set_day_place", date: "2026-10-10", place: JAY_PLACE },
      { action: "set_day_place", date: "2026-10-11", place: JAY_PLACE },
      { action: "set_day_place", date: "2026-10-12", place: JAY_PLACE },
    ])("$action %#", check);

    it("for copies with and without your kit, onto days with and without kits", async () => {
      await addKit("2026-10-09", "user-1", { outfit: OUTFIT, items: ["shell"], note: "Beacon" });
      await addKit("2026-10-10", "user-1", { items: ["jacket"], note: "Lunch" });
      await addKit("2026-10-11", "user-1", { note: "Early start" });
      await addKit("2026-10-11", "user-2", { outfit: OUTFIT });
      await check({ action: "copy_day", from: "2026-10-09", dates: ["2026-10-10", "2026-10-11", "2026-10-12"], kit: true });
      await check({ action: "copy_day", from: "2026-10-09", dates: ["2026-10-11", "2026-10-12"], kit: true });
      await check({ action: "copy_day", from: "2026-10-10", dates: ["2026-10-09", "2026-10-11"], kit: false });
      await check({ action: "copy_day", from: "2026-10-11", dates: ["2026-10-12"], kit: false });
    });

    it("for the last stop, a stop no day uses, and a trip without stops", async () => {
      await db.query("UPDATE trip_days SET stop_id = $1 WHERE stop_id = $2", [stowe, smuggs]);
      await check({ action: "remove_stop", stop_id: smuggs });
      await db.query("DELETE FROM trip_stops WHERE id IN ($1, $2)", [smuggs, jay]);
      await check({ action: "remove_stop", stop_id: stowe });
      await db.query("UPDATE trip_days SET stop_id = NULL");
      await db.query("DELETE FROM trip_stops");
      await check({ action: "set_day_place", date: "2026-10-11", place: BURLINGTON });
    });
  });
});
