// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';

const ENUM = 'supabase/migrations/20261117031000_add_bike_helmet_type.sql';
const SEED = 'supabase/migrations/20261117031100_seed_bike_helmets.sql';
const COLUMNS = 'brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static';
let db: PGlite;

const helmets = async (type: string) => (await db.query<Record<string, unknown>>(
  `SELECT ${COLUMNS} FROM headwear WHERE headwear_type::text = $1 ORDER BY brand, model_name`, [type])).rows;

describe('#373 bike helmet migrations in Postgres', () => {
  beforeAll(async () => {
    db = await PGlite.create();
    for (const file of ['001_schema.sql', '003_seed_extremities.sql']) {
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    }
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it('needs the enum migration applied, and committed, before the seed', async () => {
    const seed = await readFile(SEED, 'utf8');
    await expect(db.exec(seed)).rejects.toThrow(/bike_helmet/);

    const skiHelmets = await helmets('ski_helmet');
    for (let run = 0; run < 2; run++) {
      await db.exec(await readFile(ENUM, 'utf8'));
      await db.exec(seed);
    }
    expect(await helmets('ski_helmet')).toEqual(skiHelmets);
    expect((await helmets('bike_helmet')).map(row => `${row.brand} ${row.model_name}`))
      .toEqual(['Giro Syntax MIPS', 'Smith Signal MIPS', 'Specialized Align II MIPS']);
  });

  it('matches the golden fixture rows', async () => {
    const fixture = catalog.headwear.filter(row => row.headwear_type === 'bike_helmet')
      .map(({ brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static }) =>
        ({ brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static }));
    const seeded = (await helmets('bike_helmet')).map(row => ({ ...row, rcl_clo: Number(row.rcl_clo) }));
    expect(seeded).toEqual(fixture);
  });
});
