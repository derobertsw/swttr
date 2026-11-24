// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';

// The catalog's seed history, as the thermal calibration test replays it,
// then 036 and #412's over-pant seed.
const SEED_HISTORY = [
  '001_schema.sql', '002_seed_garments.sql', '006_seed_new_items.sql', '007_item_media_urls.sql',
  '008_seed_media_asset_urls.sql', '009_fix_arm_clo_values.sql', '011_seed_ogl_recommended_items.sql',
  '022_running_xc_clothing_semantics.sql', '033_seed_fp_movement_lift_love.sql', '034_seed_fp_ski_collection.sql',
  '035_catalog_whole_body_and_puffy_clo.sql', '036_catalog_outerwear_t2103_scale.sql',
];
const SEED = 'supabase/migrations/20261122120000_seed_bd_solution_belay_pants.sql';
const THERMAL = ['rcl_torso', 'rcl_arms', 'rcl_legs', 'rcl_whole_body', 'recl_torso', 'recl_arms', 'recl_legs',
  'recl_whole_body', 'evap_potential', 'confidence_score', 'uncertainty_clo'] as const;

type Row = Record<string, unknown>;
let db: PGlite;
let seed: string;

const overPants = async () => (await db.query<Row>(`SELECT g.*, row_to_json(t) AS thermal, row_to_json(p) AS protection,
    row_to_json(a) AS ratings, row_to_json(v) AS ventilation,
    (SELECT count(*)::int FROM garment_materials m WHERE m.garment_id = g.id) AS materials
  FROM garments g
  JOIN garment_thermal_properties t ON t.garment_id = g.id
  JOIN garment_protection p ON p.garment_id = g.id
  JOIN garment_activity_ratings a ON a.garment_id = g.id
  JOIN garment_ventilation v ON v.garment_id = g.id
  WHERE g.brand = 'Black Diamond' AND g.model_name = 'Solution 4.0 Pants'`)).rows;

describe('#412 belay over-pant seed in Postgres', () => {
  beforeAll(async () => {
    db = await PGlite.create();
    for (const file of SEED_HISTORY) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    seed = await readFile(SEED, 'utf8');
  }, 60_000);
  afterAll(async () => { await db?.close(); });

  it('adds one over-pant warmer than the 1.80 clo insulated pants, and replays without duplicates', async () => {
    const before = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM garments')).rows[0].n;
    const warmest = (await db.query<{ legs: string }>(`SELECT max(t.rcl_legs) AS legs FROM garments g
      JOIN garment_thermal_properties t ON t.garment_id = g.id WHERE g.covers_legs`)).rows[0].legs;
    expect(Number(warmest)).toBe(1.8);

    await db.exec(seed);
    await db.exec(seed);
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM garments')).rows[0].n).toBe(before + 1);
    const rows = await overPants();
    expect(rows).toHaveLength(1);
    expect(rows[0].materials).toBe(4);
    expect(Number((rows[0].thermal as Row).rcl_legs)).toBeGreaterThan(2);
  }, 30_000);

  it('seeds the values the golden fixture uses', async () => {
    // The seed is idempotent, so applying it here lets this test run on its own.
    await db.exec(seed);
    const [row] = await overPants();
    const fixture = catalog.garments.find(g => g.brand === 'Black Diamond' && g.model_name === 'Solution 4.0 Pants') as Row | undefined;
    expect(fixture).toBeDefined();
    const pick = (source: Row, keys: readonly string[]) => Object.fromEntries(keys.map(k => [k, source[k] === null ? null : Number(source[k])]));
    for (const key of ['category', 'garment_type', 'covers_torso', 'covers_arms', 'covers_legs', 'hood_type',
      'weight_grams', 'suitable_activities', 'usage']) {
      expect(row[key], key).toEqual(fixture![key]);
    }
    expect(Number(row.msrp_usd)).toBe(fixture!.msrp_usd);
    expect(pick(row.thermal as Row, THERMAL)).toEqual(pick(fixture!.garment_thermal_properties as Row, THERMAL));
    const protection = row.protection as Row;
    const fixtureProtection = fixture!.garment_protection as Row;
    expect([protection.windproof_rating, protection.waterproof_rating])
      .toEqual([fixtureProtection.windproof_rating, fixtureProtection.waterproof_rating]);
    const scores = ['xc_skiing_score', 'ski_touring_uphill_score', 'ski_touring_downhill_score', 'alpine_skiing_score'] as const;
    expect(pick(row.ratings as Row, scores)).toEqual(pick(fixture!.garment_activity_ratings as Row, scores));
    expect((row.ventilation as Row).has_side_vents).toBe(true);
  });

  it('leaves an existing row with either name alone', async () => {
    const target = await PGlite.create();
    try {
      for (const file of SEED_HISTORY.slice(0, 8)) await target.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
      await target.exec(`INSERT INTO garments (brand, model_name, category, garment_type, covers_legs)
        VALUES ('Black Diamond', 'Belay Pants', 'insulation_synthetic', 'pants', true)`);
      await target.exec(seed);
      const names = (await target.query<{ model_name: string }>(
        `SELECT model_name FROM garments WHERE brand = 'Black Diamond'`)).rows.map(r => r.model_name);
      expect(names).toEqual(['Belay Pants']);
    } finally {
      await target.close();
    }
  }, 60_000);
});
