// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { peopleKey as crewKey, type LodgingMember, type LodgingRows } from "@/lib/trip-lodging";
import { applyLodgingChange, lodgingPayload, type LodgingChange } from "@/lib/trip-lodging-changes";
import type { Trip, TripLodgingNight, TripMemberAttendance, TripStay } from "@/types/trips";

// The downhill reference journey (#329), Fri Oct 9 – Mon Oct 12: Thursday is
// the pre-trip night and Monday the last night.
const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const otherTrip = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";
const alex = "1a000000-0000-4000-8000-000000000001"; // organizer
const blair = "1a000000-0000-4000-8000-000000000002";
const casey = "1a000000-0000-4000-8000-000000000003";
const dana = "1a000000-0000-4000-8000-000000000004"; // managed guest
const eli = "1a000000-0000-4000-8000-000000000005";
const fran = "1a000000-0000-4000-8000-000000000006"; // pending invitation
const outsider = "1a000000-0000-4000-8000-000000000099"; // on the other trip
const pine = "40f9f55e-0e74-4c4a-923f-d7a3f92468a0";
const village = "a682b8af-d26b-4213-a816-39de3eb155eb";
const lodge = "c2a1b7f0-5d1e-4c39-9a3b-7e8f6a5b4c3d";
const foreignStay = "d3b2c8e1-6e2f-4d4a-8b4c-8f9a7b6c5d4e";
const FRI = "2026-10-09", SAT = "2026-10-10", SUN = "2026-10-11", MON = "2026-10-12", THU = "2026-10-08";

let db: PGlite;
type Options = { replace?: boolean; requestId?: string; owner?: string; trip?: string };
const mutate = async (revision: number, action: string, payload: object, { replace = false, requestId = randomUUID(), owner = "user-1", trip = tripId }: Options = {}) =>
  (await db.query<{ result: { revision: number } }>("SELECT public.mutate_trip_lodging($1,$2,$3,$4,$5,$6,$7) AS result",
    [trip, owner, revision, requestId, action, JSON.stringify(payload), replace])).rows[0].result;
const stay = (id: string, name: string, checkIn: string | null, checkOut: string | null, extra: object = {}) =>
  ({ id, name, check_in: checkIn, check_out: checkOut, booking_status: "not_booked", existing: false, ...extra });
const revision = async () => (await db.query<{ lodging_revision: number }>("SELECT lodging_revision FROM trips WHERE id = $1", [tripId])).rows[0].lodging_revision;
/** "member date stay|no_stay" for every saved night, in order. */
const nights = async () => (await db.query<{ member_id: string; date: string; stay_id: string | null; status: string }>(
  "SELECT member_id, date::text, stay_id, status FROM trip_member_lodging_nights WHERE trip_id = $1 ORDER BY member_id, date", [tripId])).rows
  .map((row) => `${name(row.member_id)} ${row.date} ${row.status === "no_stay" ? "no_stay" : name(row.stay_id!)}`);
const names: Record<string, string> = { [alex]: "alex", [blair]: "blair", [casey]: "casey", [dana]: "dana", [eli]: "eli", [fran]: "fran", [pine]: "pine", [village]: "village", [lodge]: "lodge" };
const name = (id: string) => names[id] ?? id;
const code = async (promise: Promise<unknown>) => { try { await promise; return "ok"; } catch (error) { return (error as { code?: string }).code; } };
const peopleKey = async () => (await db.query<{ key: string }>("SELECT public.trip_lodging_people_key($1) AS key", [tripId])).rows[0].key;

async function setUp(database: PGlite, migrations: string[]) {
  await database.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
  for (const migration of migrations) await database.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
}
const BEFORE = ["012_trips", "016_atomic_trip_creation", "017_trip_stays", "018_trip_saved_kits", "021_trip_date_changes", "022_trip_itinerary_edits",
  "023_trip_copy_day", "025_trip_stay_locations", "026_trip_tour_plans", "027_trip_access_points", "031_trip_conditions", "20261020000407_trip_conflicts_no_retry"];
const MIGRATION = "20261021201500_trip_attendance_lodging";

async function seed(database: PGlite) {
  await database.exec("TRUNCATE trips CASCADE;");
  await database.query("INSERT INTO trips (id,owner_user_id,name,start_date,end_date) VALUES ($1,'user-1','Weekend',$3,$4), ($2,'other-user','Other',$3,$4)", [tripId, otherTrip, FRI, MON]);
  await database.query(`INSERT INTO trip_members (id, trip_id, user_id, display_name, role, status) VALUES
    ($1, $7, 'user-1', 'Alex', 'organizer', 'joined'), ($2, $7, 'user-2', 'Blair', 'member', 'joined'),
    ($3, $7, 'user-3', 'Casey', 'member', 'joined'), ($4, $7, NULL, 'Dana', 'guest', 'guest'),
    ($5, $7, 'user-5', 'Eli', 'member', 'joined'), ($6, $7, NULL, 'Fran', 'member', 'invited'),
    ($8, $9, 'other-user', 'Other', 'organizer', 'joined')`, [alex, blair, casey, dana, eli, fran, tripId, outsider, otherTrip]);
}

describe("Migrating crew nights to people (#331)", () => {
  it("copies each crew night to joined members and managed guests, keeping stays, bookings and notes", async () => {
    const legacy = await PGlite.create();
    try {
      await setUp(legacy, BEFORE);
      await seed(legacy);
      await legacy.query("INSERT INTO trip_stays (id, trip_id, name, check_in, check_out, booking_status, notes) VALUES ($1, $2, 'Pine rental', $3, $4, 'booked', 'Code 1234')", [pine, tripId, FRI, SUN]);
      await legacy.query("INSERT INTO trip_lodging_nights (trip_id, date, stay_id, status) VALUES ($1, $2, $4, 'assigned'), ($1, $3, NULL, 'no_stay')", [tripId, FRI, SAT, pine]);
      await legacy.exec(await readFile(`supabase/migrations/${MIGRATION}.sql`, "utf8"));
      db = legacy;
      // Fran's invitation is pending, so she isn't asserted to occupy the rental.
      expect(await nights()).toEqual([
        `alex ${FRI} pine`, `alex ${SAT} no_stay`, `blair ${FRI} pine`, `blair ${SAT} no_stay`, `casey ${FRI} pine`, `casey ${SAT} no_stay`,
        `dana ${FRI} pine`, `dana ${SAT} no_stay`, `eli ${FRI} pine`, `eli ${SAT} no_stay`]);
      expect((await legacy.query("SELECT name, booking_status, notes, check_in::text, check_out::text FROM trip_stays")).rows).toEqual([
        { name: "Pine rental", booking_status: "booked", notes: "Code 1234", check_in: FRI, check_out: SUN }]);
      // The crew-wide rows are kept as they were, for audit or an API rollback.
      expect((await legacy.query("SELECT count(*)::int AS count FROM trip_lodging_nights")).rows[0]).toEqual({ count: 2 });
      expect(await revision()).toBe(0);
      // Someone invited afterwards starts Not planned, and saving the stay's notes asserts nothing for them.
      const later = randomUUID();
      await legacy.query("INSERT INTO trip_members (id, trip_id, user_id, display_name, role, status) VALUES ($1, $2, NULL, 'Gus', 'guest', 'guest')", [later, tripId]);
      await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN, { existing: true, booking_status: "booked", notes: "Code 5678" }));
      expect((await legacy.query("SELECT count(*)::int AS count FROM trip_member_lodging_nights WHERE member_id = $1", [later])).rows[0]).toEqual({ count: 0 });
    } finally {
      await legacy.close();
    }
  }, 30_000);
});

describe("Attendance and per-person lodging in Postgres (#331)", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await setUp(db, [...BEFORE, MIGRATION]);
  }, 30_000);
  beforeEach(async () => { await seed(db); });
  afterAll(async () => { await db?.close(); });

  it("gives a new stay's nights to joined members and guests on the trip, not pending invitations", async () => {
    await mutate(0, "save", stay(pine, "Pine rental", THU, FRI));
    expect(await nights()).toEqual([`alex ${THU} pine`, `blair ${THU} pine`, `casey ${THU} pine`, `dana ${THU} pine`, `eli ${THU} pine`]);
  });

  it("lets two groups stay in different places on the same nights", async () => {
    await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN, { occupants: [alex, blair, dana] }));
    // Overlapping dates are fine for different people, a pending invitation included.
    await mutate(1, "save", stay(village, "Village hotel", FRI, SUN, { occupants: [eli, fran] }));
    expect(await nights()).toEqual([`alex ${FRI} pine`, `alex ${SAT} pine`, `blair ${FRI} pine`, `blair ${SAT} pine`,
      `dana ${FRI} pine`, `dana ${SAT} pine`, `eli ${FRI} village`, `eli ${SAT} village`, `fran ${FRI} village`, `fran ${SAT} village`]);
    // Fran keeps her invitation; a stay never changes membership.
    expect((await db.query("SELECT status::text FROM trip_members WHERE id = $1", [fran])).rows[0]).toEqual({ status: "invited" });
    // Putting Eli in the rental too names his nights as the conflict.
    await expect(mutate(2, "save", stay(pine, "Pine rental", FRI, SUN, { existing: true, occupants: [alex, blair, dana, eli] }))).rejects.toMatchObject({ code: "23P01" });
    expect(await revision()).toBe(2);
  });

  it("covers an evening arrival who skips the day but sleeps there", async () => {
    await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN, { occupants: [alex, blair, dana] }));
    await mutate(1, "attendance", { member_id: casey, arrival_date: SAT, departure_date: null, skipped_dates: [SAT] });
    // Without dates, Casey gets every rental night he's there for: only Saturday.
    await mutate(2, "assign", { assignments: [{ member_id: casey, status: "assigned", stay_id: pine }] });
    expect((await nights()).filter((night) => night.startsWith("casey"))).toEqual([`casey ${SAT} pine`]);
    expect((await db.query("SELECT arrival_date::text, departure_date, skipped_dates::text[] FROM trip_member_attendance WHERE member_id = $1", [casey])).rows[0])
      .toEqual({ arrival_date: SAT, departure_date: null, skipped_dates: [SAT] });
    // Friday isn't one of his nights.
    expect(await code(mutate(3, "assign", { assignments: [{ member_id: casey, status: "assigned", stay_id: pine, dates: [FRI] }] }))).toBe("22023");
    expect(await revision()).toBe(3);
  });

  it("moves one person for one night without changing anyone else", async () => {
    await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN, { occupants: [alex, blair, dana] }));
    await mutate(1, "save", stay(village, "Village hotel", FRI, SUN, { occupants: [eli, fran] }));
    const before = await nights();
    const move = { assignments: [{ member_id: blair, status: "assigned", stay_id: village, dates: [SAT] }, { member_id: alex, status: "assigned", stay_id: village, dates: [SAT] }] };
    // Each moved night already has a plan: the move must be confirmed.
    expect(await code(mutate(2, "assign", move))).toBe("23P01");
    expect(await nights()).toEqual(before);
    await mutate(2, "assign", move, { replace: true });
    expect(await nights()).toEqual(before.map((night) => night === `blair ${SAT} pine` ? `blair ${SAT} village` : night === `alex ${SAT} pine` ? `alex ${SAT} village` : night));
    // Clearing a night replaces nothing.
    await mutate(3, "assign", { assignments: [{ member_id: dana, status: "unplanned", dates: [SAT] }] });
    expect(await nights()).not.toContain(`dana ${SAT} pine`);
  });

  it("clears only the nights an early departure leaves, after review, and keeps their kits and reviews", async () => {
    await mutate(0, "save", stay(lodge, "Mountain lodge", SUN, "2026-10-13"));
    const day = randomUUID(), kit = randomUUID(), source = randomUUID();
    await db.query("INSERT INTO trip_days (id, trip_id, date) VALUES ($1, $2, $3)", [day, tripId, SUN]);
    await db.query("INSERT INTO trip_member_day_kits (id, trip_day_id, trip_member_id) VALUES ($1, $2, $3)", [kit, day, dana]);
    await db.query("INSERT INTO trip_conditions_sources (id, trip_id, category, name, url, created_by, updated_by) VALUES ($1, $2, 'avalanche', 'Forecast', 'https://example.org', 'user-1', 'user-1')", [source, tripId]);
    await db.query("INSERT INTO trip_conditions_reviews (trip_id, trip_day_id, source_id, user_id, action, reviewed_at, context) VALUES ($1, $2, $3, 'user-5', 'reviewed', now(), '{}')", [tripId, day, source]);
    const leave = { member_id: dana, arrival_date: null, departure_date: SUN, skipped_dates: [] };
    expect(await code(mutate(1, "attendance", leave))).toBe("23P01");
    await mutate(1, "attendance", leave, { replace: true });
    expect((await nights()).filter((night) => night.startsWith("dana"))).toEqual([]);
    expect(await nights()).toContain(`eli ${MON} lodge`);
    expect((await db.query("SELECT count(*)::int AS count FROM trip_member_day_kits WHERE id = $1", [kit])).rows[0]).toEqual({ count: 1 });
    expect((await db.query("SELECT count(*)::int AS count FROM trip_conditions_reviews")).rows[0]).toEqual({ count: 1 });
    // Returning for the whole trip asserts no stay for the nights she rejoins.
    await mutate(2, "attendance", { member_id: dana, arrival_date: null, departure_date: null, skipped_dates: [] });
    expect((await db.query("SELECT count(*)::int AS count FROM trip_member_attendance")).rows[0]).toEqual({ count: 0 });
    expect((await nights()).filter((night) => night.startsWith("dana"))).toEqual([]);
  });

  it.each([
    ["a departure before the arrival", { arrival_date: SUN, departure_date: SAT }],
    ["an arrival before the pre-trip night", { arrival_date: "2026-10-07" }],
    ["a departure after the morning after the last night", { departure_date: "2026-10-14" }],
    ["a skipped day they aren't there", { arrival_date: SAT, skipped_dates: [FRI] }],
    ["a skipped day outside the trip", { skipped_dates: [THU] }],
  ])("rejects attendance with %s", async (_, change) => {
    expect(await code(mutate(0, "attendance", { member_id: casey, arrival_date: null, departure_date: null, skipped_dates: [], ...change }))).toBe("22023");
    expect(await revision()).toBe(0);
  });

  it("keeps explicit moves when a stay's dates change, assigning only new nights to its occupants", async () => {
    await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN, { occupants: [alex, blair, dana] }));
    await mutate(1, "save", stay(village, "Village hotel", FRI, MON, { occupants: [eli] }));
    await mutate(2, "assign", { assignments: [{ member_id: blair, status: "assigned", stay_id: village, dates: [SAT] }] }, { replace: true });
    // A note-only edit leaves every night alone.
    await mutate(3, "save", stay(pine, "Pine rental", FRI, SUN, { existing: true, notes: "Hot tub" }));
    expect((await nights()).filter((night) => night.startsWith("blair"))).toEqual([`blair ${FRI} pine`, `blair ${SAT} village`]);
    // Adding Sunday gives it to the rental's occupants, Blair included, and nobody else.
    await mutate(4, "save", stay(pine, "Pine rental", FRI, MON, { existing: true, notes: "Hot tub" }));
    expect(await nights()).toEqual([`alex ${FRI} pine`, `alex ${SAT} pine`, `alex ${SUN} pine`, `blair ${FRI} pine`, `blair ${SAT} village`, `blair ${SUN} pine`,
      `dana ${FRI} pine`, `dana ${SAT} pine`, `dana ${SUN} pine`, `eli ${FRI} village`, `eli ${SAT} village`, `eli ${SUN} village`]);
    // Starting Saturday drops Friday for its occupants only.
    await mutate(5, "save", stay(pine, "Pine rental", SAT, MON, { existing: true, notes: "Hot tub" }));
    expect((await nights()).filter((night) => night.includes(FRI))).toEqual([`eli ${FRI} village`]);
    // Removing the stay makes its nights Not planned and leaves the hotel's.
    await mutate(6, "remove", { id: pine });
    expect(await nights()).toEqual([`blair ${SAT} village`, `eli ${FRI} village`, `eli ${SAT} village`, `eli ${SUN} village`]);
  });

  it("sets exactly who stays somewhere with explicit occupants", async () => {
    await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN));
    await mutate(1, "save", stay(pine, "Pine rental", FRI, SUN, { existing: true, occupants: [alex, fran] }));
    expect(await nights()).toEqual([`alex ${FRI} pine`, `alex ${SAT} pine`, `fran ${FRI} pine`, `fran ${SAT} pine`]);
  });

  it("plans a crew night for the people on the trip that night", async () => {
    await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN));
    await mutate(1, "attendance", { member_id: casey, arrival_date: SAT, departure_date: null, skipped_dates: [] }, { replace: true });
    await mutate(2, "assign", { assignments: [{ member_id: fran, status: "assigned", stay_id: pine, dates: [SAT] }] });
    expect(await code(mutate(3, "night", { date: SAT, status: "no_stay" }))).toBe("23P01");
    await mutate(3, "night", { date: SAT, status: "no_stay" }, { replace: true });
    expect((await nights()).filter((night) => night.includes(SAT))).toEqual(
      ["alex", "blair", "casey", "dana", "eli", "fran"].map((person) => `${person} ${SAT} no_stay`));
    await mutate(4, "night", { date: SAT, status: "unplanned" });
    expect((await nights()).filter((night) => night.includes(SAT))).toEqual([]);
    // Casey isn't on the trip Friday night, so the crew's Friday doesn't include him.
    await mutate(5, "night", { date: FRI, status: "unplanned" });
    await mutate(6, "night", { date: FRI, status: "no_stay" });
    expect((await nights()).filter((night) => night.includes(FRI))).toEqual(["alex", "blair", "dana", "eli"].map((person) => `${person} ${FRI} no_stay`));
  });

  it("returns an uncertain save's result again without repeating it, and rolls back failures", async () => {
    const requestId = randomUUID();
    const first = await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN), { requestId });
    await mutate(1, "assign", { assignments: [{ member_id: alex, status: "unplanned", dates: [FRI] }] });
    expect(await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN), { requestId })).toEqual(first);
    expect(await revision()).toBe(2);
    expect(await nights()).not.toContain(`alex ${FRI} pine`);
    expect(await code(mutate(0, "save", stay(pine, "Other", FRI, SUN), { requestId }))).toBe("22023");
    // A listed night twice, or a stay without dates, changes nothing.
    await mutate(2, "save", stay(village, "Village hotel", null, null));
    const before = await nights();
    expect(await code(mutate(3, "assign", { assignments: [{ member_id: alex, status: "no_stay", dates: [FRI] }, { member_id: alex, status: "unplanned", dates: [FRI] }] }))).toBe("22023");
    expect(await code(mutate(3, "assign", { assignments: [{ member_id: alex, status: "assigned", stay_id: village }] }))).toBe("22023");
    expect(await nights()).toEqual(before);
    expect(await revision()).toBe(3);
  });

  it("caps one change at 2,000 person/nights, a whole stay's included", async () => {
    await db.query("UPDATE trips SET end_date = '2027-10-09' WHERE id = $1", [tripId]);
    await mutate(1, "save", stay(pine, "Pine rental", FRI, "2027-10-10", { occupants: [] }));
    const everyone = [alex, blair, casey, dana, eli, fran].map((member) => ({ member_id: member, status: "assigned", stay_id: pine }));
    expect(await code(mutate(2, "assign", { assignments: everyone }))).toBe("22023");
    await mutate(2, "assign", { assignments: everyone.slice(0, 5) });
    expect((await db.query("SELECT count(*)::int AS count FROM trip_member_lodging_nights")).rows[0]).toEqual({ count: 5 * 366 });
  });

  it("rejects a stale session and a crew that changed since the review", async () => {
    await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN));
    expect(await code(mutate(0, "assign", { assignments: [{ member_id: alex, status: "unplanned", dates: [FRI] }] }))).toBe("PT409");
    const key = await peopleKey();
    await mutate(1, "assign", { people_key: key, assignments: [{ member_id: alex, status: "unplanned", dates: [FRI] }] });
    // Fran accepts her invitation between another review and its save.
    await db.query("UPDATE trip_members SET status = 'joined', user_id = 'user-6' WHERE id = $1", [fran]);
    expect(await code(mutate(2, "night", { people_key: key, date: SAT, status: "unplanned" }))).toBe("PT409");
    expect(await revision()).toBe(2);
    expect(await peopleKey()).not.toBe(key);
  });

  it("allows only the organizer, people on this trip and this trip's stays", async () => {
    await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN));
    await mutate(0, "save", stay(foreignStay, "Elsewhere", FRI, SUN), { owner: "other-user", trip: otherTrip });
    const assign = (entry: object) => ({ assignments: [{ status: "assigned", stay_id: pine, ...entry }] });
    expect(await code(mutate(1, "assign", assign({ member_id: blair }), { owner: "user-2" }))).toBe("42501");
    expect(await code(mutate(1, "assign", assign({ member_id: outsider })))).toBe("42501");
    expect(await code(mutate(1, "assign", assign({ member_id: blair, stay_id: foreignStay })))).toBe("42501");
    expect(await code(mutate(1, "attendance", { member_id: outsider, skipped_dates: [] }))).toBe("42501");
    expect(await code(mutate(1, "save", stay(village, "Village hotel", FRI, SUN, { occupants: [outsider] })))).toBe("42501");
    await db.query("UPDATE trip_members SET status = 'left' WHERE id = $1", [blair]);
    expect(await code(mutate(1, "assign", assign({ member_id: blair })))).toBe("42501");
    expect(await revision()).toBe(1);
    // A managed guest is the organizer's to plan.
    await mutate(1, "assign", { assignments: [{ member_id: dana, status: "no_stay", dates: [FRI] }] }, { replace: true });
    expect(await nights()).toContain(`dana ${FRI} no_stay`);
    // The keys hold even for a direct write.
    expect(await code(db.query("INSERT INTO trip_member_lodging_nights (trip_id, member_id, date, stay_id, status) VALUES ($1, $2, $3, NULL, 'no_stay')", [tripId, outsider, FRI]))).toBe("23503");
    expect(await code(db.query("INSERT INTO trip_member_lodging_nights (trip_id, member_id, date, stay_id, status) VALUES ($1, $2, $3, $4, 'assigned')", [tripId, alex, SUN, foreignStay]))).toBe("23503");
    expect(await code(db.query("INSERT INTO trip_member_attendance (trip_id, member_id) VALUES ($1, $2)", [tripId, outsider]))).toBe("23503");
  });

  it("keeps a pending invitation's nights when it's accepted, and drops a removed person's", async () => {
    await mutate(0, "save", stay(pine, "Pine rental", FRI, SUN, { occupants: [fran, eli] }));
    await db.query("UPDATE trip_members SET status = 'joined', user_id = 'user-6' WHERE id = $1", [fran]);
    await db.query("DELETE FROM trip_members WHERE id = $1", [eli]);
    expect(await nights()).toEqual([`fran ${FRI} pine`, `fran ${SAT} pine`]);
    await db.query("DELETE FROM trips WHERE id = $1", [tripId]);
    expect((await db.query("SELECT count(*)::int AS count FROM trip_member_lodging_nights")).rows[0]).toEqual({ count: 0 });
  });

  it("needs the reviewed lodging revision to change trip dates once anyone has a plan or dates of their own", async () => {
    const change = (lodging: number | null) => db.query("SELECT public.change_trip_dates($1, 'user-1', $2, $3, $4, $5, 'keep', 'planning', NULL, $6, '[]') AS result",
      [tripId, FRI, MON, FRI, SUN, lodging]);
    await mutate(0, "attendance", { member_id: casey, arrival_date: SAT, departure_date: null, skipped_dates: [] });
    expect(await code(change(null))).toBe("PT409");
    await change(1);
    expect((await db.query("SELECT end_date::text FROM trips WHERE id = $1", [tripId])).rows[0]).toEqual({ end_date: SUN });
    expect((await db.query("SELECT arrival_date::text FROM trip_member_attendance WHERE member_id = $1", [casey])).rows[0]).toEqual({ arrival_date: SAT });
  });

  it("blocks browser roles at the RPC, helper and table boundaries", async () => {
    for (const signature of ["public.mutate_trip_lodging(uuid,text,integer,uuid,text,jsonb,boolean)", "public.trip_lodging_people_key(uuid)", "public.trip_lodging_windows(uuid)"]) {
      expect((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon, has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated, has_function_privilege('service_role',$1,'EXECUTE') AS service", [signature])).rows[0])
        .toEqual({ anon: false, authenticated: false, service: true });
    }
    for (const table of ["trip_member_attendance", "trip_member_lodging_nights"]) {
      expect((await db.query("SELECT has_table_privilege('anon',$1,'SELECT') AS anon, has_table_privilege('authenticated',$1,'SELECT,INSERT') AS authenticated, has_table_privilege('service_role',$1,'SELECT,INSERT,UPDATE,DELETE') AS service", [table])).rows[0])
        .toEqual({ anon: false, authenticated: false, service: true });
      expect((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass", [table])).rows[0]).toEqual({ relrowsecurity: true });
    }
    await db.exec("SET ROLE authenticated");
    try {
      expect(await code(db.query("SELECT * FROM public.trip_member_lodging_nights"))).toBe("42501");
      expect(await code(mutate(0, "save", stay(pine, "Pine rental", FRI, SUN)))).toBe("42501");
    } finally { await db.exec("RESET ROLE"); }
  });
});

describe("Previews match the transaction (#331)", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await setUp(db, [...BEFORE, MIGRATION]);
  }, 30_000);
  beforeEach(async () => { await seed(db); });
  afterAll(async () => { await db?.close(); });

  const load = async () => {
    const rows = async <T,>(sql: string) => (await db.query<T>(sql, [tripId])).rows;
    const trip = (await rows<Trip>("SELECT id, owner_user_id, name, start_date::text, end_date::text, status, lodging_revision FROM trips WHERE id = $1"))[0];
    const members = await rows<LodgingMember>("SELECT id, display_name, role::text, status::text, created_at::text FROM trip_members WHERE trip_id = $1");
    const lodging: LodgingRows = {
      stays: await rows<TripStay>("SELECT id, trip_id, name, check_in::text, check_out::text, type, booking_status, location, created_at::text FROM trip_stays WHERE trip_id = $1 ORDER BY created_at, id"),
      assignments: await rows<TripLodgingNight>("SELECT trip_id, member_id, date::text, stay_id, status FROM trip_member_lodging_nights WHERE trip_id = $1"),
      attendance: await rows<TripMemberAttendance>("SELECT trip_id, member_id, arrival_date::text, departure_date::text, skipped_dates::text[] FROM trip_member_attendance WHERE trip_id = $1"),
      per_member: true,
    };
    return { trip, members, lodging };
  };
  const sorted = <T,>(list: T[]) => list.map((entry) => JSON.stringify(entry, Object.keys(entry as object).sort())).sort();
  const save = (id: string, name: string, checkIn: string | null, checkOut: string | null, existing: boolean, occupants?: string[]): LodgingChange =>
    ({ action: "save", existing, ...(occupants ? { occupants } : {}), stay: { id, name, check_in: checkIn, check_out: checkOut, type: null, address: null, property_url: null,
      check_in_time: null, check_out_time: null, notes: null, booking_status: "not_booked" } });

  it("saves exactly what the preview showed, asking to replace exactly when it said so", async () => {
    const steps: LodgingChange[] = [
      save(pine, "Pine rental", FRI, SUN, false),
      save(village, "Village hotel", FRI, SUN, false, [eli, fran]),
      { action: "attendance", member_id: casey, attendance: { arrival_date: SAT, departure_date: null, skipped_dates: [SAT] } },
      { action: "assign", assignments: [{ member_id: casey, status: "assigned", stay_id: pine }] },
      { action: "assign", assignments: [{ member_id: blair, status: "assigned", stay_id: village, dates: [SAT] }, { member_id: dana, status: "unplanned", dates: [FRI] }] },
      save(pine, "Pine rental", FRI, MON, true),
      { action: "night", date: SUN, status: "no_stay" },
      { action: "attendance", member_id: dana, attendance: { arrival_date: null, departure_date: SUN, skipped_dates: [] } },
      save(lodge, "Mountain lodge", SUN, "2026-10-13", false),
      save(pine, "Pine rental", SAT, MON, true, [alex, casey]),
      { action: "remove", id: village },
      { action: "night", date: THU, status: "unplanned" },
      { action: "attendance", member_id: casey, attendance: { arrival_date: null, departure_date: null, skipped_dates: [] } },
    ];
    const replaced: number[] = [];
    for (const [index, change] of steps.entries()) {
      const before = await load();
      expect(crewKey(before.members)).toBe(await peopleKey());
      const applied = applyLodgingChange(before.trip, before.lodging, before.members, change);
      if ("error" in applied) throw new Error(`Step ${index}: ${applied.error}`);
      const replace = applied.conflicts.size > 0;
      if (replace) replaced.push(index);
      if (replace) expect(await code(mutate(before.trip.lodging_revision!, change.action, lodgingPayload(change)))).toBe("23P01");
      await mutate(before.trip.lodging_revision!, change.action, lodgingPayload(change), { replace });
      const after = await load();
      expect(sorted(after.lodging.assignments), `step ${index}`).toEqual(sorted(applied.assignments));
      expect(sorted(after.lodging.attendance), `step ${index}`).toEqual(sorted(applied.attendance));
    }
    // Eli moving hotels, Casey's Friday, Blair's move, a crew night over stays, Dana leaving, the lodge and the rental's new occupants.
    expect(replaced).toEqual([1, 2, 4, 6, 7, 8, 9]);
  });
});
