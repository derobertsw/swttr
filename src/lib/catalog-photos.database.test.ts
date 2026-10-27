// @vitest-environment node
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const targets = [
  { table: "garments", brand: "Patagonia", model: "Nano-Air Ultralight Full-Zip Hoody", file: "patagonia-nano-air-ultralight-full-zip-hoody.jpg" },
  { table: "garments", brand: "Patagonia", model: "DAS Light Hoody", file: "patagonia-das-light-hoody.jpg" },
  { table: "garments", brand: "Smartwool", model: "Classic Thermal Merino 1/4 Zip", file: "smartwool-classic-thermal-merino-quarter-zip.png" },
  { table: "garments", brand: "Helly Hansen", model: "Alpha LifaLoft Jacket", file: "helly-hansen-alpha-lifaloft-jacket.jpg" },
  { table: "headwear", brand: "Scott", model: "Flow Pro MIPS", file: "scott-flow-pro-mips.png" },
  { table: "garments", brand: "Patagonia", model: "Capilene Cool Lightweight", file: "patagonia-capilene-cool-lightweight.jpg" },
  { table: "garments", brand: "Patagonia", model: "Capilene Midweight Bottoms", file: "patagonia-capilene-midweight-bottoms.jpg" },
  { table: "garments", brand: "Patagonia", model: "Capilene Thermal Weight Boot-Length Bottoms", file: "patagonia-capilene-thermal-weight-boot-length-bottoms.jpg" },
  { table: "garments", brand: "Patagonia", model: "Nano-Air Hoody", file: "patagonia-nano-air-hoody.jpg" },
  { table: "handwear", brand: "Patagonia", model: "Capilene Midweight Liner Glove", file: "patagonia-capilene-midweight-liner-glove.jpg" },
  { table: "headwear", brand: "Smartwool", model: "Thermal Merino Reversible Neck Gaiter", file: "smartwool-thermal-merino-reversible-neck-gaiter.png" },
  { table: "garments", brand: "32 Degrees", model: "Heat Midweight Crew", file: "32-degrees-heat-midweight-crew.jpg" },
  { table: "handwear", brand: "Helly Hansen", model: "Swift HT Gloves", file: "helly-hansen-swift-ht-gloves.jpg" },
  { table: "garments", brand: "Patagonia", model: "R1 Pullover", file: "patagonia-r1-pullover.jpg" },
];
const migrationPath = "supabase/migrations/20261027140102_high_impact_catalog_photos.sql";

async function readCatalog(db: PGlite) {
  return (await db.query<{ table_name: string; row: Record<string, unknown> }>(`
    SELECT * FROM (
      SELECT 'garments' AS table_name, to_jsonb(g) - 'updated_at' AS row FROM garments g
      UNION ALL SELECT 'handwear', to_jsonb(h) - 'updated_at' FROM handwear h
      UNION ALL SELECT 'headwear', to_jsonb(h) - 'updated_at' FROM headwear h
    ) AS catalog ORDER BY table_name, row->>'brand', row->>'model_name'
  `)).rows;
}

describe("issue #84 catalog photos", () => {
  it.each(["legacy", "direct"])("updates all 14 seeded items from %s URLs without changing other catalog data", async (state) => {
    const db = await PGlite.create();
    try {
      for (const name of [
        "001_schema.sql",
        "002_seed_garments.sql",
        "003_seed_extremities.sql",
        "007_item_media_urls.sql",
        "008_seed_media_asset_urls.sql",
        "011_seed_ogl_recommended_items.sql",
        ...(state === "direct" ? ["20261026201302_direct_catalog_image_urls.sql"] : []),
      ]) {
        await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
      }
      // Also exercise the missing local path observed in the live catalog.
      await db.exec(`UPDATE garments SET item_image_url = '/images/items/32-degrees-heat-midweight-crew.jpg'
        WHERE brand = '32 Degrees' AND model_name = 'Heat Midweight Crew'`);
      const before = await readCatalog(db);
      const policies = (await db.query("SELECT * FROM pg_policies ORDER BY tablename, policyname")).rows;
      const migration = await readFile(migrationPath, "utf8");
      await db.exec(migration);
      const after = await readCatalog(db);

      expect(targets).toHaveLength(14);
      for (const target of targets) {
        const matches = after.filter(({ table_name, row }) => table_name === target.table
          && row.brand === target.brand && row.model_name === target.model);
        expect(matches, target.model).toHaveLength(1);
        expect(matches[0].row.item_image_url, target.model).toBe(`/images/items/${target.file}`);
        const image = await readFile(`public/images/items/${target.file}`);
        // Detect HTML error pages saved under image filenames, including HTTP 200 maintenance pages.
        expect(image.subarray(0, target.file.endsWith(".png") ? 8 : 3).toString("hex"), target.file)
          .toBe(target.file.endsWith(".png") ? "89504e470d0a1a0a" : "ffd8ff");
      }

      const expected = before.map(({ table_name, row }) => {
        const target = targets.find(t => t.table === table_name && t.brand === row.brand && t.model === row.model_name);
        return { table_name, row: target ? { ...row, item_image_url: `/images/items/${target.file}` } : row };
      });
      expect(after).toEqual(expected);
      expect((await db.query("SELECT * FROM pg_policies ORDER BY tablename, policyname")).rows).toEqual(policies);
      await db.exec(migration);
      expect(await readCatalog(db)).toEqual(after);

      // A later curated replacement must survive a replay, in each catalog table.
      await db.exec(`
        UPDATE garments SET item_image_url = 'https://cdn.example.com/reviewed.jpg'
          WHERE brand = 'Patagonia' AND model_name = 'DAS Light Hoody';
        UPDATE handwear SET item_image_url = '/images/items/reviewed-gloves.png'
          WHERE brand = 'Patagonia' AND model_name = 'Capilene Midweight Liner Glove';
        UPDATE headwear SET item_image_url = 'https://cdn.example.com/reviewed-helmet.png'
          WHERE brand = 'Scott' AND model_name = 'Flow Pro MIPS';
      `);
      const curated = await readCatalog(db);
      await db.exec(migration);
      expect(await readCatalog(db)).toEqual(curated);
    } finally {
      await db.close();
    }
  }, 30_000);
});
