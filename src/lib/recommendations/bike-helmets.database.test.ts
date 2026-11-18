// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import bikeHelmets from '@/test/fixtures/bike-helmets.json';

const ENUM = 'supabase/migrations/20261117031000_add_bike_helmet_type.sql';
const SEED = 'supabase/migrations/20261117031100_seed_bike_helmets.sql';
const COLUMNS = 'brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static';
const opened: PGlite[] = [];

/** A database with the schema and extremity seed as they were before the enum migration. */
async function freshDatabase() {
  const db = await PGlite.create();
  opened.push(db);
  for (const file of ['001_schema.sql', '003_seed_extremities.sql']) {
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  return db;
}

const helmets = async (db: PGlite, type: string) => (await db.query<Record<string, unknown>>(
  `SELECT ${COLUMNS} FROM headwear WHERE headwear_type::text = $1 ORDER BY brand, model_name`, [type])).rows;

describe('#373 bike helmet migrations in Postgres', () => {
  afterEach(async () => { await Promise.all(opened.splice(0).map(db => db.close())); });

  it('needs the enum migration applied, and committed, before the seed', async () => {
    const db = await freshDatabase();
    const seed = await readFile(SEED, 'utf8');
    await expect(db.exec(seed)).rejects.toThrow(/bike_helmet/);

    const skiHelmets = await helmets(db, 'ski_helmet');
    for (let run = 0; run < 2; run++) {
      await db.exec(await readFile(ENUM, 'utf8'));
      await db.exec(seed);
    }
    expect(await helmets(db, 'ski_helmet')).toEqual(skiHelmets);
    expect((await helmets(db, 'bike_helmet')).map(row => `${row.brand} ${row.model_name}`))
      .toEqual(['Giro Syntax MIPS', 'Smith Signal MIPS', 'Specialized Align II MIPS']);
  }, 30_000);

  it('seeds the rows the bike helmet test fixture uses', async () => {
    const db = await freshDatabase();
    await db.exec(await readFile(ENUM, 'utf8'));
    await db.exec(await readFile(SEED, 'utf8'));
    const fixture = bikeHelmets.headwear
      .map(({ brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static }) =>
        ({ brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static }));
    const seeded = (await helmets(db, 'bike_helmet')).map(row => ({ ...row, rcl_clo: Number(row.rcl_clo) }));
    expect(seeded).toEqual(fixture);
  }, 30_000);
});
