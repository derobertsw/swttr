-- Seed data for Biophysical Clothing Recommendation System
-- Based on USARIEM Technical Reports and consumer garment estimates

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

-- Arc'teryx Atom LT Hoody
INSERT INTO garments (brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, hood_type, weight_grams)
VALUES ('Arc''teryx', 'Atom LT Hoody', 'insulation_synthetic', 'jacket', true, true, false, 'attached', 360);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score)
SELECT id, 1.75, 1.50, 0, 1.20, 28.0, 24.0, 0, 19.0, 0.20, 0.35, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Atom LT Hoody';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, has_side_vents, ventilation_factor)
SELECT id, false, true, 0.80
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Atom LT Hoody';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static)
SELECT id, 5, 7, 7, 8, -20, 0, -10, 5
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Atom LT Hoody';

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
