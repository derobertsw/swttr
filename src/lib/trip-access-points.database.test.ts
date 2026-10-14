// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseAccessPointEdit, previewAccessPoint } from "@/lib/trip-access-points";
import { previewItinerary } from "@/lib/trip-itinerary";
import { accessPointFor } from "@/lib/trip-location";
import type { Trip, TripDay, TripFull, TripItineraryOption, TripItineraryRequest, TripLocation, TripMember, TripStop } from "@/types/trips";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const stowe = "5b7f1f7e-3c52-4c39-9d0e-0a3c1f0b6a11";
const smuggs = "8c2d6a90-1b4e-4f7a-a0c1-6d5e2b9f3c22";
const jay = "2e4b8f1a-7c3d-4e5f-9a6b-1c2d3e4f5a66";
const place = (label: string, latitude: number, longitude: number, address = `${label}, Vermont`): TripLocation => ({
  label, address, latitude, longitude, precision: "exact", time_zone: "America/New_York",
  source: "search", provider: "geoapify", provider_id: `place-${latitude}`, attribution: "© OpenStreetMap contributors",
});
const MOUNTAIN_RD = place("Mountain Road lot", 44.528, -72.7853);
const SPRUCE = place("Spruce Peak lot", 44.5307, -72.7829);
const TRAM = place("Tram lot", 44.9367, -72.5048);
let db: PGlite;

const loadFull = async (): Promise<TripFull> => {
  const rows = async <T,>(sql: string) => (await db.query<T>(sql, [tripId])).rows;
  return {
    trip: (await rows<Trip>("SELECT id, owner_user_id, name, start_date::text, end_date::text, status FROM trips WHERE id = $1"))[0],
    stops: await rows<TripStop>("SELECT id, position, name, latitude::float8 AS latitude, longitude::float8 AS longitude, access_point FROM trip_stops WHERE trip_id = $1 ORDER BY position"),
    days: await rows<TripDay>("SELECT id, date::text, stop_id, activity, access_point, access_point_stop_id FROM trip_days WHERE trip_id = $1 ORDER BY date"),
    members: await rows<TripMember>("SELECT id, trip_id, user_id, display_name, role, status FROM trip_members WHERE trip_id = $1"),
    kits: [],
    gear: [],
  };
};
/** Each day's access point, "(day)" for the day's own. */
const points = async () => {
  const full = await loadFull();
  return Object.fromEntries(full.days.map((day) => {
    const point = accessPointFor(full.stops, day);
    return [day.date, point ? `${point.location.label}${point.scope === "day" ? " (day)" : ""}` : null];
  }));
};
const run = async (payload: unknown, user = "user-1") =>
  (await db.query<{ result: unknown }>("SELECT public.set_trip_access_point($1, $2, $3::jsonb) AS result", [tripId, user, JSON.stringify(payload)])).rows[0].result;
const review = async (date: string, location: TripLocation | null) => {
  const preview = previewAccessPoint(await loadFull(), { action: "set_access_point", date, location });
  if ("error" in preview) throw new Error(preview.error);
  return preview.options;
};
/** The option's payload as the route rebuilds it from the request. */
const edit = (option: TripItineraryOption) => {
  const parsed = parseAccessPointEdit(JSON.parse(JSON.stringify({ action: "set_access_point", ...option.payload })));
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
};
/** Saves a reviewed option and checks that exactly the days its review lists changed. */
const save = async (date: string, location: TripLocation | null, key?: string) => {
  const options = await review(date, location);
  const option = key ? options.find((candidate) => candidate.key === key)! : options[0];
  const before = await points();
  await run(edit(option));
  const after = await points();
  expect(Object.keys(after).filter((day) => after[day] !== before[day])).toEqual(option.changes.map((change) => change.date));
  return option;
};
const stopPoint = async (id: string) => (await db.query<{ access_point: unknown }>("SELECT access_point FROM trip_stops WHERE id = $1", [id])).rows[0].access_point;
const ownPoints = async () => (await db.query<{ date: string; access_point_stop_id: string | null }>(
  "SELECT date::text, access_point_stop_id FROM trip_days WHERE trip_id = $1 AND access_point IS NOT NULL ORDER BY date", [tripId])).rows;
const itinerary = async (request: TripItineraryRequest) => {
  const preview = previewItinerary(await loadFull(), request, "user-1");
  if ("error" in preview) throw new Error(preview.error);
  return preview.options;
};
const editItinerary = (action: string, payload: unknown) =>
  db.query("SELECT public.edit_trip_itinerary($1, 'user-1', $2, $3::jsonb)", [tripId, action, JSON.stringify(payload)]);

describe("Access points in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    for (const migration of ["012_trips", "016_atomic_trip_creation", "017_trip_stays", "018_trip_saved_kits", "022_trip_itinerary_edits", "023_trip_copy_day", "025_trip_stay_locations", "027_trip_access_points"]) {
      await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
    }
  }, 20_000);

  // Friday–Monday at Stowe (the base), Smuggs and Jay Peak. Friday has no stop
  // of its own, so it goes to Stowe with Sunday.
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-1', 'Weekend', '2026-10-09', '2026-10-12')", [tripId]);
    await db.query(`INSERT INTO trip_stops (id, trip_id, position, name, latitude, longitude) VALUES
      ($1, $4, 0, 'Stowe, Vermont', 44.4654, -72.6874), ($2, $4, 1, 'Smuggs, Vermont', 44.5884, -72.7834), ($3, $4, 2, 'Jay Peak, Vermont', 44.9379, -72.5045)`, [stowe, smuggs, jay, tripId]);
    await db.query(`INSERT INTO trip_days (trip_id, date, stop_id, activity) VALUES
      ($1, '2026-10-09', NULL, 'Backcountry'), ($1, '2026-10-10', $2, 'Hiking'), ($1, '2026-10-11', $3, NULL), ($1, '2026-10-12', $4, NULL)`, [tripId, smuggs, stowe, jay]);
    await db.query("INSERT INTO trip_members (trip_id, user_id, display_name, role, status) VALUES ($1, 'user-1', 'You', 'organizer', 'joined'), ($1, 'user-2', 'Sam', 'member', 'joined')", [tripId]);
  });
  afterAll(async () => { await db?.close(); });

  it("gives every day at a stop its point, the base's inherited days too, and leaves the weather location alone", async () => {
    const options = await review("2026-10-11", MOUNTAIN_RD);
    expect(options.map(({ key, label, detail }) => ({ key, label, detail }))).toEqual([
      { key: "day", label: "Only Sun Oct 11", detail: "Fri Oct 9 at Stowe, Vermont doesn't change." },
      { key: "stop", label: "All days at Stowe, Vermont (2 days)", detail: "Fri Oct 9 and Sun Oct 11." },
    ]);
    const option = await save("2026-10-11", MOUNTAIN_RD, "stop");
    expect(option.changes).toEqual([
      { date: "2026-10-09", date_label: "Fri Oct 9", before: "Not set", after: "Mountain Road lot" },
      { date: "2026-10-11", date_label: "Sun Oct 11", before: "Not set", after: "Mountain Road lot" },
    ]);
    expect(await points()).toEqual({ "2026-10-09": "Mountain Road lot", "2026-10-10": null, "2026-10-11": "Mountain Road lot", "2026-10-12": null });
    expect(await stopPoint(stowe)).toEqual(MOUNTAIN_RD);
    expect((await loadFull()).stops[0]).toMatchObject({ latitude: 44.4654, longitude: -72.6874 });
  });

  it("gives only this day its own point, and the stop's other days keep theirs", async () => {
    await save("2026-10-11", MOUNTAIN_RD, "stop");
    const option = await save("2026-10-09", SPRUCE, "day");
    expect(option.changes).toEqual([{ date: "2026-10-09", date_label: "Fri Oct 9", before: "Mountain Road lot", after: "Spruce Peak lot · this day only" }]);
    expect(option.unchanged).toBe(1);
    expect(await points()).toMatchObject({ "2026-10-09": "Spruce Peak lot (day)", "2026-10-11": "Mountain Road lot" });
    expect(await ownPoints()).toEqual([{ date: "2026-10-09", access_point_stop_id: stowe }]);
  });

  it("replaces the days' own points when it's for every day at the stop", async () => {
    await save("2026-10-11", MOUNTAIN_RD, "stop");
    await save("2026-10-09", SPRUCE, "day");
    const option = await save("2026-10-11", SPRUCE, "stop");
    expect(option.changes.map(({ before, after }) => `${before} → ${after}`)).toEqual([
      "Spruce Peak lot · this day only → Spruce Peak lot",
      "Mountain Road lot → Spruce Peak lot",
    ]);
    expect(await ownPoints()).toEqual([]);
  });

  it("removes a day's own point so it uses the stop's again, then the stop's from every day", async () => {
    await save("2026-10-11", MOUNTAIN_RD, "stop");
    await save("2026-10-09", SPRUCE, "day");
    const options = await review("2026-10-09", null);
    expect(options.map(({ key, detail }) => `${key}: ${detail}`)).toEqual([
      "day: It uses Stowe, Vermont's access point, Mountain Road lot, again.",
      "stop: Fri Oct 9 and Sun Oct 11 will have no access point.",
    ]);
    await save("2026-10-09", null, "day");
    expect(await points()).toMatchObject({ "2026-10-09": "Mountain Road lot", "2026-10-11": "Mountain Road lot" });
    // Without a point of its own, a day can only lose the stop's with the rest.
    expect((await review("2026-10-09", null)).map((option) => option.key)).toEqual(["stop"]);
    await save("2026-10-09", null);
    expect(Object.values(await points())).toEqual([null, null, null, null]);
    expect(await stopPoint(stowe)).toBeNull();
  });

  it("saves the point with the stop when the day is the only one there", async () => {
    const options = await review("2026-10-10", TRAM);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ label: "Only Sat Oct 10", detail: "It's the only day at Smuggs, Vermont, so days added there later get it too.", payload: { scope: "stop" } });
    await save("2026-10-10", TRAM);
    expect(await stopPoint(smuggs)).toEqual(TRAM);
    expect(await ownPoints()).toEqual([]);
  });

  it("tells apart two places with one name", async () => {
    await save("2026-10-11", place("Corey Road", 42.5521, -73.2541, "Corey Road, Hancock"), "stop");
    const [, everyDay] = await review("2026-10-11", place("Corey Road", 42.5534, -73.2512, "Corey Road, Hancock"));
    expect(everyDay.changes[0]).toMatchObject({ before: "Corey Road (42.5521, -73.2541)", after: "Corey Road (42.5534, -73.2512)" });
  });

  it("refuses a review the trip no longer matches, and changes nothing", async () => {
    await save("2026-10-11", MOUNTAIN_RD, "stop");
    const stale = [
      // The stop's point changed.
      ["UPDATE trip_stops SET access_point = $2::jsonb WHERE id = $1", [stowe, JSON.stringify(TRAM)]],
      // Another day joined the stop.
      ["UPDATE trip_days SET stop_id = $1 WHERE date = $2", [stowe, "2026-10-12"]],
      // A day at the stop got its own point.
      ["UPDATE trip_days SET access_point = $2::jsonb, access_point_stop_id = $1 WHERE date = '2026-10-09'", [stowe, JSON.stringify(TRAM)]],
      // The day moved to another stop.
      ["UPDATE trip_days SET stop_id = $1 WHERE date = $2", [jay, "2026-10-11"]],
    ] as const;
    for (const [sql, params] of stale) {
      const payload = edit((await review("2026-10-11", SPRUCE))[1]);
      await db.exec("BEGIN");
      await db.query(sql, [...params]);
      await expect(run(payload)).rejects.toMatchObject({ code: "40001" });
      await db.exec("ROLLBACK");
    }
    // A stale review fails inside its own transaction; outside one, nothing changed either.
    const payload = edit((await review("2026-10-11", SPRUCE))[1]);
    await db.query(stale[0][0], [...stale[0][1]]);
    await expect(run(payload)).rejects.toMatchObject({ code: "40001" });
    expect(await stopPoint(stowe)).toEqual(TRAM);
  });

  it("is the organizer's to change", async () => {
    const payload = edit((await review("2026-10-11", MOUNTAIN_RD))[1]);
    await expect(run(payload, "user-2")).rejects.toMatchObject({ code: "42501" });
    await expect(run(payload, "someone-else")).rejects.toMatchObject({ code: "42501" });
    expect(await stopPoint(stowe)).toBeNull();
  });

  it("refuses places the trip can't store and days with no destination", async () => {
    const payload = edit((await review("2026-10-11", MOUNTAIN_RD))[1]);
    await expect(run({ ...payload, location: { ...MOUNTAIN_RD, latitude: 0, longitude: 0 } })).rejects.toMatchObject({ code: "22023" });
    await expect(run({ ...payload, scope: "trip" })).rejects.toMatchObject({ code: "22023" });
    await expect(run({ ...payload, date: "2026-10-20" })).rejects.toMatchObject({ code: "P0002" });
    await expect(db.query("UPDATE trip_stops SET access_point = '{\"label\": \"Lot\"}' WHERE id = $1", [stowe])).rejects.toMatchObject({ code: "23514" });
    await expect(db.query("UPDATE trip_days SET access_point = $1::jsonb WHERE date = '2026-10-09'", [JSON.stringify(SPRUCE)])).rejects.toMatchObject({ code: "23514" });
    await db.query("DELETE FROM trip_stops WHERE trip_id = $1", [tripId]);
    expect(previewAccessPoint(await loadFull(), { action: "set_access_point", date: "2026-10-11", location: MOUNTAIN_RD })).toEqual({ error: "Choose this day's destination first.", status: 400 });
    await expect(run(payload)).rejects.toMatchObject({ code: "40001" });
  });

  describe("with itinerary edits", () => {
    beforeEach(async () => {
      await save("2026-10-11", MOUNTAIN_RD, "stop");
      await save("2026-10-09", SPRUCE, "day");
      await save("2026-10-12", TRAM);
    });

    it("drops a day's own point when the day moves to another stop, and the review says so", async () => {
      const [option] = await itinerary({ action: "assign_days", dates: ["2026-10-09"], stop_id: jay });
      expect(option.changes[0].notes).toEqual(["Access point: Spruce Peak lot → Tram lot."]);
      await editItinerary("assign_days", option.payload);
      expect(await points()).toMatchObject({ "2026-10-09": "Tram lot" });
      // It's for Stowe, so it applies again if the day goes back there.
      await editItinerary("assign_days", (await itinerary({ action: "assign_days", dates: ["2026-10-09"], stop_id: stowe }))[0].payload);
      expect(await points()).toMatchObject({ "2026-10-09": "Spruce Peak lot (day)" });
    });

    it("keeps the base's days' points when another stop becomes the base", async () => {
      const [option] = await itinerary({ action: "reorder_stops", order: [jay, stowe, smuggs] });
      await editItinerary("reorder_stops", option.payload);
      expect(await points()).toEqual({ "2026-10-09": "Spruce Peak lot (day)", "2026-10-10": null, "2026-10-11": "Mountain Road lot", "2026-10-12": "Tram lot" });
    });

    it("keeps a stop's point when the stop moves, and asks to check it", async () => {
      const options = await itinerary({ action: "set_day_place", date: "2026-10-11", place: { name: "Burlington, Vermont", latitude: 44.4759, longitude: -73.2121 } });
      const everyDay = options.find((option) => option.key === "stop")!;
      expect(everyDay.changes.find((change) => change.date === "2026-10-11")?.notes).toEqual(["Access point stays Mountain Road lot. Check it's right for Burlington, Vermont."]);
      const onlyThisDay = options.find((option) => option.key === "day")!;
      expect(onlyThisDay.changes[0].notes).toEqual(["Access point: Mountain Road lot → Not set."]);
    });
  });

  it("only service_role may run it", async () => {
    const grants = (await db.query<{ role: string; allowed: boolean }>(
      "SELECT r AS role, has_function_privilege(r, 'public.set_trip_access_point(uuid, text, jsonb)', 'EXECUTE') AS allowed FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r",
    )).rows;
    expect(grants).toEqual([{ role: "anon", allowed: false }, { role: "authenticated", allowed: false }, { role: "service_role", allowed: true }]);
  });
});
