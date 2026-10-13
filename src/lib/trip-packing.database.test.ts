// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { packingSources, deriveTripPacking, emptyPacking } from "@/lib/trip-packing";
import { savedOutfit } from "@/test/savedKit";
import type { TripFull } from "@/types/trips";
import type { TripPackingSnapshot } from "@/types/trip-packing";

let db: PGlite;
let full: TripFull;
let member: string;
const trip = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const migration = "supabase/migrations/20261012234903_trip_packing_requirements.sql";
async function apply(revision = 0, user = "user-1", options: Partial<TripPackingSnapshot> = {}, sources = packingSources(full, member)) {
  const snapshot = { ...emptyPacking, ...options };
  const requirements = deriveTripPacking(full, member, snapshot.manual_items, snapshot.quantities);
  const result = await db.query<{ result: TripPackingSnapshot }>("SELECT public.apply_trip_packing($1,$2,$3,$4,$5,$6,$7) AS result",
    [trip, user, revision, JSON.stringify(sources), JSON.stringify(requirements), JSON.stringify(snapshot.manual_items), JSON.stringify(snapshot.quantities)]);
  return result.rows[0].result;
}

describe("personal packing transaction", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    await db.exec(await readFile("supabase/migrations/012_trips.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/016_atomic_trip_creation.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/018_trip_saved_kits.sql", "utf8"));
    await db.exec(await readFile(migration, "utf8"));
  }, 20_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query("INSERT INTO trips(id, owner_user_id, name, start_date, end_date) VALUES($1,'user-1','Ski weekend','2026-10-10','2026-10-12')", [trip]);
    await db.query("INSERT INTO trip_members(trip_id,user_id,display_name,role,status) VALUES($1,'user-1','You','organizer','joined'),($1,'user-2','Sam','member','joined'),($1,'user-3','Lee','member','left')", [trip]);
    await db.query("INSERT INTO trip_days(trip_id,date,activity) VALUES($1,'2026-10-10','Alpine'),($1,'2026-10-11','Alpine'),($1,'2026-10-12','Alpine')", [trip]);
    member = (await db.query<{ id: string }>("SELECT id FROM trip_members WHERE user_id = 'user-1'")).rows[0].id;
    await db.query("INSERT INTO trip_member_day_kits(trip_day_id,trip_member_id,outfit) SELECT id,$1,$2 FROM trip_days", [member, JSON.stringify(savedOutfit())]);
    full = {
      trip: (await db.query("SELECT *,start_date::text,end_date::text FROM trips")).rows[0] as TripFull["trip"],
      days: (await db.query("SELECT d.*,d.date::text FROM trip_days d ORDER BY d.date")).rows as TripFull["days"],
      kits: (await db.query("SELECT * FROM trip_member_day_kits")).rows as TripFull["kits"],
      members: [], gear: [], stops: [],
    };
  });
  afterAll(async () => { await db?.close(); });

  it("persists requirements and manual quantities for reload, replaying a lost response", async () => {
    const edits = { manual_items: [{ id: "manual-1", name: "Socks", quantity: 3 }], quantities: { '["owned","g-3"]': 2 } };
    const first = await apply(0, "user-1", edits);
    expect(first.revision).toBe(1);
    expect(first.requirements.find(i => i.name === "Ski shell")?.quantity).toBe(2);
    expect(await apply(0, "user-1", edits)).toEqual(first);
    const reloaded = (await db.query<{ requirements: unknown }>("SELECT requirements FROM trip_member_packing WHERE trip_member_id = $1", [member])).rows[0];
    expect(reloaded.requirements).toEqual(first.requirements);
  });
  it("refuses another session's stale revision without losing manual additions", async () => {
    const first = await apply();
    await apply(1, "user-1", { manual_items: [{ id: "manual-1", name: "Water", quantity: 1 }] });
    await expect(apply(1, "user-1", { quantities: { '["owned","g-3"]': 4 } })).rejects.toMatchObject({ code: "40001" });
    expect(first.revision).toBe(1);
    expect((await db.query<{ manual_items: unknown }>("SELECT manual_items FROM trip_member_packing")).rows[0].manual_items).toEqual([{ id: "manual-1", name: "Water", quantity: 1 }]);
  });
  it("rejects a kit replaced after review and keeps the existing list", async () => {
    await apply();
    await db.query("UPDATE trip_member_day_kits SET outfit = $1 WHERE id = $2", [JSON.stringify(savedOutfit({ edited: true })), full.kits[0].id]);
    await expect(apply(1)).rejects.toMatchObject({ code: "40001" });
    expect((await db.query<{ revision: number }>("SELECT revision FROM trip_member_packing")).rows[0].revision).toBe(1);
  });
  it("rejects changed dates, added/removed days and cross-member source signatures", async () => {
    const old = packingSources(full, member);
    await db.query("UPDATE trip_days SET date = '2026-10-13' WHERE date = '2026-10-12'");
    await expect(apply(0, "user-1", {}, old)).rejects.toMatchObject({ code: "40001" });
    await expect(apply(0, "user-2", {}, old)).rejects.toMatchObject({ code: "40001" });
    expect((await db.query("SELECT * FROM trip_member_packing")).rows).toEqual([]);
  });
  it.each(["outsider", "user-3"])("denies %s without exposing another member's data", async user => {
    await expect(apply(0, user)).rejects.toMatchObject({ code: "42501" });
  });
  it("keeps packing private from public API roles and deletes it with its member", async () => {
    await apply();
    for (const role of ["anon", "authenticated"]) {
      const permissions = (await db.query("SELECT has_table_privilege($1,'public.trip_member_packing','SELECT') AS reads, has_function_privilege($1,'public.apply_trip_packing(uuid,text,integer,jsonb,jsonb,jsonb,jsonb)','EXECUTE') AS writes", [role])).rows[0];
      expect(permissions).toEqual({ reads: false, writes: false });
    }
    await db.query("DELETE FROM trip_members WHERE id=$1", [member]);
    expect((await db.query("SELECT * FROM trip_member_packing")).rows).toEqual([]);
  });
});
