-- Migration: Add new clothing items - Batch 3
-- Brands: Mountain Hardwear, Columbia, Patagonia, Under Armour

-- ============================================
-- GARMENTS - Mountain Hardwear Ghost Whisperer/2 Jacket
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Mountain Hardwear', 'Ghost Whisperer/2 Jacket', 'insulation_down', 'jacket', true, true, false, false, 'none', 226, 325);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.45, 1.30, 0, 1.40, 22.0, 20.0, 0, 21.0, 0.30, 'estimated_from_specs', 0.70
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Ghost Whisperer/2 Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Ghost Whisperer/2 Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 6, 7, 5, 4, -15, 5, -5, 10, 'Ultralight packable midlayer. Best for active use and transitions. Not warm enough for static cold.'
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Ghost Whisperer/2 Jacket';


-- ============================================
-- GARMENTS - Mountain Hardwear Firefall/2 Insulated Jacket
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Mountain Hardwear', 'Firefall/2 Insulated Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'helmet_compatible', 920, 400);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.50, 1.30, 0, 1.42, 35.0, 32.0, 0, 34.0, 0.20, 'estimated_from_specs', 0.70
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Firefall/2 Insulated Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type)
SELECT id, 'windproof', 'waterproof', 'Dry.Q 2L'
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Firefall/2 Insulated Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_mesh_backed, ventilation_factor)
SELECT id, true, true, 0.65
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Firefall/2 Insulated Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 4, 7, 9, -25, -5, -15, 5, 'Resort ski jacket. Waterproof warmth for lifts and groomers. Too warm/heavy for touring.'
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Firefall/2 Insulated Jacket';


-- ============================================
-- GARMENTS - Mountain Hardwear Stretch Ozonic Insulated Jacket
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Mountain Hardwear', 'Stretch Ozonic Insulated Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'attached', 606, 350);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.20, 1.05, 0, 1.15, 30.0, 28.0, 0, 29.0, 0.25, 'estimated_from_specs', 0.70
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Stretch Ozonic Insulated Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 'Dry.Q 2L', 'taped'
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Stretch Ozonic Insulated Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, ventilation_factor)
SELECT id, true, 0.70
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Stretch Ozonic Insulated Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 6, 6, 6, 5, -15, 5, -5, 10, 'Versatile active insulated shell. Good for variable conditions hiking/touring. Stretch allows full mobility.'
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Stretch Ozonic Insulated Jacket';


-- ============================================
-- GARMENTS - Columbia Joy Peak Lite Hooded Jacket (Women's)
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Columbia', 'Joy Peak Lite Hooded Jacket', 'insulation_synthetic', 'jacket', true, true, false, true, 'attached', 450, 130);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.10, 0.95, 0, 1.05, 25.0, 22.0, 0, 24.0, 0.28, 'estimated_from_specs', 0.60
FROM garments WHERE brand = 'Columbia' AND model_name = 'Joy Peak Lite Hooded Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Joy Peak Lite Hooded Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 5, 5, 5, 5, -10, 5, 0, 10, 'Casual/lifestyle puffer. Water-resistant not waterproof. Good value option for light activity.'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Joy Peak Lite Hooded Jacket';


-- ============================================
-- GARMENTS - Patagonia R1 TechFace Jacket
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'R1 TechFace Jacket', 'soft_shell', 'jacket', true, true, false, false, 'none', 337, 179);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.65, 0.55, 0, 0.60, 18.0, 16.0, 0, 17.0, 0.35, 'estimated_from_specs', 0.70
FROM garments WHERE brand = 'Patagonia' AND model_name = 'R1 TechFace Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'R1 TechFace Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 8, 5, 4, -5, 10, 5, 15, 'Active layer for variable conditions. Excellent wind/abrasion resistance. Best layered over another fleece in cold.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'R1 TechFace Jacket';


-- ============================================
-- BASE LAYERS - Under Armour ColdGear Base 2.0 Crew
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Under Armour', 'ColdGear Base 2.0 Crew', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 200, 55);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.55, 0.50, 0, 0.53, 14.0, 12.0, 0, 13.0, 0.32, 'estimated_from_specs', 0.65
FROM garments WHERE brand = 'Under Armour' AND model_name = 'ColdGear Base 2.0 Crew';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 8, 6, 7, -15, 5, -5, 10, 'Dual-layer fabric: brushed grid interior traps air, smooth exterior. 4-way stretch. Good for high activity in cold.'
FROM garments WHERE brand = 'Under Armour' AND model_name = 'ColdGear Base 2.0 Crew';


-- ============================================
-- BASE LAYERS - Under Armour ColdGear Base 2.0 Leggings
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Under Armour', 'ColdGear Base 2.0 Leggings', 'base_layer', 'pants', false, false, true, false, 'none', 220, 50);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.50, 0.13, 0, 0, 14.0, 3.5, 0.32, 'estimated_from_specs', 0.65
FROM garments WHERE brand = 'Under Armour' AND model_name = 'ColdGear Base 2.0 Leggings';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 8, 6, 7, -15, 5, -5, 10, 'Brushed grid interior, smooth exterior. 4-way stretch. Midweight protection for cold/high activity.'
FROM garments WHERE brand = 'Under Armour' AND model_name = 'ColdGear Base 2.0 Leggings';


-- ============================================
-- BASE LAYERS - Patagonia Capilene Thermal Weight Boot-Length Bottoms
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Capilene Thermal Weight Boot-Length Bottoms', 'base_layer', 'pants', false, false, true, false, 'none', 121, 79);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.65, 0.16, 0, 0, 18.0, 4.5, 0.35, 'estimated_from_specs', 0.75
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Capilene Thermal Weight Boot-Length Bottoms';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 8, 7, 8, -20, 0, -10, 5, 'Polartec Power Grid. Open grid pattern for warmth/breathability. 22" inseam (boot-length) for ski/snowboard.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Capilene Thermal Weight Boot-Length Bottoms';

-- Note: Smartwool Ski Targeted Cushion OTC socks not added - no socks table exists in current schema
