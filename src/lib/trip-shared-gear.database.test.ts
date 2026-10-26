// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sharedTouringGearId } from "@/lib/trip-shared-touring";
import type { TripGroupGear } from "@/types/trips";

let db: PGlite;
const trip = randomUUID(), other = randomUUID();
const owner = randomUUID(), ana = randomUUID(), guest = randomUUID(), invited = randomUUID(), left = randomUUID(), foreign = randomUUID();
async function change(id: string, body: object, user = "owner"): Promise<TripGroupGear> {
  return (await db.query<{ gear: TripGroupGear }>("SELECT public.update_trip_shared_gear($1, $2, $3, $4) AS gear", [trip, user, id, JSON.stringify(body)])).rows[0].gear;
}
const create = (target: string | null = ana, user = "owner", id = randomUUID()) => change(id, { action: "create", description: "Stove", assignee_member_id: target }, user);
const act = (g: TripGroupGear, action: string, user = "ana", extra = {}) => change(g.id, { action, expected_revision: g.revision, ...extra }, user);
const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return (e as { code: string }).code; } };
const read = async (id: string) => (await db.query<TripGroupGear>("SELECT * FROM trip_group_gear WHERE id = $1", [id])).rows[0];

describe("Shared responsibility and physical packing in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;");
    await db.exec(await readFile("supabase/migrations/012_trips.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261018131917_trip_shared_gear_responsibility.sql", "utf8"));
    await db.exec("GRANT USAGE ON SCHEMA public TO service_role; GRANT SELECT, UPDATE ON trips, trip_members TO service_role;");
  }, 20_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE");
    await db.query("INSERT INTO trips(id, owner_user_id, name, start_date, end_date) VALUES ($1, 'owner', 'Crew', '2026-10-10', '2026-10-11'), ($2, 'outsider', 'Other', '2026-10-10', '2026-10-11')", [trip, other]);
    await db.query(`INSERT INTO trip_members(id, trip_id, user_id, display_name, role, status) VALUES
      ($1, $7, 'owner', 'Organizer', 'organizer', 'joined'), ($2, $7, 'ana', 'Ana', 'member', 'joined'),
      ($3, $7, NULL, 'Guest', 'guest', 'guest'), ($4, $7, NULL, 'Invite', 'member', 'invited'),
      ($5, $7, 'departed', 'Left', 'member', 'left'), ($6, $8, 'outsider', 'Other', 'organizer', 'joined')`, [owner, ana, guest, invited, left, foreign, trip, other]);
  });

  it("keeps assignment, recipient acceptance and physically packed confirmation distinct with actors and times", async () => {
    const g = await create();
    expect(g).toMatchObject({ assignee_member_id: ana, assigned_by: "owner", accepted_at: null, packed_at: null });
    expect(g.assigned_at).toBeTruthy();
    expect(await code(act(g, "pack"))).toBe("22023");
    const accepted = await act(g, "accept");
    expect(accepted).toMatchObject({ accepted_by: "ana", packed_at: null });
    expect(accepted.accepted_at).toBeTruthy();
    const packed = await act(accepted, "pack");
    expect(packed).toMatchObject({ accepted_by: "ana", packed_by: "ana" });
    expect(packed.packed_at).toBeTruthy();
    expect(await act(packed, "accept")).toEqual(packed);
    expect(packed.events?.map((e) => e.action)).toEqual(["create", "accept", "pack"]);
    const unpacked = await act(packed, "unpack");
    expect(unpacked).toMatchObject({ accepted_at: accepted.accepted_at, packed_at: null, packed_by: null });
  });

  it("makes self-assignment acceptance, and permits members to volunteer for unassigned gear", async () => {
    expect(await create(ana, "ana")).toMatchObject({ accepted_by: "ana", packed_at: null });
    const empty = await create(null);
    expect(await act(empty, "assign", "ana", { assignee_member_id: ana })).toMatchObject({ assignee_member_id: ana, accepted_by: "ana" });
    expect(await code(create(null, "ana"))).toBe("42501");
    expect(await code(create(guest, "ana"))).toBe("42501");
    const theirs = await create(owner);
    expect(await code(act(theirs, "assign", "ana", { assignee_member_id: ana }))).toBe("42501");
  });

  it("allows only the recipient to accept or decline an account's assignment", async () => {
    const g = await create();
    expect(await code(act(g, "accept", "owner"))).toBe("42501");
    expect(await code(act(g, "decline", "owner"))).toBe("42501");
    const declined = await act(g, "decline");
    expect(declined).toMatchObject({ assignee_member_id: null, accepted_at: null, packed_at: null });
    expect(declined.events?.at(-1)).toMatchObject({ action: "decline", actor: "ana", assignee: ana });
  });

  it("records the organizer as actor only for an explicit managed guest", async () => {
    const g = await create(guest);
    expect(await code(act(g, "accept"))).toBe("42501");
    const accepted = await act(g, "accept", "owner");
    const packed = await act(accepted, "pack", "owner");
    expect(packed).toMatchObject({ assignee_member_id: guest, accepted_by: "owner", packed_by: "owner" });
    expect(await code(act(await create(invited), "accept", "owner"))).toBe("42501");
  });

  it("clears acceptance and packing on reassignment and rejects an old assignee's stale confirmation", async () => {
    const g = await act(await act(await create(), "accept"), "pack");
    const reassigned = await act(g, "assign", "owner", { assignee_member_id: guest });
    expect(reassigned).toMatchObject({ assignee_member_id: guest, accepted_at: null, accepted_by: null, packed_at: null, packed_by: null });
    expect(await code(act(g, "pack"))).toBe("P0409");
    expect(await code(act(reassigned, "accept"))).toBe("42501");
    const cleared = await act(reassigned, "assign", "owner", { assignee_member_id: null });
    expect(cleared.assignee_member_id).toBeNull();
  });

  it("invalidates checks for older API instances that directly reassign or rename gear during rollout", async () => {
    const g = await act(await act(await create(), "accept"), "pack");
    await db.query("UPDATE trip_group_gear SET assignee_member_id = $1 WHERE id = $2", [guest, g.id]);
    const updated = await read(g.id);
    expect(updated).toMatchObject({ assignee_member_id: guest, accepted_at: null, packed_at: null });
    expect(updated.revision).not.toBe(g.revision);
    expect(updated.events?.at(-1)?.action).toBe("legacy_assignment_changed");
    expect(await code(act(g, "pack"))).toBe("P0409");
  });

  it("rejects one of two simultaneous edits, and permits a deliberate retry after reloading", async () => {
    const g = await create();
    const results = await Promise.all([code(act(g, "accept")), code(act(g, "decline"))]);
    expect(results.filter((r) => r === "P0409")).toHaveLength(1);
    const current = await read(g.id);
    expect(current.accepted_by).toBe("ana");
    expect((await act(current, "decline")).assignee_member_id).toBeNull();
  });

  it.each(["delete", "leave"])("releases packed gear atomically when a member is removed (%s)", async (mode) => {
    const g = await act(await act(await create(), "accept"), "pack");
    if (mode === "delete") await db.query("DELETE FROM trip_members WHERE id = $1", [ana]);
    else await db.query("UPDATE trip_members SET status = 'left' WHERE id = $1", [ana]);
    const released = await read(g.id);
    expect(released).toMatchObject({ assignee_member_id: null, accepted_at: null, packed_at: null, assigned_by: "owner" });
    expect(released.events?.at(-1)).toMatchObject({ action: "member_removed", actor: "owner", assignee: ana });
    expect(await code(act(g, "pack"))).toBe("P0002");
  });

  it("rejects outsiders, left members, cross-trip recipients and invalid descriptions", async () => {
    expect(await code(create(ana, "outsider"))).toBe("P0002");
    expect(await code(create(ana, "departed"))).toBe("P0002");
    expect(await code(create(foreign))).toBe("22023");
    expect(await code(create(left))).toBe("22023");
    expect(await code(change(randomUUID(), { action: "create", description: " ", assignee_member_id: null }))).toBe("22023");
  });

  it("retries a creation without duplicates and revision-checks deletion", async () => {
    const id = randomUUID();
    const first = await create(ana, "owner", id);
    expect((await create(ana, "owner", id)).id).toBe(first.id);
    expect((await db.query("SELECT * FROM trip_group_gear")).rows).toHaveLength(1);
    expect(await code(act(first, "delete"))).toBe("42501");
    const accepted = await act(first, "accept");
    expect(await code(act(first, "delete", "owner"))).toBe("P0409");
    await act(accepted, "delete", "owner");
    expect(await read(id)).toBeUndefined();
  });

  it("adds a shared touring item once under its fixed id, and again after it's removed (#212)", async () => {
    const id = sharedTouringGearId(trip, "first_aid");
    const add = () => change(id, { action: "create", description: "First aid kit", assignee_member_id: null });
    const first = await add();
    expect(await add()).toEqual(first);
    const assigned = await act(first, "assign", "owner", { assignee_member_id: ana });
    // Adding it again once it's assigned returns it as it is, without resetting it.
    expect(await add()).toMatchObject({ id, assignee_member_id: ana, revision: assigned.revision });
    expect((await db.query("SELECT * FROM trip_group_gear WHERE trip_id = $1", [trip])).rows).toHaveLength(1);
    await act(assigned, "delete", "owner");
    expect(await add()).toMatchObject({ id, assignee_member_id: null });
  });

  it("denies anon/authenticated direct table and RPC access while the service RPC works", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      expect(await code(db.query("SELECT * FROM public.trip_group_gear"))).toBe("42501");
      expect(await code(create())).toBe("42501");
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE service_role");
    try { expect((await create()).assigned_by).toBe("owner"); } finally { await db.exec("RESET ROLE"); }
  });
});
