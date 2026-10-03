// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Trip } from "@/types/trips";

const id = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
let db: PGlite;
const create = async (owner = "user-1", destination: object | null = { name: "Stowe", latitude: 44.47, longitude: -72.69 }, activity: string | null = "Alpine") => {
  const result = await db.query<{ result: { trip: Trip; created: boolean } }>("SELECT public.create_trip_draft($1, $2, 'Ski weekend', '2026-10-10', '2026-10-12', 'planning', $3, $4) AS result", [id, owner, destination && JSON.stringify(destination), activity]);
  return result.rows[0].result;
};
const counts = async () => (await db.query("SELECT (SELECT count(*)::int FROM trips) AS trips, (SELECT count(*)::int FROM trip_stops) AS stops, (SELECT count(*)::int FROM trip_days) AS days, (SELECT count(*)::int FROM trip_members) AS members")).rows[0];

describe("Trip creation transaction in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    await db.exec(await readFile("supabase/migrations/012_trips.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/016_atomic_trip_creation.sql", "utf8"));
  }, 20_000);
  beforeEach(async () => { await db.exec("TRUNCATE public.trips CASCADE;"); });
  afterAll(async () => { await db?.close(); });

  it("commits one solo trip with its destination, assigned days, activity and organizer", async () => {
    expect((await create()).created).toBe(true);
    expect(await counts()).toEqual({ trips: 1, stops: 1, days: 3, members: 1 });
    const days = (await db.query<{ date: string; activity: string | null; stop_id: string | null }>("SELECT date::text, activity, stop_id FROM trip_days ORDER BY date")).rows;
    expect(days.map((d) => d.date)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
    expect(days.every((d) => d.activity === "Alpine" && d.stop_id)).toBe(true);
    expect((await db.query("SELECT user_id, role, status FROM trip_members")).rows).toEqual([{ user_id: "user-1", role: "organizer", status: "joined" }]);
  });
  it("returns one trip for repeated requests and never overwrites later changes", async () => {
    await create(); await db.exec("UPDATE trips SET name = 'Renamed later';");
    const replay = await create(); expect(replay.created).toBe(false); expect(replay.trip.name).toBe("Renamed later");
    expect(await counts()).toEqual({ trips: 1, stops: 1, days: 3, members: 1 });
  });
  it("rejects reuse by another account", async () => {
    await create(); await expect(create("user-2")).rejects.toMatchObject({ code: "42501" });
    expect(await counts()).toEqual({ trips: 1, stops: 1, days: 3, members: 1 });
  });
  it("rolls back the trip, stop and days if the organizer save fails, then safely retries", async () => {
    await db.exec("ALTER TABLE trip_members ADD CONSTRAINT simulate_failure CHECK (user_id <> 'fail-user');");
    try { await expect(create("fail-user")).rejects.toMatchObject({ code: "23514" }); expect(await counts()).toEqual({ trips: 0, stops: 0, days: 0, members: 0 }); }
    finally { await db.exec("ALTER TABLE trip_members DROP CONSTRAINT simulate_failure;"); }
    expect((await create("fail-user")).created).toBe(true);
  });
  it("allows older date-only drafts and leaves optional activities unresolved", async () => {
    await create("user-1", null, null); expect(await counts()).toEqual({ trips: 1, stops: 0, days: 3, members: 1 });
    expect((await db.query<{ stop_id: string | null; activity: string | null }>("SELECT stop_id, activity FROM trip_days")).rows.every((day) => day.stop_id === null && day.activity === null)).toBe(true);
  });
  it("grants RPC execution only to the service role", async () => {
    const signature = "public.create_trip_draft(uuid,text,text,date,date,public.trip_status,jsonb,text)";
    const result = await db.query("SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon, has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated, has_function_privilege('service_role', $1, 'EXECUTE') AS service", [signature]);
    expect(result.rows[0]).toEqual({ anon: false, authenticated: false, service: true });
  });
});
