// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const tripId = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";
const otherTrip = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
let db: PGlite;

type Row = { trip_member_id: string; trip_id: string; items: Array<{ id: string; name: string; quantity: number }>; quantities: Record<string, number>; seen: object | null; checks: Record<string, { packed: boolean; quantity: number; version: string }>; equipment: Record<string, { status: string; quantity: number }> };

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
    await db.exec(await readFile("supabase/migrations/20261016231848_trip_personal_packing_checks.sql", "utf8"));
    // Every test here runs against 032's function, which replaces 20261016231848's.
    await db.exec(await readFile("supabase/migrations/032_trip_touring_equipment.sql", "utf8"));
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

  const check = async (key = "item:g-3", overrides: Record<string, unknown> = {}, user = "user-1") => update({
    op: "set_packed", key, packed: true, quantity: 1, expected: null, mutation: randomUUID(),
    kits: await kitVersions(await memberId(user === "user-1" ? "Ana" : "You")), aliases: [], ...overrides,
  }, user);

  it("persists checks for a fresh read and merges different items from two sessions", async () => {
    await Promise.all([check("item:g-3"), check("carry:snacks")]);
    const row = (await db.query<Row>("SELECT * FROM trip_member_packing WHERE trip_member_id = $1", [await memberId("Ana")])).rows[0];
    expect(row.checks).toEqual({ "item:g-3": { packed: true, quantity: 1, version: expect.any(String) },
      "carry:snacks": { packed: true, quantity: 1, version: expect.any(String) } });
    // Regenerated labels/order and an acknowledgement never rewrite checks.
    await db.query("UPDATE trip_member_day_kits SET outfit = '{\"version\":1,\"renamed\":true}' WHERE trip_member_id = $1", [await memberId("Ana")]);
    expect((await update({ op: "acknowledge", seen: {}, kits: await kitVersions(await memberId("Ana")) })).checks).toEqual(row.checks);
    await check("item:g-3", {}, "user-2");
    const other = (await db.query<Row>("SELECT * FROM trip_member_packing WHERE trip_member_id = $1", [await memberId("You")])).rows[0];
    expect(Object.keys(other.checks)).toEqual(["item:g-3"]);
  });

  it("replays a lost response but refuses stale edits and ABA updates to the same item", async () => {
    const mutation = randomUUID();
    const first = await check("item:g-3", { mutation });
    expect((await check("item:g-3", { mutation })).checks).toEqual(first.checks);
    expect(await code(check("item:g-3", { packed: false }))).toBe("P0409");
    const unchecked = await check("item:g-3", { packed: false, expected: mutation });
    expect(unchecked.checks["item:g-3"].packed).toBe(false);
    expect(await code(check("item:g-3", { expected: mutation }))).toBe("P0409");
    expect(await code(check("item:g-3", { mutation }))).toBe("P0409");
    expect(await code(check("item:g-3", { mutation: unchecked.checks["item:g-3"].version, packed: true }))).toBe("22023");
  });

  it("requires a fresh check after quantities change, even if the old quantity returns", async () => {
    const first = await check();
    const changed = await update({ op: "quantity", key: "item:g-3", quantity: 2 });
    expect(changed.checks["item:g-3"]).toMatchObject({ packed: false, quantity: 2 });
    expect(changed.checks["item:g-3"].version).not.toBe(first.checks["item:g-3"].version);
    expect(await code(check("item:g-3", { expected: first.checks["item:g-3"].version }))).toBe("P0409");
    await update({ op: "quantity", key: "item:g-3", quantity: 1 });
    const current = (await db.query<Row>("SELECT * FROM trip_member_packing")).rows[0];
    expect(current.checks["item:g-3"].packed).toBe(false);
    await check("item:g-3", { expected: current.checks["item:g-3"].version });
    await update({ op: "quantity", key: "general:torso:outer:shell", quantity: 3 });
    expect(await code(check("item:new", { aliases: ["general:torso:outer:shell"] }))).toBe("P0409");
    expect((await check("item:new", { aliases: ["general:torso:outer:shell"], quantity: 3 })).checks["item:new"].packed).toBe(true);
  });

  it("checks all of a personal addition, resets on quantity change, and removes its check with it", async () => {
    const id = randomUUID();
    await update({ op: "add_item", id, name: "Socks", quantity: 2 });
    const row = await check(`manual:${id}`, { quantity: 2 });
    expect(row.checks[`manual:${id}`].packed).toBe(true);
    expect((await update({ op: "item_quantity", id, quantity: 3 })).checks[`manual:${id}`]).toMatchObject({ packed: false, quantity: 3 });
    expect((await update({ op: "remove_item", id })).checks).toEqual({});
    expect(await code(check(`manual:${id}`))).toBe("P0002");
    await update({ op: "add_item", id, name: "Socks", quantity: 1 });
    expect((await db.query<Row>("SELECT * FROM trip_member_packing")).rows[0].checks).toEqual({});
  });

  it.each([false, true])("rejects a stale first check after a quantity cycle (manual: %s)", async (manual) => {
    const id = randomUUID();
    const key = manual ? `manual:${id}` : "item:g-3";
    if (manual) await update({ op: "add_item", id, name: "Socks", quantity: 1 });
    const quantity = (value: number) => update(manual
      ? { op: "item_quantity", id, quantity: value }
      : { op: "quantity", key, quantity: value });
    // Session A saw an untouched, unchecked item at quantity 1.
    const stale = { expected: null, mutation: randomUUID(), quantity: 1 };
    // Session B changes the quantity and then restores it before A saves.
    const changed = await quantity(2);
    expect(changed.checks[key]).toMatchObject({ packed: false, quantity: 2, version: expect.any(String) });
    const restored = await quantity(1);
    expect(restored.checks[key]).toMatchObject({ packed: false, quantity: 1, version: expect.any(String) });
    expect(restored.checks[key].version).not.toBe(changed.checks[key].version);
    expect(await code(check(key, stale))).toBe("P0409");
    expect((await check(key, { expected: restored.checks[key].version })).checks[key].packed).toBe(true);
  });

  it.each([false, true])("keeps an untouched item's version absent when its quantity is unchanged (manual: %s)", async (manual) => {
    const id = randomUUID();
    if (manual) await update({ op: "add_item", id, name: "Socks", quantity: 1 });
    const row = await update(manual ? { op: "item_quantity", id, quantity: 1 } : { op: "quantity", key: "item:g-3", quantity: 1 });
    expect(row.checks).toEqual({});
    const key = manual ? `manual:${id}` : "item:g-3";
    const checked = await check(key);
    const unchanged = await update(manual ? { op: "item_quantity", id, quantity: 1 } : { op: "quantity", key, quantity: 1 });
    expect(unchanged.checks).toEqual(checked.checks);
  });

  it("rejects a check when an outfit changed since it was shown", async () => {
    const kits = await kitVersions(await memberId("Ana"));
    await db.query("UPDATE trip_member_day_kits SET outfit = '{\"changed\": true}' WHERE id = $1", [Object.keys(kits)[0]]);
    expect(await code(check("item:g-3", { kits }))).toBe("40001");
    expect((await db.query("SELECT count(*)::int AS n FROM trip_member_packing")).rows[0]).toEqual({ n: 0 });
  });

  it.each([
    { packed: "true" }, { expected: "invalid" }, { mutation: null }, { quantity: 0 }, { key: "" }, { kits: [] }, { aliases: null },
  ])("rejects an invalid packing check %j", async (overrides) => {
    expect(await code(check("item:g-3", overrides))).toBe("22023");
  });

  it("adds touring equipment once, however often it's added", async () => {
    await update({ op: "add_equipment", ids: ["transceiver", "probe", "transceiver"] });
    const row = await update({ op: "add_equipment", ids: ["transceiver", "shovel"] });
    expect(row.equipment).toEqual({
      transceiver: { status: "added", quantity: 1 }, probe: { status: "added", quantity: 1 }, shovel: { status: "added", quantity: 1 },
    });
    // Another member's list is their own.
    expect((await update({ op: "add_equipment", ids: ["airbag"] }, "user-2")).equipment).toEqual({ airbag: { status: "added", quantity: 1 } });
    expect((await db.query<Row>("SELECT * FROM trip_member_packing WHERE trip_member_id = $1", [await memberId("Ana")])).rows[0].equipment)
      .toEqual(row.equipment);
  });

  it("checks equipment by its exact key, resets on quantity change, and drops the check when it's removed", async () => {
    await update({ op: "add_equipment", ids: ["transceiver"] });
    const key = "equipment:transceiver";
    expect((await check(key)).checks[key]).toMatchObject({ packed: true, quantity: 1 });
    // A stale quantity is refused, and a new one needs a fresh check.
    expect(await code(check(key, { quantity: 2 }))).toBe("P0409");
    const changed = await update({ op: "equipment_quantity", id: "transceiver", quantity: 2 });
    expect(changed.equipment.transceiver).toEqual({ status: "added", quantity: 2 });
    expect(changed.checks[key]).toMatchObject({ packed: false, quantity: 2 });
    expect((await check(key, { quantity: 2, expected: changed.checks[key].version })).checks[key].packed).toBe(true);
    // An unchanged quantity keeps the check.
    expect((await update({ op: "equipment_quantity", id: "transceiver", quantity: 2 })).checks[key].packed).toBe(true);

    const removed = await update({ op: "remove_equipment", id: "transceiver" });
    expect(removed.equipment.transceiver).toEqual({ status: "removed", quantity: 2 });
    expect(removed.checks).toEqual({});
    expect(await code(check(key))).toBe("P0002");
    expect(await code(update({ op: "equipment_quantity", id: "transceiver", quantity: 1 }))).toBe("P0002");
    // Removing again, or removing one that was never added, changes nothing.
    expect((await update({ op: "remove_equipment", id: "transceiver" })).equipment).toEqual(removed.equipment);
    expect((await update({ op: "remove_equipment", id: "probe" })).equipment).toEqual(removed.equipment);

    // Added back, it starts again at one, unchecked.
    const back = await update({ op: "add_equipment", ids: ["transceiver"] });
    expect(back.equipment.transceiver).toEqual({ status: "added", quantity: 1 });
    expect(back.checks).toEqual({});
  });

  it("refuses a check for equipment that was never added", async () => {
    expect(await code(check("equipment:probe"))).toBe("P0002");
  });

  it.each([
    { op: "add_equipment" }, { op: "add_equipment", ids: [] }, { op: "add_equipment", ids: "transceiver" },
    { op: "add_equipment", ids: ["Transceiver"] }, { op: "add_equipment", ids: [1] }, { op: "add_equipment", ids: ["a b"] },
    { op: "add_equipment", ids: Array.from({ length: 21 }, (_, index) => `item_${index}`) },
    { op: "equipment_quantity", id: "transceiver", quantity: 0 }, { op: "equipment_quantity", id: "../x", quantity: 1 },
    { op: "remove_equipment", id: "" }, { op: "remove_equipment", id: "x".repeat(41) },
  ])("refuses an invalid equipment change %j", async (op) => {
    expect(await code(update(op))).toBe("22023");
  });

  it("caps touring equipment at 50 kinds of item", async () => {
    for (let start = 0; start < 50; start += 10) {
      await update({ op: "add_equipment", ids: Array.from({ length: 10 }, (_, index) => `item_${start + index}`) });
    }
    expect(await code(update({ op: "add_equipment", ids: ["one_more"] }))).toBe("22023");
    // Adding one that's in the list already is still fine.
    expect(Object.keys((await update({ op: "add_equipment", ids: ["item_0"] })).equipment)).toHaveLength(50);
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
