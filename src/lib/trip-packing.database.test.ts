// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const tripId = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";
const otherTrip = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
let db: PGlite;

type Row = { trip_member_id: string; trip_id: string; items: Array<{ id: string; name: string; quantity: number }>; quantities: Record<string, number>; seen: object | null };

async function update(op: object, user = "user-1", trip = tripId): Promise<Row> {
  const result = await db.query<{ row: Row }>("SELECT public.update_trip_packing($1, $2, $3) AS row", [trip, user, JSON.stringify(op)]);
  return result.rows[0].row;
}
async function code(promise: Promise<unknown>): Promise<string | undefined> {
  try { await promise; return undefined; } catch (error) { return (error as { code?: string }).code; }
}
const memberId = async (name: string) => (await db.query<{ id: string }>("SELECT id FROM trip_members WHERE display_name = $1 AND trip_id = $2", [name, tripId])).rows[0].id;
const kitVersions = async (member: string) => Object.fromEntries((await db.query<{ id: string; at: string }>(
  "SELECT k.id, to_jsonb(k.updated_at)#>>'{}' AS at FROM trip_member_day_kits k WHERE k.trip_member_id = $1 AND (k.outfit IS NOT NULL OR jsonb_array_length(k.items) > 0)", [member]
)).rows.map((row) => [row.id, row.at]));

describe("A member's own packing choices in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;");
    await db.exec(await readFile("supabase/migrations/012_trips.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/018_trip_saved_kits.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/024_trip_packing.sql", "utf8"));
  }, 20_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    // A crew trip organized by user-2, which user-1 joined, plus a guest and a member who left; and a trip user-1 isn't on.
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-2', 'Crew weekend', '2026-10-10', '2026-10-11'), ($2, 'user-4', 'Other', '2026-10-10', '2026-10-11')", [tripId, otherTrip]);
    await db.query("INSERT INTO trip_members (trip_id, user_id, display_name, role, status) VALUES ($1, 'user-2', 'You', 'organizer', 'joined'), ($1, 'user-1', 'Ana', 'member', 'joined'), ($1, NULL, 'Sam', 'guest', 'guest'), ($1, 'user-3', 'Lee', 'member', 'left'), ($2, 'user-4', 'Kim', 'organizer', 'joined')", [tripId, otherTrip]);
    await db.query("INSERT INTO trip_days (trip_id, date, activity) VALUES ($1, '2026-10-10', 'Alpine'), ($1, '2026-10-11', 'Alpine')", [tripId]);
    await db.query("INSERT INTO trip_member_day_kits (trip_day_id, trip_member_id, outfit) SELECT d.id, m.id, '{\"version\": 1}'::jsonb FROM trip_days d, trip_members m WHERE d.trip_id = $1 AND m.trip_id = $1 AND m.display_name IN ('Ana', 'You')", [tripId]);
  });
  afterAll(async () => { await db?.close(); });

  it("adds an item by hand once, however often the request is repeated", async () => {
    const id = randomUUID();
    await update({ op: "add_item", id, name: " Headlamp ", quantity: 1 });
    const row = await update({ op: "add_item", id, name: "Headlamp", quantity: 1 });
    expect(row.items).toEqual([{ id, name: "Headlamp", quantity: 1 }]);
    expect(row.trip_member_id).toBe(await memberId("Ana"));
    expect(row.trip_id).toBe(tripId);
  });

  it("changes and removes an item, and says when it's already gone", async () => {
    const [lamp, socks] = [randomUUID(), randomUUID()];
    await update({ op: "add_item", id: lamp, name: "Headlamp", quantity: 1 });
    await update({ op: "add_item", id: socks, name: "Ski socks", quantity: 2 });
    expect((await update({ op: "item_quantity", id: socks, quantity: 3 })).items).toEqual([
      { id: lamp, name: "Headlamp", quantity: 1 }, { id: socks, name: "Ski socks", quantity: 3 },
    ]);
    expect((await update({ op: "remove_item", id: lamp })).items).toEqual([{ id: socks, name: "Ski socks", quantity: 3 }]);
    // Removing again is a no-op; changing a removed item's quantity is refused.
    expect((await update({ op: "remove_item", id: lamp })).items).toHaveLength(1);
    expect(await code(update({ op: "item_quantity", id: lamp, quantity: 2 }))).toBe("P0002");
    expect((await update({ op: "remove_item", id: socks })).items).toEqual([]);
  });

  it("keeps each kit item's chosen quantity, one included", async () => {
    expect((await update({ op: "quantity", key: "item:g-1", quantity: 3 })).quantities).toEqual({ "item:g-1": 3 });
    expect((await update({ op: "quantity", key: "carry:spare gloves", quantity: 2 })).quantities).toEqual({ "item:g-1": 3, "carry:spare gloves": 2 });
    // A chosen 1 is kept, so it overrides an older quantity of an item that joined this one.
    expect((await update({ op: "quantity", key: "item:g-1", quantity: 1 })).quantities).toEqual({ "item:g-1": 1, "carry:spare gloves": 2 });
  });

  it("merges changes from two sessions instead of overwriting either", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    await Promise.all([
      update({ op: "add_item", id: a, name: "Headlamp", quantity: 1 }),
      update({ op: "add_item", id: b, name: "Sunscreen", quantity: 1 }),
      update({ op: "quantity", key: "item:g-1", quantity: 2 }),
    ]);
    const row = (await db.query<Row>("SELECT * FROM trip_member_packing")).rows[0];
    expect(row.items.map((item) => item.name).sort()).toEqual(["Headlamp", "Sunscreen"]);
    expect(row.quantities).toEqual({ "item:g-1": 2 });
  });

  it("records what was acknowledged only while the member's kits are as they were", async () => {
    const ana = await memberId("Ana");
    const seen = { "item:g-1": { name: "Merino crew", dates: ["2026-10-10"], slots: ["2026-10-10:torso:base"] } };
    const kits = await kitVersions(ana);
    expect(Object.keys(kits)).toHaveLength(2);
    expect((await update({ op: "acknowledge", seen, kits })).seen).toEqual(seen);

    // A kit saved since, a missing kit or an extra one: nothing changes.
    await db.query("UPDATE trip_member_day_kits SET outfit = '{\"version\": 1, \"new\": true}' WHERE id = $1", [Object.keys(kits)[0]]);
    expect(await code(update({ op: "acknowledge", seen: {}, kits }))).toBe("40001");
    const now = await kitVersions(ana);
    expect(await code(update({ op: "acknowledge", seen: {}, kits: { [Object.keys(now)[0]]: Object.values(now)[0] } }))).toBe("40001");
    expect(await code(update({ op: "acknowledge", seen: {}, kits: { ...now, [randomUUID()]: "2026-10-01T00:00:00Z" } }))).toBe("40001");
    expect((await db.query<Row>("SELECT seen FROM trip_member_packing")).rows[0].seen).toEqual(seen);

    // A kit on a day outside the trip's dates isn't one of them, as the API reads it.
    await db.query("INSERT INTO trip_days (trip_id, date) VALUES ($1, '2026-10-20')", [tripId]);
    await db.query("INSERT INTO trip_member_day_kits (trip_day_id, trip_member_id, items) SELECT id, $2, '[\"shell\"]' FROM trip_days WHERE trip_id = $1 AND date = '2026-10-20'", [tripId, ana]);
    expect((await update({ op: "acknowledge", seen, kits: now })).seen).toEqual(seen);
    await db.query("DELETE FROM trip_days WHERE trip_id = $1 AND date = '2026-10-20'", [tripId]);

    // Someone else's kit changing doesn't matter; a checklist kit counts.
    await db.query("UPDATE trip_member_day_kits SET outfit = NULL WHERE trip_member_id = $1", [await memberId("You")]);
    await db.query("UPDATE trip_member_day_kits SET outfit = NULL, items = '[\"shell\"]' WHERE id = $1", [Object.keys(now)[0]]);
    expect((await update({ op: "acknowledge", seen: {}, kits: await kitVersions(ana) })).seen).toEqual({});
  });

  it("keeps each member's list to themselves", async () => {
    await update({ op: "add_item", id: randomUUID(), name: "Headlamp", quantity: 1 });
    await update({ op: "add_item", id: randomUUID(), name: "Thermos", quantity: 1 }, "user-2");
    const rows = (await db.query<{ name: string; items: Row["items"] }>(
      "SELECT m.display_name AS name, p.items FROM trip_member_packing p JOIN trip_members m ON m.id = p.trip_member_id ORDER BY m.display_name"
    )).rows;
    expect(rows.map((row) => [row.name, row.items.map((item) => item.name)])).toEqual([["Ana", ["Headlamp"]], ["You", ["Thermos"]]]);
  });

  it.each([
    ["a user who left", "user-3", tripId],
    ["a user on another trip", "user-1", otherTrip],
    ["an unknown user", "user-9", tripId],
  ])("refuses %s", async (_label, user, trip) => {
    expect(await code(update({ op: "add_item", id: randomUUID(), name: "Headlamp", quantity: 1 }, user, trip))).toBe("42501");
    expect((await db.query("SELECT count(*)::int AS n FROM trip_member_packing")).rows[0]).toEqual({ n: 0 });
  });

  it.each([
    [{ op: "wipe" }],
    [{ op: "add_item", id: "not-a-uuid", name: "Headlamp", quantity: 1 }],
    [{ op: "add_item", id: randomUUID(), name: "  ", quantity: 1 }],
    [{ op: "add_item", id: randomUUID(), name: "x".repeat(81), quantity: 1 }],
    [{ op: "add_item", id: randomUUID(), name: "Headlamp", quantity: 0 }],
    [{ op: "add_item", id: randomUUID(), name: "Headlamp", quantity: "2" }],
    [{ op: "quantity", key: "item:g-1", quantity: 21 }],
    [{ op: "quantity", key: "", quantity: 2 }],
    [{ op: "acknowledge", seen: [], kits: {} }],
  ])("refuses an invalid change %j", async (op) => {
    expect(await code(update(op))).toBe("22023");
  });

  it("caps items added by hand at 50", async () => {
    for (let index = 0; index < 50; index += 1) await update({ op: "add_item", id: randomUUID(), name: `Item ${index}`, quantity: 1 });
    expect(await code(update({ op: "add_item", id: randomUUID(), name: "One more", quantity: 1 }))).toBe("22023");
  }, 20_000);

  it("leaves with its member or trip", async () => {
    await update({ op: "add_item", id: randomUUID(), name: "Headlamp", quantity: 1 });
    await db.query("DELETE FROM trip_members WHERE display_name = 'Ana'");
    expect((await db.query("SELECT count(*)::int AS n FROM trip_member_packing")).rows[0]).toEqual({ n: 0 });
    await update({ op: "add_item", id: randomUUID(), name: "Thermos", quantity: 1 }, "user-2");
    await db.query("DELETE FROM trips WHERE id = $1", [tripId]);
    expect((await db.query("SELECT count(*)::int AS n FROM trip_member_packing")).rows[0]).toEqual({ n: 0 });
  });

  it("is only for the service role", async () => {
    const grants = (await db.query<{ grantee: string; privilege_type: string }>(
      "SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = 'trip_member_packing' AND grantee IN ('anon', 'authenticated', 'PUBLIC')"
    )).rows;
    expect(grants).toEqual([]);
    const execute = (await db.query<{ role: string; allowed: boolean }>(
      "SELECT r AS role, has_function_privilege(r, 'public.update_trip_packing(uuid, text, jsonb)', 'EXECUTE') AS allowed FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r"
    )).rows;
    expect(execute).toEqual([{ role: "anon", allowed: false }, { role: "authenticated", allowed: false }, { role: "service_role", allowed: true }]);
    expect((await db.query<{ rls: boolean }>("SELECT relrowsecurity AS rls FROM pg_class WHERE relname = 'trip_member_packing'")).rows[0].rls).toBe(true);
  });
});
