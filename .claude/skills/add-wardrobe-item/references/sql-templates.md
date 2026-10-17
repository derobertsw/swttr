# Seed migration templates

Every statement must be safe to run twice and must never overwrite an existing row:
- the parent insert uses `ON CONFLICT (brand, model_name) DO NOTHING`;
- each child row uses `ON CONFLICT (garment_id) DO NOTHING` (the child tables are keyed by `garment_id`);
- `garment_materials` uses `WHERE NOT EXISTS`, because it has no unique key.

Older seeds (`006`, `011`) skip the child guards and would fail on a re-run, so don't copy them blindly.

Don't set `id`, `brand_logo_url` or `item_image_url`: the triggers from migration 007 generate them. Escape apostrophes by doubling them (`'Arc''teryx'`). Use the brand spelling the catalog already uses (`Norrøna`, `Arc'teryx`, `Fjallraven`).

## File header

```sql
-- Seed: <items> (<YYYY-MM-DD>)
-- <Why these items: user request / catalog gap>.
-- Duplicate check against the live catalog on <date>: no existing or near-match rows
-- (<N> garments, <N> handwear, <N> headwear at the time).
-- Values: see the per-item notes; method and sources are stored in data_source.
```

## Garment

```sql
-- ============================================
-- GARMENT - <Brand> <Model>
-- ============================================
-- <Construction facts: insulation g/m², fabrics, membrane, vents.> (<product URL>)
-- Calibrated against <analogue 1> and <analogue 2>; <key judgment, e.g. peer-consistent
-- value stored, lab-scaled value would be X>.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type,
  covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams,
  usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('<Brand>', '<Model>', <year|NULL>, <usd|NULL>, '<category>', '<garment_type>',
  <bool>, <bool>, <bool>, <bool>, '<none|attached|removable|helmet_compatible>', <grams|NULL>,
  '<standalone|underlayer|either>', <0..1>, <0..1>, <0..1>, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id,
  rcl_torso, rcl_arms, rcl_legs, rcl_whole_body,
  recl_torso, recl_arms, recl_legs, recl_whole_body,
  evap_potential, im_whole_body,
  estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id,
  <t>, <a>, <l>, <0.5t+0.25a+0.25l>,
  <T>, <A>, <L>, <0.5T+0.25A+0.25L>,
  <catalog-scale>, <min(1, 9.40*wb_clo/wb_ret)>,
  '<derived_from_similar|calculated_from_materials|lab_tested>', <0..1>, '<urls; analogues: …>', <clo>, false
FROM garments WHERE brand = '<Brand>' AND model_name = '<Model>'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, air_permeability_cfm,
  waterproof_rating, waterproof_mm, breathability_mvtr, breathability_ret,
  membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, '<none|wind_resistant|windproof>', <cfm|NULL>,
  '<none|DWR_only|water_resistant|waterproof>', <mm only if waterproof, else NULL>, <NULL|g/m²/24h>, <NULL|fabric RET>,
  <'Gore-Tex Pro ePE'|NULL>, <'sewn'|'taped'|'welded'|NULL>, '<urls>', false
FROM garments WHERE brand = '<Brand>' AND model_name = '<Model>'
ON CONFLICT (garment_id) DO NOTHING;

-- Only when the item has vents or a two-way/half zip.
INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_length_cm, has_side_vents,
  has_back_vent, has_thigh_vents, main_zip_two_way, mesh_lined_pockets, ventilation_factor)
SELECT id, <bool>, <cm|NULL>, <bool>, <bool>, <bool>, <bool>, <bool>, <0.3..1.0>
FROM garments WHERE brand = '<Brand>' AND model_name = '<Model>'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score,
  ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active,
  min_temp_static, max_temp_static, activity_notes)
SELECT id, <1..10>, <1..10>, <1..10>, <1..10>, <°C>, <°C>, <°C>, <°C>, '<one or two sentences>'
FROM garments WHERE brand = '<Brand>' AND model_name = '<Model>'
ON CONFLICT (garment_id) DO NOTHING;

-- Optional, one per layer that has stated specs.
INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, '<outer|membrane|insulation|lining>', '<material description>', <gsm|NULL>, <0..100>
FROM garments g
WHERE g.brand = '<Brand>' AND g.model_name = '<Model>'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = '<same layer>');
```

`suitable_activities` stays `NULL` unless the item truly shouldn't appear for some sports. To restrict it, use an array such as `ARRAY['running','xc_skiing']`.

## Handwear

```sql
-- HANDWEAR - <Brand> <Model>
-- <Construction facts.> (<product URL>) Calibrated against <analogues>.
INSERT INTO handwear (brand, model_name, year_released, msrp_usd, handwear_type, weight_grams_pair,
  rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('<Brand>', '<Model>', <year|NULL>, <usd|NULL>, '<liner_glove|light_glove|insulated_glove|mitten|lobster_mitten|shell_overmitten>', <g|NULL>,
  <clo>, <1..10>, <bool>, <bool>, <bool>, <°C>, <°C>)
ON CONFLICT (brand, model_name) DO NOTHING;
```

## Headwear

```sql
-- HEADWEAR - <Brand> <Model>
-- <Construction facts.> (<product URL>) Calibrated against <analogues>.
INSERT INTO headwear (brand, model_name, year_released, msrp_usd, headwear_type, weight_grams,
  covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('<Brand>', '<Model>', <year|NULL>, <usd|NULL>, '<liner_beanie|midweight_beanie|heavy_beanie|balaclava_light|balaclava_heavy|headband|buff_thin|buff_heavy|facemask|ski_helmet>', <g|NULL>,
  <bool>, <bool>, <bool>, <bool>, <clo>, <bool>, <°C>, <°C>)
ON CONFLICT (brand, model_name) DO NOTHING;
```

Handwear and headwear have no provenance columns, so record the method, sources and analogues in the comment above each insert.

## Paste script for the SQL editor

```sql
BEGIN;
-- (full contents of supabase/migrations/0NN_seed_<slug>.sql)
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('0NN', 'seed_<slug>');
COMMIT;
```

## Verification query (after the user applies it)

This only reads, and returns one row per item, with NULLs if something is missing:

```sql
SELECT g.brand, g.model_name, g.category, g.usage,
       t.rcl_torso, t.rcl_arms, t.rcl_legs, t.rcl_whole_body, t.evap_potential,
       p.windproof_rating, p.waterproof_rating, a.alpine_skiing_score,
       (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '0NN') AS history_rows
FROM (VALUES ('<Brand>', '<Model>')) AS want(brand, model_name)
LEFT JOIN garments g ON g.brand = want.brand AND g.model_name = want.model_name
LEFT JOIN garment_thermal_properties t ON t.garment_id = g.id
LEFT JOIN garment_protection p ON p.garment_id = g.id
LEFT JOIN garment_activity_ratings a ON a.garment_id = g.id;
```

For handwear and headwear, select from those tables with the same `VALUES` pattern. Re-running `catalog-lookup.mjs find` from a terminal checks the same thing without the SQL editor.
