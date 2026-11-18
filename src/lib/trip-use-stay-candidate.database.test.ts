// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { lodgingPayload } from "@/lib/trip-lodging-changes";
import { place } from "@/test/driveTrip";

// Use for these nights (#213): an option becomes a stay only as it was previewed.
const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const alex = "1a000000-0000-4000-8000-000000000001";
const blair = "1a000000-0000-4000-8000-000000000002";
const optionId = "3c000000-0000-4000-8000-000000000001";
const FRI = "2026-10-09", SUN = "2026-10-11";
const RIDGE = place("Ridge chalet", 44.5012, -72.7519);

const CHAIN = ["012_trips", "016_atomic_trip_creation", "017_trip_stays", "018_trip_saved_kits", "021_trip_date_changes", "022_trip_itinerary_edits",
  "023_trip_copy_day", "025_trip_stay_locations", "026_trip_tour_plans", "027_trip_access_points", "028_trip_drive_estimates", "031_trip_conditions",
  "20261020000407_trip_conflicts_no_retry", "20261021201500_trip_attendance_lodging", "20261116200000_trip_stay_candidates", "20261117090000_trip_use_stay_candidate"];

let db: PGlite;
const peopleKey = async () => (await db.query<{ key: string }>("SELECT public.trip_lodging_people_key($1) AS key", [tripId])).rows[0].key;
const payload = async (name = "Ridge chalet") => ({ ...lodgingPayload({ action: "save", existing: false, occupants: [alex, blair], stay: {
  id: optionId, name, check_in: FRI, check_out: SUN, type: null, address: "12 Ridge Rd", property_url: null, check_in_time: null, check_out_time: null,
  notes: null, booking_status: "not_booked", location: RIDGE } }), people_key: await peopleKey() });
const use = async ({ revision = 0, requestId = randomUUID(), body = undefined as object | undefined, candidateRevision = 1, user = "user-1" } = {}) =>
  (await db.query<{ result: { revision: number } }>("SELECT public.use_trip_stay_candidate($1, $2, $3, $4, $5, true, $6, $7) AS result",
    [tripId, user, revision, requestId, JSON.stringify(body ?? await payload()), optionId, candidateRevision])).rows[0].result;
const state = async () => (await db.query<Record<string, unknown>>(`SELECT
  (SELECT lodging_revision FROM trips WHERE id = '${tripId}') AS revision,
  (SELECT string_agg(name, ',') FROM trip_stays) AS stays,
  (SELECT count(*)::int FROM trip_member_lodging_nights WHERE stay_id = '${optionId}') AS nights`)).rows[0];

describe("Using an option for these nights (#213)", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    for (const migration of CHAIN) await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
  }, 30_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'user-1', 'Weekend', '2026-10-09', '2026-10-12')", [tripId]);
    await db.query("INSERT INTO trip_members (id, trip_id, user_id, display_name, role, status) VALUES ($1, $3, 'user-1', 'Alex', 'organizer', 'joined'), ($2, $3, 'user-2', 'Blair', 'member', 'joined')", [alex, blair, tripId]);
    await db.query("INSERT INTO trip_stay_candidates (id, trip_id, name, address, location) VALUES ($1, $2, 'Ridge chalet', '12 Ridge Rd', $3)", [optionId, tripId, JSON.stringify(RIDGE)]);
  });
  afterAll(async () => { await db?.close(); });

  it("saves the stay the option becomes, with who stays there, when the option is as previewed", async () => {
    expect(await use()).toEqual({ revision: 1 });
    expect(await state()).toEqual({ revision: 1, stays: "Ridge chalet", nights: 4 });
  });

  it("changes nothing when the option was edited or removed since the preview", async () => {
    await db.query("UPDATE trip_stay_candidates SET name = 'Ridge chalet (upper)', revision = 2 WHERE id = $1", [optionId]);
    await expect(use()).rejects.toMatchObject({ code: "PT409", hint: "option" });
    await db.query("DELETE FROM trip_stay_candidates WHERE id = $1", [optionId]);
    await expect(use({ candidateRevision: 2 })).rejects.toMatchObject({ code: "PT409", hint: "option" });
    expect(await state()).toEqual({ revision: 0, stays: null, nights: 0 });
  });

  it("returns a retried save's first result, even after the option changed", async () => {
    const requestId = randomUUID();
    const body = await payload();
    expect(await use({ requestId, body })).toEqual({ revision: 1 });
    await db.query("UPDATE trip_stay_candidates SET notes = 'Sauna', revision = 2 WHERE id = $1", [optionId]);
    expect(await use({ requestId, body })).toEqual({ revision: 1 });
    expect(await state()).toEqual({ revision: 1, stays: "Ridge chalet", nights: 4 });
    // The same identity with other input is still refused.
    await expect(use({ requestId, body: await payload("Other place") })).rejects.toMatchObject({ code: "22023" });
  });

  it("saves only the option it names, for the organizer, through the server", async () => {
    await expect(use({ body: { ...await payload(), id: randomUUID() } })).rejects.toMatchObject({ code: "22023" });
    await expect(use({ user: "user-2" })).rejects.toMatchObject({ code: "42501" });
    const signature = "public.use_trip_stay_candidate(uuid, text, integer, uuid, jsonb, boolean, uuid, integer)";
    const rights = await db.query<{ anon: boolean; service: boolean }>(`SELECT has_function_privilege('anon', '${signature}', 'EXECUTE') AS anon, has_function_privilege('service_role', '${signature}', 'EXECUTE') AS service`);
    expect(rights.rows[0]).toEqual({ anon: false, service: true });
    expect(await state()).toEqual({ revision: 0, stays: null, nights: 0 });
  });
});
