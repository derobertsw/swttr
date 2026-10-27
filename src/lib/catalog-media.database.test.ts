// @vitest-environment node
import { access, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20261026201302_direct_catalog_image_urls.sql";
let db: PGlite;
let migration: string;

async function catalogRows() {
  return (await db.query<{ table_name: string; row: Record<string, unknown> }>(`
    SELECT * FROM (
      SELECT 'garments' AS table_name, to_jsonb(g) - 'updated_at' AS row FROM garments g
      UNION ALL SELECT 'handwear', to_jsonb(h) - 'updated_at' FROM handwear h
      UNION ALL SELECT 'headwear', to_jsonb(h) - 'updated_at' FROM headwear h
    ) AS catalog
    ORDER BY table_name, row->>'brand', row->>'model_name'
  `)).rows;
}

describe("direct catalog image migration", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(await readFile("supabase/migrations/001_schema.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/007_item_media_urls.sql", "utf8"));
    await db.exec(`
      INSERT INTO garments (brand, model_name, category, garment_type, hood_type, item_image_url) VALUES
        ('Norrøna', 'Lofoten Gore-Tex Pro Jacket', 'hard_shell', 'jacket', 'attached', '/media/items/garment/old.svg'),
        ('Arc''teryx', 'Gamma MX Hoody', 'soft_shell', 'jacket', 'attached', NULL),
        ('32 Degrees', 'Heat Midweight Crew', 'base_layer', 'top_long_sleeve', 'none', '/images/items/32-degrees-heat-midweight-crew.jpg'),
        ('Avalanche', 'Weather Shield Ski Jacket', 'hard_shell', 'jacket', 'attached', '/images/items/avalanche-weather-shield-ski-jacket.jpg'),
        ('Icebreaker', 'GT260 Quantum Hood', 'mid_layer_light', 'jacket', 'attached', '/images/items/icebreaker-gt260-quantum-hood.jpg'),
        ('Icebreaker', 'Shifter Long Sleeve Zip Hood', 'mid_layer_light', 'jacket', 'attached', '/images/items/icebreaker-shifter-long-sleeve-zip-hood.jpg'),
        ('Norrøna', 'Falketind Thermo40 Zip Hood', 'insulation_synthetic', 'jacket', 'attached', '/images/items/norrona-falketind-thermo40-zip-hood.jpg'),
        ('Norrøna', 'Senja Alpha90 Hood', 'mid_layer_light', 'jacket', 'attached', '/images/items/norrona-senja-alpha90-hood.jpg'),
        ('Arc''teryx', 'Beta AR Jacket', 'hard_shell', 'jacket', 'helmet_compatible', NULL),
        ('Example', 'Base', 'base_layer', 'top_long_sleeve', 'none', NULL),
        ('Example', 'Pants', 'hard_shell', 'pants', 'none', NULL),
        ('Example', 'Vest', 'insulation_down', 'vest', 'none', NULL),
        ('Patagonia', 'DAS Parka', 'insulation_synthetic', 'jacket', 'attached', 'https://cdn.example.com/reviewed.webp'),
        ('Example', 'Local photo', 'base_layer', 'top_long_sleeve', 'none', '/images/items/patagonia-capilene-midweight.png');
      INSERT INTO handwear (brand, model_name, handwear_type, rcl_clo) VALUES
        ('Outdoor Research', 'Stormtracker Sensor Gloves', 'insulated_glove', 1),
        ('Example', 'Mittens', 'mitten', 1),
        ('Example', 'Liners', 'liner_glove', 0.5);
      INSERT INTO headwear (brand, model_name, headwear_type, rcl_clo) VALUES
        ('Smith', 'Vantage MIPS', 'ski_helmet', 1),
        ('Example', 'Helmet', 'ski_helmet', 1),
        ('Example', 'Hat', 'liner_beanie', 0.5);
    `);
    migration = await readFile(migrationPath, "utf8");
  }, 20_000);

  afterAll(async () => { await db?.close(); });

  it("backfills direct URLs, preserves explicit URLs and all other catalog data, and replays safely", async () => {
    const original = await catalogRows();
    const policies = (await db.query("SELECT * FROM pg_policies ORDER BY tablename, policyname")).rows;
    await db.exec(migration);
    const migrated = await catalogRows();
    const withoutImage = (rows: typeof migrated) => rows.map(({ table_name, row }) => {
      const data = { ...row };
      delete data.item_image_url;
      return { table_name, row: data };
    });
    expect(withoutImage(migrated)).toEqual(withoutImage(original));
    expect((await db.query("SELECT * FROM pg_policies ORDER BY tablename, policyname")).rows).toEqual(policies);

    const urls = Object.fromEntries(migrated.map(({ row }) => [row.model_name, row.item_image_url]));
    expect(urls).toMatchObject({
      "Lofoten Gore-Tex Pro Jacket": "/images/items/norrona-lofoten-gore-tex-pro-jacket.jpg",
      "Gamma MX Hoody": "/images/items/arcteryx-gamma-mx-hoody.jpg",
      "Heat Midweight Crew": "https://www.rei.com/media/e95a1679-4f82-4d6b-b67c-0502c6af70f9.jpg?size=784x588",
      "Beta AR Jacket": "/images/silhouettes/hooded-jacket.png",
      Base: "/images/silhouettes/base-layer-top.png",
      Pants: "/images/silhouettes/heavy-ski-pants.png",
      Vest: "/images/silhouettes/vest.png",
      "DAS Parka": "https://cdn.example.com/reviewed.webp",
      "Local photo": "/images/items/patagonia-capilene-midweight.png",
      "Stormtracker Sensor Gloves": "/images/items/outdoor-research-stormtracker-sensor-gloves.png",
      Mittens: "/images/silhouettes/mittens.png",
      Liners: "/images/silhouettes/gloves-lightweight.png",
      "Vantage MIPS": "/images/items/smith-vantage-mips.jpg",
      Helmet: "/images/silhouettes/ski-helmet.png",
      Hat: "/images/silhouettes/beanie.png",
    });
    for (const url of Object.values(urls) as string[]) {
      expect(url).not.toMatch(/^\/(api\/media\/item-image|media\/items\/)/);
      if (url.startsWith("/")) await access(`public${url}`);
    }

    await db.exec(migration);
    expect(await catalogRows()).toEqual(migrated);
  });

  it("allows new items without images and clearing an existing photo without regenerating a lookup URL", async () => {
    await db.exec(migration);
    await db.exec(`
      INSERT INTO garments (brand, model_name, category, garment_type)
      VALUES ('New', 'No photo', 'base_layer', 'top_long_sleeve');
      INSERT INTO handwear (brand, model_name, handwear_type, rcl_clo, item_image_url)
      VALUES ('New', 'No photo', 'liner_glove', 0.5, '  ');
      INSERT INTO headwear (brand, model_name, headwear_type, rcl_clo, item_image_url)
      VALUES ('New', 'No photo', 'liner_beanie', 0.5, NULL);
      UPDATE garments SET item_image_url = NULL WHERE model_name = 'DAS Parka';
    `);
    const rows = (await catalogRows()).filter(({ row }) => row.brand === "New" || row.model_name === "DAS Parka");
    expect(rows).toHaveLength(4);
    for (const { row } of rows) {
      expect(row.item_image_url).toBeNull();
      expect(row.brand_logo_url).toMatch(/^\/api\/media\/brand-logo\?/);
    }
    expect((await db.query("SELECT proconfig, prosecdef FROM pg_proc WHERE oid = 'public.set_item_media_urls()'::regprocedure")).rows[0])
      .toEqual({ proconfig: ['search_path=""'], prosecdef: false });
  });

  it("only seeds photo paths that exist in the checkout", async () => {
    const photos = JSON.parse(migration.split("$photos$")[1]) as Record<string, string>;
    for (const url of Object.values(photos)) {
      if (url.startsWith("/")) await access(`public${url}`);
    }
  });

  it("restores newer main-branch photos without overwriting subsequent photo edits", async () => {
    const repair = await readFile("supabase/migrations/20261027001728_restore_current_catalog_photos.sql", "utf8");
    await db.exec(repair);
    const repaired = await catalogRows();
    const expected = {
      "Heat Midweight Crew": "/images/items/32-degrees-heat-midweight-crew.jpg",
      "Weather Shield Ski Jacket": "/images/items/avalanche-weather-shield-ski-jacket.jpg",
      "GT260 Quantum Hood": "/images/items/icebreaker-gt260-quantum-hood.jpg",
      "Shifter Long Sleeve Zip Hood": "/images/items/icebreaker-shifter-long-sleeve-zip-hood.jpg",
      "Falketind Thermo40 Zip Hood": "/images/items/norrona-falketind-thermo40-zip-hood.jpg",
      "Senja Alpha90 Hood": "/images/items/norrona-senja-alpha90-hood.jpg",
    };
    expect(Object.fromEntries(repaired.map(({ row }) => [row.model_name, row.item_image_url]))).toMatchObject(expected);
    for (const url of Object.values(expected)) await access(`public${url}`);

    await db.exec(repair);
    expect(await catalogRows()).toEqual(repaired);

    await db.exec("UPDATE garments SET item_image_url = 'https://cdn.example.com/new-photo.webp' WHERE brand = '32 Degrees'");
    await db.exec(repair);
    expect((await db.query("SELECT item_image_url FROM garments WHERE brand = '32 Degrees'")).rows[0])
      .toEqual({ item_image_url: "https://cdn.example.com/new-photo.webp" });
  });
});
