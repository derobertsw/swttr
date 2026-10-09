-- Running/XC foundations (#244). Checked the live catalog read-only on
-- 2026-10-09 (97 garments, 28 handwear, 38 headwear) and all seed migrations.
-- Reuse Nordic wind layers and light accessories; only three basics were absent.
-- No production mutation is performed by preparing this migration.
ALTER TABLE garments
  ADD COLUMN IF NOT EXISTS usage text CHECK (usage IN ('standalone','underlayer','either','unknown')),
  ADD COLUMN IF NOT EXISTS coverage_torso numeric CHECK (coverage_torso BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS coverage_arms numeric CHECK (coverage_arms BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS coverage_legs numeric CHECK (coverage_legs BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS suitable_activities text[];
ALTER TABLE garment_thermal_properties
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS uncertainty_clo numeric CHECK (uncertainty_clo >= 0),
  ADD COLUMN IF NOT EXISTS generic_estimate boolean NOT NULL DEFAULT false;
ALTER TABLE garment_protection
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS generic_estimate boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN garments.usage IS 'Explicit wearing capability independent of layer category. NULL means unreviewed.';
COMMENT ON COLUMN garments.coverage_legs IS 'Fraction of leg region covered; NULL means unreviewed. Regional clo already averages over the entire region.';
COMMENT ON COLUMN garment_thermal_properties.rcl_legs IS 'Average clo over entire leg region including exposed skin; do not multiply by coverage again. Missing is unknown, not zero.';
COMMENT ON COLUMN garment_thermal_properties.rcl_arms IS 'Average clo over entire arm region including exposed skin; do not multiply by coverage again.';
COMMENT ON COLUMN garment_thermal_properties.rcl_torso IS 'Average clo over entire torso region; do not multiply by coverage again.';
COMMENT ON COLUMN garment_thermal_properties.uncertainty_clo IS 'Engineering allowance on regional clo; not a statistical interval or safety bound.';
-- Reviewed usage from catalog/seed descriptions, explicitly listed rather than
-- guessed from names at runtime. Leave other legacy semantics unknown.
UPDATE garments SET usage='standalone', coverage_torso=0, coverage_arms=0, coverage_legs=1 WHERE brand='Patagonia' AND model_name='Wind Shield Pants' AND usage IS NULL;
UPDATE garments SET usage='standalone', coverage_torso=0, coverage_arms=0, coverage_legs=1 WHERE brand='Outdoor Research' AND model_name='Ferrosi Joggers' AND usage IS NULL;
UPDATE garments SET usage='either', coverage_torso=1, coverage_arms=1, coverage_legs=0 WHERE brand='Patagonia' AND model_name='Upstride Jacket' AND usage IS NULL;
UPDATE garments SET usage='either', coverage_torso=1, coverage_arms=1, coverage_legs=0 WHERE brand='Outdoor Research' AND model_name='Ferrosi Hoodie' AND usage IS NULL;
UPDATE garments SET usage='either', coverage_torso=1, coverage_arms=1, coverage_legs=0 WHERE brand='Patagonia' AND model_name='Capilene Cool Lightweight' AND usage IS NULL;
UPDATE garments SET usage='underlayer', coverage_torso=0, coverage_arms=0, coverage_legs=1 WHERE brand='Patagonia' AND model_name='Capilene Midweight Bottoms' AND usage IS NULL;
UPDATE garments SET usage='underlayer', coverage_torso=0, coverage_arms=0, coverage_legs=0.8 WHERE brand='Patagonia' AND model_name='Capilene Thermal Weight Boot-Length Bottoms' AND usage IS NULL;
UPDATE garments SET usage='underlayer', coverage_torso=0, coverage_arms=0, coverage_legs=1 WHERE brand='Columbia' AND model_name='Midweight Stretch Tight' AND usage IS NULL;

-- Recheck matching basics at migration time to avoid duplicates after preflight.
INSERT INTO garments (id,brand,model_name,category,garment_type,usage,coverage_torso,coverage_arms,coverage_legs,suitable_activities,covers_torso,covers_arms,covers_legs)
SELECT 'e0244000-0000-4000-8000-000000000001','SWTTR','Generic Lightweight Running T-Shirt','base_layer','top_short_sleeve','standalone',1,0.2,0,ARRAY['running'],true,true,false
WHERE NOT EXISTS (SELECT 1 FROM garments WHERE garment_type='top_short_sleeve')
ON CONFLICT (brand,model_name) DO NOTHING;
INSERT INTO garment_thermal_properties (garment_id,rcl_torso,rcl_arms,rcl_legs,rcl_whole_body,recl_torso,recl_arms,recl_legs,recl_whole_body,evap_potential,estimation_method,confidence_score,data_source,uncertainty_clo,generic_estimate)
SELECT id,0.1,0.02,0,0.06,3,0.6,0,1.65,0.4,'derived_from_similar',0.3,'docs/running-xc-foundations.md#catalog-estimates',0.08,true FROM garments WHERE brand='SWTTR' AND model_name='Generic Lightweight Running T-Shirt'
ON CONFLICT (garment_id) DO NOTHING;
INSERT INTO garment_protection (garment_id,windproof_rating,waterproof_rating,data_source,generic_estimate)
SELECT id,'none','none','docs/running-xc-foundations.md#catalog-estimates',true FROM garments WHERE brand='SWTTR' AND model_name='Generic Lightweight Running T-Shirt'
ON CONFLICT (garment_id) DO NOTHING;
INSERT INTO garment_activity_ratings (garment_id,xc_skiing_score,alpine_skiing_score,ski_touring_uphill_score,ski_touring_downhill_score,activity_notes)
SELECT id,1,1,1,1,'Generic clothing archetype; not a tested product.' FROM garments WHERE brand='SWTTR' AND model_name='Generic Lightweight Running T-Shirt'
ON CONFLICT (garment_id) DO NOTHING;

-- Recheck matching basics at migration time to avoid duplicates after preflight.
INSERT INTO garments (id,brand,model_name,category,garment_type,usage,coverage_torso,coverage_arms,coverage_legs,suitable_activities,covers_torso,covers_arms,covers_legs)
SELECT 'e0244000-0000-4000-8000-000000000002','SWTTR','Generic Running Shorts','base_layer','shorts','standalone',0,0,0.3,ARRAY['running'],false,false,true
WHERE NOT EXISTS (SELECT 1 FROM garments WHERE garment_type='shorts')
ON CONFLICT (brand,model_name) DO NOTHING;
INSERT INTO garment_thermal_properties (garment_id,rcl_torso,rcl_arms,rcl_legs,rcl_whole_body,recl_torso,recl_arms,recl_legs,recl_whole_body,evap_potential,estimation_method,confidence_score,data_source,uncertainty_clo,generic_estimate)
SELECT id,0,0,0.06,0.02,0,0,1.5,0.38,0.4,'derived_from_similar',0.3,'docs/running-xc-foundations.md#catalog-estimates',0.08,true FROM garments WHERE brand='SWTTR' AND model_name='Generic Running Shorts'
ON CONFLICT (garment_id) DO NOTHING;
INSERT INTO garment_protection (garment_id,windproof_rating,waterproof_rating,data_source,generic_estimate)
SELECT id,'none','none','docs/running-xc-foundations.md#catalog-estimates',true FROM garments WHERE brand='SWTTR' AND model_name='Generic Running Shorts'
ON CONFLICT (garment_id) DO NOTHING;
INSERT INTO garment_activity_ratings (garment_id,xc_skiing_score,alpine_skiing_score,ski_touring_uphill_score,ski_touring_downhill_score,activity_notes)
SELECT id,1,1,1,1,'Generic clothing archetype; not a tested product.' FROM garments WHERE brand='SWTTR' AND model_name='Generic Running Shorts'
ON CONFLICT (garment_id) DO NOTHING;

-- Recheck matching basics at migration time to avoid duplicates after preflight.
INSERT INTO garments (id,brand,model_name,category,garment_type,usage,coverage_torso,coverage_arms,coverage_legs,suitable_activities,covers_torso,covers_arms,covers_legs)
SELECT 'e0244000-0000-4000-8000-000000000003','SWTTR','Generic Standalone Running/Nordic Tights','base_layer','pants','standalone',0,0,1,ARRAY['running','xc_skiing'],false,false,true
WHERE NOT EXISTS (SELECT 1 FROM garments WHERE garment_type='pants' AND category='base_layer' AND usage IN ('standalone','either'))
ON CONFLICT (brand,model_name) DO NOTHING;
INSERT INTO garment_thermal_properties (garment_id,rcl_torso,rcl_arms,rcl_legs,rcl_whole_body,recl_torso,recl_arms,recl_legs,recl_whole_body,evap_potential,estimation_method,confidence_score,data_source,uncertainty_clo,generic_estimate)
SELECT id,0,0,0.25,0.06,0,0,6,1.5,0.4,'derived_from_similar',0.3,'docs/running-xc-foundations.md#catalog-estimates',0.15,true FROM garments WHERE brand='SWTTR' AND model_name='Generic Standalone Running/Nordic Tights'
ON CONFLICT (garment_id) DO NOTHING;
INSERT INTO garment_protection (garment_id,windproof_rating,waterproof_rating,data_source,generic_estimate)
SELECT id,'none','none','docs/running-xc-foundations.md#catalog-estimates',true FROM garments WHERE brand='SWTTR' AND model_name='Generic Standalone Running/Nordic Tights'
ON CONFLICT (garment_id) DO NOTHING;
INSERT INTO garment_activity_ratings (garment_id,xc_skiing_score,alpine_skiing_score,ski_touring_uphill_score,ski_touring_downhill_score,activity_notes)
SELECT id,8,1,1,1,'Generic clothing archetype; not a tested product.' FROM garments WHERE brand='SWTTR' AND model_name='Generic Standalone Running/Nordic Tights'
ON CONFLICT (garment_id) DO NOTHING;
