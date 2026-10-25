// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dayCheckContext } from "@/lib/trip-day-checks";
import type { TripDay, TripDayCheckKind, TripStop, TripTourPlanSummary } from "@/types/trips";

const tripId = "5f0c2a8e-3a1b-4c6d-9e7f-0a1b2c3d4e5f";
const otherTrip = "6e1d3b9f-4b2c-4d7e-8f90-1b2c3d4e5f60";
const SAT = "2026-10-10";
let db: PGlite;

const rows = async <T,>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows;
const memberId = async (name: string, trip = tripId) =>
  (await rows<{ id: string }>("SELECT id FROM trip_members WHERE trip_id = $1 AND display_name = $2", [trip, name]))[0]?.id ?? randomUUID();
const dayId = async (date: string, trip = tripId) =>
  (await rows<{ id: string }>("SELECT id FROM trip_days WHERE trip_id = $1 AND date = $2", [trip, date]))[0]?.id ?? randomUUID();

/** The context the app builds for a person's check on a day, from the rows as they are now. */
const appContext = async (kind: TripDayCheckKind, name: string, date = SAT) => {
  const [day] = await rows<TripDay>("SELECT id, trip_id, date::text, stop_id, activity, access_point, access_point_stop_id FROM trip_days WHERE trip_id = $1 AND date = $2", [tripId, date]);
  const stops = await rows<TripStop>("SELECT id, position, name, latitude::float8 AS latitude, longitude::float8 AS longitude, activities, access_point FROM trip_stops WHERE trip_id = $1 ORDER BY position", [tripId]);
  const plans = await rows<TripTourPlanSummary>("SELECT trip_day_id, objective, route_url, backup_plan, meet_time::text, meet_day_offset, return_time::text, return_day_offset FROM trip_day_tour_plans WHERE trip_id = $1", [tripId]);
  const [packing] = await rows<{ equipment: Record<string, { status: string; added_at?: string }> }>("SELECT equipment FROM trip_member_packing WHERE trip_member_id = $1", [await memberId(name)]);
  return dayCheckContext(kind, { stops, tour_plans: plans }, day, packing?.equipment);
};

type RecordArgs = { kind?: TripDayCheckKind; name?: string; user?: string; date?: string; day?: string; expected?: string | null;
  action?: string; ctx?: object | null; requestId?: string; zone?: string | null; trip?: string; member?: string };
/** Saves a check with the context the app would send now, unless `ctx` gives another (null for none). */
const record = async ({ kind = "plan_review", name = "Sam", user = "user-2", date = SAT, day, expected = null, action = "recorded",
  ctx, requestId = randomUUID(), zone = "America/New_York", trip = tripId, member }: RecordArgs = {}) => {
  const context = ctx === undefined ? action === "recorded" ? await appContext(kind, name, date) : null : ctx;
  return (await db.query<{ result: { entry_id: string } }>("SELECT public.record_trip_day_check($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS result",
    [trip, user, date, day ?? await dayId(date, trip), member ?? await memberId(name, trip), kind, expected, requestId, action,
      context === null ? null : JSON.stringify(context), zone])).rows[0].result;
};
const code = async (promise: Promise<unknown>) => {
  try { await promise; return undefined; } catch (error) { return (error as { code?: string }).code; }
};
const entries = async () => rows<Record<string, unknown>>(
  `SELECT d.date::text, m.display_name AS person, c.kind, c.action, c.recorded_by, c.plan_revision, c.time_zone
   FROM trip_day_checks c JOIN trip_days d ON d.id = c.trip_day_id JOIN trip_members m ON m.id = c.trip_member_id
   WHERE c.trip_id = $1 ORDER BY c.entry_number`, [tripId]);
const packing = (op: object, user = "user-2") => db.query("SELECT public.update_trip_packing($1, $2, $3)", [tripId, user, JSON.stringify(op)]);
const equipment = async (name = "Sam") =>
  (await rows<{ equipment: Record<string, { status: string; quantity: number; added_at?: string }> }>("SELECT equipment FROM trip_member_packing WHERE trip_member_id = $1", [await memberId(name)]))[0]?.equipment;
const savePlan = async (plan: object, revision = 0) => db.query("SELECT public.mutate_trip_tour_plan($1, 'user-1', $2, $3, $4, $5, 'save', $6)",
  [tripId, SAT, await dayId(SAT), revision, randomUUID(), JSON.stringify(plan)]);

describe("Day checks in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;");
    for (const migration of ["012_trips", "016_atomic_trip_creation", "017_trip_stays", "018_trip_saved_kits", "021_trip_date_changes",
      "022_trip_itinerary_edits", "023_trip_copy_day", "024_trip_packing", "20261016231848_trip_personal_packing_checks", "025_trip_stay_locations",
      "026_trip_tour_plans", "027_trip_access_points", "032_trip_touring_equipment", "20261020000407_trip_conflicts_no_retry",
      "20261024200000_trip_day_checks"]) {
      await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
    }
  }, 30_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-1', 'Presidentials', '2026-10-09', '2026-10-11'), ($2, 'user-9', 'Other', '2026-10-09', '2026-10-11')", [tripId, otherTrip]);
    await db.query(`INSERT INTO trip_members (trip_id, user_id, display_name, role, status) VALUES
      ($1, 'user-1', 'You', 'organizer', 'joined'), ($1, 'user-2', 'Sam', 'member', 'joined'), ($1, 'user-3', 'Ana', 'member', 'joined'),
      ($1, NULL, 'Gus', 'guest', 'guest'), ($1, NULL, 'Ivy', 'member', 'invited'), ($1, 'user-4', 'Lee', 'member', 'left'),
      ($2, 'user-9', 'Kim', 'organizer', 'joined'), ($2, NULL, 'Max', 'guest', 'guest')`, [tripId, otherTrip]);
    const point = JSON.stringify({ label: "Pinkham lot", address: null, latitude: 44.257, longitude: -71.253, precision: "exact",
      time_zone: "America/New_York", source: "manual", provider: null, provider_id: null, attribution: null });
    await db.query("INSERT INTO trip_stops (trip_id, position, name, latitude, longitude, activities, access_point) VALUES ($1, 0, 'Pinkham Notch', 44.257, -71.253, ARRAY['Backcountry'], $2)", [tripId, point]);
    await db.query("INSERT INTO trip_stops (trip_id, position, name, latitude, longitude, activities) VALUES ($1, 1, 'North Conway', 44.05, -71.13, ARRAY['Alpine'])", [tripId]);
    // Friday and Saturday are Backcountry by the base's first activity; Sunday is an Alpine day.
    await db.query("INSERT INTO trip_days (trip_id, date, activity) SELECT $1, d::date, NULL FROM generate_series('2026-10-09'::date, '2026-10-11'::date, interval '1 day') AS d", [tripId]);
    await db.query("UPDATE trip_days SET activity = 'Alpine' WHERE trip_id = $1 AND date = '2026-10-11'", [tripId]);
    await db.query("INSERT INTO trip_days (trip_id, date, activity) VALUES ($1, $2, 'Backcountry')", [otherTrip, SAT]);
    await savePlan({ objective: "Tuckerman Ravine", route_url: "https://example.com/route", backup_plan: "Lion Head if the bowl is loaded",
      meet_time: "06:30", return_time: "15:00", approach_notes: "Skin up the fire road", distance: 9.6, distance_unit: "km" });
  });
  afterAll(async () => { await db?.close(); });

  describe("who records", () => {
    it("records a member's own plan review, attributed to them, with the plan's revision and the zone", async () => {
      const { entry_id } = await record();
      expect(entry_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(await entries()).toEqual([{ date: SAT, person: "Sam", kind: "plan_review", action: "recorded", recorded_by: "user-2", plan_revision: 1, time_zone: "America/New_York" }]);
      expect((await rows<{ context: object }>("SELECT context FROM trip_day_checks", []))[0].context).toEqual({
        date: SAT, meeting_point: { latitude: 44.257, longitude: -71.253 },
        plan: { objective: "Tuckerman Ravine", route_url: "https://example.com/route", backup_plan: "Lion Head if the bowl is loaded",
          meet_time: "06:30", meet_day_offset: 0, return_time: "15:00", return_day_offset: 0 },
      });
    });

    it("lets the organizer record a managed guest's check, attributed to the organizer", async () => {
      await record({ name: "Gus", user: "user-1", kind: "transceiver" });
      await record({ name: "You", user: "user-1" });
      expect(await entries()).toMatchObject([{ person: "Gus", kind: "transceiver", recorded_by: "user-1" }, { person: "You", recorded_by: "user-1" }]);
    });

    it("refuses anyone else's check: another member's, a guest's for a member, an invitation's, and from someone who left", async () => {
      expect(await code(record({ name: "Sam", user: "user-1" }))).toBe("42501");
      expect(await code(record({ name: "Ana", user: "user-2" }))).toBe("42501");
      expect(await code(record({ name: "Gus", user: "user-2" }))).toBe("42501");
      expect(await code(record({ name: "Ivy", user: "user-1" }))).toBe("42501");
      expect(await code(record({ name: "Lee", user: "user-4" }))).toBe("42501");
      expect(await code(record({ name: "Sam", user: "user-9" }))).toBe("42501");
      expect(await entries()).toEqual([]);
    });

    it("refuses another trip's person or day", async () => {
      expect(await code(record({ name: "You", user: "user-1", member: await memberId("Max", otherTrip) }))).toBe("P0002");
      expect(await code(record({ day: await dayId(SAT, otherTrip) }))).toBe("PT409");
      expect(await entries()).toEqual([]);
    });
  });

  describe("days", () => {
    it("records on any Backcountry day, separately for each day", async () => {
      await record({ kind: "transceiver", date: "2026-10-09" });
      await record({ kind: "transceiver" });
      expect(await entries()).toMatchObject([{ date: "2026-10-09", kind: "transceiver" }, { date: SAT, kind: "transceiver" }]);
    });

    it("refuses a day that isn't Backcountry, a date the day moved from and a date that's gone", async () => {
      expect(await code(record({ kind: "transceiver", date: "2026-10-11" }))).toBe("PT409");
      expect(await code(record({ day: await dayId("2026-10-09") }))).toBe("PT409");
      expect(await code(record({ date: "2026-10-12", ctx: { date: "2026-10-12" } }))).toBe("P0002");
      expect(await entries()).toEqual([]);
    });

    it("refuses a plan review on a day without a tour plan", async () => {
      expect(await code(record({ date: "2026-10-09", ctx: { date: "2026-10-09", plan: null, meeting_point: { latitude: 44.257, longitude: -71.253 } } }))).toBe("PT409");
    });

    it("removes a day's checks with the day", async () => {
      await record();
      await db.query("DELETE FROM trip_days WHERE trip_id = $1 AND date = $2", [tripId, SAT]);
      expect(await entries()).toEqual([]);
    });
  });

  describe("history", () => {
    it("withdraws a recorded check, keeping its context, and records it again from the withdrawal", async () => {
      const first = await record();
      const withdrawn = await record({ action: "withdrawn", expected: first.entry_id });
      await record({ expected: withdrawn.entry_id });
      expect(await entries()).toMatchObject([{ action: "recorded" }, { action: "withdrawn", recorded_by: "user-2", plan_revision: 1 }, { action: "recorded" }]);
      const contexts = await rows<{ context: object }>("SELECT context FROM trip_day_checks ORDER BY entry_number", []);
      expect(contexts[1].context).toEqual(contexts[0].context);
    });

    it("refuses a change from a window that read an older entry", async () => {
      const first = await record();
      expect(await code(record())).toBe("PT409");
      expect(await code(record({ action: "withdrawn", expected: null }))).toBe("PT409");
      await record({ action: "withdrawn", expected: first.entry_id });
      expect(await entries()).toHaveLength(2);
    });

    it("refuses to withdraw a check that isn't recorded", async () => {
      expect(await code(record({ action: "withdrawn" }))).toBe("22000");
      const first = await record();
      const withdrawn = await record({ action: "withdrawn", expected: first.entry_id });
      expect(await code(record({ action: "withdrawn", expected: withdrawn.entry_id }))).toBe("22000");
    });

    it("returns the first result for a retry, and refuses a save identity used for something else", async () => {
      const requestId = randomUUID();
      const first = await record({ requestId });
      expect(await record({ requestId })).toEqual(first);
      expect(await code(record({ requestId, kind: "transceiver" }))).toBe("22023");
      expect(await entries()).toHaveLength(1);
    });

    it("refuses an invalid kind, action or context", async () => {
      expect(await code(record({ kind: "helmet" as TripDayCheckKind, ctx: {} }))).toBe("22000");
      expect(await code(record({ action: "corrected", ctx: {} }))).toBe("22000");
      expect(await code(record({ ctx: null }))).toBe("22000");
    });
  });

  // record_trip_day_check rebuilds the context under the trip lock; these tie it to the app's dayCheckContext.
  describe("what a plan review covers", () => {
    it.each([
      ["the route", "UPDATE trip_day_tour_plans SET objective = 'Gulf of Slides' WHERE trip_id = $1"],
      ["the route link", "UPDATE trip_day_tour_plans SET route_url = NULL WHERE trip_id = $1"],
      ["the backup plan", "UPDATE trip_day_tour_plans SET backup_plan = 'Hillman''s Highway' WHERE trip_id = $1"],
      ["the meet time", "UPDATE trip_day_tour_plans SET meet_time = '06:00' WHERE trip_id = $1"],
      ["the meet day", "UPDATE trip_day_tour_plans SET meet_day_offset = -1 WHERE trip_id = $1"],
      ["the return time", "UPDATE trip_day_tour_plans SET return_time = '16:00' WHERE trip_id = $1"],
      ["the meeting point", "UPDATE trip_stops SET access_point = NULL WHERE trip_id = $1"],
      ["the tour plan's existence", "DELETE FROM trip_day_tour_plans WHERE trip_id = $1"],
    ])("refuses a review of the plan from before a change to %s", async (_change, sql) => {
      const seen = await appContext("plan_review", "Sam");
      await db.query(sql, [tripId]);
      expect(await code(record({ ctx: seen }))).toBe("PT409");
      expect(await entries()).toEqual([]);
    });

    it("accepts it after changes to notes and figures", async () => {
      const seen = await appContext("plan_review", "Sam");
      await db.query("UPDATE trip_day_tour_plans SET approach_notes = 'Bring ski crampons', access_notes = 'Lot fills by 7', checkin_notes = 'Text Ana', distance = 10.2, ascent = 1200, ascent_unit = 'm' WHERE trip_id = $1", [tripId]);
      await db.query("UPDATE trip_stops SET name = 'Pinkham Notch Visitor Center' WHERE trip_id = $1 AND position = 0", [tripId]);
      await record({ ctx: seen });
      expect(await entries()).toHaveLength(1);
    });
  });

  describe("the transceiver a check covers", () => {
    it("is none until it's in the person's list, then the item as added", async () => {
      expect(await appContext("transceiver", "Sam")).toEqual({ date: SAT, transceiver: null });
      await record({ kind: "transceiver" });
      await packing({ op: "add_equipment", ids: ["transceiver", "probe"] });
      const added = await equipment();
      expect(added?.transceiver.added_at).toEqual(expect.any(String));
      expect(await appContext("transceiver", "Sam")).toEqual({ date: SAT, transceiver: { added_at: added?.transceiver.added_at } });
      await record({ kind: "transceiver", date: "2026-10-09" });
      expect(await entries()).toHaveLength(2);
    });

    it("keeps when it was added through quantity changes and packing checks", async () => {
      await packing({ op: "add_equipment", ids: ["transceiver"] });
      const seen = await appContext("transceiver", "Sam");
      const { added_at } = (await equipment())!.transceiver;
      await packing({ op: "equipment_quantity", id: "transceiver", quantity: 2 });
      // The new quantity left an unchecked entry to check against.
      const [{ version }] = await rows<{ version: string }>("SELECT checks->'equipment:transceiver'->>'version' AS version FROM trip_member_packing WHERE trip_member_id = $1", [await memberId("Sam")]);
      await packing({ op: "set_packed", key: "equipment:transceiver", packed: true, quantity: 2, mutation: randomUUID(), expected: version, kits: {}, aliases: [] });
      await packing({ op: "add_equipment", ids: ["transceiver", "shovel"] });
      expect((await equipment())!.transceiver).toMatchObject({ status: "added", quantity: 2, added_at });
      await record({ kind: "transceiver", ctx: seen });
      expect(await entries()).toHaveLength(1);
    });

    it("refuses a check of a transceiver that was taken off the list, or replaced", async () => {
      await packing({ op: "add_equipment", ids: ["transceiver"] });
      const seen = await appContext("transceiver", "Sam");
      await packing({ op: "remove_equipment", id: "transceiver" });
      expect(await code(record({ kind: "transceiver", ctx: seen }))).toBe("PT409");
      await packing({ op: "add_equipment", ids: ["transceiver"] });
      expect((await equipment())!.transceiver.added_at).not.toBe((seen as { transceiver: { added_at: string } }).transceiver.added_at);
      expect(await code(record({ kind: "transceiver", ctx: seen }))).toBe("PT409");
      await record({ kind: "transceiver" });
      expect(await entries()).toHaveLength(1);
    });

    it("leaves an item added before the stamp without one while it stays in the list", async () => {
      await db.exec("ALTER TABLE trip_member_packing DISABLE TRIGGER stamp_trip_member_equipment");
      await db.query("INSERT INTO trip_member_packing (trip_member_id, trip_id, equipment) VALUES ($1, $2, '{\"transceiver\": {\"status\": \"added\", \"quantity\": 1}}')", [await memberId("Sam"), tripId]);
      await db.exec("ALTER TABLE trip_member_packing ENABLE TRIGGER stamp_trip_member_equipment");
      await packing({ op: "equipment_quantity", id: "transceiver", quantity: 2 });
      expect((await equipment())!.transceiver).toEqual({ status: "added", quantity: 2 });
      expect(await appContext("transceiver", "Sam")).toEqual({ date: SAT, transceiver: { added_at: null } });
      await record({ kind: "transceiver" });
      expect(await entries()).toHaveLength(1);
    });

    it("is none for a managed guest, who has no packing list", async () => {
      expect(await appContext("transceiver", "Gus")).toEqual({ date: SAT, transceiver: null });
      await record({ kind: "transceiver", name: "Gus", user: "user-1" });
      expect(await entries()).toHaveLength(1);
    });
  });

  it("is reachable only by the service role", async () => {
    const signature = "public.record_trip_day_check(uuid, text, date, uuid, uuid, text, uuid, uuid, text, jsonb, text)";
    expect((await rows("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon, has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated, has_function_privilege('service_role',$1,'EXECUTE') AS service", [signature]))[0])
      .toEqual({ anon: false, authenticated: false, service: true });
    for (const table of ["public.trip_day_checks", "public.trip_day_check_mutations"]) {
      expect((await rows("SELECT has_table_privilege('anon',$1,'SELECT') AS anon, has_table_privilege('authenticated',$1,'INSERT') AS authenticated, has_table_privilege('service_role',$1,'SELECT,INSERT,UPDATE,DELETE') AS service", [table]))[0])
        .toEqual({ anon: false, authenticated: false, service: true });
    }
  });
});
