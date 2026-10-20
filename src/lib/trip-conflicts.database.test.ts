// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

const migration = () => readFile("supabase/migrations/20261020000407_trip_conflicts_no_retry.sql", "utf8");

it("changes only deliberate trip conflicts, preserving function identity, security and grants on replay", async () => {
  const db = await PGlite.create();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    for (const name of ["012_trips", "016_atomic_trip_creation", "017_trip_stays", "018_trip_saved_kits",
      "021_trip_date_changes", "022_trip_itinerary_edits", "023_trip_copy_day", "024_trip_packing",
      "025_trip_stay_locations", "026_trip_tour_plans", "027_trip_access_points", "028_trip_drive_estimates",
      "029_trip_drive_starting_points", "030_trip_copy_tour_plans", "031_trip_conditions",
      "20261016231848_trip_personal_packing_checks", "032_trip_touring_equipment",
      "20261018131917_trip_shared_gear_responsibility"]) {
      await db.exec(await readFile(`supabase/migrations/${name}.sql`, "utf8"));
    }
    await db.exec("CREATE FUNCTION public.unrelated_serialization_failure() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Actual serialization failure' USING ERRCODE = '40001'; END $$;");
    const snapshot = async () => (await db.query<{ name: string; body: string; [key: string]: unknown }>(`
      SELECT p.oid, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments,
        p.proowner, p.prosecdef, p.proconfig, p.proacl::text, p.prosrc AS body
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.oid
    `)).rows;
    const before = await snapshot();
    const targets = before.filter((fn) => fn.name !== "unrelated_serialization_failure" && fn.body.includes("'40001'"));
    expect(targets).toHaveLength(13);
    const sql = await migration();
    await db.exec(sql);
    const after = await snapshot();
    expect(after).toEqual(before.map((fn) => targets.includes(fn)
      ? { ...fn, body: fn.body.replaceAll("'40001'", "'PT409'") } : fn));
    await db.exec(sql);
    expect(await snapshot()).toEqual(after);
    await expect(db.query("SELECT public.unrelated_serialization_failure()"))
      .rejects.toMatchObject({ code: "40001" });
  } finally { await db.close(); }
}, 20_000);
