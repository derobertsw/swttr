// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TripLocation } from "@/types/trips";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const otherTrip = "0c3f5b8e-2d4a-4e6f-8a1b-9c7d5e3f1a22";
const motel = "40f9f55e-0e74-4c4a-923f-d7a3f92468a0";
const inn = "7a1e2b3c-4d5e-4f60-8172-93a4b5c6d7e8";
const elsewhere = "1b2c3d4e-5f60-4718-892a-3b4c5d6e7f80";
const place = (label: string, latitude: number, longitude: number): TripLocation => ({
  label, address: `${label}, Vermont`, latitude, longitude, precision: "exact", time_zone: "America/New_York",
  source: "search", provider: "geoapify", provider_id: `place-${latitude}`, attribution: "© OpenStreetMap contributors",
});
const MOTEL = place("Stowe Motel & Snowdrift", 44.4875, -72.7262);
const CABIN = place("Ridge cabin", 44.51, -72.75);
const NONE = { origin: null, origin_stay_id: null, no_drive: false };
let db: PGlite;

type Day = { date: string; origin: TripLocation | null; origin_stay_id: string | null; no_drive: boolean };
const day = async (date: string) => (await db.query<Day>(
  "SELECT date::text, origin, origin_stay_id, no_drive FROM trip_days WHERE trip_id = $1 AND date = $2", [tripId, date])).rows[0];
/** The day as an editor shows it: what the save expects to find. */
const seen = async (date: string) => {
  const { origin, origin_stay_id, no_drive } = await day(date);
  return { origin, origin_stay_id, no_drive };
};
const setOrigin = async (payload: Record<string, unknown>, user = "user-1") =>
  (await db.query<{ result: unknown }>("SELECT public.set_trip_day_origin($1, $2, $3::jsonb) AS result", [tripId, user, JSON.stringify(payload)])).rows[0].result;

type Manual = { date: string; pair_key: string; duration_seconds: number; note: string | null; use_calculated: boolean; entered_at: string };
const manual = async () => (await db.query<Manual>(
  `SELECT d.date::text, m.pair_key, m.duration_seconds, m.note, m.use_calculated, to_jsonb(m.entered_at) #>> '{}' AS entered_at
   FROM trip_drive_manual_estimates m JOIN trip_days d ON d.id = m.trip_day_id WHERE m.trip_id = $1 ORDER BY d.date`, [tripId])).rows;
/** What an editor showed for each day: its estimate's entered time and choice, or nulls. */
const expected = async (dates: string[]) => {
  const rows = await manual();
  return dates.map((date) => {
    const row = rows.find((candidate) => candidate.date === date);
    return { date, entered_at: row?.entered_at ?? null, use_calculated: row?.use_calculated ?? null };
  });
};
const estimate = (minutes: number, pair = "drive|44.4875,-72.7262>44.53,-72.7816", note: string | null = "Resort directions page") =>
  ({ pair_key: pair, origin_label: "Stowe Motel", destination_label: "Spruce Peak lot", duration_seconds: minutes * 60, note });
const setEstimate = async (action: string, payload: Record<string, unknown>, user = "user-1") =>
  (await db.query<{ result: unknown }>("SELECT public.set_trip_drive_estimate($1, $2, $3, $4::jsonb) AS result",
    [tripId, user, action, JSON.stringify(payload)])).rows[0].result;

describe("Starting points and your own estimates in Postgres (029)", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    for (const migration of ["012_trips", "017_trip_stays", "021_trip_date_changes", "025_trip_stay_locations", "026_trip_tour_plans", "028_trip_drive_estimates", "029_trip_drive_starting_points"]) {
      await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
    }
  }, 20_000);

  // Fri–Mon in Vermont. Stowe Motel has a place; Village Inn doesn't yet.
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query(`INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES
      ($1, 'user-1', 'Vermont', '2027-01-08', '2027-01-11'), ($2, 'user-1', 'Elsewhere', '2027-01-08', '2027-01-11')`, [tripId, otherTrip]);
    await db.query(`INSERT INTO trip_days (trip_id, date) VALUES ($1, '2027-01-08'), ($1, '2027-01-09'), ($1, '2027-01-10'), ($1, '2027-01-11'),
      ($2, '2027-01-09')`, [tripId, otherTrip]);
    await db.query(`INSERT INTO trip_stays (id, trip_id, name, check_in, check_out, location) VALUES
      ($1, $4, 'Stowe Motel', '2027-01-08', '2027-01-10', $5::jsonb), ($2, $4, 'Village Inn', '2027-01-10', '2027-01-11', NULL),
      ($3, $6, 'Other trip''s lodge', '2027-01-08', '2027-01-10', $5::jsonb)`, [motel, inn, elsewhere, tripId, JSON.stringify(MOTEL), otherTrip]);
  });
  afterAll(async () => { await db?.close(); });

  describe("A day's starting point", () => {
    it("starts from a saved stay under the stay's name, then uses the crew stay again", async () => {
      await setOrigin({ date: "2027-01-08", origin: { stay_id: motel }, no_drive: false, expected: NONE });
      expect(await day("2027-01-08")).toEqual({ date: "2027-01-08", origin: { ...MOTEL, label: "Stowe Motel" }, origin_stay_id: motel, no_drive: false });
      await setOrigin({ date: "2027-01-08", origin: null, no_drive: false, expected: await seen("2027-01-08") });
      expect(await seen("2027-01-08")).toEqual(NONE);
    });
    it("starts from any place, and No drive planned keeps the starting point", async () => {
      await setOrigin({ date: "2027-01-09", origin: { location: CABIN }, no_drive: true, expected: NONE });
      expect(await seen("2027-01-09")).toEqual({ origin: CABIN, origin_stay_id: null, no_drive: true });
      // No drive planned with the crew stay: nothing of the day's own.
      await setOrigin({ date: "2027-01-10", origin: null, no_drive: true, expected: NONE });
      expect(await seen("2027-01-10")).toEqual({ ...NONE, no_drive: true });
    });
    it("keeps the place, as the day's own, when its stay is removed", async () => {
      await setOrigin({ date: "2027-01-08", origin: { stay_id: motel }, no_drive: false, expected: NONE });
      await db.query("DELETE FROM trip_stays WHERE id = $1", [motel]);
      expect(await seen("2027-01-08")).toEqual({ origin: { ...MOTEL, label: "Stowe Motel" }, origin_stay_id: null, no_drive: false });
    });
    it("keeps up with its stay's name and place, so removing the stay keeps the place the day was using", async () => {
      await setOrigin({ date: "2027-01-08", origin: { stay_id: motel }, no_drive: false, expected: NONE });
      const corrected = { ...MOTEL, latitude: 44.4881, longitude: -72.7255 };
      // Saved as mutate_trip_lodging (025) saves a stay: an upsert on its id.
      await db.query(`INSERT INTO trip_stays AS stay (id, trip_id, name, check_in, check_out, location)
        VALUES ($1, $2, 'Stowe Motel & Snowdrift', '2027-01-08', '2027-01-10', $3::jsonb)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location`, [motel, tripId, JSON.stringify(corrected)]);
      expect((await seen("2027-01-08")).origin).toEqual({ ...corrected, label: "Stowe Motel & Snowdrift" });
      // A stay whose place is removed leaves the day its last place, under the new name.
      await db.query("UPDATE trip_stays SET name = 'Snowdrift', location = NULL WHERE id = $1", [motel]);
      expect((await seen("2027-01-08")).origin).toEqual({ ...corrected, label: "Snowdrift" });
      await db.query("DELETE FROM trip_stays WHERE id = $1", [motel]);
      expect(await seen("2027-01-08")).toEqual({ origin: { ...corrected, label: "Snowdrift" }, origin_stay_id: null, no_drive: false });
      // Other days and other stays' days are untouched.
      expect(await seen("2027-01-09")).toEqual(NONE);
    });
    it("refuses an editor the day or the stay no longer matches, and changes nothing", async () => {
      await setOrigin({ date: "2027-01-09", origin: { location: CABIN }, no_drive: false, expected: NONE });
      const before = await seen("2027-01-09");
      for (const stale of [NONE, { ...before, no_drive: true }, { ...before, origin: { ...CABIN, label: "Ridge hut" } }]) {
        await expect(setOrigin({ date: "2027-01-09", origin: null, no_drive: false, expected: stale })).rejects.toMatchObject({ code: "40001" });
      }
      // A stay without a place, or another trip's, isn't one the editor offered.
      for (const stay of [inn, elsewhere]) {
        await expect(setOrigin({ date: "2027-01-09", origin: { stay_id: stay }, no_drive: false, expected: before })).rejects.toMatchObject({ code: "40001" });
      }
      expect(await seen("2027-01-09")).toEqual(before);
    });
    it("is the organizer's to change", async () => {
      await expect(setOrigin({ date: "2027-01-09", origin: { location: CABIN }, no_drive: false, expected: NONE }, "user-2")).rejects.toMatchObject({ code: "42501" });
      expect(await seen("2027-01-09")).toEqual(NONE);
    });
    it.each([
      ["a place the trip can't store", { origin: { location: { ...CABIN, latitude: 0, longitude: 0 } } }, "22023"],
      ["neither a stay nor a place", { origin: { label: "Ridge cabin" } }, "22023"],
      ["text for an origin", { origin: "Ridge cabin" }, "22023"],
      ["no No drive choice", { no_drive: undefined }, "22023"],
      ["a date the trip doesn't have", { date: "2027-01-12" }, "P0002"],
    ])("refuses %s", async (_, change, code) => {
      await expect(setOrigin({ date: "2027-01-09", origin: null, no_drive: false, expected: NONE, ...change })).rejects.toMatchObject({ code });
    });
  });

  describe("Your estimate", () => {
    it("saves it on the chosen days with one entered time, then edits and unticks a day", async () => {
      await setEstimate("save", { estimate: estimate(40), dates: ["2027-01-09", "2027-01-10"], expected: await expected(["2027-01-09", "2027-01-10"]) });
      const saved = await manual();
      expect(saved.map(({ date, duration_seconds, note, use_calculated }) => ({ date, duration_seconds, note, use_calculated }))).toEqual([
        { date: "2027-01-09", duration_seconds: 2400, note: "Resort directions page", use_calculated: false },
        { date: "2027-01-10", duration_seconds: 2400, note: "Resort directions page", use_calculated: false },
      ]);
      expect(saved[0].entered_at).toBe(saved[1].entered_at);
      await setEstimate("save", { estimate: estimate(35, undefined, "  "), dates: ["2027-01-09"], clear: ["2027-01-10"], expected: await expected(["2027-01-09", "2027-01-10"]) });
      expect(await manual()).toEqual([expect.objectContaining({ date: "2027-01-09", duration_seconds: 2100, note: null })]);
      expect((await manual())[0].entered_at).not.toBe(saved[0].entered_at);
    });
    it("keeps both when the calculated estimate is chosen, until the drive is another pair", async () => {
      await setEstimate("save", { estimate: estimate(40), dates: ["2027-01-09"], expected: await expected(["2027-01-09"]) });
      await setEstimate("prefer", { dates: ["2027-01-09"], use_calculated: true, expected: await expected(["2027-01-09"]) });
      expect(await manual()).toEqual([expect.objectContaining({ duration_seconds: 2400, use_calculated: true })]);
      await setEstimate("save", { estimate: estimate(45), dates: ["2027-01-09"], expected: await expected(["2027-01-09"]) });
      expect(await manual()).toEqual([expect.objectContaining({ duration_seconds: 2700, use_calculated: true })]);
      await setEstimate("save", { estimate: estimate(45, "drive|44.51,-72.75>44.53,-72.7816"), dates: ["2027-01-09"], expected: await expected(["2027-01-09"]) });
      expect(await manual()).toEqual([expect.objectContaining({ pair_key: "drive|44.51,-72.75>44.53,-72.7816", use_calculated: false })]);
      await setEstimate("remove", { dates: ["2027-01-09"], expected: await expected(["2027-01-09"]) });
      expect(await manual()).toEqual([]);
    });
    it("refuses a review the days no longer match, and changes nothing", async () => {
      await setEstimate("save", { estimate: estimate(40), dates: ["2027-01-09"], expected: await expected(["2027-01-09"]) });
      const before = await manual();
      const stale = [
        [{ date: "2027-01-09", entered_at: null, use_calculated: null }],
        [{ date: "2027-01-09", entered_at: "2027-01-01T00:00:00+00:00", use_calculated: false }],
        [{ date: "2027-01-09", entered_at: before[0].entered_at, use_calculated: true }],
        [...await expected(["2027-01-09"]), { date: "2027-01-12", entered_at: null, use_calculated: null }],
      ];
      for (const review of stale) {
        await expect(setEstimate("remove", { dates: ["2027-01-09"], expected: review })).rejects.toMatchObject({ code: "40001" });
      }
      await expect(setEstimate("save", { estimate: estimate(50), dates: ["2027-01-10"], expected: [{ date: "2027-01-10", entered_at: before[0].entered_at, use_calculated: false }] }))
        .rejects.toMatchObject({ code: "40001" });
      expect(await manual()).toEqual(before);
    });
    it("is the organizer's to change", async () => {
      await expect(setEstimate("save", { estimate: estimate(40), dates: ["2027-01-09"], expected: await expected(["2027-01-09"]) }, "user-2"))
        .rejects.toMatchObject({ code: "42501" });
    });
    it.each([
      ["no time", "save", { estimate: estimate(0) }, "23514"],
      ["more than a day", "save", { estimate: estimate(1441) }, "23514"],
      ["a day it doesn't review", "save", { estimate: estimate(40), dates: ["2027-01-09", "2027-01-10"] }, "22023"],
      ["a day both written and unticked", "save", { estimate: estimate(40), clear: ["2027-01-09"] }, "22023"],
      ["no days", "remove", { dates: [] }, "22023"],
      ["choosing on a day without one", "prefer", { use_calculated: true }, "22023"],
      ["an unknown action", "replace", {}, "22023"],
    ])("refuses %s", async (_, action, change, code) => {
      await expect(setEstimate(action, { dates: ["2027-01-09"], expected: await expected(["2027-01-09"]), ...change })).rejects.toMatchObject({ code });
      expect(await manual()).toEqual([]);
    });
    it("goes with its day and its trip", async () => {
      await setEstimate("save", { estimate: estimate(40), dates: ["2027-01-09", "2027-01-10"], expected: await expected(["2027-01-09", "2027-01-10"]) });
      await db.query("DELETE FROM trip_days WHERE trip_id = $1 AND date = '2027-01-10'", [tripId]);
      expect((await manual()).map((row) => row.date)).toEqual(["2027-01-09"]);
      await db.query("DELETE FROM trips WHERE id = $1", [tripId]);
      expect((await db.query("SELECT count(*)::int AS n FROM trip_drive_manual_estimates")).rows).toEqual([{ n: 0 }]);
    });
  });

  it("moves the day's starting point, No drive planned and your estimate with it when the trip's dates move", async () => {
    await setOrigin({ date: "2027-01-09", origin: { location: CABIN }, no_drive: true, expected: NONE });
    await setEstimate("save", { estimate: estimate(40), dates: ["2027-01-10"], expected: await expected(["2027-01-10"]) });
    const { rows: [{ revision }] } = await db.query<{ revision: number }>("SELECT lodging_revision AS revision FROM trips WHERE id = $1", [tripId]);
    await db.query("SELECT public.change_trip_dates($1, 'user-1', '2027-01-08', '2027-01-11', '2027-01-15', '2027-01-18', 'move', 'planning', NULL, $2, '[]'::jsonb)", [tripId, revision]);
    expect(await seen("2027-01-16")).toEqual({ origin: CABIN, origin_stay_id: null, no_drive: true });
    expect(await seen("2027-01-15")).toEqual(NONE);
    expect((await manual()).map(({ date, duration_seconds }) => ({ date, duration_seconds }))).toEqual([{ date: "2027-01-17", duration_seconds: 2400 }]);
  });

  it("is reachable only by the server's service role", async () => {
    const { rows } = await db.query(`SELECT r AS role,
        has_table_privilege(r, 'public.trip_drive_manual_estimates', 'SELECT') AS estimates,
        has_function_privilege(r, 'public.set_trip_day_origin(uuid, text, jsonb)', 'EXECUTE') AS origin,
        has_function_privilege(r, 'public.set_trip_drive_estimate(uuid, text, text, jsonb)', 'EXECUTE') AS estimate
      FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r`);
    expect(rows).toEqual([
      { role: "anon", estimates: false, origin: false, estimate: false },
      { role: "authenticated", estimates: false, origin: false, estimate: false },
      { role: "service_role", estimates: true, origin: true, estimate: true },
    ]);
    const { rows: sync } = await db.query(`SELECT r AS role, has_function_privilege(r, 'public.sync_trip_day_stay_origins()', 'EXECUTE') AS allowed
      FROM unnest(ARRAY['anon', 'authenticated']) AS r`);
    expect(sync).toEqual([{ role: "anon", allowed: false }, { role: "authenticated", allowed: false }]);
    expect((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname = 'trip_drive_manual_estimates'")).rows).toEqual([{ relrowsecurity: true }]);
  });
});
