-- Migration: Add new clothing items - Batch 4
-- Brands: Hestra, Arc'teryx, Patagonia, Black Diamond, Outdoor Research, BlackStrap, Smartwool, Fjallraven

-- ============================================
-- HANDWEAR
-- ============================================

-- Hestra Ergo Grip Gloves (Active insulated glove with good dexterity)
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Hestra', 'Ergo Grip Active', 'insulated_glove', 200, 1.60, 6, false, true, false, -15, -5);

-- Arc'teryx Venta Mitten (Windproof GORE-TEX INFINIUM)
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Arc''teryx', 'Venta Mitten', 'mitten', 95, 1.80, 3, false, true, false, -20, -10);

-- Arc'teryx Venta Glove (Windproof GORE-TEX INFINIUM)
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Arc''teryx', 'Venta Glove', 'light_glove', 75, 1.20, 7, false, true, true, -10, 0);

-- Patagonia Capilene Midweight Liner Glove
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Patagonia', 'Capilene Midweight Liner Glove', 'liner_glove', 35, 0.45, 9, false, false, true, 0, 5);

-- Black Diamond Mercury Mitt (Shell only)
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Black Diamond', 'Mercury Mitt Shell', 'shell_overmitten', 180, 0.90, 3, true, true, false, -10, 0);

-- Black Diamond Mercury Mitt (Shell + Liner - full system)
-- Note: Already exists as 'Mercury Mitt', adding clarification for completeness
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Black Diamond', 'Mercury Mitt System', 'mitten', 400, 3.50, 2, true, true, false, -35, -25);

-- Outdoor Research Flurry Sensor Gloves
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Outdoor Research', 'Flurry Sensor Gloves', 'light_glove', 65, 0.85, 8, false, false, true, -5, 5);


-- ============================================
-- HEADWEAR
-- ============================================

-- Patagonia Merino Air Balaclava
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Patagonia', 'Merino Air Balaclava', 'balaclava_light', 55, true, true, true, true, 0.75, false, -15, -5);

-- Patagonia Snowfarer Cap (insulated cap)
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Patagonia', 'Snowfarer Cap', 'midweight_beanie', 65, true, false, false, true, 0.85, false, -10, 0);

-- BlackStrap Expedition Hood Balaclava
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('BlackStrap', 'Expedition Hood Balaclava', 'balaclava_heavy', 85, true, true, true, true, 1.40, true, -25, -15);

-- Smartwool Cozy Cabin Hat
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Smartwool', 'Cozy Cabin Hat', 'heavy_beanie', 75, true, false, false, false, 1.10, false, -15, -5);


-- ============================================
-- GARMENTS - Patagonia Snowdrifter Bibs
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Snowdrifter Bibs', 'outer_insulated', 'bib', true, false, true, false, 'none', 850, 449);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.60, 0, 1.20, 0.75, 28.0, 0, 32.0, 28.0, 0.22, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Snowdrifter Bibs';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 20000, 'H2No', 'taped'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Snowdrifter Bibs';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, has_thigh_vents, ventilation_factor)
SELECT id, false, true, 0.70
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Snowdrifter Bibs';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 4, 7, 8, -20, -5, -10, 5, 'Insulated ski bibs with H2No waterproofing. Excellent for resort and backcountry descents. Thigh vents for temperature regulation.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Snowdrifter Bibs';


-- ============================================
-- GARMENTS - Patagonia Snowdrifter Jacket
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Snowdrifter Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'helmet_compatible', 780, 499);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.35, 1.15, 0, 1.28, 30.0, 28.0, 0, 29.0, 0.22, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Snowdrifter Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 20000, 'H2No', 'taped'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Snowdrifter Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, ventilation_factor)
SELECT id, true, 0.65
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Snowdrifter Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 4, 7, 9, -20, -5, -10, 5, 'Insulated ski jacket with H2No waterproofing. 60g insulation throughout. Helmet-compatible hood. Best for resort skiing.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Snowdrifter Jacket';


-- ============================================
-- GARMENTS - Patagonia Nano-Air Light Vest
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Nano-Air Light Vest', 'insulation_synthetic', 'vest', true, false, false, false, 'none', 156, 179);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.85, 0, 0, 0.45, 14.0, 0, 0, 7.0, 0.45, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Nano-Air Light Vest';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Nano-Air Light Vest';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 9, 6, 5, -10, 10, 0, 15, 'Ultralight active insulation vest. FullRange insulation is highly breathable. Perfect for high-output activities in cold.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Nano-Air Light Vest';


-- ============================================
-- GARMENTS - Patagonia Capilene Midweight Bottoms
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Capilene Midweight Bottoms', 'base_layer', 'pants', false, false, true, false, 'none', 147, 69);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.50, 0.13, 0, 0, 12.0, 3.0, 0.38, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Capilene Midweight Bottoms';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 9, 9, 7, 7, -15, 10, -5, 15, 'Midweight base layer with hollow-core Capilene fabric. Excellent moisture wicking for high-output activities.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Capilene Midweight Bottoms';


-- ============================================
-- GARMENTS - Patagonia Jackson Glacier Parka
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Jackson Glacier Parka', 'outer_insulated', 'jacket', true, true, false, true, 'attached', 1134, 549);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 2.20, 1.80, 0, 2.05, 45.0, 40.0, 0, 43.0, 0.15, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Jackson Glacier Parka';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type)
SELECT id, 'windproof', 'waterproof', 'H2No'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Jackson Glacier Parka';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 2, 2, 5, 6, -30, -10, -20, 0, 'Heavy-duty winter parka with 700-fill down. Urban/casual focus. Too warm for most active skiing but excellent for extreme cold standby.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Jackson Glacier Parka';


-- ============================================
-- GARMENTS - Outdoor Research Ferrosi Hoodie
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Outdoor Research', 'Ferrosi Hoodie', 'soft_shell', 'jacket', true, true, false, true, 'attached', 340, 129);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.55, 0.48, 0, 0.52, 12.0, 10.0, 0, 11.0, 0.42, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Ferrosi Hoodie';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Ferrosi Hoodie';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 9, 6, 4, -5, 15, 5, 20, 'Lightweight softshell with excellent stretch and breathability. Wind resistant face. Ideal for high-output aerobic activities.'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Ferrosi Hoodie';


-- ============================================
-- GARMENTS - Outdoor Research Ferrosi Joggers
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Outdoor Research', 'Ferrosi Joggers', 'soft_shell', 'pants', false, false, true, false, 'none', 280, 99);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.50, 0.13, 0, 0, 11.0, 2.8, 0.42, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Ferrosi Joggers';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Ferrosi Joggers';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 8, 5, 3, -5, 15, 5, 20, 'Lightweight stretchy softshell pants. Wind resistant, breathable. Great for hiking, XC skiing, casual use.'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Ferrosi Joggers';


-- ============================================
-- GARMENTS - Patagonia Macro Puff Hoody
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Macro Puff Hoody', 'insulation_synthetic', 'jacket', true, true, false, true, 'attached', 539, 349);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.65, 1.45, 0, 1.58, 28.0, 25.0, 0, 27.0, 0.28, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Macro Puff Hoody';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Macro Puff Hoody';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 5, 6, 6, 6, -20, 0, -10, 10, 'PlumaFill synthetic insulation mimics down. Warm, packable, performs wet. Good belay jacket or cold weather midlayer.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Macro Puff Hoody';


-- ============================================
-- GARMENTS - Patagonia Micro Puff Hoody
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Micro Puff Hoody', 'insulation_synthetic', 'jacket', true, true, false, true, 'attached', 264, 299);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.10, 0.95, 0, 1.05, 20.0, 18.0, 0, 19.0, 0.32, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Micro Puff Hoody';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Micro Puff Hoody';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 7, 5, 5, -15, 5, -5, 10, 'Ultralight PlumaFill insulation. Extremely packable. Best warmth-to-weight ratio in synthetic. Good for active cold or emergency warmth.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Micro Puff Hoody';


-- ============================================
-- GARMENTS - Fjallraven Övik Fleece Half Zip
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Fjallraven', 'Övik Fleece Half Zip', 'mid_layer_light', 'top_long_sleeve', true, true, false, false, 'none', 380, 130);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.70, 0.60, 0, 0.66, 15.0, 13.0, 0, 14.0, 0.35, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Fjallraven' AND model_name = 'Övik Fleece Half Zip';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 6, 6, 5, 5, -10, 10, 0, 15, 'Classic fleece midlayer. Good breathability and warmth. Relaxed fit works well as casual or technical layer.'
FROM garments WHERE brand = 'Fjallraven' AND model_name = 'Övik Fleece Half Zip';


-- ============================================
-- GARMENTS - Patagonia R1 Pull Over
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'R1 Pullover', 'mid_layer_heavy', 'top_long_sleeve', true, true, false, false, 'none', 289, 139);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.80, 0.70, 0, 0.76, 16.0, 14.0, 0, 15.0, 0.38, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Patagonia' AND model_name = 'R1 Pullover';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 9, 6, 5, -10, 10, 0, 15, 'Polartec Power Grid fleece. Industry standard for active insulation. Excellent breathability with offset seams for comfort under pack straps.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'R1 Pullover';


-- ============================================
-- GARMENTS - Patagonia Houdini Jacket
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Houdini Jacket', 'hard_shell', 'jacket', true, true, false, true, 'attached', 105, 109);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.15, 0.12, 0, 0.14, 8.0, 6.0, 0, 7.0, 0.50, 'derived_from_similar', 0.80
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Houdini Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'windproof', 'DWR_only'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Houdini Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 9, 7, 5, 0, 20, 10, 25, 'Ultralight wind shell. Packs into own pocket. Essential for transitions and summits. Not waterproof but DWR handles light precip.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Houdini Jacket';


-- ============================================
-- GARMENTS - Arc'teryx Atom LT Insulated Jacket
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Arc''teryx', 'Atom LT Hoody', 'insulation_synthetic', 'jacket', true, true, false, true, 'attached', 375, 280);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.15, 1.00, 0, 1.10, 22.0, 20.0, 0, 21.0, 0.32, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Atom LT Hoody';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Atom LT Hoody';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 7, 6, 6, -15, 5, -5, 10, 'Coreloft synthetic in core, Polartec fleece in arms. Versatile active insulation. Industry benchmark for midlayer/belay jacket.'
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Atom LT Hoody';


-- ============================================
-- GARMENTS - Patagonia R1 Fleece Pants
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'R1 Fleece Pants', 'mid_layer_heavy', 'pants', false, false, true, false, 'none', 275, 139);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.75, 0.19, 0, 0, 16.0, 4.0, 0.38, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Patagonia' AND model_name = 'R1 Fleece Pants';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 8, 6, 6, -15, 5, -5, 10, 'Polartec Power Grid fleece pants. Excellent breathability for high-output activities. Works as midlayer or standalone in mild cold.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'R1 Fleece Pants';
