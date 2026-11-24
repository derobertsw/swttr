// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const state = vi.hoisted(() => ({
  userId: "user_2Reporter000000000000001" as string | null,
  client: null as unknown,
}));

vi.mock("@/lib/supabase", () => ({ getSupabase: () => state.client }));
vi.mock("@/lib/auth", () => ({ getAuthUserId: async () => state.userId }));

const MIGRATION = "supabase/migrations/20261124120000_catalog_item_reports.sql";
const GARMENT = "10000000-0000-4000-8000-000000000001";
const GLOVE = "20000000-0000-4000-8000-000000000001";
const HAT = "30000000-0000-4000-8000-000000000001";
const MISSING = "40000000-0000-4000-8000-000000000001";

let db: PGlite;

/** Supabase's rpc(), answered by Postgres with the real migration. */
async function rpc(fn: string, args: Record<string, unknown>) {
  const names = Object.keys(args);
  try {
    const { rows } = await db.query<{ result: unknown }>(
      `SELECT public.${fn}(${names.map((name, i) => `${name} => $${i + 1}`).join(", ")}) AS result`,
      names.map((name) => args[name])
    );
    return { data: rows[0].result, error: null };
  } catch (error) {
    return { data: null, error: { code: (error as { code?: string }).code ?? "", message: "database error" } };
  }
}

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/wardrobe/reports", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

const reports = async () =>
  (
    await db.query<Record<string, unknown>>(
      "SELECT user_id, item_type, item_id, item_snapshot, reasons, note, product_url, status FROM catalog_item_reports ORDER BY created_at"
    )
  ).rows;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  await db.exec(await readFile("supabase/migrations/001_schema.sql", "utf8"));
  await db.exec(await readFile(MIGRATION, "utf8"));
  await db.query(
    "INSERT INTO garments (id, brand, model_name, category, garment_type) VALUES ($1, 'Patagonia', 'R1 Air Full-Zip Hoody', 'mid_layer_light', 'jacket')",
    [GARMENT]
  );
  await db.query("INSERT INTO handwear (id, brand, model_name, handwear_type, rcl_clo) VALUES ($1, 'Black Diamond', 'Guide Gloves', 'insulated_glove', 1.2)", [GLOVE]);
  await db.query("INSERT INTO headwear (id, brand, model_name, headwear_type, rcl_clo) VALUES ($1, 'Smith', 'Vantage MIPS', 'ski_helmet', 0.5)", [HAT]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  state.userId = "user_2Reporter000000000000001";
  state.client = { rpc };
  await db.exec("TRUNCATE catalog_item_reports;");
});

describe("POST /api/wardrobe/reports", () => {
  it("records a report with the item's brand and model, reasons in the form's order", async () => {
    const res = await post({
      item_type: "garment",
      item_id: GARMENT,
      reasons: ["wrong_warmth", "wrong_photo"],
      note: "  Photo shows the older version.  ",
      product_url: " https://www.patagonia.com/product/r1-air ",
    });

    expect(res.status).toBe(201);
    const { report } = await res.json();
    expect(report).toMatchObject({ outcome: "created", reasons: ["wrong_photo", "wrong_warmth"] });
    expect(await reports()).toEqual([
      {
        user_id: "user_2Reporter000000000000001",
        item_type: "garment",
        item_id: GARMENT,
        item_snapshot: { brand: "Patagonia", model_name: "R1 Air Full-Zip Hoody" },
        reasons: ["wrong_photo", "wrong_warmth"],
        note: "Photo shows the older version.",
        product_url: "https://www.patagonia.com/product/r1-air",
        status: "open",
      },
    ]);
  });

  it("reports handwear and headwear from their own tables", async () => {
    expect((await post({ item_type: "handwear", item_id: GLOVE, reasons: ["discontinued"] })).status).toBe(201);
    expect((await post({ item_type: "headwear", item_id: HAT, reasons: ["wrong_category"] })).status).toBe(201);
    expect((await reports()).map((row) => row.item_snapshot)).toEqual([
      { brand: "Black Diamond", model_name: "Guide Gloves" },
      { brand: "Smith", model_name: "Vantage MIPS" },
    ]);
  });

  it("adds to the person's open report on the item instead of starting another", async () => {
    await post({ item_type: "garment", item_id: GARMENT, reasons: ["wrong_photo"], note: "Old photo" });
    const res = await post({ item_type: "garment", item_id: GARMENT, reasons: ["duplicate", "wrong_photo"] });

    expect(res.status).toBe(200);
    expect((await res.json()).report).toMatchObject({ outcome: "updated", reasons: ["wrong_photo", "duplicate"] });
    // Leaving the note out keeps the earlier one.
    expect(await reports()).toEqual([
      expect.objectContaining({ reasons: ["wrong_photo", "duplicate"], note: "Old photo", product_url: null }),
    ]);
  });

  it("starts a new report once the earlier one is resolved, and keeps other people's apart", async () => {
    await post({ item_type: "garment", item_id: GARMENT, reasons: ["wrong_photo"] });
    await db.exec("UPDATE catalog_item_reports SET status = 'resolved', resolved_at = now()");
    expect((await post({ item_type: "garment", item_id: GARMENT, reasons: ["wrong_photo"] })).status).toBe(201);

    state.userId = "user_2SomeoneElse0000000000002";
    expect((await post({ item_type: "garment", item_id: GARMENT, reasons: ["wrong_photo"] })).status).toBe(201);
    expect((await reports()).map((row) => [row.user_id, row.status])).toEqual([
      ["user_2Reporter000000000000001", "resolved"],
      ["user_2Reporter000000000000001", "open"],
      ["user_2SomeoneElse0000000000002", "open"],
    ]);
  });

  it("limits new reports to 20 a day, but still adds to an open one", async () => {
    await db.query(
      `INSERT INTO catalog_item_reports (user_id, item_type, item_id, reasons, status, resolved_at)
       SELECT $1, 'garment', gen_random_uuid(), ARRAY['other'], 'dismissed', now() FROM generate_series(1, 19)`,
      [state.userId]
    );
    expect((await post({ item_type: "garment", item_id: GARMENT, reasons: ["wrong_specs"] })).status).toBe(201);

    const limited = await post({ item_type: "handwear", item_id: GLOVE, reasons: ["wrong_specs"] });
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toMatch(/try again tomorrow/i);
    expect((await post({ item_type: "garment", item_id: GARMENT, reasons: ["wrong_photo"] })).status).toBe(200);
  });

  it("answers 404 for an item that isn't in the catalog, or isn't in that table", async () => {
    expect((await post({ item_type: "garment", item_id: MISSING, reasons: ["wrong_photo"] })).status).toBe(404);
    expect((await post({ item_type: "headwear", item_id: GARMENT, reasons: ["wrong_photo"] })).status).toBe(404);
    expect(await reports()).toEqual([]);
  });

  it.each([
    ["no body", "not json", "item"],
    ["a custom item", { item_type: "custom", item_id: GARMENT, reasons: ["wrong_photo"] }, "item"],
    ["an ID that isn't a UUID", { item_type: "garment", item_id: "abc", reasons: ["wrong_photo"] }, "item"],
    ["no reasons", { item_type: "garment", item_id: GARMENT, reasons: [] }, "reasons"],
    ["an unknown reason", { item_type: "garment", item_id: GARMENT, reasons: ["too_expensive"] }, "reasons"],
    ["a long note", { item_type: "garment", item_id: GARMENT, reasons: ["wrong_specs"], note: "x".repeat(1001) }, "note"],
    ["Something else without a note", { item_type: "garment", item_id: GARMENT, reasons: ["other"], note: "  " }, "other_note"],
    ["a link that isn't a web page", { item_type: "garment", item_id: GARMENT, reasons: ["wrong_specs"], product_url: "javascript:alert(1)" }, "product_url"],
    ["a link without a domain", { item_type: "garment", item_id: GARMENT, reasons: ["wrong_specs"], product_url: "https://localhost" }, "product_url"],
    ["a long link", { item_type: "garment", item_id: GARMENT, reasons: ["wrong_specs"], product_url: `https://example.com/${"a".repeat(500)}` }, "product_url"],
  ])("refuses %s with 400", async (_name, body, problem) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).problem).toBe(problem);
    expect(await reports()).toEqual([]);
  });

  it("needs a signed-in user", async () => {
    state.userId = null;
    expect((await post({ item_type: "garment", item_id: GARMENT, reasons: ["wrong_photo"] })).status).toBe(401);
  });

  it("answers 503 until the migration is applied", async () => {
    state.client = { rpc: async () => ({ data: null, error: { code: "PGRST202", message: "not found" } }) };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post({ item_type: "garment", item_id: GARMENT, reasons: ["wrong_photo"] })).status).toBe(503);
  });

  it("keeps the table and function from the public roles", async () => {
    const tableGrants = await db.query<{ grantee: string }>(
      "SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_name = 'catalog_item_reports'"
    );
    expect(tableGrants.rows.map((row) => row.grantee)).not.toEqual(expect.arrayContaining(["anon"]));
    expect(tableGrants.rows.map((row) => row.grantee)).not.toEqual(expect.arrayContaining(["authenticated"]));
    const fnGrants = await db.query<{ grantee: string }>(
      "SELECT grantee FROM information_schema.routine_privileges WHERE routine_name = 'submit_catalog_item_report'"
    );
    expect(fnGrants.rows.map((row) => row.grantee)).toContain("service_role");
    expect(fnGrants.rows.map((row) => row.grantee)).not.toContain("anon");
    const rls = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname = 'catalog_item_reports'");
    expect(rls.rows).toEqual([{ relrowsecurity: true }]);
  });
});
