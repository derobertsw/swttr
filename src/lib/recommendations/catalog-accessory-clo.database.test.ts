// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import bikeHelmets from '@/test/fixtures/bike-helmets.json';
import { ACCESSORY_CLO_SCALE } from '@/lib/biophysics/constants';

// The seed history of the accessory tables. Replaying it reproduces the live
// catalog's 28 handwear and 41 headwear rows (checked read-only on
// 2026-11-19: no row has been edited since its seed), so the migration runs
// on the same rows.
const SEED_HISTORY = [
  '001_schema.sql', '003_seed_extremities.sql', '006_seed_new_items.sql', '007_item_media_urls.sql',
  '008_seed_media_asset_urls.sql', '011_seed_ogl_recommended_items.sql',
  '20261117031000_add_bike_helmet_type.sql', '20261117031100_seed_bike_helmets.sql',
];
const MIGRATION = 'supabase/migrations/20261119120000_anchor_accessory_clo.sql';
const SOURCE = 'docs/catalog-accessory-clo.md#per-item-values';
const TABLES = { handwear: 'handwear_type', headwear: 'headwear_type' } as const;
type Table = keyof typeof TABLES;
type Row = { brand: string; model_name: string; type: string; rcl_clo: number; confidence_score: number | null;
  uncertainty_clo: number | null; data_source: string | null; updated_at?: unknown };

let migration: string;
let seeded: Record<Table, Row[]>;
let db: PGlite;

async function seededCatalog() {
  const target = await PGlite.create();
  for (const file of SEED_HISTORY) await target.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  return target;
}

async function rows(target: PGlite, table: Table, withUpdatedAt = false): Promise<Row[]> {
  const columns = await target.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [table]);
  const has = (name: string) => columns.rows.some(row => row.column_name === name);
  const provenance = ['confidence_score', 'uncertainty_clo', 'data_source']
    .map(name => (has(name) ? name : `NULL AS ${name}`)).join(', ');
  const { rows: result } = await target.query<Record<string, unknown>>(`SELECT brand, model_name,
      ${TABLES[table]}::text AS type, rcl_clo, ${provenance}${withUpdatedAt ? ', updated_at' : ''}
    FROM ${table} ORDER BY brand, model_name`);
  return result.map(row => ({
    ...row,
    rcl_clo: Number(row.rcl_clo),
    confidence_score: row.confidence_score == null ? null : Number(row.confidence_score),
    uncertainty_clo: row.uncertainty_clo == null ? null : Number(row.uncertainty_clo),
  }) as Row);
}

const round2 = (value: number) => Math.round(value * 100 + 1e-9) / 100;
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const key = (row: { brand: string; model_name: string }) => `${row.brand} ${row.model_name}`;

describe('accessory clo migration (#376) in Postgres', () => {
  beforeAll(async () => {
    migration = await readFile(MIGRATION, 'utf8');
    db = await seededCatalog();
    seeded = { handwear: await rows(db, 'handwear'), headwear: await rows(db, 'headwear') };
    await db.exec(migration);
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it('rescales every seeded row by the factor the code bands carry', async () => {
    expect(seeded.handwear).toHaveLength(28);
    expect(seeded.headwear).toHaveLength(41);
    for (const [table, scale] of [['handwear', ACCESSORY_CLO_SCALE.hands], ['headwear', ACCESSORY_CLO_SCALE.head]] as const) {
      const before = new Map(seeded[table].map(row => [key(row), row.rcl_clo]));
      const after = await rows(db, table);
      expect(after).toHaveLength(before.size);
      for (const row of after) {
        expect(row.rcl_clo, key(row)).toBe(round2(before.get(key(row))! * scale));
        expect(row.data_source, key(row)).toBe(SOURCE);
        expect(row.uncertainty_clo, key(row)).toBeGreaterThanOrEqual(0.07);
        expect(row.confidence_score, key(row)).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('keeps each part in the catalog order its estimates had', async () => {
    for (const table of ['handwear', 'headwear'] as const) {
      const before = seeded[table];
      const after = new Map((await rows(db, table)).map(row => [key(row), row.rcl_clo]));
      for (const a of before) for (const b of before) {
        if (a.rcl_clo < b.rcl_clo) expect(after.get(key(a))!).toBeLessThanOrEqual(after.get(key(b))!);
      }
    }
  });

  it('lands the types with a manikin analogue within their uncertainty of it', async () => {
    const byType = async (table: Table, type: string) => (await rows(db, table)).filter(row => row.type === type);
    // USARIEM T18-01 Tables 7 and 8 (hand zones), T22-14 Table 3.
    const anchors: Array<[Table, string, number]> = [
      ['handwear', 'liner_glove', 0.26],
      ['handwear', 'lobster_mitten', 1.82],
      ['headwear', 'midweight_beanie', 0.32],
      ['headwear', 'balaclava_light', 0.39],
    ];
    for (const [table, type, anchor] of anchors) {
      const items = await byType(table, type);
      expect(Math.abs(mean(items.map(row => row.rcl_clo)) - anchor), type)
        .toBeLessThanOrEqual(mean(items.map(row => row.uncertainty_clo!)));
    }
    // Mitten systems sit between the USMC liner + shell (1.74) and the Army set (2.85).
    const mittens = (await byType('handwear', 'mitten')).filter(row => row.model_name !== 'Venta Mitten');
    for (const row of mittens) expect(row.rcl_clo).toBeGreaterThanOrEqual(1.74 - row.uncertainty_clo!);
    for (const row of mittens) expect(row.rcl_clo).toBeLessThanOrEqual(2.85);
    // A midweight beanie plus a light balaclava: T18-01 measured 0.71 for the pair.
    const pair = mean((await byType('headwear', 'midweight_beanie')).map(row => row.rcl_clo))
      + mean((await byType('headwear', 'balaclava_light')).map(row => row.rcl_clo));
    expect(Math.abs(pair - 0.71)).toBeLessThanOrEqual(0.07);
    // Bike helmets: a head-manikin study measured 0 to 0.15 clo over a bare head.
    for (const row of await byType('headwear', 'bike_helmet')) expect(row.rcl_clo).toBeLessThanOrEqual(0.15);
  });

  it('matches the golden fixtures', async () => {
    const byName = new Map([...await rows(db, 'handwear'), ...await rows(db, 'headwear')].map(row => [key(row), row]));
    const fixtures = [...catalog.handwear, ...catalog.headwear, ...bikeHelmets.headwear] as Array<Record<string, unknown>>;
    expect(fixtures).toHaveLength(66);
    const actual = fixtures.map(item => {
      const row = byName.get(key(item as Row));
      return { name: key(item as Row), rcl_clo: row?.rcl_clo, confidence_score: row?.confidence_score,
        uncertainty_clo: row?.uncertainty_clo, data_source: row?.data_source };
    });
    const expected = fixtures.map(item => ({ name: key(item as Row), rcl_clo: item.rcl_clo,
      confidence_score: item.confidence_score, uncertainty_clo: item.uncertainty_clo, data_source: item.data_source }));
    expect(actual).toEqual(expected);
  });

  it('replays without touching a row', async () => {
    const before = [await rows(db, 'handwear', true), await rows(db, 'headwear', true)];
    await db.exec(migration);
    expect([await rows(db, 'handwear', true), await rows(db, 'headwear', true)]).toEqual(before);
  });

  it('leaves a row alone once its clo was edited by hand', async () => {
    const edited = await seededCatalog();
    try {
      await edited.exec(`UPDATE handwear SET rcl_clo = 1.10 WHERE model_name = 'Alti Mitt';
        UPDATE headwear SET rcl_clo = 0.40 WHERE model_name = 'Ninjaclava';`);
      await edited.exec(migration);
      const hands = new Map((await rows(edited, 'handwear')).map(row => [row.model_name, row]));
      const heads = new Map((await rows(edited, 'headwear')).map(row => [row.model_name, row]));
      expect(hands.get('Alti Mitt')).toMatchObject({ rcl_clo: 1.1, data_source: null, uncertainty_clo: null });
      expect(heads.get('Ninjaclava')).toMatchObject({ rcl_clo: 0.4, data_source: null });
      // Untouched rows are still rescaled.
      expect(hands.get('Mercury Mitt')).toMatchObject({ rcl_clo: 2.1, data_source: SOURCE });
    } finally {
      await edited.close();
    }
  }, 30_000);
});
