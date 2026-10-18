// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { REGIONAL_WEIGHTS } from '@/lib/biophysics/constants';

// Replaying the catalog's seed history and 035 reproduces production's thermal
// values (checked against the live catalog on 2026-10-18, 116 garments), so
// 036 runs on the same rows.
const SEED_HISTORY = [
  '001_schema.sql', '002_seed_garments.sql', '006_seed_new_items.sql', '007_item_media_urls.sql',
  '008_seed_media_asset_urls.sql', '009_fix_arm_clo_values.sql', '011_seed_ogl_recommended_items.sql',
  '022_running_xc_clothing_semantics.sql', '033_seed_fp_movement_lift_love.sql', '034_seed_fp_ski_collection.sql',
  '035_catalog_whole_body_and_puffy_clo.sql',
];
const COLUMNS = [
  'rcl_torso', 'rcl_arms', 'rcl_legs', 'rcl_whole_body', 'recl_torso', 'recl_arms', 'recl_legs', 'recl_whole_body',
  'confidence_score', 'uncertainty_clo', 'data_source',
] as const;
type Row = Record<string, string | number | null>;

let migration: string;
let db: PGlite;

async function migratedCatalog(beforeMigration?: (target: PGlite) => Promise<unknown>) {
  const target = await PGlite.create();
  for (const file of SEED_HISTORY) await target.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await beforeMigration?.(target);
  await target.exec(migration);
  return target;
}

async function thermalRows(target: PGlite) {
  const { rows } = await target.query<Row>(`SELECT g.brand, g.model_name, g.category, g.weight_grams, a.activity_notes,
      ${COLUMNS.map(c => `t.${c}`).join(', ')}, t.updated_at
    FROM garments g JOIN garment_thermal_properties t ON t.garment_id = g.id
    LEFT JOIN garment_activity_ratings a ON a.garment_id = g.id
    ORDER BY g.brand, g.model_name`);
  return rows;
}

async function referenceRows(target: PGlite) {
  const { rows } = await target.query<Row>(`SELECT garment_description, measured_rcl_torso, measured_rcl_arm,
      measured_recl_torso, measured_recl_arm FROM calibration_reference ORDER BY garment_description`);
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, k === 'garment_description' ? v : Number(v)])));
}

const numberOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const values = (row: Record<string, unknown>) => Object.fromEntries(COLUMNS.map(c =>
  [c, c === 'data_source' ? row[c] ?? null : numberOrNull(row[c])]));
const weighted = (row: Row, prefix: 'rcl' | 'recl') =>
  REGIONAL_WEIGHTS.torso * Number(row[`${prefix}_torso`] ?? 0)
  + REGIONAL_WEIGHTS.arm * Number(row[`${prefix}_arms`] ?? 0)
  + REGIONAL_WEIGHTS.leg * Number(row[`${prefix}_legs`] ?? 0);

describe('catalog thermal calibration migration (036) in Postgres', () => {
  beforeAll(async () => {
    migration = await readFile('supabase/migrations/036_catalog_outerwear_t2103_scale.sql', 'utf8');
    db = await migratedCatalog();
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it('keeps every garment on the regional weighting and matches the golden fixture', async () => {
    const rows = await thermalRows(db);
    expect(rows).toHaveLength(116);
    const offWeighting = rows.filter(row =>
      Math.abs(Number(row.rcl_whole_body) - weighted(row, 'rcl')) > 0.02 + 1e-9
      || Math.abs(Number(row.recl_whole_body) - weighted(row, 'recl')) > 0.5 + 1e-9);
    expect(offWeighting.map(row => `${row.brand} ${row.model_name}`)).toEqual([]);

    const byName = new Map(rows.map(row => [`${row.brand} ${row.model_name}`, row]));
    const actual = catalog.garments.map(g => {
      const row = byName.get(`${g.brand} ${g.model_name}`) ?? {};
      return { name: `${g.brand} ${g.model_name}`, category: row.category, weight: numberOrNull(row.weight_grams), ...values(row) };
    });
    const expected = catalog.garments.map(g => ({
      name: `${g.brand} ${g.model_name}`, category: g.category, weight: numberOrNull(g.weight_grams),
      ...values(g.garment_thermal_properties as Record<string, unknown>),
    }));
    expect(actual).toEqual(expected);
  });

  it('puts shells and insulated outerwear on the T21-03 single-garment scale', async () => {
    const rows = new Map((await thermalRows(db)).map(row => [`${row.brand} ${row.model_name}`, values(row)]));
    // Hard shells: the T21-03 thin-shell mean, with their own Ret kept.
    expect(rows.get("Arc'teryx Beta AR Jacket")).toMatchObject({ rcl_torso: 0.75, rcl_arms: 0.6, recl_torso: 30, rcl_whole_body: 0.53, uncertainty_clo: 0.15 });
    expect(rows.get('Spyder Sentinel Gore-Tex Pant')).toMatchObject({ rcl_legs: 0.65, recl_legs: 28 });
    // Insulated jackets sit above a puffy of equal fill (Nano-Air, 60 g/m²: 2.34).
    expect(rows.get('Obermeyer Raze Jacket')).toMatchObject({ rcl_torso: 2.4, rcl_arms: 1.6 });
    expect(rows.get('Mountain Hardwear Firefall/2 Insulated Jacket')).toMatchObject({
      rcl_torso: 3.25, rcl_arms: 2.4, uncertainty_clo: 0.3, data_source: 'docs/catalog-thermal-calibration.md#per-garment-values',
    });
    // Insulated pants: between T21-03's Nano-Air Bottom (60 g, 1.75) and DAS Pants.
    expect(rows.get('Patagonia Insulated Powder Bowl Pants - Regular')).toMatchObject({ rcl_legs: 1.8 });
    // Unpublished fill: low confidence, wider allowance, provenance kept.
    expect(rows.get('FP Movement Lift Love Jacket')).toMatchObject({
      rcl_torso: 2.4, uncertainty_clo: 0.6, confidence_score: 0.45,
      data_source: expect.stringMatching(/^https:\/\/www\.freepeople\.com\/.* ; 036: T21-03 shell \+ fill increment/),
    });
    // Vests follow T21-03's Nano-Air Vest against its Hoody.
    expect(rows.get('Patagonia Nano-Air Light Vest')).toMatchObject({ rcl_torso: 1.6, uncertainty_clo: 0.3 });
    // Lab rows and soft shells already on the scale are untouched.
    expect(rows.get('Patagonia Nano-Air Hoody')).toMatchObject({ rcl_torso: 2.34, rcl_arms: 2.04, data_source: null });
    expect(rows.get("Arc'teryx Gamma Hoody")).toMatchObject({ rcl_torso: 0.95, rcl_arms: 0.8, data_source: null });
  });

  it('moves the Snowdrifter shells out of insulated outerwear', async () => {
    const rows = new Map((await thermalRows(db)).map(row => [row.model_name, row]));
    expect(rows.get('Snowdrifter Jacket')).toMatchObject({ category: 'hard_shell', weight_grams: 615 });
    expect(rows.get('Snowdrifter Bibs')).toMatchObject({ category: 'hard_shell', weight_grams: 584 });
    expect(String(rows.get('Snowdrifter Jacket')?.activity_notes)).toMatch(/^Uninsulated 3-layer H2No/);
  });

  it('corrects the seeded T21-03 reference rows', async () => {
    const rows = new Map((await referenceRows(db)).map(row => [row.garment_description, row]));
    expect(rows.get('ECWCS Fleece Jacket')).toMatchObject({ measured_rcl_arm: 1.32, measured_recl_arm: 21.7 });
    expect(rows.get('ECWCS ECW Parka')).toMatchObject({ measured_rcl_arm: 2.94, measured_recl_torso: 65.91, measured_recl_arm: 65.41 });
    expect(rows.get('SOF Lightweight Crew (Base Layer)')).toMatchObject({ measured_rcl_torso: 0.59, measured_rcl_arm: 0.43 });
    // Already right in the seed.
    expect(rows.get('SOF DAS Jacket (Heavy Insulation)')).toMatchObject({ measured_rcl_arm: 2.94, measured_recl_arm: 63.9 });
  });

  it('replays without touching a row', async () => {
    const before = [await thermalRows(db), await referenceRows(db)];
    await db.exec(migration);
    expect([await thermalRows(db), await referenceRows(db)]).toEqual(before);
  });

  it('leaves a row alone once any field it replaces was edited by hand', async () => {
    const edit = (target: PGlite, model: string, set: string) => target.exec(
      `UPDATE garment_thermal_properties SET ${set} FROM garments g WHERE garment_id = g.id AND g.model_name = '${model}'`);
    const edited = await migratedCatalog(async (target) => {
      await edit(target, 'Beta AR Jacket', 'rcl_torso = 0.30');
      await edit(target, 'Firefall/2 Insulated Jacket', "data_source = 'hand-checked'");
      await edit(target, 'Nano-Air Light Vest', 'uncertainty_clo = 0.20');
      await target.exec(`UPDATE garments SET weight_grams = 700 WHERE model_name = 'Snowdrifter Jacket'`);
    });
    try {
      const rows = new Map((await thermalRows(edited)).map(row => [row.model_name, { ...row, ...values(row) }]));
      expect(rows.get('Beta AR Jacket')).toMatchObject({ rcl_torso: 0.3, rcl_arms: 0.2, data_source: null });
      expect(rows.get('Firefall/2 Insulated Jacket')).toMatchObject({ rcl_torso: 1.5, data_source: 'hand-checked' });
      expect(rows.get('Nano-Air Light Vest')).toMatchObject({ rcl_torso: 1.85, uncertainty_clo: 0.2 });
      expect(rows.get('Snowdrifter Jacket')).toMatchObject({ category: 'outer_insulated', weight_grams: 700 });
      // Untouched rows are still recalibrated.
      expect(rows.get('Alpha FL Jacket')).toMatchObject({ rcl_torso: 0.75 });
    } finally {
      await edited.close();
    }
  }, 30_000);
});
