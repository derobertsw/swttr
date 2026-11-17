// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { place } from "@/test/driveTrip";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const otherTrip = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";
const optionId = "3c000000-0000-4000-8000-000000000001";
const stayId = "40f9f55e-0e74-4c4a-923f-d7a3f92468a0";

// The trip migrations as prod has them, then this one.
const CHAIN = ["012_trips", "016_atomic_trip_creation", "017_trip_stays", "018_trip_saved_kits", "021_trip_date_changes", "022_trip_itinerary_edits",
  "023_trip_copy_day", "025_trip_stay_locations", "026_trip_tour_plans", "027_trip_access_points", "028_trip_drive_estimates", "031_trip_conditions",
  "20261020000407_trip_conflicts_no_retry", "20261021201500_trip_attendance_lodging", "20261116200000_trip_stay_candidates"];

async function createDatabase() {
  const db = await PGlite.create();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
  for (const migration of CHAIN) await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
  return db;
}

const RIDGE = place("Ridge chalet", 44.5012, -72.7519);
const option = (fields: Record<string, unknown> = {}) => ({
  id: optionId, name: "Ridge chalet", check_in: "2026-10-09", check_out: "2026-10-11", address: "12 Ridge Rd", property_url: "https://example.com/ridge",
  notes: "Hot tub", location: RIDGE, cost_amount: 840, cost_currency: "USD", expected_revision: null, ...fields,
});

describe("Stay options (#213)", () => {
  let db: PGlite;
  beforeAll(async () => { db = await createDatabase(); }, 30_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-1', 'Weekend', '2026-10-09', '2026-10-11'), ($2, 'other-user', 'Other', '2026-10-09', '2026-10-11')", [tripId, otherTrip]);
  });
  afterAll(async () => { await db?.close(); });

  const mutate = async (action: string, payload: object, { user = "user-1", trip = tripId } = {}) =>
    (await db.query<{ result: Record<string, unknown> }>("SELECT public.mutate_trip_stay_candidate($1, $2, $3, $4) AS result", [trip, user, action, JSON.stringify(payload)])).rows[0].result;
  const saved = async () => (await db.query<Record<string, unknown>>("SELECT id, name, revision, cost_amount::float AS cost, location->>'label' AS place FROM trip_stay_candidates ORDER BY name")).rows;
  const counts = async () => (await db.query<Record<string, number>>(`SELECT
    (SELECT count(*)::int FROM trip_stays) AS stays, (SELECT count(*)::int FROM trip_lodging_nights) AS nights,
    (SELECT count(*)::int FROM trip_member_lodging_nights) AS person_nights, (SELECT lodging_revision FROM trips WHERE id = '${tripId}') AS lodging_revision`)).rows[0];

  it("adds an option without touching stays, nights or the lodging revision", async () => {
    await db.query("INSERT INTO trip_stays (id, trip_id, name, check_in, check_out, booking_status) VALUES ($1, $2, 'Pine rental', '2026-10-09', '2026-10-11', 'booked')", [stayId, tripId]);
    const before = await counts();
    const result = await mutate("save", option());
    expect(result).toMatchObject({ id: optionId, name: "Ridge chalet", revision: 1, cost_amount: 840, cost_currency: "USD", check_in: "2026-10-09" });
    expect(await saved()).toEqual([{ id: optionId, name: "Ridge chalet", revision: 1, cost: 840, place: "Ridge chalet" }]);
    // Overlapping a booked stay's dates is fine: it's only an option.
    expect(await counts()).toEqual(before);
  });

  it("returns the same option for a retried save, and refuses an edit the editor didn't see", async () => {
    await mutate("save", option());
    expect(await mutate("save", option())).toMatchObject({ revision: 1 });
    await expect(mutate("save", option({ notes: "Sauna" }))).rejects.toMatchObject({ code: "PT409" });
    expect(await mutate("save", option({ notes: "Sauna", expected_revision: 1 }))).toMatchObject({ revision: 2, notes: "Sauna" });
    // A retry of that edit finds it done; an older editor's other change is refused.
    expect(await mutate("save", option({ notes: "Sauna", expected_revision: 1 }))).toMatchObject({ revision: 2 });
    await expect(mutate("save", option({ notes: "Fireplace", expected_revision: 1 }))).rejects.toMatchObject({ code: "PT409" });
    expect(await saved()).toEqual([{ id: optionId, name: "Ridge chalet", revision: 2, cost: 840, place: "Ridge chalet" }]);
  });

  it("refuses an edit to an option that was removed", async () => {
    await expect(mutate("save", option({ expected_revision: 1 }))).rejects.toMatchObject({ code: "P0002" });
  });

  it("removes an option only as the editor saw it, and a retried removal finds it gone", async () => {
    await mutate("save", option());
    await expect(mutate("remove", { id: optionId, expected_revision: 2 })).rejects.toMatchObject({ code: "PT409" });
    expect(await mutate("remove", { id: optionId, expected_revision: 1 })).toEqual({ id: optionId, removed: true });
    expect(await mutate("remove", { id: optionId, expected_revision: 1 })).toEqual({ id: optionId, removed: true });
    expect(await saved()).toEqual([]);
  });

  it("refuses the same place for the same nights twice, but not for other nights", async () => {
    await mutate("save", option());
    await expect(mutate("save", option({ id: "3c000000-0000-4000-8000-000000000002", name: " ridge CHALET " }))).rejects.toMatchObject({ code: "23505" });
    await mutate("save", option({ id: "3c000000-0000-4000-8000-000000000002", check_in: "2026-10-10", cost_amount: null, cost_currency: null }));
    expect((await saved()).length).toBe(2);
  });

  it("is the organizer's, and keeps options to their own trip", async () => {
    await expect(mutate("save", option(), { user: "user-2" })).rejects.toMatchObject({ code: "42501" });
    await mutate("save", option(), { user: "other-user", trip: otherTrip });
    // The same id from this trip is another trip's option: never found or replaced here.
    await expect(mutate("save", option()), "cross-trip id").rejects.toMatchObject({ code: "P0002" });
    await expect(mutate("remove", { id: optionId, expected_revision: 1 })).rejects.toMatchObject({ code: "P0002" });
    expect((await saved()).length).toBe(1);
  });

  it("keeps a cost to one currency and the option's nights", async () => {
    await expect(mutate("save", option({ cost_currency: null }))).rejects.toMatchObject({ code: "23514" });
    await expect(mutate("save", option({ check_in: null, check_out: null }))).rejects.toMatchObject({ code: "23514" });
    await expect(mutate("save", option({ cost_currency: "usd" }))).rejects.toMatchObject({ code: "23514" });
    await expect(mutate("save", option({ location: { ...RIDGE, latitude: 0, longitude: 0 } }))).rejects.toMatchObject({ code: "23514" });
    expect(await mutate("save", option({ check_in: null, check_out: null, cost_amount: null, cost_currency: null }))).toMatchObject({ check_in: null, cost_amount: null });
  });

  it("caps a trip's options", async () => {
    await db.query("INSERT INTO trip_stay_candidates (id, trip_id, name) SELECT gen_random_uuid(), $1, 'Option ' || n FROM generate_series(1, 30) n", [tripId]);
    await expect(mutate("save", option())).rejects.toMatchObject({ code: "22023", hint: "limit" });
  });

  it("goes with the trip and is readable only by the server", async () => {
    await mutate("save", option());
    await db.query("INSERT INTO trip_stay_candidate_routes (trip_id, route_key, origin_label, destination_label, status, duration_seconds, distance_meters, calculated_at, provider) VALUES ($1, 'drive|a>b|none', 'Ridge chalet', 'Spruce Peak lot', 'ok', 600, 9000, now(), 'geoapify')", [tripId]);
    await expect(db.query("INSERT INTO trip_stay_candidate_routes (trip_id, route_key, origin_label, destination_label, status, duration_seconds, distance_meters, calculated_at, provider) VALUES ($1, 'drive|c>d|none', 'Hut', 'Lot', 'no_route', 600, NULL, now(), 'geoapify')", [tripId])).rejects.toMatchObject({ code: "23514" });
    const grants = await db.query<{ grantee: string; table_name: string }>("SELECT grantee, table_name FROM information_schema.role_table_grants WHERE table_name IN ('trip_stay_candidates', 'trip_stay_candidate_routes') AND grantee IN ('anon', 'authenticated')");
    expect(grants.rows).toEqual([]);
    const executable = await db.query<{ anon: boolean; service: boolean }>("SELECT has_function_privilege('anon', 'public.mutate_trip_stay_candidate(uuid, text, text, jsonb)', 'EXECUTE') AS anon, has_function_privilege('service_role', 'public.mutate_trip_stay_candidate(uuid, text, text, jsonb)', 'EXECUTE') AS service");
    expect(executable.rows[0]).toEqual({ anon: false, service: true });
    await db.query("DELETE FROM trips WHERE id = $1", [tripId]);
    expect((await db.query("SELECT 1 FROM trip_stay_candidates UNION ALL SELECT 1 FROM trip_stay_candidate_routes")).rows).toEqual([]);
  });
});
