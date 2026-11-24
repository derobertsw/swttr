import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

/** The account Clerk deleted, and someone it planned trips with. */
export const DELETED = "user_2DeletedAccount00000000001";
export const OTHER = "user_2OtherAccount0000000000002";

// The deleted account's own trip, with the other account on its crew.
export const OWNED_TRIP = "a0000000-0000-4000-8000-000000000001";
// The other account's trip, with the deleted account on its crew.
export const SHARED_TRIP = "b0000000-0000-4000-8000-000000000002";

const ids = {
  ownedOrganizer: "a1000000-0000-4000-8000-000000000001",
  ownedCrew: "a1000000-0000-4000-8000-000000000002",
  ownedDay: "a2000000-0000-4000-8000-000000000001",
  ownedSource: "a3000000-0000-4000-8000-000000000001",
  sharedOrganizer: "b1000000-0000-4000-8000-000000000001",
  sharedCrew: "b1000000-0000-4000-8000-000000000002",
  sharedGuest: "b1000000-0000-4000-8000-000000000003",
  sharedDay: "b2000000-0000-4000-8000-000000000001",
  sharedSource: "b3000000-0000-4000-8000-000000000001",
  sharedStay: "b4000000-0000-4000-8000-000000000001",
  gearTheyBring: "b5000000-0000-4000-8000-000000000001",
  gearTheyAdded: "b5000000-0000-4000-8000-000000000002",
};
export const SHARED_IDS = ids;

// Every migration that makes or changes a table holding a user ID, in order.
const UNAPPLIED_IN_PROD = ["20261021201500_trip_attendance_lodging", "20261023000200_trip_drive_departures",
  "20261023233000_trip_member_starting_points", "20261028130000_trip_day_notes"];
const MIGRATIONS = ["001_schema", "004_user_preferences_body_metrics", "005_user_item_mappings", "007_item_media_urls",
  "010_user_custom_items", "012_trips", "014_restrict_to_service_role", "015_user_preferences_timestamps",
  "016_atomic_trip_creation", "017_trip_stays", "018_trip_saved_kits", "019_trip_kit_save_tombstones",
  "020_trip_kit_save_stable_hash", "021_trip_date_changes", "022_trip_itinerary_edits", "023_trip_copy_day",
  "024_trip_packing", "025_trip_stay_locations", "026_trip_tour_plans", "027_trip_access_points",
  "028_trip_drive_estimates", "029_trip_drive_starting_points", "030_trip_copy_tour_plans", "031_trip_conditions",
  "032_trip_touring_equipment", "20261016231848_trip_personal_packing_checks",
  "20261018131917_trip_shared_gear_responsibility", "20261020000407_trip_conflicts_no_retry",
  "20261021201500_trip_attendance_lodging", "20261023000200_trip_drive_departures",
  "20261023233000_trip_member_starting_points", "20261024230000_trip_day_meet_times", "20261026120000_trip_day_checks",
  "20261028130000_trip_day_notes", "20261116150000_delete_user_data", "20261124120000_catalog_item_reports"];

// Prod also has trip_nudges, from a migration that isn't in this repo
// (20260520002401). Its rows go with either member.
const TRIP_NUDGES = `CREATE TABLE public.trip_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  sender_member_id uuid NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  recipient_member_id uuid NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);`;

/**
 * A database with every table that holds a user ID. `prodLike` leaves out the
 * migrations prod doesn't have yet, as of November 16, 2026.
 */
export async function createAccountDeletionDatabase({ prodLike = false } = {}): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  for (const migration of MIGRATIONS) {
    if (prodLike && UNAPPLIED_IN_PROD.includes(migration)) continue;
    await db.exec(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
    if (migration === "012_trips") await db.exec(TRIP_NUDGES);
  }
  return db;
}

const hasTable = async (db: PGlite, table: string) =>
  (await db.query<{ found: boolean }>("SELECT to_regclass($1) IS NOT NULL AS found", [`public.${table}`])).rows[0].found;

/**
 * Both accounts' data: their own account data, the deleted account's trip with
 * the other on its crew, and the other's trip with the deleted account on its
 * crew alongside a guest. Some rows name the deleted account where only an
 * organizer could, so the anonymizing is checked for every column.
 */
export async function seedAccounts(db: PGlite) {
  await db.query(`INSERT INTO user_preferences (user_id, temperature_sensitivity, height_inches, weight_lbs)
    VALUES ($1, 'cold', 70, 160), ($2, 'hot', 65, 140)`, [DELETED, OTHER]);
  await db.query(`INSERT INTO user_wardrobe (user_id, item_type, item_id) VALUES
    ($1, 'garment', gen_random_uuid()), ($1, 'handwear', gen_random_uuid()), ($2, 'garment', gen_random_uuid())`, [DELETED, OTHER]);
  await db.query(`INSERT INTO user_item_mappings (user_id, body_part, layer_type, standard_option, custom_name) VALUES
    ($1, 'torso', 'base', 'Light', 'My merino'), ($2, 'torso', 'base', 'Light', 'Their merino')`, [DELETED, OTHER]);
  await db.query(`INSERT INTO user_custom_items (user_id, body_part, layer_type, generic_option, custom_name, rcl_clo) VALUES
    ($1, 'legs', 'mid', 'Medium', 'Fleece tights', 0.4), ($2, 'legs', 'mid', 'Medium', 'Wool tights', 0.4)`, [DELETED, OTHER]);

  // Reports of catalog problems: two of theirs (one resolved), and one of the other account's.
  await db.query(`INSERT INTO catalog_item_reports (user_id, item_type, item_id, reasons, note, status, resolved_at) VALUES
    ($1, 'garment', gen_random_uuid(), ARRAY['wrong_photo'], 'Old photo', 'open', NULL),
    ($1, 'handwear', gen_random_uuid(), ARRAY['discontinued'], NULL, 'resolved', now()),
    ($2, 'garment', gen_random_uuid(), ARRAY['wrong_specs'], 'Weighs 420 g', 'open', NULL)`, [DELETED, OTHER]);

  await db.query(`INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES
    ($1, $3, 'Their weekend', '2026-12-05', '2026-12-06'), ($2, $4, 'Presidentials', '2026-12-12', '2026-12-13')`,
  [OWNED_TRIP, SHARED_TRIP, DELETED, OTHER]);
  await db.query(`INSERT INTO trip_members (id, trip_id, user_id, display_name, role, status) VALUES
    ($1, $5, $8, 'You', 'organizer', 'joined'), ($2, $5, $9, 'Sam', 'member', 'joined'),
    ($3, $6, $9, 'You', 'organizer', 'joined'), ($4, $6, $8, 'Alex', 'member', 'joined'),
    ($7, $6, NULL, 'Gus', 'guest', 'guest')`,
  [ids.ownedOrganizer, ids.ownedCrew, ids.sharedOrganizer, ids.sharedCrew, OWNED_TRIP, SHARED_TRIP, ids.sharedGuest, DELETED, OTHER]);
  await db.query(`INSERT INTO trip_days (id, trip_id, date, activity) VALUES
    ($1, $3, '2026-12-05', 'Backcountry'), ($2, $4, '2026-12-12', 'Backcountry')`, [ids.ownedDay, ids.sharedDay, OWNED_TRIP, SHARED_TRIP]);
  await db.query(`INSERT INTO trip_stops (trip_id, position, name) VALUES ($1, 0, 'Pinkham Notch'), ($2, 0, 'Crawford Notch')`,
    [OWNED_TRIP, SHARED_TRIP]);
  await db.query("INSERT INTO trip_stays (id, trip_id, name) VALUES ($1, $2, 'Joe Dodge Lodge')", [ids.sharedStay, SHARED_TRIP]);
  await db.query(`INSERT INTO trip_member_day_kits (trip_day_id, trip_member_id) VALUES ($1, $2), ($1, $3), ($4, $5), ($4, $6)`,
    [ids.ownedDay, ids.ownedOrganizer, ids.ownedCrew, ids.sharedDay, ids.sharedOrganizer, ids.sharedCrew]);
  await db.query("INSERT INTO trip_member_packing (trip_member_id, trip_id) VALUES ($1, $2), ($3, $4), ($5, $4)",
    [ids.ownedCrew, OWNED_TRIP, ids.sharedCrew, SHARED_TRIP, ids.sharedOrganizer]);
  await db.query("INSERT INTO trip_nudges (trip_id, sender_member_id, recipient_member_id, message) VALUES ($1, $2, $3, 'Packed yet?')",
    [SHARED_TRIP, ids.sharedCrew, ids.sharedOrganizer]);

  // Tour plans and conditions sources: the organizer's own, plus an edit by the deleted account.
  await db.query(`INSERT INTO trip_day_tour_plans (trip_id, trip_day_id, objective, created_by, updated_by) VALUES
    ($1, $2, 'Tuckerman Ravine', $5, $5), ($3, $4, 'Mount Washington', $6, $5)`, [OWNED_TRIP, ids.ownedDay, SHARED_TRIP, ids.sharedDay, DELETED, OTHER]);
  await db.query(`INSERT INTO trip_conditions_sources (id, trip_id, category, name, url, created_by, updated_by) VALUES
    ($1, $2, 'avalanche', 'MWAC', 'https://www.mountwashingtonavalanchecenter.org/', $5, $5),
    ($3, $4, 'avalanche', 'MWAC', 'https://www.mountwashingtonavalanchecenter.org/', $6, $5)`,
  [ids.ownedSource, OWNED_TRIP, ids.sharedSource, SHARED_TRIP, DELETED, OTHER]);
  await db.query(`INSERT INTO trip_day_conditions_sources (trip_id, trip_day_id, source_id, added_by) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)`,
    [OWNED_TRIP, ids.ownedDay, ids.ownedSource, DELETED, SHARED_TRIP, ids.sharedDay, ids.sharedSource, DELETED]);
  await db.query(`INSERT INTO trip_conditions_reviews (trip_id, trip_day_id, source_id, user_id, action, note, reviewed_at, context) VALUES
    ($1, $2, $3, $7, 'reviewed', 'Their note on their trip', now(), '{}'),
    ($4, $5, $6, $8, 'reviewed', 'Their note on our trip', now(), '{}'),
    ($4, $5, $6, $7, 'reviewed', 'Considerable above treeline', now(), '{}')`,
  [OWNED_TRIP, ids.ownedDay, ids.ownedSource, SHARED_TRIP, ids.sharedDay, ids.sharedSource, OTHER, DELETED]);

  // Day checks: the deleted account's own, and one it recorded for the guest.
  await db.query(`INSERT INTO trip_day_checks (trip_id, trip_day_id, trip_member_id, kind, action, recorded_by, context) VALUES
    ($1, $2, $3, 'plan_review', 'recorded', $5, '{}'), ($1, $2, $4, 'transceiver', 'recorded', $5, '{}'),
    ($1, $2, $6, 'plan_review', 'recorded', $7, '{}')`,
  [SHARED_TRIP, ids.sharedDay, ids.sharedCrew, ids.sharedGuest, DELETED, ids.sharedOrganizer, OTHER]);
  await db.query(`INSERT INTO trip_drive_manual_estimates (trip_day_id, trip_id, pair_key, origin_label, destination_label, duration_seconds, entered_by)
    VALUES ($1, $2, 'lodge>trailhead', 'Lodge', 'Trailhead', 900, $3)`, [ids.sharedDay, SHARED_TRIP, DELETED]);

  // Shared gear: one item the deleted account was bringing, and one it added that the organizer brings.
  const at = "2026-12-01T12:00:00Z";
  const event = (action: string, actor: string, assignee: string | null) => ({ action, actor, at, assignee });
  await db.query(`INSERT INTO trip_group_gear (id, trip_id, description, assignee_member_id, assigned_by, assigned_at,
      accepted_by, accepted_at, packed_by, packed_at, events) VALUES
    ($1, $3, 'Stove', $4, $6, $8, $6, $8, $6, $8, $9), ($2, $3, 'Rope', $5, $7, $8, $7, $8, NULL, NULL, $10)`,
  [ids.gearTheyBring, ids.gearTheyAdded, SHARED_TRIP, ids.sharedCrew, ids.sharedOrganizer, DELETED, OTHER, at,
    JSON.stringify([event("assign", DELETED, ids.sharedCrew), event("accept", DELETED, ids.sharedCrew), event("pack", DELETED, ids.sharedCrew)]),
    JSON.stringify([event("create", DELETED, null), event("assign", OTHER, ids.sharedOrganizer), event("accept", OTHER, ids.sharedOrganizer)])]);
  await db.query("INSERT INTO trip_group_gear (trip_id, description) VALUES ($1, 'Tent')", [OWNED_TRIP]);

  // Save to trip receipts: each account's, on both trips. The one on the
  // deleted account's trip holds a copy of that trip, owner included.
  await db.query(`INSERT INTO trip_kit_saves (save_id, trip_id, user_id, input_hash, result) VALUES
    (gen_random_uuid(), $1, $3, 'h1', jsonb_build_object('trip', jsonb_build_object('owner_user_id', $4::text))),
    (gen_random_uuid(), $2, $4, 'h2', '{}'), (gen_random_uuid(), $2, $3, 'h3', '{}')`, [OWNED_TRIP, SHARED_TRIP, OTHER, DELETED]);

  if (await hasTable(db, "trip_member_attendance")) {
    await db.query("INSERT INTO trip_member_attendance (trip_id, member_id, arrival_date) VALUES ($1, $2, '2026-12-12'), ($1, $3, '2026-12-12')",
      [SHARED_TRIP, ids.sharedCrew, ids.sharedOrganizer]);
    await db.query(`INSERT INTO trip_member_lodging_nights (trip_id, member_id, date, stay_id, status) VALUES
      ($1, $2, '2026-12-12', $4, 'assigned'), ($1, $3, '2026-12-12', $4, 'assigned')`, [SHARED_TRIP, ids.sharedCrew, ids.sharedOrganizer, ids.sharedStay]);
  }
  if (await hasTable(db, "trip_member_day_origins")) {
    await db.query(`INSERT INTO trip_member_day_origins (trip_id, trip_day_id, member_id, no_drive, updated_by) VALUES
      ($1, $2, $3, true, $5), ($1, $2, $4, true, $5)`, [SHARED_TRIP, ids.sharedDay, ids.sharedCrew, ids.sharedOrganizer, DELETED]);
  }
}

/** The app's tables: everything but the gear catalog, plus people's reports about it. */
async function appTables(db: PGlite): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND (table_name LIKE 'trip%' OR table_name LIKE 'user%' OR table_name = 'catalog_item_reports')
    ORDER BY table_name`);
  return rows.map((row) => row.table_name);
}

/** Every row of every app table, to tell whether anything changed. */
export async function snapshot(db: PGlite): Promise<Record<string, unknown[]>> {
  const tables: Record<string, unknown[]> = {};
  for (const table of await appTables(db)) {
    tables[table] = (await db.query(`SELECT to_jsonb(t)::text AS row FROM public.${table} t ORDER BY 1`)).rows;
  }
  return tables;
}

/** "table.column" for every value anywhere in the app's tables that still contains `text`. */
export async function traces(db: PGlite, text: string): Promise<string[]> {
  const found: string[] = [];
  for (const table of await appTables(db)) {
    const { rows } = await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table]);
    for (const { column_name: column } of rows) {
      const { rows: [hit] } = await db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM public.${table} WHERE strpos("${column}"::text, $1) > 0`, [text]);
      if (hit.count > 0) found.push(`${table}.${column}`);
    }
  }
  return found;
}

/** Rows per app table that mention `text` anywhere, to compare one account's data before and after. */
export async function rowsMentioning(db: PGlite, text: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of await appTables(db)) {
    const { rows: [hit] } = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM public.${table} t WHERE strpos(to_jsonb(t)::text, $1) > 0`, [text]);
    if (hit.count > 0) counts[table] = hit.count;
  }
  return counts;
}
