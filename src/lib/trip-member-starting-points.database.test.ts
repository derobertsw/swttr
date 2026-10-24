// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TripLocation } from "@/types/trips";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const otherTrip = "0c3f5b8e-2d4a-4e6f-8a1b-9c7d5e3f1a22";
const pine = "40f9f55e-0e74-4c4a-923f-d7a3f92468a0";
const elsewhere = "1b2c3d4e-5f60-4718-892a-3b4c5d6e7f80";
const [eli, fran, left, stranger] = ["1a000000-0000-4000-8000-000000000005", "1a000000-0000-4000-8000-000000000006",
  "1a000000-0000-4000-8000-000000000007", "1a000000-0000-4000-8000-000000000008"];
const place = (label: string, latitude: number, longitude: number): TripLocation => ({
  label, address: `${label}, Vermont`, latitude, longitude, precision: "exact", time_zone: "America/New_York",
  source: "search", provider: "geoapify", provider_id: `place-${latitude}`, attribution: "© OpenStreetMap contributors",
});
const PINE = place("Pine rental", 44.4712, -72.7011);
const CABIN = place("Ridge cabin", 44.51, -72.75);
const HOTEL = "drive|44.4654,-72.6874>44.53,-72.7816", RENTAL = "drive|44.4712,-72.7011>44.53,-72.7816";
let db: PGlite;

type Own = { member_id: string; origin: TripLocation | null; origin_stay_id: string | null; no_drive: boolean };
const own = async () => (await db.query<Own>(
  "SELECT member_id::text, origin, origin_stay_id::text, no_drive FROM trip_member_day_origins WHERE trip_id = $1 ORDER BY member_id", [tripId])).rows;
/** Each person as an editor shows them: their own row, or nothing of their own. */
const seen = async (members: string[]) => {
  const rows = await own();
  return members.map((member) => {
    const row = rows.find((candidate) => candidate.member_id === member);
    return { member_id: member, origin: row?.origin ?? null, origin_stay_id: row?.origin_stay_id ?? null, no_drive: row?.no_drive ?? false };
  });
};
const setOwn = async (payload: Record<string, unknown>, user = "user-1") =>
  (await db.query<{ result: unknown }>("SELECT public.set_trip_member_day_origins($1, $2, $3::jsonb) AS result", [tripId, user, JSON.stringify(payload)])).rows[0].result;
const forPeople = async (members: string[], change: Record<string, unknown>) =>
  setOwn({ date: "2026-10-10", member_ids: members, no_drive: false, origin: null, expected: await seen(members), ...change });

type Manual = { date: string; pair_key: string; duration_seconds: number; use_calculated: boolean; entered_at: string };
const manual = async () => (await db.query<Manual>(
  `SELECT d.date::text, m.pair_key, m.duration_seconds, m.use_calculated, to_jsonb(m.entered_at) #>> '{}' AS entered_at
   FROM trip_drive_manual_estimates m JOIN trip_days d ON d.id = m.trip_day_id WHERE m.trip_id = $1 ORDER BY d.date, m.pair_key`, [tripId])).rows;
const expected = async (drives: Array<{ date: string; pair_key: string }>) => {
  const rows = await manual();
  return drives.map(({ date, pair_key }) => {
    const row = rows.find((candidate) => candidate.date === date && candidate.pair_key === pair_key);
    return { date, pair_key, entered_at: row?.entered_at ?? null, use_calculated: row?.use_calculated ?? null };
  });
};
const setEstimate = async (action: string, payload: Record<string, unknown>, user = "user-1") =>
  (await db.query<{ result: unknown }>("SELECT public.set_trip_drive_pair_estimate($1, $2, $3, $4::jsonb) AS result",
    [tripId, user, action, JSON.stringify(payload)])).rows[0].result;
const estimate = (pair: string, minutes: number) => ({ pair_key: pair, origin_label: "x", destination_label: "Spruce Peak lot", duration_seconds: minutes * 60, note: null });
const saveFor = async (pair: string, minutes: number, dates = ["2026-10-10"], clear: Array<{ date: string; pair_key: string }> = []) =>
  setEstimate("save", { estimate: estimate(pair, minutes), dates, clear, expected: await expected([...dates.map((date) => ({ date, pair_key: pair })), ...clear]) });

describe("Starting points for one person and estimates per drive in Postgres (20261023233000, #333)", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    for (const migration of ["012_trips", "017_trip_stays", "021_trip_date_changes", "025_trip_stay_locations", "026_trip_tour_plans",
      "028_trip_drive_estimates", "029_trip_drive_starting_points", "20261020000407_trip_conflicts_no_retry"]) {
      await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
    }
    // The one piece of #331's migration this needs: people within their own trip.
    await db.exec("ALTER TABLE public.trip_members ADD CONSTRAINT trip_members_trip_id_id_key UNIQUE (trip_id, id);");
    await db.exec(await readFile("supabase/migrations/20261023233000_trip_member_starting_points.sql", "utf8"));
  }, 30_000);

  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query(`INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES
      ($1, 'user-1', 'Stowe', '2026-10-09', '2026-10-12'), ($2, 'user-1', 'Elsewhere', '2026-10-09', '2026-10-12')`, [tripId, otherTrip]);
    await db.query(`INSERT INTO trip_days (trip_id, date) VALUES ($1, '2026-10-09'), ($1, '2026-10-10'), ($1, '2026-10-11'), ($2, '2026-10-10')`, [tripId, otherTrip]);
    await db.query(`INSERT INTO trip_members (id, trip_id, user_id, display_name, role, status) VALUES
      ($1, $5, 'user-eli', 'Eli', 'member', 'joined'), ($2, $5, NULL, 'Fran', 'member', 'invited'),
      ($3, $5, 'user-gone', 'Gone', 'member', 'left'), ($4, $6, 'user-x', 'Stranger', 'member', 'joined')`, [eli, fran, left, stranger, tripId, otherTrip]);
    await db.query(`INSERT INTO trip_stays (id, trip_id, name, check_in, check_out, location) VALUES
      ($1, $3, 'Pine rental', '2026-10-09', '2026-10-11', $4::jsonb), ($2, $5, 'Other trip''s lodge', '2026-10-09', '2026-10-11', $4::jsonb)`,
    [pine, elsewhere, tripId, JSON.stringify(PINE), otherTrip]);
  });
  afterAll(async () => { await db.close(); });

  it("saves a picked stay or any place for chosen people only, and resets them", async () => {
    await forPeople([eli, fran], { origin: { stay_id: pine } });
    expect(await own()).toEqual([eli, fran].map((member) => ({ member_id: member, origin: PINE, origin_stay_id: pine, no_drive: false })));
    await forPeople([eli], { origin: { location: CABIN }, no_drive: true });
    expect((await own())[0]).toEqual({ member_id: eli, origin: CABIN, origin_stay_id: null, no_drive: true });
    // No drive planned from where they'd start anyway, then back to the shared default.
    await forPeople([fran], { no_drive: true });
    expect((await own())[1]).toEqual({ member_id: fran, origin: null, origin_stay_id: null, no_drive: true });
    await forPeople([eli, fran], {});
    expect(await own()).toEqual([]);
  });
  it("refuses a stale review, someone who left or isn't on the trip, another trip's stay, and anyone but the organizer", async () => {
    await forPeople([eli], { origin: { location: CABIN } });
    const stale = { date: "2026-10-10", member_ids: [eli], origin: null, no_drive: true, expected: [{ member_id: eli, origin: null, origin_stay_id: null, no_drive: false }] };
    await expect(setOwn(stale)).rejects.toMatchObject({ code: "PT409" });
    await expect(forPeople([left], { no_drive: true })).rejects.toMatchObject({ code: "PT409" });
    await expect(forPeople([stranger], { no_drive: true })).rejects.toMatchObject({ code: "PT409" });
    await expect(forPeople([eli], { origin: { stay_id: elsewhere } })).rejects.toMatchObject({ code: "PT409" });
    await expect(setOwn({ ...stale, expected: await seen([eli]) }, "user-eli")).rejects.toMatchObject({ code: "42501" });
    await expect(forPeople([eli, eli], { no_drive: true })).rejects.toMatchObject({ code: "22023" });
    await expect(setOwn({ ...stale, date: "2026-10-20", expected: await seen([eli]) })).rejects.toMatchObject({ code: "P0002" });
    expect(await own()).toEqual([{ member_id: eli, origin: CABIN, origin_stay_id: null, no_drive: false }]);
  });
  it("follows a picked stay's name and place, keeps the place once it's removed, and goes with the person", async () => {
    await forPeople([eli], { origin: { stay_id: pine } });
    await db.query("UPDATE trip_stays SET name = 'Pine chalet' WHERE id = $1", [pine]);
    expect((await own())[0].origin?.label).toBe("Pine chalet");
    await db.query("DELETE FROM trip_stays WHERE id = $1", [pine]);
    expect((await own())[0]).toMatchObject({ origin: { label: "Pine chalet", latitude: PINE.latitude }, origin_stay_id: null });
    await db.query("DELETE FROM trip_members WHERE id = $1", [eli]);
    expect(await own()).toEqual([]);
  });
  it("is reachable only by the server's service role", async () => {
    const { rows } = await db.query(`SELECT r AS role, has_table_privilege(r, 'public.trip_member_day_origins', 'SELECT') AS allowed,
      has_function_privilege(r, 'public.set_trip_member_day_origins(uuid, text, jsonb)', 'EXECUTE') AS runs
      FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r`);
    expect(rows).toEqual([{ role: "anon", allowed: false, runs: false }, { role: "authenticated", allowed: false, runs: false }, { role: "service_role", allowed: true, runs: true }]);
  });

  it("keeps an estimate of yours for each drive on a day, and changes one without the other", async () => {
    await saveFor(RENTAL, 15);
    await saveFor(HOTEL, 25, ["2026-10-10", "2026-10-11"]);
    expect((await manual()).map((row) => [row.date, row.pair_key, row.duration_seconds / 60])).toEqual([
      ["2026-10-10", HOTEL, 25], ["2026-10-10", RENTAL, 15], ["2026-10-11", HOTEL, 25],
    ]);
    await setEstimate("prefer", { pair_key: HOTEL, dates: ["2026-10-10"], use_calculated: true, expected: await expected([{ date: "2026-10-10", pair_key: HOTEL }]) });
    await setEstimate("remove", { pair_key: HOTEL, dates: ["2026-10-11"], expected: await expected([{ date: "2026-10-11", pair_key: HOTEL }]) });
    expect((await manual()).map((row) => [row.pair_key, row.use_calculated])).toEqual([[HOTEL, true], [RENTAL, false]]);
    // Editing one keeps its choice of the calculated estimate.
    await saveFor(HOTEL, 30);
    expect((await manual()).find((row) => row.pair_key === HOTEL)).toMatchObject({ duration_seconds: 1800, use_calculated: true });
  });
  it("replaces an estimate for a drive the day no longer has, and refuses stale or unreviewed drives", async () => {
    await saveFor("drive|1,1>2,2", 40);
    await saveFor(RENTAL, 15, ["2026-10-10"], [{ date: "2026-10-10", pair_key: "drive|1,1>2,2" }]);
    expect((await manual()).map((row) => row.pair_key)).toEqual([RENTAL]);
    const stale = [{ date: "2026-10-10", pair_key: RENTAL, entered_at: null, use_calculated: null }];
    await expect(setEstimate("save", { estimate: estimate(RENTAL, 20), dates: ["2026-10-10"], clear: [], expected: stale })).rejects.toMatchObject({ code: "PT409" });
    await expect(setEstimate("save", { estimate: estimate(HOTEL, 20), dates: ["2026-10-10"], clear: [{ date: "2026-10-10", pair_key: RENTAL }],
      expected: await expected([{ date: "2026-10-10", pair_key: HOTEL }]) })).rejects.toMatchObject({ code: "22023" });
    await expect(setEstimate("remove", { pair_key: RENTAL, dates: ["2026-10-10"], expected: await expected([{ date: "2026-10-10", pair_key: RENTAL }]) }, "user-eli"))
      .rejects.toMatchObject({ code: "42501" });
    expect((await manual()).map((row) => row.duration_seconds)).toEqual([900]);
  });
  it("retires 029's one-per-day function", async () => {
    expect((await db.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'set_trip_drive_estimate'")).rows).toEqual([{ n: 0 }]);
  });
});
