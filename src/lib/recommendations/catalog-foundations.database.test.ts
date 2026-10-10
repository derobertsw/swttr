// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';

let db: PGlite;
let migration: string;
const basics = catalog.garments.filter(g => g.brand === 'SWTTR');
const legacy = catalog.garments.filter(g => g.brand !== 'SWTTR');

describe('clothing foundation migration in Postgres', () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(await readFile('supabase/migrations/001_schema.sql', 'utf8'));
    // Load existing identities/properties; semantics are introduced by migration.
    for (const g of legacy) {
      await db.query('INSERT INTO garments (id,brand,model_name,category,garment_type,covers_torso,covers_arms,covers_legs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [g.id,g.brand,g.model_name,g.category,g.garment_type,g.covers_torso,g.covers_arms,g.covers_legs]);
      await db.query('INSERT INTO garment_thermal_properties (garment_id,rcl_torso,rcl_arms,rcl_legs,rcl_whole_body) VALUES ($1,$2,$3,$4,$5)',
        [g.id,g.garment_thermal_properties.rcl_torso,g.garment_thermal_properties.rcl_arms,g.garment_thermal_properties.rcl_legs,g.garment_thermal_properties.rcl_whole_body]);
    }
    migration = await readFile('supabase/migrations/022_running_xc_clothing_semantics.sql', 'utf8');
  }, 20_000);
  afterAll(async () => { await db?.close(); });

  it('preserves legacy insulation, catalog identities and access policies; replays without duplicates', async () => {
    const original = (await db.query('SELECT garment_id,rcl_torso,rcl_arms,rcl_legs,rcl_whole_body FROM garment_thermal_properties ORDER BY garment_id')).rows;
    const policies = (await db.query('SELECT * FROM pg_policies ORDER BY tablename,policyname')).rows;
    await db.exec(migration);
    await db.exec(migration);
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM garments')).rows[0].count).toBe(legacy.length + 3);
    expect((await db.query('SELECT * FROM pg_policies ORDER BY tablename,policyname')).rows).toEqual(policies);
    expect((await db.query('SELECT garment_id,rcl_torso,rcl_arms,rcl_legs,rcl_whole_body FROM garment_thermal_properties WHERE garment_id = ANY($1::uuid[]) ORDER BY garment_id', [legacy.map(g => g.id)])).rows).toEqual(original);
    for (const basic of basics) {
      const row = (await db.query<{ usage: string; coverage_arms: string; coverage_legs: string; rcl_legs: string; rcl_whole_body: string; generic_estimate: boolean; data_source: string }>('SELECT g.usage,g.coverage_arms,g.coverage_legs,t.rcl_legs,t.rcl_whole_body,t.generic_estimate,t.data_source FROM garments g JOIN garment_thermal_properties t ON g.id=t.garment_id WHERE g.id=$1', [basic.id])).rows[0];
      expect(row.usage).toBe('standalone');
      expect(Number(row.coverage_arms)).toBe(basic.coverage_arms);
      expect(Number(row.coverage_legs)).toBe(basic.coverage_legs);
      expect(Number(row.rcl_legs)).toBe(basic.garment_thermal_properties.rcl_legs);
      expect(Number(row.rcl_whole_body)).toBe(basic.garment_thermal_properties.rcl_whole_body);
      expect(row.generic_estimate).toBe(true);
      expect(row.data_source).toBeTruthy();
    }
  });

  it('rejects impossible coverage and keeps missing data null', async () => {
    await expect(db.query('UPDATE garments SET coverage_legs=1.1 WHERE id=$1', [basics[1].id])).rejects.toMatchObject({ code: '23514' });
    await db.query("INSERT INTO garments (brand,model_name,category,garment_type) VALUES ('Example','Unreviewed garment','base_layer','pants')");
    expect((await db.query("SELECT usage,coverage_legs FROM garments WHERE brand='Example'")).rows[0]).toEqual({ usage: null, coverage_legs: null });
  });

  it('checks matching clothing again at deployment time without replacing its data', async () => {
    const existing = await PGlite.create();
    try {
      await existing.exec(await readFile('supabase/migrations/001_schema.sql', 'utf8'));
      await existing.exec("INSERT INTO garments (brand,model_name,category,garment_type,covers_torso,covers_arms) VALUES ('Existing','Light shirt','base_layer','top_short_sleeve',true,true);");
      await existing.exec(migration);
      await existing.exec("INSERT INTO garments (brand,model_name,category,garment_type,usage,covers_legs) VALUES ('Existing','Standalone tights','base_layer','pants','standalone',true); DELETE FROM garments WHERE brand='SWTTR' AND garment_type IN ('shorts','pants'); INSERT INTO garments (brand,model_name,category,garment_type,covers_legs) VALUES ('Existing','Shorts','base_layer','shorts',true);");
      await existing.exec(migration);
      expect((await existing.query("SELECT model_name FROM garments WHERE brand='SWTTR'")).rows).toEqual([]);
      expect((await existing.query("SELECT count(*)::int AS count FROM garments WHERE brand='Existing'")).rows[0]).toEqual({ count: 3 });
    } finally { await existing.close(); }
  });
});
