-- Seed data: Garments, materials, and calibration reference

-- ============================================
-- MATERIAL REFERENCE DATA
-- ============================================

INSERT INTO material_reference (material_name, manufacturer, material_category, thermal_resistance_per_mm, base_evap_resistance, fill_power, clo_per_oz_sqyd) VALUES
-- Synthetic base layer fabrics
('Capilene Cool', 'Patagonia', 'synthetic_knit', 0.015, 5.0, NULL, NULL),
('Capilene Midweight', 'Patagonia', 'synthetic_knit', 0.022, 10.0, NULL, NULL),
('Polartec Power Grid', 'Polartec', 'synthetic_fleece', 0.028, 8.0, NULL, NULL),

-- Merino
('Merino 150', 'Generic', 'merino', 0.020, 12.0, NULL, NULL),
('Merino 250', 'Generic', 'merino', 0.024, 16.0, NULL, NULL),

-- Fleece
('Polartec Alpha Direct', 'Polartec', 'synthetic_insulation', NULL, 6.0, NULL, 0.65),
('Polartec High Loft', 'Polartec', 'synthetic_fleece', 0.035, 12.0, NULL, NULL),

-- Synthetic insulation
('PrimaLoft Gold', 'PrimaLoft', 'synthetic_insulation', NULL, 18.0, NULL, 0.84),
('FullRange Insulation', 'Patagonia', 'synthetic_insulation', NULL, 14.0, NULL, 0.70),
('Climashield APEX', 'Climashield', 'synthetic_insulation', NULL, 16.0, NULL, 0.78),

-- Down
('800 Fill Down', 'Generic', 'down_insulation', NULL, 20.0, 800, 1.1),
('850 Fill Down', 'Generic', 'down_insulation', NULL, 22.0, 850, 1.2),

-- Membranes
('Gore-Tex Pro', 'Gore', 'membrane', NULL, 12.0, NULL, NULL),
('Gore-Tex Active', 'Gore', 'membrane', NULL, 8.0, NULL, NULL),
('Gore-Tex Infinium', 'Gore', 'membrane', NULL, 5.0, NULL, NULL),
('Pertex Shield', 'Pertex', 'membrane', NULL, 10.0, NULL, NULL),
('Pertex Quantum', 'Pertex', 'membrane', NULL, 4.0, NULL, NULL);

-- ============================================
-- CALIBRATION DATA FROM USARIEM TESTING
-- ============================================

INSERT INTO calibration_reference (source_report, garment_description, measured_rcl_torso, measured_rcl_arm, measured_rcl_leg, measured_rcl_whole, measured_recl_torso, measured_recl_arm, measured_recl_leg, measured_recl_whole, garment_category, approximate_weight_grams, primary_material) VALUES
('USARIEM T21-03', 'SOF Lightweight Crew (Base Layer)', 0.55, 0.34, NULL, NULL, 12.32, 12.15, NULL, NULL, 'base_layer', 150, 'Synthetic knit'),
('USARIEM T21-03', 'SOF Nano Air Hoody (Insulation)', 2.34, 2.04, NULL, NULL, 35.59, 38.49, NULL, NULL, 'insulation_synthetic', 336, 'FullRange Insulation'),
('USARIEM T21-03', 'SOF DAS Jacket (Heavy Insulation)', 4.70, 2.94, NULL, NULL, 82.43, 63.90, NULL, NULL, 'insulation_synthetic', 539, 'PrimaLoft'),
('USARIEM T21-03', 'ECWCS Lightweight Undershirt', 0.55, 0.36, NULL, NULL, 9.86, 9.41, NULL, NULL, 'base_layer', 180, 'Synthetic knit'),
('USARIEM T21-03', 'ECWCS Midweight Shirt', 0.69, 0.55, NULL, NULL, 12.96, 13.18, NULL, NULL, 'base_layer', 220, 'Synthetic grid fleece'),
('USARIEM T21-03', 'ECWCS Fleece Jacket', 1.05, 0.94, NULL, NULL, 14.20, 14.63, NULL, NULL, 'mid_layer_heavy', 400, 'Polartec fleece'),
('USARIEM T21-03', 'CAF CADPAT IECS Parka', 4.68, 3.20, NULL, NULL, 82.49, 68.31, NULL, NULL, 'outer_insulated', 1200, 'Synthetic insulation'),
('USARIEM T21-03', 'ECWCS ECW Parka', 3.69, 2.38, NULL, NULL, 75.60, 60.53, NULL, NULL, 'outer_insulated', 900, 'Synthetic insulation');

-- ============================================
-- CONSUMER GARMENTS
-- ============================================

-- Patagonia Capilene Cool Lightweight
INSERT INTO garments (brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, weight_grams)
VALUES ('Patagonia', 'Capilene Cool Lightweight', 'base_layer', 'top_long_sleeve', true, true, false, 96);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score)
SELECT id, 0.35, 0.25, 0, 0.22, 6.0, 5.0, 0, 4.0, 0.45, 0.38, 'derived_from_similar', 0.7
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Capilene Cool Lightweight';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 9, 9, 4, 3, -5, 15, 5, 20
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Capilene Cool Lightweight';

-- Patagonia Capilene Midweight
INSERT INTO garments (brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, weight_grams)
VALUES ('Patagonia', 'Capilene Midweight', 'base_layer', 'top_long_sleeve', true, true, false, 184);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score)
SELECT id, 0.69, 0.55, 0, 0.45, 12.96, 10.0, 0, 8.5, 0.32, 0.35, 'lab_tested', 0.95
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Capilene Midweight';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 7, 8, 6, 6, -15, 5, -5, 10
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Capilene Midweight';

-- Smartwool Merino 250
INSERT INTO garments (brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, weight_grams)
VALUES ('Smartwool', 'Merino 250 Base Layer Crew', 'base_layer', 'top_long_sleeve', true, true, false, 240);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score)
SELECT id, 0.79, 0.65, 0, 0.52, 17.74, 15.0, 0, 12.0, 0.26, 0.30, 'derived_from_similar', 0.8
FROM garments WHERE brand = 'Smartwool' AND model_name = 'Merino 250 Base Layer Crew';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 5, 6, 7, 8, -20, 0, -10, 5
FROM garments WHERE brand = 'Smartwool' AND model_name = 'Merino 250 Base Layer Crew';

-- Patagonia R1 Air Full-Zip Hoody
INSERT INTO garments (brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, hood_type, weight_grams)
VALUES ('Patagonia', 'R1 Air Full-Zip Hoody', 'mid_layer_light', 'jacket', true, true, false, 'attached', 312);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score)
SELECT id, 0.95, 0.80, 0, 0.65, 11.0, 9.0, 0, 7.5, 0.38, 0.42, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Patagonia' AND model_name = 'R1 Air Full-Zip Hoody';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, main_zip_two_way, ventilation_factor)
SELECT id, false, true, 0.85
FROM garments WHERE brand = 'Patagonia' AND model_name = 'R1 Air Full-Zip Hoody';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 8, 9, 6, 5, -15, 5, -5, 10
FROM garments WHERE brand = 'Patagonia' AND model_name = 'R1 Air Full-Zip Hoody';

-- Patagonia Nano-Air Hoody
INSERT INTO garments (brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, hood_type, weight_grams)
VALUES ('Patagonia', 'Nano-Air Hoody', 'insulation_synthetic', 'jacket', true, true, false, 'attached', 336);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score)
SELECT id, 2.34, 2.04, 0, 1.65, 35.59, 38.49, 0, 27.0, 0.18, 0.38, 'lab_tested', 0.98
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Nano-Air Hoody';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, main_zip_two_way, ventilation_factor)
SELECT id, false, false, 0.90
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Nano-Air Hoody';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 4, 7, 8, 7, -25, -5, -15, 5
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Nano-Air Hoody';

-- Patagonia DAS Parka
INSERT INTO garments (brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, hood_type, weight_grams)
VALUES ('Patagonia', 'DAS Parka', 'insulation_synthetic', 'jacket', true, true, false, 'helmet_compatible', 539);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score)
SELECT id, 4.70, 2.94, 0, 2.85, 82.43, 63.90, 0, 55.0, 0.14, 0.32, 'lab_tested', 0.98
FROM garments WHERE brand = 'Patagonia' AND model_name = 'DAS Parka';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 1, 2, 6, 5, -40, -20, -30, -10
FROM garments WHERE brand = 'Patagonia' AND model_name = 'DAS Parka';

-- Arc'teryx Gamma MX Hoody
INSERT INTO garments (brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, hood_type, weight_grams)
VALUES ('Arc''teryx', 'Gamma MX Hoody', 'soft_shell', 'jacket', true, true, false, 'helmet_compatible', 575);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score)
SELECT id, 1.20, 1.00, 0, 0.80, 22.0, 20.0, 0, 15.5, 0.25, 0.35, 'derived_from_similar', 0.7
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Gamma MX Hoody';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'water_resistant'
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Gamma MX Hoody';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_length_cm, ventilation_factor)
SELECT id, true, 25, 0.70
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Gamma MX Hoody';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 6, 8, 8, 7, -20, 5, -10, 10
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Gamma MX Hoody';

-- Patagonia Upstride Jacket
INSERT INTO garments (brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, hood_type, weight_grams)
VALUES ('Patagonia', 'Upstride Jacket', 'soft_shell', 'jacket', true, true, false, 'helmet_compatible', 385);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score)
SELECT id, 0.65, 0.55, 0, 0.45, 14.0, 12.0, 0, 9.5, 0.32, 0.38, 'derived_from_similar', 0.7
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Upstride Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Upstride Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_length_cm, has_side_vents, ventilation_factor)
SELECT id, true, 30, true, 0.60
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Upstride Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 7, 9, 6, 4, -15, 10, -5, 15
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Upstride Jacket';

-- Arc'teryx Beta AR Jacket
INSERT INTO garments (brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, hood_type, weight_grams)
VALUES ('Arc''teryx', 'Beta AR Jacket', 'hard_shell', 'jacket', true, true, false, 'helmet_compatible', 455);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score)
SELECT id, 0.25, 0.20, 0, 0.17, 30.0, 28.0, 0, 21.0, 0.15, 0.15, 'derived_from_similar', 0.8
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Beta AR Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, breathability_mvtr, breathability_ret, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 28000, 25000, 13.0, 'Gore-Tex Pro', 'taped'
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Beta AR Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_length_cm, ventilation_factor)
SELECT id, true, 28, 0.65
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Beta AR Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 4, 5, 9, 9, -30, 10, -20, 15
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Beta AR Jacket';

-- Arc'teryx Alpha FL Jacket
INSERT INTO garments (brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, hood_type, weight_grams)
VALUES ('Arc''teryx', 'Alpha FL Jacket', 'hard_shell', 'jacket', true, true, false, 'helmet_compatible', 315);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score)
SELECT id, 0.15, 0.12, 0, 0.10, 22.0, 20.0, 0, 15.5, 0.22, 0.20, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Alpha FL Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, breathability_mvtr, breathability_ret, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 20000, 35000, 9.0, 'Gore-Tex Active', 'taped'
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Alpha FL Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, ventilation_factor)
SELECT id, false, 0.85
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Alpha FL Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 5, 7, 8, 7, -25, 10, -15, 15
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Alpha FL Jacket';

-- Migration: Add new clothing items
-- Brands: Norrøna, Patagonia, Icebreaker

-- ============================================
-- NORRØNA ITEMS
-- ============================================

-- Norrøna Lyngen Down850 Hood Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Norrøna', 'Lyngen Down850 Hood Jacket', 'insulation_down', 'jacket', true, true, false, false, 'helmet_compatible', 382, 489);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 2.80, 2.20, 0, 1.90, 45.0, 40.0, 0, 32.0, 0.16, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lyngen Down850 Hood Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lyngen Down850 Hood Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 3, 4, 8, 7, -25, -5, -15, 0
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lyngen Down850 Hood Jacket';


-- Norrøna Trollveggen Gore-Tex Pro Light Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Norrøna', 'Trollveggen Gore-Tex Pro Light Jacket', 'hard_shell', 'jacket', true, true, false, false, 'helmet_compatible', 432, 699);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.20, 0.15, 0, 0.13, 28.0, 26.0, 0, 20.0, 0.18, 'derived_from_similar', 0.80
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Trollveggen Gore-Tex Pro Light Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, breathability_ret, seam_construction)
SELECT id, 'windproof', 'waterproof', 28000, 13.0, 'taped'
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Trollveggen Gore-Tex Pro Light Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_length_cm, main_zip_two_way, ventilation_factor)
SELECT id, true, 50, true, 0.65
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Trollveggen Gore-Tex Pro Light Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 5, 6, 9, 8, -30, 10, -20, 15
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Trollveggen Gore-Tex Pro Light Jacket';


-- Norrøna Trollveggen Gore-Tex Pro Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Norrøna', 'Trollveggen Gore-Tex Pro Jacket', 'hard_shell', 'jacket', true, true, false, false, 'helmet_compatible', 650, 849);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.28, 0.22, 0, 0.19, 32.0, 30.0, 0, 23.0, 0.15, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Trollveggen Gore-Tex Pro Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, breathability_ret, seam_construction)
SELECT id, 'windproof', 'waterproof', 28000, 13.0, 'taped'
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Trollveggen Gore-Tex Pro Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_length_cm, main_zip_two_way, ventilation_factor)
SELECT id, true, 50, true, 0.60
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Trollveggen Gore-Tex Pro Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 4, 5, 9, 9, -35, 10, -25, 15
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Trollveggen Gore-Tex Pro Jacket';


-- Norrøna Trollveggen Thermal Pro Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Norrøna', 'Trollveggen Thermal Pro Jacket', 'mid_layer_heavy', 'jacket', true, true, false, false, 'none', 485, 199);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.45, 1.20, 0, 0.98, 16.0, 14.0, 0, 11.0, 0.22, 'calculated_from_materials', 0.70
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Trollveggen Thermal Pro Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'none', 'none'
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Trollveggen Thermal Pro Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 3, 4, 6, 7, -15, 5, -5, 10
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Trollveggen Thermal Pro Jacket';


-- Norrøna Falketind Flex1 Pants
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Norrøna', 'Falketind Flex1 Pants', 'soft_shell', 'pants', false, false, true, false, 'none', 426, 199);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.85, 0.21, 0, 0, 18.0, 4.5, 0.28, 'calculated_from_materials', 0.70
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Falketind Flex1 Pants';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Falketind Flex1 Pants';

INSERT INTO garment_ventilation (garment_id, has_thigh_vents, ventilation_factor)
SELECT id, true, 0.70
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Falketind Flex1 Pants';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 7, 9, 7, 5, -15, 10, -5, 15
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Falketind Flex1 Pants';


-- Norrøna Falketind Flex1 Heavy Duty Pants
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Norrøna', 'Falketind Flex1 Heavy Duty Pants', 'soft_shell', 'pants', false, false, true, false, 'none', 526, 229);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 1.00, 0.25, 0, 0, 20.0, 5.0, 0.25, 'calculated_from_materials', 0.65
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Falketind Flex1 Heavy Duty Pants';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Falketind Flex1 Heavy Duty Pants';

INSERT INTO garment_ventilation (garment_id, has_thigh_vents, ventilation_factor)
SELECT id, true, 0.75
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Falketind Flex1 Heavy Duty Pants';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 6, 8, 8, 6, -20, 5, -10, 10
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Falketind Flex1 Heavy Duty Pants';


-- Norrøna Lofoten Gore-Tex Pro Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Norrøna', 'Lofoten Gore-Tex Pro Jacket', 'hard_shell', 'jacket', true, true, false, false, 'helmet_compatible', 520, 749);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.18, 0.15, 0, 0.12, 26.0, 24.0, 0, 18.5, 0.20, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Pro Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, seam_construction)
SELECT id, 'windproof', 'waterproof', 28000, 'taped'
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Pro Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_length_cm, ventilation_factor)
SELECT id, true, 45, 0.55
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Pro Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 5, 7, 9, 8, -30, 10, -20, 15
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Pro Jacket';


-- Norrøna Lofoten Gore-Tex Insulated Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Norrøna', 'Lofoten Gore-Tex Insulated Jacket', 'outer_insulated', 'jacket', true, true, false, false, 'helmet_compatible', 780, 699);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.80, 1.30, 0, 1.15, 42.0, 38.0, 0, 30.0, 0.15, 'calculated_from_materials', 0.70
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Insulated Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, breathability_ret, seam_construction)
SELECT id, 'windproof', 'waterproof', 28000, 13.0, 'taped'
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Insulated Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, ventilation_factor)
SELECT id, true, 0.70
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Insulated Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 2, 3, 7, 9, -25, -5, -15, 5
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Insulated Jacket';


-- Norrøna Lofoten Gore-Tex Insulated Pants
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Norrøna', 'Lofoten Gore-Tex Insulated Pants', 'outer_insulated', 'pants', false, false, true, false, 'none', 720, 549);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 1.40, 0.35, 0, 0, 35.0, 8.75, 0.16, 'calculated_from_materials', 0.65
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Insulated Pants';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, seam_construction)
SELECT id, 'windproof', 'waterproof', 28000, 'taped'
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Insulated Pants';

INSERT INTO garment_ventilation (garment_id, has_thigh_vents, ventilation_factor)
SELECT id, true, 0.70
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Insulated Pants';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 2, 3, 7, 9, -25, -5, -15, 5
FROM garments WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Insulated Pants';


-- ============================================
-- PATAGONIA ITEMS
-- ============================================

-- Patagonia Wind Shield Pants
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Wind Shield Pants', 'soft_shell', 'pants', false, false, true, false, 'none', 230, 149);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.55, 0.14, 0, 0, 12.0, 3.0, 0.32, 'calculated_from_materials', 0.70
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Wind Shield Pants';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Wind Shield Pants';

INSERT INTO garment_ventilation (garment_id, has_thigh_vents, has_back_vent, has_side_vents, ventilation_factor)
SELECT id, false, true, true, 0.65
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Wind Shield Pants';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 9, 8, 5, 3, -10, 10, 0, 15
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Wind Shield Pants';


-- ============================================
-- ICEBREAKER ITEMS
-- ============================================

-- Icebreaker Merino 260 Tech Long Sleeve Crewe
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Icebreaker', 'Merino 260 Tech Long Sleeve Crewe', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 316, 120);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.85, 0.70, 0, 0.58, 18.0, 16.0, 0, 12.5, 0.25, 'derived_from_similar', 0.80
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 260 Tech Long Sleeve Crewe';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 5, 5, 7, 8, -25, 0, -15, 5
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 260 Tech Long Sleeve Crewe';


-- Icebreaker Merino 260 Tech Long Sleeve Half-Zip
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Icebreaker', 'Merino 260 Tech Long Sleeve Half-Zip', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 340, 130);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.90, 0.75, 0, 0.62, 19.0, 17.0, 0, 13.0, 0.24, 'derived_from_similar', 0.80
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 260 Tech Long Sleeve Half-Zip';

INSERT INTO garment_ventilation (garment_id, main_zip_two_way, ventilation_factor)
SELECT id, false, 0.85
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 260 Tech Long Sleeve Half-Zip';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 5, 6, 7, 8, -25, 0, -15, 5
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 260 Tech Long Sleeve Half-Zip';


-- Icebreaker Merino 260 Tech Leggings
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Icebreaker', 'Merino 260 Tech Leggings', 'base_layer', 'pants', false, false, true, false, 'none', 270, 110);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.80, 0.20, 0, 0, 17.0, 4.25, 0.26, 'derived_from_similar', 0.80
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 260 Tech Leggings';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 5, 5, 7, 8, -25, 0, -15, 5
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 260 Tech Leggings';


-- Icebreaker Merino 200 Oasis Long Sleeve Crewe
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Icebreaker', 'Merino 200 Oasis Long Sleeve Crewe', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 210, 105);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.65, 0.55, 0, 0.45, 14.0, 12.0, 0, 9.5, 0.30, 'derived_from_similar', 0.85
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 200 Oasis Long Sleeve Crewe';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 7, 7, 6, 6, -15, 5, -5, 10
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 200 Oasis Long Sleeve Crewe';


-- Icebreaker Merino 200 Oasis Long Sleeve Half-Zip
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Icebreaker', 'Merino 200 Oasis Long Sleeve Half-Zip', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 237, 115);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.68, 0.58, 0, 0.47, 15.0, 13.0, 0, 10.0, 0.29, 'derived_from_similar', 0.85
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 200 Oasis Long Sleeve Half-Zip';

INSERT INTO garment_ventilation (garment_id, main_zip_two_way, ventilation_factor)
SELECT id, false, 0.85
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 200 Oasis Long Sleeve Half-Zip';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 7, 8, 6, 6, -15, 5, -5, 10
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 200 Oasis Long Sleeve Half-Zip';


-- Icebreaker Merino 200 Oasis Leggings
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Icebreaker', 'Merino 200 Oasis Leggings', 'base_layer', 'pants', false, false, true, false, 'none', 185, 95);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.60, 0.15, 0, 0, 13.0, 3.25, 0.30, 'derived_from_similar', 0.85
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 200 Oasis Leggings';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 7, 7, 6, 6, -15, 5, -5, 10
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 200 Oasis Leggings';


-- Icebreaker Merino 200 ZoneKnit Long Sleeve Half-Zip
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Icebreaker', 'Merino 200 ZoneKnit Long Sleeve Half-Zip', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 245, 150);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.62, 0.52, 0, 0.43, 12.0, 10.0, 0, 8.0, 0.34, 'calculated_from_materials', 0.70
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 200 ZoneKnit Long Sleeve Half-Zip';

INSERT INTO garment_ventilation (garment_id, main_zip_two_way, has_back_vent, ventilation_factor)
SELECT id, false, true, 0.75
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 200 ZoneKnit Long Sleeve Half-Zip';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 8, 9, 6, 5, -15, 10, -5, 15
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 200 ZoneKnit Long Sleeve Half-Zip';


-- Icebreaker Merino 175 Everyday Long Sleeve Crewe
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Icebreaker', 'Merino 175 Everyday Long Sleeve Crewe', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 175, 95);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.50, 0.42, 0, 0.35, 11.0, 9.5, 0, 7.5, 0.35, 'calculated_from_materials', 0.75
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 175 Everyday Long Sleeve Crewe';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 8, 8, 5, 4, -10, 15, 0, 20
FROM garments WHERE brand = 'Icebreaker' AND model_name = 'Merino 175 Everyday Long Sleeve Crewe';

-- ============================================
-- GARMENTS - Lululemon Pace Breaker Jacket
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Lululemon', 'Pace Breaker Jacket', 'soft_shell', 'jacket', true, true, false, false, 'attached', 220, 168);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.20, 0.18, 0, 0.19, 12.0, 10.0, 0, 11.0, 0.38, 'calculated_from_materials', 0.60
FROM garments WHERE brand = 'Lululemon' AND model_name = 'Pace Breaker Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Lululemon' AND model_name = 'Pace Breaker Jacket';

INSERT INTO garment_ventilation (garment_id, has_back_vent, main_zip_two_way, ventilation_factor)
SELECT id, true, true, 0.70
FROM garments WHERE brand = 'Lululemon' AND model_name = 'Pace Breaker Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 8, 4, 3, -10, 15, 0, 20, 'Wind protection for high-output activities. Not warm enough for lifts or descents.'
FROM garments WHERE brand = 'Lululemon' AND model_name = 'Pace Breaker Jacket';


-- ============================================
-- GARMENTS - Outdoor Research Helium Rain Jacket
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Outdoor Research', 'Helium Rain Jacket', 'hard_shell', 'jacket', true, true, false, false, 'attached', 185, 159);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.12, 0.10, 0, 0.11, 40.0, 35.0, 0, 38.0, 0.07, 'calculated_from_materials', 0.65
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Helium Rain Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type)
SELECT id, 'windproof', 'waterproof', 'Pertex Shield Diamond Fuse 2.5L'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Helium Rain Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 5, 4, 6, 3, -20, 15, -10, 20, 'Ultralight emergency shell. Wets out in sustained rain. Poor breathability but excellent packability.'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Helium Rain Jacket';


-- ============================================
-- GARMENTS - Patagonia Insulated Powder Bowl Pants
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Insulated Powder Bowl Pants - Regular', 'outer_insulated', 'pants', false, false, true, false, 'none', 773, 379);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 1.10, 0.28, 0, 0, 40.0, 10.0, 0.22, 'calculated_from_materials', 0.70
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Insulated Powder Bowl Pants - Regular';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 'GORE-TEX 2L', 'taped'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Insulated Powder Bowl Pants - Regular';

INSERT INTO garment_ventilation (garment_id, has_thigh_vents, ventilation_factor)
SELECT id, true, 0.75
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Insulated Powder Bowl Pants - Regular';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 4, 5, 8, 9, -25, 0, -15, 5, 'Optimized for resort skiing. Insulation too warm for sustained uphill. Excellent for cold chairlift days.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Insulated Powder Bowl Pants - Regular';


-- ============================================
-- GARMENTS - Mountain Hardwear Ghost Whisperer/2 Jacket
-- ============================================

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Mountain Hardwear', 'Ghost Whisperer/2 Jacket', 'insulation_down', 'jacket', true, true, false, false, 'none', 226, 325);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.45, 1.30, 0, 1.40, 22.0, 20.0, 0, 21.0, 0.30, 'derived_from_similar', 0.70
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
SELECT id, 1.50, 1.30, 0, 1.42, 35.0, 32.0, 0, 34.0, 0.20, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Firefall/2 Insulated Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type)
SELECT id, 'windproof', 'waterproof', 'Dry.Q 2L'
FROM garments WHERE brand = 'Mountain Hardwear' AND model_name = 'Firefall/2 Insulated Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, ventilation_factor)
SELECT id, true, 0.65
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
SELECT id, 1.20, 1.05, 0, 1.15, 30.0, 28.0, 0, 29.0, 0.25, 'derived_from_similar', 0.70
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
VALUES (gen_random_uuid(), 'Columbia', 'Joy Peak Lite Hooded Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'attached', 450, 130);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.15, 1.00, 0, 1.10, 26.0, 23.0, 0, 25.0, 0.28, 'derived_from_similar', 0.60
FROM garments WHERE brand = 'Columbia' AND model_name = 'Joy Peak Lite Hooded Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'windproof', 'water_resistant'
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
SELECT id, 0.65, 0.55, 0, 0.60, 18.0, 16.0, 0, 17.0, 0.35, 'derived_from_similar', 0.70
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
SELECT id, 0.55, 0.50, 0, 0.53, 14.0, 12.0, 0, 13.0, 0.32, 'derived_from_similar', 0.65
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
SELECT id, 0, 0, 0.50, 0.13, 0, 0, 14.0, 3.5, 0.32, 'derived_from_similar', 0.65
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
SELECT id, 0, 0, 0.65, 0.16, 0, 0, 18.0, 4.5, 0.35, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Capilene Thermal Weight Boot-Length Bottoms';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 8, 7, 8, -20, 0, -10, 5, 'Polartec Power Grid. Open grid pattern for warmth/breathability. 22" inseam (boot-length) for ski/snowboard.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Capilene Thermal Weight Boot-Length Bottoms';


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


-- ============================================
-- GARMENTS: 32 Degrees (Heat) base layers
-- ============================================

-- 32 Degrees Heat Lightweight Crew
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), '32 Degrees', 'Heat Lightweight Crew', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 140, 20);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.30, 0.25, 0, 0.25, 8.0, 6.0, 0, 7.0, 0.40, 'derived_from_similar', 0.60
FROM garments WHERE brand = '32 Degrees' AND model_name = 'Heat Lightweight Crew';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 7, 5, 5, -5, 10, 5, 15, 'Budget lightweight synthetic base layer. Good moisture wicking for the price. Best for mild cold or high output.'
FROM garments WHERE brand = '32 Degrees' AND model_name = 'Heat Lightweight Crew';


-- 32 Degrees Heat Midweight Crew
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), '32 Degrees', 'Heat Midweight Crew', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 180, 25);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.48, 0.42, 0, 0.40, 12.0, 10.0, 0, 11.0, 0.35, 'derived_from_similar', 0.60
FROM garments WHERE brand = '32 Degrees' AND model_name = 'Heat Midweight Crew';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 7, 6, 6, -10, 5, 0, 10, 'Budget midweight synthetic base layer. Brushed interior traps warmth. Good value for cold weather activities.'
FROM garments WHERE brand = '32 Degrees' AND model_name = 'Heat Midweight Crew';


-- 32 Degrees Heat Lightweight Legging
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), '32 Degrees', 'Heat Lightweight Legging', 'base_layer', 'pants', false, false, true, false, 'none', 120, 20);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.30, 0.08, 0, 0, 8.0, 2.0, 0.40, 'derived_from_similar', 0.60
FROM garments WHERE brand = '32 Degrees' AND model_name = 'Heat Lightweight Legging';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 7, 5, 5, -5, 10, 5, 15, 'Budget lightweight synthetic base layer bottom. Thin and breathable. Best for mild cold or high output.'
FROM garments WHERE brand = '32 Degrees' AND model_name = 'Heat Lightweight Legging';


-- 32 Degrees Heat Midweight Legging
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), '32 Degrees', 'Heat Midweight Legging', 'base_layer', 'pants', false, false, true, false, 'none', 160, 25);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.45, 0.12, 0, 0, 12.0, 3.0, 0.35, 'derived_from_similar', 0.60
FROM garments WHERE brand = '32 Degrees' AND model_name = 'Heat Midweight Legging';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 7, 6, 6, -10, 5, 0, 10, 'Budget midweight synthetic base layer bottom. Brushed interior for warmth. Good value for cold weather.'
FROM garments WHERE brand = '32 Degrees' AND model_name = 'Heat Midweight Legging';


-- ============================================
-- GARMENTS: Columbia (5 items)
-- ============================================

-- Columbia Powder Lite Hooded Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Columbia', 'Powder Lite Hooded Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'attached', 510, 150);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.25, 1.05, 0, 1.15, 28.0, 25.0, 0, 27.0, 0.25, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Columbia' AND model_name = 'Powder Lite Hooded Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'windproof', 'water_resistant'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Powder Lite Hooded Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 4, 4, 6, 7, -20, -5, -10, 5, 'Synthetic insulated jacket with water-resistant shell. Omni-Heat reflective lining. Good value resort option.'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Powder Lite Hooded Jacket';


-- Columbia Powder Lite Vest
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Columbia', 'Powder Lite Vest', 'insulation_synthetic', 'vest', true, false, false, false, 'none', 280, 100);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.95, 0, 0, 0.55, 16.0, 0, 0, 9.0, 0.30, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Columbia' AND model_name = 'Powder Lite Vest';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'water_resistant'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Powder Lite Vest';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 6, 7, 5, 5, -10, 5, 0, 10, 'Synthetic insulated vest with Omni-Heat. Good core warmth without restricting arms. Versatile layering piece.'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Powder Lite Vest';


-- Columbia Bugaboo IV Interchange Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Columbia', 'Bugaboo IV Interchange Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'attached', 1100, 230);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.50, 1.25, 0, 1.35, 35.0, 32.0, 0, 34.0, 0.18, 'derived_from_similar', 0.60
FROM garments WHERE brand = 'Columbia' AND model_name = 'Bugaboo IV Interchange Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'windproof', 'waterproof'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Bugaboo IV Interchange Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 3, 6, 8, -25, -5, -15, 5, '3-in-1 interchange system with waterproof shell and insulated liner. Heavy but versatile. Best for resort skiing in cold.'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Bugaboo IV Interchange Jacket';


-- Columbia Silver Ridge Base Layer Crew
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Columbia', 'Silver Ridge Base Layer Crew', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 170, 45);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.38, 0.32, 0, 0.30, 10.0, 8.0, 0, 9.0, 0.36, 'derived_from_similar', 0.60
FROM garments WHERE brand = 'Columbia' AND model_name = 'Silver Ridge Base Layer Crew';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 7, 5, 6, -8, 8, 2, 12, 'Lightweight synthetic base layer with Omni-Wick moisture management. Good value option for moderate cold.'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Silver Ridge Base Layer Crew';


-- Columbia Midweight Stretch Tight
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Columbia', 'Midweight Stretch Tight', 'base_layer', 'pants', false, false, true, false, 'none', 160, 45);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.40, 0.10, 0, 0, 10.0, 2.5, 0.36, 'derived_from_similar', 0.60
FROM garments WHERE brand = 'Columbia' AND model_name = 'Midweight Stretch Tight';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 7, 6, 6, -10, 5, 0, 10, 'Midweight stretch base layer bottom with Omni-Heat. 4-way stretch for mobility. Good value cold weather option.'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Midweight Stretch Tight';


-- ============================================
-- GARMENTS: Spyder (5 items)
-- ============================================

-- Spyder Leader Insulated Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Spyder', 'Leader Insulated Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'attached', 900, 350);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.55, 1.30, 0, 1.40, 35.0, 32.0, 0, 34.0, 0.20, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Spyder' AND model_name = 'Leader Insulated Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'windproof', 'waterproof'
FROM garments WHERE brand = 'Spyder' AND model_name = 'Leader Insulated Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 3, 7, 9, -25, -5, -15, 5, 'Premium resort ski jacket. Waterproof with PrimaLoft insulation. Built for chairlift-to-groomer skiing in cold conditions.'
FROM garments WHERE brand = 'Spyder' AND model_name = 'Leader Insulated Jacket';


-- Spyder Challenger Insulated Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Spyder', 'Challenger Insulated Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'attached', 750, 250);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.20, 1.05, 0, 1.10, 28.0, 25.0, 0, 27.0, 0.22, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Spyder' AND model_name = 'Challenger Insulated Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'windproof', 'waterproof'
FROM garments WHERE brand = 'Spyder' AND model_name = 'Challenger Insulated Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 4, 4, 6, 8, -20, 0, -10, 5, 'Mid-range resort ski jacket. Waterproof with synthetic insulation. Lighter than Leader for milder conditions.'
FROM garments WHERE brand = 'Spyder' AND model_name = 'Challenger Insulated Jacket';


-- Spyder Dare Base Layer Crew
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Spyder', 'Dare Base Layer Crew', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 160, 65);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.42, 0.36, 0, 0.35, 11.0, 9.0, 0, 10.0, 0.34, 'derived_from_similar', 0.60
FROM garments WHERE brand = 'Spyder' AND model_name = 'Dare Base Layer Crew';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 7, 6, 7, -10, 5, 0, 10, 'Performance synthetic base layer. T-Hot technology for warmth. 4-way stretch with flatlock seams.'
FROM garments WHERE brand = 'Spyder' AND model_name = 'Dare Base Layer Crew';


-- Spyder Dare Base Layer Pant
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Spyder', 'Dare Base Layer Pant', 'base_layer', 'pants', false, false, true, false, 'none', 140, 55);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.40, 0.10, 0, 0, 10.0, 2.5, 0.34, 'derived_from_similar', 0.60
FROM garments WHERE brand = 'Spyder' AND model_name = 'Dare Base Layer Pant';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 7, 6, 7, -10, 5, 0, 10, 'Performance synthetic base layer bottom. T-Hot technology. 4-way stretch with flatlock seams.'
FROM garments WHERE brand = 'Spyder' AND model_name = 'Dare Base Layer Pant';


-- Spyder Sentinel Gore-Tex Pant
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Spyder', 'Sentinel Gore-Tex Pant', 'hard_shell', 'pants', false, false, true, false, 'none', 650, 400);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.20, 0.12, 0, 0, 28.0, 7.0, 0.18, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Spyder' AND model_name = 'Sentinel Gore-Tex Pant';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 'Gore-Tex', 'taped'
FROM garments WHERE brand = 'Spyder' AND model_name = 'Sentinel Gore-Tex Pant';

INSERT INTO garment_ventilation (garment_id, has_thigh_vents, ventilation_factor)
SELECT id, true, 0.65
FROM garments WHERE brand = 'Spyder' AND model_name = 'Sentinel Gore-Tex Pant';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 4, 8, 9, -30, 10, -20, 15, 'Premium Gore-Tex ski pant. Fully waterproof/windproof shell. Thigh vents for temperature regulation. Pair with base/mid layers for warmth.'
FROM garments WHERE brand = 'Spyder' AND model_name = 'Sentinel Gore-Tex Pant';


-- ============================================
-- HELLY HANSEN
-- ============================================

-- Helly Hansen Lifa Active Crew
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Lifa Active Crew', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 185, 60);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.32, 0.26, 0, 0.26, 7.0, 5.5, 0, 6.0, 0.42, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Lifa Active Crew';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 9, 9, 4, 4, -5, 15, 5, 20, 'LIFA polypropylene wicks faster than any other fiber. Excellent for high-output cold weather. Too thin for static cold.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Lifa Active Crew';


-- Helly Hansen Lifa Active Pant
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Lifa Active Pant', 'base_layer', 'pants', false, false, true, false, 'none', 160, 55);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.30, 0.08, 0, 0, 7.0, 1.8, 0.42, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Lifa Active Pant';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 9, 9, 4, 4, -5, 15, 5, 20, 'Lightweight LIFA base layer bottom. Excellent moisture management for high output. Pair with shell for wind protection.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Lifa Active Pant';


-- Helly Hansen Lifa Merino Midweight Crew
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Lifa Merino Midweight Crew', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 275, 105);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.75, 0.62, 0, 0.50, 16.0, 14.0, 0, 11.5, 0.28, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Lifa Merino Midweight Crew';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 6, 6, 7, 8, -20, 0, -10, 5, 'Merino exterior with LIFA wicking interior. Best of both worlds: warmth + moisture management. Great for resort skiing.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Lifa Merino Midweight Crew';


-- Helly Hansen Lifa Merino Midweight Pant
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Lifa Merino Midweight Pant', 'base_layer', 'pants', false, false, true, false, 'none', 235, 105);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.70, 0.18, 0, 0, 16.0, 4.0, 0.28, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Lifa Merino Midweight Pant';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 6, 6, 7, 8, -20, 0, -10, 5, 'Merino/LIFA midweight base layer bottom. Good warmth with excellent wicking. Ideal under ski pants in cold conditions.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Lifa Merino Midweight Pant';


-- Helly Hansen Varde Fleece Jacket 2.0
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Varde Fleece Jacket 2.0', 'mid_layer_heavy', 'jacket', true, true, false, false, 'none', 540, 150);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.90, 0.78, 0, 0.85, 16.0, 14.0, 0, 15.0, 0.32, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Varde Fleece Jacket 2.0';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 6, 6, 6, 7, -15, 5, -5, 10, 'Polartec Thermal Pro fleece. Warm and pill-resistant. Good midlayer under shell for resort skiing or standalone in mild cold.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Varde Fleece Jacket 2.0';


-- Helly Hansen Odin Stretch Hooded Light Insulator 2.0
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Odin Stretch Hooded Light Insulator 2.0', 'insulation_synthetic', 'jacket', true, true, false, true, 'attached', 420, 230);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.15, 1.00, 0, 1.10, 22.0, 20.0, 0, 21.0, 0.30, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Odin Stretch Hooded Light Insulator 2.0';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Odin Stretch Hooded Light Insulator 2.0';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 8, 6, 5, -15, 5, -5, 10, '40g PrimaLoft Gold Active+. 4-way stretch with fleece side panels. Excellent for ski touring and high-output backcountry use.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Odin Stretch Hooded Light Insulator 2.0';


-- Helly Hansen Odin Stretch Hooded Insulator 2.0
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Odin Stretch Hooded Insulator 2.0', 'insulation_synthetic', 'jacket', true, true, false, true, 'attached', 580, 280);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.55, 1.35, 0, 1.48, 28.0, 25.0, 0, 27.0, 0.25, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Odin Stretch Hooded Insulator 2.0';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Odin Stretch Hooded Insulator 2.0';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 5, 6, 7, 7, -20, 0, -10, 5, '80g PrimaLoft Gold Active+. Warmer sibling of the Light version. Good belay jacket or cold weather midlayer with stretch.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Odin Stretch Hooded Insulator 2.0';


-- Helly Hansen Sogn Shell 2.0 Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Sogn Shell 2.0 Jacket', 'hard_shell', 'jacket', true, true, false, true, 'helmet_compatible', 600, 415);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.22, 0.18, 0, 0.15, 28.0, 26.0, 0, 20.0, 0.18, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Sogn Shell 2.0 Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 'Helly Tech Professional 3L', 'taped'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Sogn Shell 2.0 Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, ventilation_factor)
SELECT id, true, 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Sogn Shell 2.0 Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 4, 5, 9, 8, -30, 10, -20, 15, '3L Helly Tech Pro shell. RECCO rescue system. Life Pocket keeps phone warm. Pair with insulation for cold days.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Sogn Shell 2.0 Jacket';


-- Helly Hansen Swift 3L Shell Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Swift 3L Shell Jacket', 'hard_shell', 'jacket', true, true, false, true, 'helmet_compatible', 830, 440);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.25, 0.20, 0, 0.17, 30.0, 28.0, 0, 22.0, 0.16, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Swift 3L Shell Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 'Helly Tech Professional 3L', 'taped'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Swift 3L Shell Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, ventilation_factor)
SELECT id, true, 0.60
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Swift 3L Shell Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 4, 6, 9, 8, -30, 10, -20, 15, '3L stretch shell with RECCO. Heavier but more durable than Sogn. PFC-free DWR. Good for resort and backcountry descents.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Swift 3L Shell Jacket';


-- Helly Hansen Sogn Bib Shell Pants
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Sogn Bib Shell Pants', 'hard_shell', 'bib', true, false, true, false, 'none', 860, 375);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.15, 0, 0.22, 0.14, 26.0, 0, 28.0, 20.0, 0.18, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Sogn Bib Shell Pants';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 'Helly Tech Professional 3L', 'taped'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Sogn Bib Shell Pants';

INSERT INTO garment_ventilation (garment_id, has_thigh_vents, ventilation_factor)
SELECT id, true, 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Sogn Bib Shell Pants';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 4, 8, 9, -30, 10, -20, 15, '3L shell bib with stretch back panel. Thigh vents and adjustable suspenders. Pair with base/mid layers for warmth.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Sogn Bib Shell Pants';


-- Helly Hansen Alpha 4.0 Insulated Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Alpha 4.0 Insulated Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'helmet_compatible', 1060, 485);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.50, 1.25, 0, 1.40, 36.0, 32.0, 0, 34.0, 0.18, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha 4.0 Insulated Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 'Helly Tech Professional 2L', 'taped'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha 4.0 Insulated Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, ventilation_factor)
SELECT id, true, 0.60
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha 4.0 Insulated Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 3, 7, 9, -25, -5, -15, 5, '80g/60g body-mapped PrimaLoft. H2Flow ventilation. RECCO rescue. Life Pocket+ keeps phone warm. Premium resort ski jacket.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha 4.0 Insulated Jacket';


-- Helly Hansen Alpha Infinity Insulated Jacket
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Alpha Infinity Insulated Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'helmet_compatible', 950, 600);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.45, 1.20, 0, 1.35, 34.0, 30.0, 0, 32.0, 0.20, 'derived_from_similar', 0.60
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha Infinity Insulated Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 'LIFA Infinity Pro', 'taped'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha Infinity Insulated Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, ventilation_factor)
SELECT id, true, 0.60
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha Infinity Insulated Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 3, 7, 9, -25, -5, -15, 5, 'PFC-free LIFA Infinity Pro membrane. 80g recycled PrimaLoft Black Eco. H2Flow ventilation. Premium eco-focused flagship.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha Infinity Insulated Jacket';


-- Helly Hansen Legendary Insulated Ski Pants
INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Legendary Insulated Ski Pants', 'outer_insulated', 'pants', false, false, true, false, 'none', 570, 205);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 1.00, 0.25, 0, 0, 32.0, 8.0, 0.22, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Legendary Insulated Ski Pants';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 'Helly Tech Performance 2L', 'taped'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Legendary Insulated Ski Pants';

INSERT INTO garment_ventilation (garment_id, has_thigh_vents, ventilation_factor)
SELECT id, true, 0.70
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Legendary Insulated Ski Pants';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 3, 7, 9, -25, 0, -15, 5, 'Body-mapped PrimaLoft 60g/40g insulation. Mechanical stretch. Inner thigh vents. Reinforced scuff guards. Best-selling HH ski pant.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Legendary Insulated Ski Pants';
