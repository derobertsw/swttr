// @vitest-environment node
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { feedbackRecord, tripKitSourceKey } from "@/lib/outing-feedback-server";
import { createAccountDeletionDatabase, OTHER, OWNED_TRIP, DELETED } from "@/test/accountDeletionDb";
import { savedOutfit } from "@/test/savedKit";
import type { FeedbackAnswer } from "@/types/outingFeedback";

const rows = async <T,>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

const record = (overrides: { userId?: string; sourceKey?: string; answer?: Partial<FeedbackAnswer>; tripId?: string | null } = {}) =>
  feedbackRecord({
    userId: overrides.userId ?? OTHER,
    source: overrides.sourceKey?.startsWith("trip_kit:") ? "trip_kit" : "gear_up",
    sourceKey: overrides.sourceKey ?? "gear_up:5b6c0a9e-4f0f-4b1a-9c55-0d9c1f6f4c11",
    kit: savedOutfit(),
    date: "2026-10-10",
    tripId: overrides.tripId ?? null,
    answer: { overall: "too_cold", moments: [], body_areas: [], worn: null, ...overrides.answer },
    sensitivityAtRecommendation: null,
    preferences: { sensitivity: null, height_band_in: null, weight_band_lb: null },
    startedAt: Date.parse("2026-10-10T13:00:00Z"),
    recommendedAt: null,
    now: Date.parse("2026-10-10T16:00:00Z"),
  });

/** Writes a record the way the API's upsert does (PostgREST's ON CONFLICT ... DO UPDATE). */
async function upsert(db: PGlite, row: ReturnType<typeof feedbackRecord>) {
  const columns = Object.keys(row);
  await db.query(`INSERT INTO user_outing_feedback (${columns.join(", ")})
    SELECT ${columns.join(", ")} FROM jsonb_populate_record(NULL::user_outing_feedback, $1)
    ON CONFLICT (user_id, source_key) DO UPDATE SET ${columns.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}`,
  [JSON.stringify(row)]);
}

describe("user_outing_feedback in Postgres", () => {
  let db: PGlite;
  beforeAll(async () => { db = await createAccountDeletionDatabase(); }, 60_000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec("TRUNCATE trips, user_outing_feedback CASCADE;");
    await db.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, $2, 'Stowe', '2026-10-10', '2026-10-10')",
      [OWNED_TRIP, DELETED]);
  });

  it("stores what the API writes", async () => {
    await upsert(db, record({ answer: { moments: ["stops"], body_areas: ["hands", "feet"],
      worn: { as_suggested: false, items: [{ source: "generic", generic: "t_shirt", name: "T-shirt", area: "torso" }], bare: ["hands"] } } }));
    expect(await rows(db, "SELECT activity, exertion, advice_kind, overall, moments, body_areas, worn->'bare' AS bare FROM user_outing_feedback"))
      .toEqual([{ activity: "alpine_skiing", exertion: "moderate", advice_kind: "personalized", overall: "too_cold",
        moments: ["stops"], body_areas: ["hands", "feet"], bare: ["hands"] }]);
  });

  it("keeps one answer per person and outing: answering again replaces it", async () => {
    await upsert(db, record());
    const [{ created_at: created }] = await rows<{ created_at: Date }>(db, "SELECT created_at FROM user_outing_feedback");
    await upsert(db, record({ answer: { overall: "just_right", worn: { as_suggested: true } } }));
    await upsert(db, record({ userId: "user_2Someone0000000000000003" }));
    expect(await rows(db, "SELECT user_id, overall, worn, created_at FROM user_outing_feedback ORDER BY user_id")).toEqual([
      { user_id: OTHER, overall: "just_right", worn: { as_suggested: true }, created_at: created },
      { user_id: "user_2Someone0000000000000003", overall: "too_cold", worn: null, created_at: expect.any(Date) },
    ]);
  });

  it("keeps feedback about a trip kit when the trip is deleted, without the trip", async () => {
    await upsert(db, record({ sourceKey: tripKitSourceKey("k1", "2026-10-09T12:00:00Z"), tripId: OWNED_TRIP }));
    await db.query("DELETE FROM trips WHERE id = $1", [OWNED_TRIP]);
    expect(await rows(db, "SELECT source, trip_id, trip_date::text AS date FROM user_outing_feedback"))
      .toEqual([{ source: "trip_kit", trip_id: null, date: "2026-10-10" }]);
  });

  it.each([
    ["an unknown moment", "moments = '{lunch}'"],
    ["an unknown body area", "body_areas = '{toes}'"],
    ["an unknown answer", "overall = 'freezing'"],
    ["a Gear up answer on a trip", `trip_id = '${OWNED_TRIP}'`],
    ["a trip kit key on a Gear up answer", "source_key = 'trip_kit:k1'"],
  ])("refuses %s", async (_label, change) => {
    await upsert(db, record());
    await expect(db.query(`UPDATE user_outing_feedback SET ${change}`)).rejects.toMatchObject({ code: "23514" });
  });

  it("is for the service role only, with row-level security on", async () => {
    const grants = await rows<{ grantee: string }>(db, `SELECT DISTINCT grantee FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = 'user_outing_feedback'`);
    expect(grants.map(({ grantee }) => grantee)).not.toContain("anon");
    expect(grants.map(({ grantee }) => grantee)).not.toContain("authenticated");
    expect(grants.map(({ grantee }) => grantee)).toContain("service_role");
    expect(await rows(db, "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_outing_feedback'::regclass"))
      .toEqual([{ relrowsecurity: true }]);
  });

  it("answers the review queries in docs/outing-feedback.md", async () => {
    await upsert(db, record({ answer: { moments: ["stops"], body_areas: ["hands"], worn: { as_suggested: true } } }));
    await upsert(db, { ...record({ sourceKey: "gear_up:2" }), activity: "running", overall: "too_warm" });
    const doc = await readFile("docs/outing-feedback.md", "utf8");
    const queries = [...doc.slice(doc.indexOf("## Reviewing feedback")).matchAll(/```sql\n([\s\S]*?)```/g)]
      .flatMap(([, sql]) => sql.split(/;\s*\n/).map((query) => query.trim()).filter(Boolean));
    expect(queries).toHaveLength(4);
    const results = [];
    for (const query of queries) results.push((await db.query(query)).rows);
    expect(results[0]).toEqual([
      expect.objectContaining({ activity: "alpine_skiing", answers: 1, too_cold: 1, worn_known: 1 }),
      expect.objectContaining({ activity: "running", answers: 1, too_warm: 1, worn_known: 0 }),
    ]);
    expect(results[1]).toEqual([{ activity: "alpine_skiing", overall: "too_cold", area: "hands", count: 1 }]);
    expect(results[3]).toEqual([expect.objectContaining({ activity: "running", overall: "too_warm",
      minutes_after_start: 180 })]);
    expect((results[3][0] as { suggested: string[] }).suggested.sort())
      .toEqual(["Fleece", "Long johns", "Merino crew", "Ski pants", "Ski shell"]);
  });

  it("keeps what another migration adds to delete_user_data, and can be applied again after one replaces it", async () => {
    // Like #426's 20261124120000: delete_user_data replaced whole, deleting another table too, without the feedback.
    await db.exec("CREATE TABLE IF NOT EXISTS public.catalog_item_reports (user_id text NOT NULL)");
    const original = await readFile("supabase/migrations/20261116150000_delete_user_data.sql", "utf8");
    const replacement = original.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION").replace("  RETURN v_counts;\nEND;",
      "  DELETE FROM public.catalog_item_reports WHERE user_id = p_user_id;\n  GET DIAGNOSTICS v_rows = ROW_COUNT;\n"
      + "  v_counts := v_counts || jsonb_build_object('catalog_item_reports', v_rows);\n\n  RETURN v_counts;\nEND;");
    const definition = async () => (await rows<{ def: string }>(db,
      "SELECT pg_get_functiondef('public.delete_user_data(text)'::regprocedure) AS def"))[0].def;
    await db.exec(replacement);
    expect(await definition()).not.toContain("user_outing_feedback");

    const migration = await readFile("supabase/migrations/20261124130000_user_outing_feedback.sql", "utf8");
    await upsert(db, record({ userId: DELETED }));
    await db.exec(migration);
    const patched = await definition();
    await db.exec(migration);
    expect(await definition()).toBe(patched);
    await db.query("INSERT INTO catalog_item_reports VALUES ($1)", [DELETED]);
    expect(await rows(db, "SELECT public.delete_user_data($1) AS counts", [DELETED]))
      .toEqual([{ counts: expect.objectContaining({ catalog_item_reports: 1, user_outing_feedback: 1 }) }]);
    // Back to this repo's function, for the other tests.
    await db.exec("DROP TABLE public.catalog_item_reports");
    await db.exec(original.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"));
    await db.exec(migration);
  });

  it("is deleted with the account", async () => {
    await upsert(db, record({ userId: DELETED }));
    await upsert(db, record());
    expect(await rows(db, "SELECT public.delete_user_data($1)->'user_outing_feedback' AS deleted", [DELETED])).toEqual([{ deleted: 1 }]);
    expect(await rows(db, "SELECT user_id FROM user_outing_feedback")).toEqual([{ user_id: OTHER }]);
  });
});
