// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dayLabels, previewItinerary } from "@/lib/trip-itinerary";
import type { Trip, TripDay, TripFull, TripItineraryRequest, TripStop } from "@/types/trips";

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

const edit = async (action: string, payload: unknown, user = "user-1") =>
  (await db.query<{ result: unknown }>("SELECT public.edit_trip_itinerary($1, $2, $3, $4::jsonb) AS result", [tripId, user, action, JSON.stringify(payload)])).rows[0].result;
const loadFull = async (): Promise<TripFull> => {
  const rows = async <T,>(sql: string) => (await db.query<T>(sql, [tripId])).rows;
  return {
    trip: (await rows<Trip>("SELECT id, owner_user_id, name, start_date::text, end_date::text, status FROM trips WHERE id = $1"))[0],
    stops: await rows<TripStop>("SELECT id, position, name, latitude::float8 AS latitude, longitude::float8 AS longitude FROM trip_stops WHERE trip_id = $1 ORDER BY position"),
    days: await rows<TripDay>("SELECT id, date::text, stop_id, activity FROM trip_days WHERE trip_id = $1 ORDER BY date"),
    members: [], kits: [], gear: [],
  };
};
const labels = async () => Object.fromEntries(dayLabels(await loadFull()));
/** Each day's stop after following NULL to the base, which must survive reordering. */
const effectiveStops = async () => {
  const { stops, days } = await loadFull();
  return Object.fromEntries(days.map((day) => [day.date, day.stop_id ?? stops[0]?.id ?? null]));
};
const stopNames = async () => (await loadFull()).stops.map((stop) => stop.name);

describe("Itinerary edits in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    await db.exec(await readFile("supabase/migrations/012_trips.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/022_trip_itinerary_edits.sql", "utf8"));
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
      "SELECT r AS role, has_function_privilege(r, 'public.edit_trip_itinerary(uuid, text, text, jsonb)', 'EXECUTE') AS allowed FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r"
    )).rows;
    expect(grants).toEqual([{ role: "anon", allowed: false }, { role: "authenticated", allowed: false }, { role: "service_role", allowed: true }]);
  });

  describe("applies exactly what the review previewed", () => {
    const check = async (request: TripItineraryRequest) => {
      const full = await loadFull();
      const before = dayLabels(full);
      const preview = previewItinerary(full, request);
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
