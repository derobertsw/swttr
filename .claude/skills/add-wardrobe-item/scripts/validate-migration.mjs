#!/usr/bin/env node
// Replays the catalog schema in an in-memory Postgres (PGlite), runs a seed
// migration twice, and checks the rows it adds against the catalog's
// conventions (regional weighting, coverage, provenance, extremity ratings).
//
//   node .claude/skills/add-wardrobe-item/scripts/validate-migration.mjs supabase/migrations/0NN_seed_x.sql
//
// Exit code 1 means a hard error (SQL failure, not idempotent, missing thermal
// row); warnings are judgment calls to review, not failures.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCHEMA_MIGRATIONS = ['001_schema.sql', '007_item_media_urls.sql', '022_running_xc_clothing_semantics.sql'];
const TABLES = ['garments', 'garment_thermal_properties', 'garment_protection', 'garment_ventilation',
  'garment_activity_ratings', 'garment_materials', 'handwear', 'headwear'];

const errors = [];
const warnings = [];
const num = (v) => (v === null || v === undefined ? null : Number(v));

async function counts(db) {
  const out = {};
  for (const table of TABLES) {
    out[table] = (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  }
  return out;
}

function checkGarment(g) {
  const name = `${g.brand} ${g.model_name}`;
  const err = (m) => errors.push(`${name}: ${m}`);
  const warn = (m) => warnings.push(`${name}: ${m}`);
  const regions = ['torso', 'arms', 'legs'];

  if (g.t_id === null) {
    err('no garment_thermal_properties row; the recommendation pool drops it');
  } else {
    for (const r of regions) {
      const clo = num(g[`rcl_${r}`]);
      const ret = num(g[`recl_${r}`]);
      if (g[`covers_${r}`]) {
        if (clo === null || ret === null) err(`covers ${r} but rcl_${r}/recl_${r} is NULL (unknown, not zero)`);
      } else if ((clo ?? 0) !== 0 || (ret ?? 0) !== 0) {
        warn(`does not cover ${r} but rcl_${r}/recl_${r} is non-zero`);
      }
    }
    const weighted = (p) => 0.5 * (num(g[`${p}_torso`]) ?? 0) + 0.25 * (num(g[`${p}_arms`]) ?? 0) + 0.25 * (num(g[`${p}_legs`]) ?? 0);
    const wbClo = num(g.rcl_whole_body);
    const wbRet = num(g.recl_whole_body);
    if (wbClo === null) err('rcl_whole_body is NULL');
    else if (Math.abs(wbClo - weighted('rcl')) > 0.02) warn(`rcl_whole_body ${wbClo} ≠ 0.5/0.25/0.25 weighted ${weighted('rcl').toFixed(2)}`);
    if (wbRet !== null && Math.abs(wbRet - weighted('recl')) > 0.6) warn(`recl_whole_body ${wbRet} ≠ weighted ${weighted('recl').toFixed(1)}`);
    const im = num(g.im_whole_body);
    if (im !== null && wbClo && wbRet) {
      const expected = Math.min(1, (9.40 * wbClo) / wbRet);
      if (Math.abs(im - expected) > 0.03) warn(`im_whole_body ${im} ≠ min(1, 9.40·clo/Ret) = ${expected.toFixed(2)}`);
    }
    const ep = num(g.evap_potential);
    if (ep === null) warn('evap_potential is NULL; every breathability gate treats it as 0');
    else if (ep < 0.03 || ep > 0.6) warn(`evap_potential ${ep} is outside the catalog's 0.07–0.50 scale`);
    if (!g.data_source) warn('thermal data_source is empty');
    if (num(g.uncertainty_clo) === null) warn('uncertainty_clo is NULL');
    if (num(g.confidence_score) === null) warn('confidence_score is NULL');
    if (g.generic_estimate && g.brand !== 'SWTTR') warn('generic_estimate is true on a branded product');
    if (g.estimation_method === 'lab_tested' && num(g.confidence_score) < 0.9) warn('lab_tested with confidence below 0.9');
  }

  if (!g.usage) warn('usage is NULL (unreviewed); set standalone/underlayer/either');
  for (const r of regions) {
    const coverage = num(g[`coverage_${r}`]);
    if (coverage === null) warn(`coverage_${r} is NULL`);
    else if (g[`covers_${r}`] !== coverage > 0) warn(`covers_${r}=${g[`covers_${r}`]} but coverage_${r}=${coverage}`);
  }
  if (['jacket', 'top_long_sleeve', 'one_piece'].includes(g.garment_type) && !g.covers_arms) warn(`${g.garment_type} without covers_arms`);
  if (['pants', 'shorts', 'bib', 'one_piece'].includes(g.garment_type) && !g.covers_legs) warn(`${g.garment_type} without covers_legs`);
  if ((g.hood_type ?? 'none') !== 'none' && !g.covers_head) warn(`hood_type ${g.hood_type} but covers_head is false`);

  if (g.p_id === null) warn('no garment_protection row; wind/wet capability reads as unknown');
  else {
    if (num(g.waterproof_mm) > 0 && g.waterproof_rating !== 'waterproof') {
      warn(`waterproof_mm ${g.waterproof_mm} on a ${g.waterproof_rating} item; the engine treats any mm > 0 as waterproof`);
    }
    if (!g.p_data_source) warn('protection data_source is empty');
  }
  if (g.a_id === null) warn('no garment_activity_ratings row; sport catalog gates exclude it');
  else if ([g.xc_skiing_score, g.ski_touring_uphill_score, g.ski_touring_downhill_score, g.alpine_skiing_score].some(s => s === null)) {
    warn('an activity score is NULL');
  }
}

function checkExtremity(kind, h) {
  const name = `${h.brand} ${h.model_name}`;
  const clo = num(h.rcl_clo);
  const active = num(h.min_temp_active);
  const stat = num(h.min_temp_static);
  if (active === null || stat === null) warnings.push(`${name}: min_temp_active/static missing; the selector filters on them`);
  else {
    if (active > stat) warnings.push(`${name}: min_temp_active ${active} is warmer than static ${stat}; active should reach colder`);
    if (kind === 'handwear' && Math.abs(stat - (10 - 10 * clo)) > 8) {
      warnings.push(`${name}: static min ${stat}°C vs ${(10 - 10 * clo).toFixed(0)}°C expected for ${clo} clo (Gao rule); explain or adjust`);
    }
  }
  if (kind === 'handwear' && h.dexterity_score === null) warnings.push(`${name}: dexterity_score is NULL`);
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: validate-migration.mjs <path to migration .sql>');
    process.exit(2);
  }
  const sql = await readFile(resolve(target), 'utf8');

  const db = await PGlite.create();
  for (const file of SCHEMA_MIGRATIONS) {
    await db.exec(await readFile(join(repoRoot, 'supabase/migrations', file), 'utf8'));
  }
  const before = await counts(db);
  const existing = {
    garments: new Set((await db.query('SELECT id FROM garments')).rows.map(r => r.id)),
  };

  try {
    await db.exec(sql);
  } catch (error) {
    console.error(`FAILED on first run: ${error.message}`);
    process.exit(1);
  }
  const afterFirst = await counts(db);
  try {
    await db.exec(sql);
  } catch (error) {
    errors.push(`second run failed (not idempotent): ${error.message}`);
  }
  const afterSecond = await counts(db);
  for (const table of TABLES) {
    if (afterSecond[table] !== afterFirst[table]) errors.push(`second run added ${afterSecond[table] - afterFirst[table]} more ${table} rows`);
  }

  const garments = (await db.query(`
    SELECT g.*, t.garment_id AS t_id, t.rcl_torso, t.rcl_arms, t.rcl_legs, t.rcl_whole_body,
           t.recl_torso, t.recl_arms, t.recl_legs, t.recl_whole_body, t.evap_potential, t.im_whole_body,
           t.estimation_method, t.confidence_score, t.data_source, t.uncertainty_clo, t.generic_estimate,
           p.garment_id AS p_id, p.windproof_rating, p.waterproof_rating, p.waterproof_mm, p.data_source AS p_data_source,
           a.garment_id AS a_id, a.xc_skiing_score, a.ski_touring_uphill_score, a.ski_touring_downhill_score, a.alpine_skiing_score
    FROM garments g
    LEFT JOIN garment_thermal_properties t ON t.garment_id = g.id
    LEFT JOIN garment_protection p ON p.garment_id = g.id
    LEFT JOIN garment_activity_ratings a ON a.garment_id = g.id
    ORDER BY g.brand, g.model_name`)).rows.filter(g => !existing.garments.has(g.id));
  const handwear = (await db.query('SELECT * FROM handwear ORDER BY brand, model_name')).rows;
  const headwear = (await db.query('SELECT * FROM headwear ORDER BY brand, model_name')).rows;

  garments.forEach(checkGarment);
  handwear.forEach(h => checkExtremity('handwear', h));
  headwear.forEach(h => checkExtremity('headwear', h));

  console.log('Rows added by the migration:');
  for (const table of TABLES) {
    const added = afterFirst[table] - before[table];
    if (added) console.log(`  ${table}: +${added}`);
  }
  for (const g of garments) {
    console.log(`  garment  ${g.brand} | ${g.model_name}: clo ${g.rcl_torso}/${g.rcl_arms}/${g.rcl_legs} → ${g.rcl_whole_body}, Ret ${g.recl_torso}/${g.recl_arms}/${g.recl_legs} → ${g.recl_whole_body}, evap ${g.evap_potential}, ${g.windproof_rating ?? '-'}/${g.waterproof_rating ?? '-'}, scores ${g.xc_skiing_score}/${g.ski_touring_uphill_score}/${g.ski_touring_downhill_score}/${g.alpine_skiing_score}`);
  }
  for (const h of handwear) console.log(`  handwear ${h.brand} | ${h.model_name}: ${h.handwear_type} ${h.rcl_clo} clo, min ${h.min_temp_active}/${h.min_temp_static}°C`);
  for (const h of headwear) console.log(`  headwear ${h.brand} | ${h.model_name}: ${h.headwear_type} ${h.rcl_clo} clo, min ${h.min_temp_active}/${h.min_temp_static}°C`);
  console.log('Second run: ' + (errors.some(e => e.startsWith('second run')) ? 'NOT idempotent' : 'no changes (idempotent)'));

  if (warnings.length) console.log(`\nWarnings (${warnings.length}):\n` + warnings.map(w => `  - ${w}`).join('\n'));
  if (errors.length) console.log(`\nErrors (${errors.length}):\n` + errors.map(e => `  - ${e}`).join('\n'));
  await db.close();
  process.exit(errors.length ? 1 : 0);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
