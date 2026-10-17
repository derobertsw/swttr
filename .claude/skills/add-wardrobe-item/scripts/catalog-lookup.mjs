#!/usr/bin/env node
// Read-only lookup against the live SWTTR gear catalog (garments, handwear,
// headwear) for the add-wardrobe-item skill. Only GET requests are made.
//
//   node catalog-lookup.mjs find <brand and/or model words>   duplicates and near-duplicates
//   node catalog-lookup.mjs brand <brand>                     everything from one brand
//   node catalog-lookup.mjs analogues <category|type> [garment_type]
//                                                             calibration rows, e.g.
//                                                             "insulation_synthetic jacket",
//                                                             "handwear", "mitten", "headwear"
//   node catalog-lookup.mjs gaps                              counts per category/type
//
// Add --json to any command for the raw rows (find returns { exact, near }). Credentials come from the first
// .env.local found walking up from the current directory (worktrees under
// .claude/worktrees/ reach the main checkout's file).

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const GARMENT_SELECT = [
  'id', 'brand', 'model_name', 'category', 'garment_type', 'hood_type', 'weight_grams', 'msrp_usd',
  'usage', 'coverage_torso', 'coverage_arms', 'coverage_legs', 'suitable_activities',
  'covers_torso', 'covers_arms', 'covers_legs', 'covers_head',
  'garment_thermal_properties(*)', 'garment_protection(*)', 'garment_ventilation(*)',
  'garment_activity_ratings(*)', 'garment_materials(*)',
].join(',');

function loadEnv() {
  let dir = resolve(process.cwd());
  for (;;) {
    const candidate = join(dir, '.env.local');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function get(table, select) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=5000`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

// PostgREST returns one-to-one embeds as an object, but older relations can
// come back as arrays.
const one = (value) => (Array.isArray(value) ? value[0] ?? null : value ?? null);

const normalize = (text) => String(text ?? '')
  .toLowerCase()
  .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const tokens = (text) => normalize(text).split(' ').filter(Boolean);

const fmt = (value, digits) => (value === null || value === undefined ? '-'
  : typeof value === 'number' && digits !== undefined ? value.toFixed(digits) : String(value));

function describeGarment(g) {
  const t = one(g.garment_thermal_properties) ?? {};
  const p = one(g.garment_protection) ?? {};
  const v = one(g.garment_ventilation) ?? {};
  const a = one(g.garment_activity_ratings) ?? {};
  const materials = (g.garment_materials ?? [])
    .map(m => `${m.layer_position}:${m.material_type ?? '?'}${m.fabric_weight_gsm ? `@${m.fabric_weight_gsm}gsm` : ''}`)
    .join(' ');
  const cover = ['torso', 'arms', 'legs'].map(r => (g[`covers_${r}`] ? r[0].toUpperCase() : '·')).join('');
  return [
    `GARMENT  ${g.brand} | ${g.model_name}   [${g.category} / ${g.garment_type}, hood=${g.hood_type ?? '-'}, ${fmt(g.weight_grams)}g, $${fmt(g.msrp_usd)}]`,
    `   covers=${cover} usage=${fmt(g.usage)} coverage T/A/L=${fmt(g.coverage_torso)}/${fmt(g.coverage_arms)}/${fmt(g.coverage_legs)} activities=${g.suitable_activities?.join(',') ?? '-'}`,
    `   clo T/A/L/WB=${fmt(t.rcl_torso)}/${fmt(t.rcl_arms)}/${fmt(t.rcl_legs)}/${fmt(t.rcl_whole_body)}  Ret T/A/L/WB=${fmt(t.recl_torso)}/${fmt(t.recl_arms)}/${fmt(t.recl_legs)}/${fmt(t.recl_whole_body)}  evap_potential=${fmt(t.evap_potential)}`,
    `   ${fmt(t.estimation_method)} conf=${fmt(t.confidence_score)} ±clo=${fmt(t.uncertainty_clo)} generic=${fmt(t.generic_estimate)} src=${fmt(t.data_source)}`,
    `   wind=${fmt(p.windproof_rating)} water=${fmt(p.waterproof_rating)} mm=${fmt(p.waterproof_mm)} RET=${fmt(p.breathability_ret)} MVTR=${fmt(p.breathability_mvtr)} CFM=${fmt(p.air_permeability_cfm)} membrane=${fmt(p.membrane_type)} seams=${fmt(p.seam_construction)}`,
    `   vents: pits=${fmt(v.has_pit_zips)} side=${fmt(v.has_side_vents)} thigh=${fmt(v.has_thigh_vents)} factor=${fmt(v.ventilation_factor)}  scores xc/up/down/alpine=${fmt(a.xc_skiing_score)}/${fmt(a.ski_touring_uphill_score)}/${fmt(a.ski_touring_downhill_score)}/${fmt(a.alpine_skiing_score)}  active ${fmt(a.min_temp_active)}..${fmt(a.max_temp_active)}°C static ${fmt(a.min_temp_static)}..${fmt(a.max_temp_static)}°C`,
    ...(materials ? [`   materials: ${materials}`] : []),
  ].join('\n');
}

function describeHandwear(h) {
  return `HANDWEAR ${h.brand} | ${h.model_name}   [${h.handwear_type}, ${fmt(h.weight_grams_pair)}g/pair, $${fmt(h.msrp_usd)}]`
    + `  clo=${fmt(h.rcl_clo)} dexterity=${fmt(h.dexterity_score)} waterproof=${fmt(h.waterproof)} windproof=${fmt(h.windproof)} touchscreen=${fmt(h.touchscreen_compatible)}`
    + `  min active/static=${fmt(h.min_temp_active)}/${fmt(h.min_temp_static)}°C`;
}

function describeHeadwear(h) {
  const covers = [h.covers_ears && 'ears', h.covers_neck && 'neck', h.covers_face && 'face'].filter(Boolean).join('+') || 'none';
  return `HEADWEAR ${h.brand} | ${h.model_name}   [${h.headwear_type}, ${fmt(h.weight_grams)}g, $${fmt(h.msrp_usd)}]`
    + `  clo=${fmt(h.rcl_clo)} covers=${covers} helmet_compatible=${fmt(h.helmet_compatible)} windproof=${fmt(h.windproof)}`
    + `  min active/static=${fmt(h.min_temp_active)}/${fmt(h.min_temp_static)}°C`;
}

async function loadCatalog() {
  const [garments, handwear, headwear] = await Promise.all([
    get('garments', GARMENT_SELECT),
    get('handwear', '*'),
    get('headwear', '*'),
  ]);
  return [
    ...garments.map(row => ({ kind: 'garment', row, text: describeGarment(row) })),
    ...handwear.map(row => ({ kind: 'handwear', row, text: describeHandwear(row) })),
    ...headwear.map(row => ({ kind: 'headwear', row, text: describeHeadwear(row) })),
  ];
}

function print(items, json, emptyMessage) {
  if (json) {
    console.log(JSON.stringify(items.map(i => ({ kind: i.kind, ...i.row })), null, 2));
  } else if (items.length === 0) {
    console.log(emptyMessage);
  } else {
    console.log(items.map(i => i.text).join('\n\n'));
  }
}

function find(catalog, query) {
  const wanted = tokens(query);
  const scored = catalog.map(item => {
    const brand = tokens(item.row.brand);
    const model = tokens(item.row.model_name);
    const all = new Set([...brand, ...model]);
    const hits = wanted.filter(w => all.has(w) || [...all].some(t => t.startsWith(w) || w.startsWith(t))).length;
    const brandHit = brand.some(b => wanted.includes(b));
    const modelHits = model.filter(m => wanted.includes(m)).length;
    return { item, hits, brandHit, modelHits, modelSize: model.length };
  });
  const exact = scored.filter(s => s.hits === wanted.length);
  const near = scored.filter(s => s.hits !== wanted.length
    && ((s.brandHit && s.modelHits > 0) || (s.modelHits >= 2) || (s.modelHits > 0 && s.modelHits === s.modelSize)));
  return { exact: exact.map(s => s.item), near: near.sort((a, b) => b.hits - a.hits).map(s => s.item) };
}

function analogues(catalog, what, garmentType) {
  const key = normalize(what).replace(/ /g, '_');
  if (key === 'handwear' || key === 'headwear') {
    return catalog.filter(i => i.kind === key).sort((a, b) => a.row.rcl_clo - b.row.rcl_clo);
  }
  const typed = catalog.filter(i =>
    (i.kind === 'garment' && i.row.category === key && (!garmentType || i.row.garment_type === garmentType))
    || (i.kind === 'garment' && i.row.garment_type === key)
    || (i.kind === 'handwear' && i.row.handwear_type === key)
    || (i.kind === 'headwear' && i.row.headwear_type === key));
  const warmth = (i) => (i.kind === 'garment' ? one(i.row.garment_thermal_properties)?.rcl_whole_body ?? -1 : i.row.rcl_clo);
  return typed.sort((a, b) => warmth(a) - warmth(b));
}

function gaps(catalog) {
  const count = (keyOf) => {
    const counts = new Map();
    for (const i of catalog) {
      const k = keyOf(i);
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `  ${String(n).padStart(3)}  ${k}`).join('\n');
  };
  const garments = catalog.filter(i => i.kind === 'garment');
  const unreviewed = garments.filter(i => !i.row.usage).length;
  const noThermal = garments.filter(i => !one(i.row.garment_thermal_properties)).length;
  return [
    `Garments by category / garment_type (${garments.length} total; ${unreviewed} with usage unreviewed, ${noThermal} without thermal rows):`,
    count(i => i.kind === 'garment' && `${i.row.category} / ${i.row.garment_type}`),
    `\nHandwear by type:`,
    count(i => i.kind === 'handwear' && i.row.handwear_type),
    `\nHeadwear by type:`,
    count(i => i.kind === 'headwear' && i.row.headwear_type),
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const [command, ...rest] = args.filter(a => a !== '--json');

  const envFile = loadEnv();
  if (!envFile || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('No .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY found above the current directory.');
    process.exit(2);
  }

  const catalog = await loadCatalog();

  switch (command) {
    case 'find': {
      const query = rest.join(' ');
      if (!query) throw new Error('find needs brand and/or model words');
      const { exact, near } = find(catalog, query);
      if (json) {
        const rows = (items) => items.map(i => ({ kind: i.kind, ...i.row }));
        console.log(JSON.stringify({ exact: rows(exact), near: rows(near) }, null, 2));
        break;
      }
      console.log(`== Matches for "${query}" ==`);
      print(exact, json, '(none)');
      console.log(`\n== Near matches (same brand + shared model words, or shared model words) ==`);
      print(near, json, '(none)');
      break;
    }
    case 'brand': {
      const wanted = normalize(rest.join(' '));
      print(catalog.filter(i => normalize(i.row.brand).includes(wanted)), json, `(no items for brand "${rest.join(' ')}")`);
      break;
    }
    case 'analogues': {
      const [what, garmentType] = rest;
      if (!what) throw new Error('analogues needs a category, garment_type, handwear/headwear type, "handwear" or "headwear"');
      print(analogues(catalog, what, garmentType), json, `(no catalog rows for ${rest.join(' ')})`);
      break;
    }
    case 'gaps':
      console.log(gaps(catalog));
      break;
    default:
      console.error('Usage: catalog-lookup.mjs find <words> | brand <brand> | analogues <category|type> [garment_type] | gaps   [--json]');
      process.exit(2);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
