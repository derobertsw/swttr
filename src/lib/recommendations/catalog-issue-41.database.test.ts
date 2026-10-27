// @vitest-environment node
import { readFile, access } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import catalog from '@/test/fixtures/gear-catalog.json';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { GET as available } from '@/app/api/wardrobe/available/route';
import { POST as touring } from '@/app/api/v1/recommendations/ski-touring/route';
import { POST as alpine } from '@/app/api/v1/recommendations/alpine/route';
import { formatGarmentResponse } from './formatting';
import { hasUsableThermalData } from './garment-semantics';
import { hoodInsulation } from './extremities';
import { loadGearPool } from './gear-pool';
import { parseRecommendationRequest } from './request';
import { skiTouring } from './sports/ski-touring';
import type { GarmentRow } from './types';

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => state.client }));
vi.mock('@/lib/auth', () => ({ getAuthUserId: async () => null }));

const ENUM = 'supabase/migrations/20261024180535_add_windbreaker_category.sql';
const REPAIRS = 'supabase/migrations/20261024180550_issue_41_catalog_repairs.sql';
const models = ['Falketind Thermo40 Zip Hood', 'Senja Alpha90 Hood',
  'Weather Shield Ski Jacket', 'Shifter Long Sleeve Zip Hood', 'GT260 Quantum Hood'];
let db: PGlite;
let repairs: string;
let rows: Array<GarmentRow & Record<string, unknown> & { item_image_url: string; covers_head: boolean }>;

describe('#41 catalog migration and API integration', () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(await readFile('supabase/migrations/001_schema.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/007_item_media_urls.sql', 'utf8'));
    // Existing IDs and real thermal/protection values, without rewriting the
    // shared golden fixture or other work currently in progress in this tree.
    for (const g of catalog.garments.filter(g => g.brand !== 'SWTTR')) {
      await db.query(`INSERT INTO garments (id,brand,model_name,category,garment_type,
        covers_torso,covers_arms,covers_legs,covers_head,hood_type,weight_grams)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [g.id,g.brand,g.model_name,g.category,g.garment_type,g.covers_torso,
        g.covers_arms,g.covers_legs,g.covers_head,g.hood_type,g.weight_grams]);
      for (const table of ['garment_thermal_properties', 'garment_protection', 'garment_activity_ratings'] as const) {
        if (g[table]) await db.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table}, $1::jsonb)`, [JSON.stringify(g[table])]);
      }
    }
    await db.exec(await readFile('supabase/migrations/022_running_xc_clothing_semantics.sql', 'utf8'));
    await db.exec(await readFile(ENUM, 'utf8'));
    repairs = await readFile(REPAIRS, 'utf8');
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it('repairs the catalog, preserves identities/properties/policies, and replays without duplicates', async () => {
    const before = (await db.query<{ id: string; brand: string; model_name: string }>('SELECT id,brand,model_name FROM garments ORDER BY id')).rows;
    const thermal = (await db.query('SELECT * FROM garment_thermal_properties ORDER BY garment_id')).rows;
    const policies = (await db.query('SELECT * FROM pg_policies ORDER BY tablename,policyname')).rows;
    await db.exec(repairs);
    await db.exec(await readFile(ENUM, 'utf8'));
    await db.exec(repairs);
    expect((await db.query('SELECT id,brand,model_name FROM garments WHERE id=ANY($1::uuid[]) ORDER BY id', [before.map(r => r.id)])).rows).toEqual(before);
    expect((await db.query('SELECT * FROM garment_thermal_properties WHERE garment_id=ANY($1::uuid[]) ORDER BY garment_id', [before.map(r => r.id)])).rows).toEqual(thermal);
    expect((await db.query('SELECT * FROM pg_policies ORDER BY tablename,policyname')).rows).toEqual(policies);
    expect((await db.query('SELECT count(*)::int AS count FROM garments')).rows[0]).toEqual({ count: before.length + models.length });
    expect((await db.query("SELECT category FROM garments WHERE model_name='Houdini Jacket'")).rows[0]).toEqual({ category: 'windbreaker' });
    expect((await db.query("SELECT item_image_url FROM garments WHERE model_name='Heat Midweight Crew'")).rows[0]).toEqual({ item_image_url: '/images/items/32-degrees-heat-midweight-crew.jpg' });
    rows = (await db.query<{ garment: typeof rows[number] }>(`SELECT to_jsonb(g) || jsonb_build_object(
      'garment_thermal_properties',to_jsonb(t),'garment_protection',to_jsonb(p),
      'garment_activity_ratings',to_jsonb(a)) AS garment
      FROM garments g LEFT JOIN garment_thermal_properties t ON t.garment_id=g.id
      LEFT JOIN garment_protection p ON p.garment_id=g.id
      LEFT JOIN garment_activity_ratings a ON a.garment_id=g.id`)).rows.map(r => r.garment);
    for (const model of models) {
      const g = rows.find(r => r.model_name === model)!;
      expect(hasUsableThermalData(g)).toBe(true);
      const thermal = g.garment_thermal_properties!;
      // Match the live catalog's 035/036 whole-body convention.
      expect(thermal.rcl_whole_body).toBe(Math.round((0.5 * thermal.rcl_torso! + 0.25 * thermal.rcl_arms!) * 100) / 100);
      expect(thermal.recl_whole_body).toBe(Math.round((0.5 * thermal.recl_torso! + 0.25 * thermal.recl_arms!) * 100) / 100);
      expect(g).toMatchObject({ covers_torso: true, covers_arms: true, covers_legs: false,
        covers_head: true, coverage_arms: 1, coverage_legs: 0 });
      expect(formatGarmentResponse(g)).toMatchObject({ thermal_provenance: {
        estimation_method: 'derived_from_similar', generic_estimate: true,
        data_source: 'docs/catalog-issue-41.md#thermal-estimates',
      } });
      expect(hoodInsulation([g], false)).toBeGreaterThan(0);
      expect(hoodInsulation([g], true)).toBe(model === models[0] ? 0.5 : 0);
      await access(`public${g.item_image_url}`);
    }
    expect((await db.query('SELECT count(*)::int AS count FROM garment_materials')).rows[0]).toEqual({ count: 11 });
    // Unknown weight/wind resistance must not become invented product specs.
    expect(rows.find(g => g.model_name === models[2])).toMatchObject({ weight_grams: null,
      garment_protection: { windproof_rating: null, waterproof_rating: 'water_resistant', waterproof_mm: null } });
    expect(rows.find(g => g.model_name === models[4])?.weight_grams).toBeNull();
  });

  it('reuses alternate brand spelling/case and preserves a previously reviewed item', async () => {
    await db.query("UPDATE garments SET brand='Norrona',model_name='SENJA ALPHA90 HOOD' WHERE model_name=$1", [models[1]]);
    await db.query("UPDATE garment_thermal_properties SET confidence_score=0.9 WHERE garment_id=(SELECT id FROM garments WHERE model_name='SENJA ALPHA90 HOOD')");
    await db.exec(repairs);
    expect((await db.query("SELECT g.brand,t.confidence_score FROM garments g JOIN garment_thermal_properties t ON t.garment_id=g.id WHERE lower(g.model_name)='senja alpha90 hood'")).rows).toEqual([{ brand: 'Norrona', confidence_score: '0.90' }]);
  });

  it('serves the migrated products and direct local photo URLs to wardrobe search', async () => {
    state.client = createFakeSupabase({ garments: rows, handwear: [], headwear: [] });
    const response = await available();
    expect(response.status).toBe(200);
    const body = await response.json();
    for (const model of models) {
      const g = rows.find(r => r.model_name === model)!;
      expect(body.items.find((item: { model_name: string }) => item.model_name === model)).toMatchObject({
        id: g.id, item_image_url: g.item_image_url, thermal_provenance: { generic_estimate: true },
      });
    }
    for (const model of [...models, 'Heat Midweight Crew']) {
      const g = rows.find(r => r.model_name === model)!;
      const photoUrl = body.items.find((item: { id: string }) => item.id === g.id).item_image_url;
      expect(photoUrl).toBe(g.item_image_url);
      expect(photoUrl).toMatch(/^\/images\/items\//);
      await access(`public${photoUrl}`);
    }
  });

  it('does not let the migrated Houdini replace a real descent hard shell', async () => {
    state.client = createFakeSupabase({ garments: rows, handwear: catalog.handwear, headwear: catalog.headwear, user_wardrobe: [] });
    const response = await touring(new NextRequest('http://localhost/api/v1/recommendations/ski-touring', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weather: { temperature: 5, wind_speed: 20, humidity: 85, precipitation: true, precipitation_type: 'snow' }, exertion: 'hard' }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = [...body.recommendation.garments, ...body.pack_items.garments].map((g: { id: string }) => g.id);
    expect(rows.some(g => ids.includes(g.id) && g.covers_torso && g.category === 'hard_shell'
      && g.garment_protection?.waterproof_rating === 'waterproof')).toBe(true);
    expect(body.recommendation.garments.find((g: { name: string }) => g.name.includes('Houdini'))?.category).not.toBe('hard_shell');
  });

  it('selects both Norrøna products when they supply the needed touring layers', async () => {
    const candidates = rows.filter(g => g.category === 'base_layer' || g.category === 'hard_shell' || models.includes(g.model_name));
    state.client = createFakeSupabase({ garments: candidates, handwear: catalog.handwear, headwear: catalog.headwear, user_wardrobe: [] });
    const request = () => new NextRequest('http://localhost/api/v1/recommendations/ski-touring', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weather: { temperature: 5, wind_speed: 20 }, exertion: 'moderate' }),
    });
    const parsed = await parseRecommendationRequest(request());
    if (parsed instanceof Response) throw new Error('Unexpected invalid recommendation request');
    const pool = await loadGearPool(parsed, skiTouring.catalog);
    expect(pool.status).toBe('ok');
    if (pool.status !== 'ok') throw new Error('Expected usable migrated garments');
    expect(pool.pool.categorized.insulation.some(g => g.model_name === models[0])).toBe(true);
    expect(pool.pool.categorized.midLayers.some(g => g.model_name === models[1])).toBe(true);
    const body = await (await touring(request())).json();
    expect(body.recommendation.garments.some((g: { name: string }) => g.name.endsWith(models[1]))).toBe(true);
    expect(body.pack_items.garments.some((g: { name: string }) => g.name.endsWith(models[0]))).toBe(true);
  });

  it.each(models.slice(3))('selects the researched %s as a touring mid layer', async model => {
    state.client = createFakeSupabase({
      garments: rows.filter(g => g.category === 'base_layer' || g.category === 'hard_shell' || g.model_name === model),
      handwear: catalog.handwear, headwear: catalog.headwear, user_wardrobe: [],
    });
    const response = await touring(new NextRequest('http://localhost/api/v1/recommendations/ski-touring', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weather: { temperature: 5, wind_speed: 10 }, exertion: 'moderate' }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recommendation.garments.some((g: { name: string }) => g.name === `Icebreaker ${model}`)).toBe(true);
  });

  it('selects the researched Avalanche jacket as alpine outerwear', async () => {
    const jacket = rows.find(g => g.model_name === models[2])!;
    state.client = createFakeSupabase({ garments: rows.filter(g => g.category === 'base_layer' || g.id === jacket.id),
      handwear: catalog.handwear, headwear: catalog.headwear, user_wardrobe: [] });
    const response = await alpine(new NextRequest('http://localhost/api/v1/recommendations/alpine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weather: { temperature: 5, wind_speed: 10 }, exertion: 'moderate' }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).recommendation.garments.some((g: { id: string }) => g.id === jacket.id)).toBe(true);
  });
});
