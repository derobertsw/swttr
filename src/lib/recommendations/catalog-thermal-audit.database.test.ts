// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { REGIONAL_WEIGHTS } from '@/lib/biophysics/constants';

// Replaying the catalog's seed history reproduces production's thermal values
// (checked against the live catalog on 2026-10-17, 116 garments), so 035 runs on
// the same rows.
const SEED_HISTORY = [
  '001_schema.sql', '002_seed_garments.sql', '006_seed_new_items.sql', '007_item_media_urls.sql',
  '008_seed_media_asset_urls.sql', '009_fix_arm_clo_values.sql', '011_seed_ogl_recommended_items.sql',
  '022_running_xc_clothing_semantics.sql', '033_seed_fp_movement_lift_love.sql', '034_seed_fp_ski_collection.sql',
];
const COLUMNS = [
  'rcl_torso', 'rcl_arms', 'rcl_legs', 'rcl_whole_body', 'recl_torso', 'recl_arms', 'recl_legs', 'recl_whole_body',
  'confidence_score', 'uncertainty_clo', 'data_source',
] as const;
type Row = Record<string, string | number | null>;

let migration: string;
let db: PGlite;

async function seededCatalog() {
  const seeded = await PGlite.create();
  for (const file of SEED_HISTORY) await seeded.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  return seeded;
}

async function thermalRows(target: PGlite) {
  const { rows } = await target.query<Row>(`SELECT g.brand, g.model_name, ${COLUMNS.map(c => `t.${c}`).join(', ')}, t.updated_at
    FROM garments g JOIN garment_thermal_properties t ON t.garment_id = g.id ORDER BY g.brand, g.model_name`);
  return rows;
}

const numberOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const values = (row: Record<string, unknown>) => Object.fromEntries(COLUMNS.map(c =>
  [c, c === 'data_source' ? row[c] ?? null : numberOrNull(row[c])]));
const weighted = (row: Row, prefix: 'rcl' | 'recl') =>
  REGIONAL_WEIGHTS.torso * Number(row[`${prefix}_torso`] ?? 0)
  + REGIONAL_WEIGHTS.arm * Number(row[`${prefix}_arms`] ?? 0)
  + REGIONAL_WEIGHTS.leg * Number(row[`${prefix}_legs`] ?? 0);

describe('catalog thermal audit migration (035) in Postgres', () => {
  beforeAll(async () => {
    migration = await readFile('supabase/migrations/035_catalog_whole_body_and_puffy_clo.sql', 'utf8');
    db = await seededCatalog();
    await db.exec(migration);
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it('puts every garment on the regional weighting and matches the golden fixture', async () => {
    const rows = await thermalRows(db);
    expect(rows).toHaveLength(116);
    const offWeighting = rows.filter(row =>
      Math.abs(Number(row.rcl_whole_body) - weighted(row, 'rcl')) > 0.02 + 1e-9
      || Math.abs(Number(row.recl_whole_body) - weighted(row, 'recl')) > 0.5 + 1e-9);
    expect(offWeighting.map(row => `${row.brand} ${row.model_name}`)).toEqual([]);

    const byName = new Map(rows.map(row => [`${row.brand} ${row.model_name}`, row]));
    const actual = catalog.garments.map(g => ({ name: `${g.brand} ${g.model_name}`, ...values(byName.get(`${g.brand} ${g.model_name}`) ?? {}) }));
    const expected = catalog.garments.map(g => ({
      name: `${g.brand} ${g.model_name}`,
      ...values(g.garment_thermal_properties as Record<string, unknown>),
    }));
    expect(actual).toEqual(expected);
  });

  it('keeps the lab rows and re-derives the puffies on the lab scale', async () => {
    const rows = new Map((await thermalRows(db)).map(row => [`${row.brand} ${row.model_name}`, values(row)]));
    expect(rows.get('Patagonia Nano-Air Hoody')).toMatchObject({ rcl_torso: 2.34, rcl_arms: 2.04, rcl_whole_body: 1.68, data_source: null });
    expect(rows.get('Patagonia DAS Parka')).toMatchObject({ rcl_torso: 4.7, rcl_arms: 2.94, rcl_whole_body: 3.09 });
    // Same 65 g/m² PlumaFill, so the same insulation (they differed by 1.8x).
    expect(rows.get('Patagonia Micro Puff Hoody')).toMatchObject({ rcl_torso: 2.45, rcl_arms: 2.15 });
    expect(rows.get('Patagonia DAS Light Hoody')).toMatchObject({ rcl_torso: 2.45, rcl_arms: 2.15 });
    expect(rows.get("Arc'teryx Atom LT Hoody")).toMatchObject({
      rcl_torso: 2.35, rcl_arms: 2.05, rcl_whole_body: 1.69, uncertainty_clo: 0.3, confidence_score: 0.75,
      data_source: 'docs/catalog-thermal-audit.md#puffy-recalibration',
    });
    // Added after the audit at Powder Lite Vest's old 0.95; it moves with that peer.
    expect(rows.get('FP Movement Happy Trails Poncho')).toMatchObject({
      rcl_torso: 2, rcl_arms: 0.38, recl_torso: 37.89, recl_arms: 8.42, rcl_whole_body: 1.1, recl_whole_body: 21.05,
      uncertainty_clo: 0.6, confidence_score: 0.4,
      data_source: expect.stringMatching(/^https:\/\/www\.freepeople\.com\/.* ; 035: recalibrated to the lab scale/),
    });
    expect(rows.get('Columbia Powder Lite Vest')).toMatchObject({ rcl_torso: 2 });
    // Unpublished fill: low confidence and a wider allowance.
    expect(rows.get('Helly Hansen Odin Stretch Hooded Light Insulator 2.0')).toMatchObject({ uncertainty_clo: 0.6, confidence_score: 0.5 });
  });

  it('replays without touching a row', async () => {
    const before = await thermalRows(db);
    await db.exec(migration);
    expect(await thermalRows(db)).toEqual(before);
  });

  it('leaves a puffy alone once any field it replaces was edited by hand, but still fixes its whole body', async () => {
    const edited = await seededCatalog();
    const edit = (model: string, set: string) => edited.exec(
      `UPDATE garment_thermal_properties SET ${set} FROM garments g WHERE garment_id = g.id AND g.model_name = '${model}'`);
    try {
      await edit('Atom LT Hoody', 'rcl_torso = 1.30');
      await edit('Micro Puff Hoody', 'recl_torso = 25');
      await edit('Macro Puff Hoody', 'confidence_score = 0.60');
      await edit('Ghost Whisperer/2 Jacket', "data_source = 'hand-checked'");
      await edit('Nano-Air Light Vest', 'uncertainty_clo = 0.20');
      await edited.exec(migration);
      const rows = new Map((await thermalRows(edited)).map(row => [row.model_name, values(row)]));
      expect(rows.get('Atom LT Hoody')).toMatchObject({ rcl_torso: 1.3, rcl_arms: 1, recl_torso: 22, data_source: null, rcl_whole_body: 0.9 });
      expect(rows.get('Micro Puff Hoody')).toMatchObject({ rcl_torso: 1.1, recl_torso: 25, data_source: null });
      expect(rows.get('Macro Puff Hoody')).toMatchObject({ rcl_torso: 1.65, confidence_score: 0.6, data_source: null });
      expect(rows.get('Ghost Whisperer/2 Jacket')).toMatchObject({ rcl_torso: 1.45, data_source: 'hand-checked', uncertainty_clo: null });
      expect(rows.get('Nano-Air Light Vest')).toMatchObject({ rcl_torso: 0.85, uncertainty_clo: 0.2, data_source: null });
      // Untouched puffies are still recalibrated.
      expect(rows.get('DAS Light Hoody')).toMatchObject({ rcl_torso: 2.45 });
    } finally {
      await edited.close();
    }
  }, 30_000);
});
