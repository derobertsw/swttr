// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createAccountDeletionDatabase, DELETED, OTHER, OWNED_TRIP, rowsMentioning, seedAccounts, SHARED_IDS, SHARED_TRIP, snapshot, traces,
} from "@/test/accountDeletionDb";

const deleteUserData = async (db: PGlite, userId: string | null) =>
  (await db.query<{ result: Record<string, number> }>("SELECT public.delete_user_data($1) AS result", [userId])).rows[0].result;
const rows = async <T,>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const ANONYMOUS = "deleted-account";

describe("delete_user_data in Postgres", () => {
  let db: PGlite;
  beforeAll(async () => { db = await createAccountDeletionDatabase(); }, 60_000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec(`TRUNCATE trips, user_preferences, user_wardrobe, user_item_mappings, user_custom_items, trip_kit_saves CASCADE;`);
    await seedAccounts(db);
  });

  it("leaves no trace of the account anywhere in the app's tables", async () => {
    expect((await traces(db, DELETED)).length).toBeGreaterThan(20);
    await deleteUserData(db, DELETED);
    expect(await traces(db, DELETED)).toEqual([]);
  });

  it("deletes their account data and trips, and their place on other trips, and says how much", async () => {
    expect(await deleteUserData(db, DELETED)).toEqual({
      trips: 1, trip_memberships: 1, trip_conditions_reviews: 1, trip_kit_saves: 1,
      // Two shared gear items, the guest's day check, the tour plan, the conditions
      // source and its day link, the manual drive estimate and the organizer's starting point.
      trip_rows_anonymized: 8,
      user_preferences: 1, user_wardrobe: 2, user_item_mappings: 1, user_custom_items: 1,
    });
    expect(await rows(db, "SELECT id FROM trips")).toEqual([{ id: SHARED_TRIP }]);
    expect(await rows(db, "SELECT display_name FROM trip_members ORDER BY display_name")).toEqual([{ display_name: "Gus" }, { display_name: "You" }]);
  });

  it("deletes their own trip for its whole crew", async () => {
    await deleteUserData(db, DELETED);
    for (const table of ["trip_members", "trip_days", "trip_stops", "trip_group_gear", "trip_day_tour_plans", "trip_conditions_sources",
      "trip_conditions_reviews", "trip_member_packing"]) {
      expect(await rows(db, `SELECT 1 FROM ${table} WHERE trip_id = $1`, [OWNED_TRIP]), table).toEqual([]);
    }
    // The crew member's receipt for a save to it outlives it, as when the organizer deletes a trip (019).
    expect(await rows(db, "SELECT trip_id, result FROM trip_kit_saves WHERE user_id = $1 AND input_hash = 'h1'", [OTHER]))
      .toEqual([{ trip_id: null, result: null }]);
  });

  it("removes them from someone else's trip as the organizer removing them would", async () => {
    await deleteUserData(db, DELETED);
    const crew = SHARED_IDS.sharedCrew;
    for (const [table, column] of [["trip_member_day_kits", "trip_member_id"], ["trip_member_packing", "trip_member_id"],
      ["trip_day_checks", "trip_member_id"], ["trip_member_attendance", "member_id"], ["trip_member_lodging_nights", "member_id"],
      ["trip_member_day_origins", "member_id"], ["trip_nudges", "sender_member_id"]]) {
      expect(await rows(db, `SELECT 1 FROM ${table} WHERE ${column} = $1`, [crew]), table).toEqual([]);
    }
    // The gear they were bringing goes back to the organizer to reassign.
    const [stove] = await rows<{ assignee_member_id: string | null; assigned_by: string; accepted_by: string | null; packed_by: string | null;
      events: { action: string; actor: string | null }[] }>(db, "SELECT * FROM trip_group_gear WHERE id = $1", [SHARED_IDS.gearTheyBring]);
    expect(stove).toMatchObject({ assignee_member_id: null, assigned_by: OTHER, accepted_by: null, packed_by: null });
    expect(stove.events.map(({ action, actor }) => [action, actor])).toEqual([
      ["assign", ANONYMOUS], ["accept", ANONYMOUS], ["pack", ANONYMOUS], ["member_removed", OTHER],
    ]);
    // The crew's own rows stay.
    expect(await rows(db, "SELECT note FROM trip_conditions_reviews")).toEqual([{ note: "Considerable above treeline" }]);
    expect(await rows(db, "SELECT kind FROM trip_day_checks ORDER BY kind")).toEqual([{ kind: "plan_review" }, { kind: "transceiver" }]);
    expect(await rows(db, "SELECT count(*)::int AS n FROM trip_member_lodging_nights")).toEqual([{ n: 1 }]);
  });

  it("keeps the crew's records of what they did, without their ID", async () => {
    await deleteUserData(db, DELETED);
    const [rope] = await rows<{ assignee_member_id: string; assigned_by: string; accepted_by: string; revision: string;
      events: { action: string; actor: string }[] }>(db, "SELECT * FROM trip_group_gear WHERE id = $1", [SHARED_IDS.gearTheyAdded]);
    expect(rope).toMatchObject({ assignee_member_id: SHARED_IDS.sharedOrganizer, assigned_by: OTHER, accepted_by: OTHER });
    expect(rope.events.map(({ action, actor }) => [action, actor])).toEqual([["create", ANONYMOUS], ["assign", OTHER], ["accept", OTHER]]);
    expect(await rows(db, "SELECT trip_member_id, recorded_by FROM trip_day_checks WHERE trip_member_id = $1", [SHARED_IDS.sharedGuest]))
      .toEqual([{ trip_member_id: SHARED_IDS.sharedGuest, recorded_by: ANONYMOUS }]);
    expect(await rows(db, "SELECT created_by, updated_by FROM trip_day_tour_plans")).toEqual([{ created_by: OTHER, updated_by: ANONYMOUS }]);
    expect(await rows(db, "SELECT created_by, updated_by FROM trip_conditions_sources")).toEqual([{ created_by: OTHER, updated_by: ANONYMOUS }]);
    expect(await rows(db, "SELECT added_by FROM trip_day_conditions_sources")).toEqual([{ added_by: ANONYMOUS }]);
    expect(await rows(db, "SELECT entered_by FROM trip_drive_manual_estimates")).toEqual([{ entered_by: ANONYMOUS }]);
    expect(await rows(db, "SELECT member_id, updated_by FROM trip_member_day_origins"))
      .toEqual([{ member_id: SHARED_IDS.sharedOrganizer, updated_by: ANONYMOUS }]);
  });

  it("leaves the other account's own data and its trip alone", async () => {
    const before = await rowsMentioning(db, OTHER);
    const sharedBefore = await rows(db, "SELECT to_jsonb(t) AS row FROM trip_stays t WHERE trip_id = $1", [SHARED_TRIP]);
    await deleteUserData(db, DELETED);
    const after = await rowsMentioning(db, OTHER);
    for (const table of ["user_preferences", "user_wardrobe", "user_item_mappings", "user_custom_items", "trips"]) {
      expect(after[table], table).toBe(before[table]);
    }
    // Only the deleted account's trip took the other account's rows with it.
    expect(before.trip_members - after.trip_members).toBe(1);
    expect(await rows(db, "SELECT to_jsonb(t) AS row FROM trip_stays t WHERE trip_id = $1", [SHARED_TRIP])).toEqual(sharedBefore);
  });

  it("does nothing the second time, or for an account with no data", async () => {
    await deleteUserData(db, DELETED);
    const before = await snapshot(db);
    const zero = { trips: 0, trip_memberships: 0, trip_conditions_reviews: 0, trip_kit_saves: 0, trip_rows_anonymized: 0,
      user_preferences: 0, user_wardrobe: 0, user_item_mappings: 0, user_custom_items: 0 };
    expect(await deleteUserData(db, DELETED)).toEqual(zero);
    expect(await deleteUserData(db, "user_2NeverSeen000000000000000")).toEqual(zero);
    expect(await snapshot(db)).toEqual(before);
  });

  it.each([null, "", "user-6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f", "deleted-account", "user_%", "user_ab cd"])(
    "refuses %j, which isn't a Clerk user ID, and changes nothing", async (userId) => {
      const before = await snapshot(db);
      await expect(deleteUserData(db, userId)).rejects.toMatchObject({ code: "22023" });
      expect(await snapshot(db)).toEqual(before);
    });

  it("is only for the service role", async () => {
    const grants = await rows<{ grantee: string }>(db, `SELECT grantee FROM information_schema.routine_privileges
      WHERE routine_schema = 'public' AND routine_name = 'delete_user_data' ORDER BY grantee`);
    expect(grants.map(({ grantee }) => grantee)).not.toContain("anon");
    expect(grants.map(({ grantee }) => grantee)).not.toContain("authenticated");
    expect(grants.map(({ grantee }) => grantee)).toContain("service_role");
  });
});

describe("delete_user_data on prod's schema, before its newer trip migrations", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createAccountDeletionDatabase({ prodLike: true });
    await seedAccounts(db);
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it("still deletes everything that names the account", async () => {
    expect(await rows(db, "SELECT to_regclass('public.trip_member_day_origins') AS t")).toEqual([{ t: null }]);
    expect(await deleteUserData(db, DELETED)).toMatchObject({ trips: 1, trip_memberships: 1, trip_rows_anonymized: 7 });
    expect(await traces(db, DELETED)).toEqual([]);
  });
});
