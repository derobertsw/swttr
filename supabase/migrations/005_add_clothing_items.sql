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
