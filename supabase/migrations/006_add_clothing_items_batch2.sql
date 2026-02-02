-- Migration: Add new clothing items - Batch 2
-- Brands: Arc'teryx, HEAD, Lululemon, Smartwool, Outdoor Research, Patagonia

-- ============================================
-- HANDWEAR
-- ============================================

-- Arc'teryx Fission SV Gloves
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Arc''teryx', 'Fission SV Gloves', 'insulated_glove', 280, 2.70, 6, true, true, false, -18, -7);

-- HEAD Ultrafit Multi-Sport Running Gloves
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('HEAD', 'Ultrafit Multi-Sport Running Gloves', 'liner_glove', 60, 0.60, 9, false, false, true, -7, 5);

-- Norrøna falketind dri short Gloves
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Norrøna', 'falketind dri short Gloves', 'light_glove', 109, 1.00, 7, true, true, false, -5, 5);


-- ============================================
-- HEADWEAR
-- ============================================

-- Update existing Smartwool Merino 250 Cuffed Beanie with more accurate specs
UPDATE headwear
SET headwear_type = 'midweight_beanie',
    weight_grams = 60,
    rcl_clo = 0.85,
    min_temp_active = -15,
    min_temp_static = -5
WHERE brand = 'Smartwool' AND model_name = 'Merino 250 Cuffed Beanie';

-- Smartwool Thermal Merino Reversible Neck Gaiter
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Smartwool', 'Thermal Merino Reversible Neck Gaiter', 'buff_heavy', 90, false, true, false, true, 0.55, false, -10, 0);


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
