// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
let db: PGlite;

const insert = (row: Record<string, unknown>) => {
  const values = { trip_id: tripId, date: "2027-01-09", route_key: "drive|approximated|a>b|none", origin_label: "Stowe Motel",
    destination_label: "Spruce Peak lot", status: "ok", duration_seconds: 720, distance_meters: 9000, provider: "geoapify", ...row };
  const columns = Object.keys(values);
  return db.query(`INSERT INTO trip_drive_estimates (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`, Object.values(values));
};

describe("Stored drive estimates in Postgres (028)", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    for (const migration of ["012_trips", "028_trip_drive_estimates"]) {
      await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
    }
  }, 20_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-1', 'Vermont', '2027-01-08', '2027-01-11')", [tripId]);
  });
  afterAll(async () => { await db.close(); });

  it("keeps one estimate per trip day, replaced in place", async () => {
    await insert({});
    await db.query(`INSERT INTO trip_drive_estimates (trip_id, date, route_key, origin_label, destination_label, status, provider)
      VALUES ($1, '2027-01-09', 'drive|approximated|a>c|none', 'Stowe Motel', 'Johns Brook Lodge', 'no_route', 'geoapify')
      ON CONFLICT (trip_id, date) DO UPDATE SET route_key = EXCLUDED.route_key, destination_label = EXCLUDED.destination_label,
        status = EXCLUDED.status, duration_seconds = NULL, distance_meters = NULL`, [tripId]);
    const { rows } = await db.query("SELECT destination_label, status, duration_seconds FROM trip_drive_estimates");
    expect(rows).toEqual([{ destination_label: "Johns Brook Lodge", status: "no_route", duration_seconds: null }]);
  });
  it.each([
    ["a road route without a time", { duration_seconds: null }],
    ["no road route recorded as zero", { status: "no_route", duration_seconds: 0, distance_meters: 0 }],
    ["a negative time", { duration_seconds: -1 }],
    ["an unknown status", { status: "approximate" }],
    ["an unknown provider", { provider: "google" }],
  ])("refuses %s", async (_, row) => {
    await expect(insert(row)).rejects.toThrow();
  });
  it("goes with its trip", async () => {
    await insert({});
    await db.query("DELETE FROM trips WHERE id = $1", [tripId]);
    expect((await db.query("SELECT count(*)::int AS n FROM trip_drive_estimates")).rows).toEqual([{ n: 0 }]);
  });
  it("is reachable only by the server's service role", async () => {
    const { rows } = await db.query(`SELECT r AS role, has_table_privilege(r, 'public.trip_drive_estimates', 'SELECT') AS allowed
      FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r`);
    expect(rows).toEqual([{ role: "anon", allowed: false }, { role: "authenticated", allowed: false }, { role: "service_role", allowed: true }]);
    expect((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname = 'trip_drive_estimates'")).rows).toEqual([{ relrowsecurity: true }]);
  });
});
