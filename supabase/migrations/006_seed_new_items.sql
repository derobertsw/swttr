-- Seed data: Additional garments, handwear, and headwear
-- Patagonia PowSlayer Pants, Columbia Bugaboo II Pants,
-- Outdoor Research Snowcrew/Carbide/Adrenaline/Stormtracker,
-- Turtle Fur Original Fleece Neck Gaiter

-- ============================================
-- GARMENTS - Patagonia PowSlayer Pants
-- ============================================
-- Gore-Tex Pro ePE 3L shell pants for backcountry/resort skiing.
-- 3.8-oz 80-denier recycled nylon plain-weave, PFAS-free DWR.
-- Zippered side vents, watertight Vislon zippers.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'PowSlayer Pants', 'hard_shell', 'pants', false, false, true, false, 'none', 430, 549);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.22, 0.06, 0, 0, 28.0, 7.0, 0.18, 'calculated_from_materials', 0.75
FROM garments WHERE brand = 'Patagonia' AND model_name = 'PowSlayer Pants';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, breathability_ret, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 28000, 11.0, 'Gore-Tex Pro ePE', 'taped'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'PowSlayer Pants';

INSERT INTO garment_ventilation (garment_id, has_side_vents, has_thigh_vents, ventilation_factor)
SELECT id, true, false, 0.60
FROM garments WHERE brand = 'Patagonia' AND model_name = 'PowSlayer Pants';

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT id, 'outer', 'synthetic_woven', 129, 100
FROM garments WHERE brand = 'Patagonia' AND model_name = 'PowSlayer Pants';

INSERT INTO garment_materials (garment_id, layer_position, material_type, coverage_percent)
SELECT id, 'membrane', 'membrane', 100
FROM garments WHERE brand = 'Patagonia' AND model_name = 'PowSlayer Pants';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 6, 9, 9, -30, 10, -20, 15, 'Premium Gore-Tex Pro ePE shell pant. Full weather protection with side vents. Pairs with base layers for temperature tuning.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'PowSlayer Pants';


-- ============================================
-- GARMENTS - Columbia Bugaboo II Pants
-- ============================================
-- Budget insulated ski pants with Omni-Heat reflective lining
-- and 60g Microtemp XF II synthetic insulation.
-- Omni-Tech waterproof/breathable, critically seam-sealed.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Columbia', 'Bugaboo II Pants', 'outer_insulated', 'pants', false, false, true, false, 'none', 650, 90);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 1.15, 0.29, 0, 0, 38.0, 9.5, 0.18, 'calculated_from_materials', 0.60
FROM garments WHERE brand = 'Columbia' AND model_name = 'Bugaboo II Pants';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, seam_construction)
SELECT id, 'windproof', 'waterproof', 10000, 'taped'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Bugaboo II Pants';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 3, 7, 8, -25, 0, -15, 5, 'Budget-friendly insulated resort ski pant. Omni-Heat reflective lining with 60g synthetic insulation. Too warm for high-output activities.'
FROM garments WHERE brand = 'Columbia' AND model_name = 'Bugaboo II Pants';


-- ============================================
-- GARMENTS - Outdoor Research Snowcrew Jacket
-- ============================================
-- Insulated resort ski jacket. Ventia 2L waterproof shell
-- with VerticalX Eco synthetic insulation (80g body, 60g sleeves/hood).

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Outdoor Research', 'Snowcrew Jacket', 'outer_insulated', 'jacket', true, true, false, false, 'helmet_compatible', 544, 349);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.60, 1.20, 0, 1.05, 38.0, 32.0, 0, 26.0, 0.18, 'calculated_from_materials', 0.65
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Snowcrew Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 'Ventia 2L', 'taped'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Snowcrew Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_length_cm, ventilation_factor)
SELECT id, true, 25, 0.70
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Snowcrew Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 2, 3, 7, 9, -25, -5, -15, 5, 'Warm insulated resort ski jacket. VerticalX Eco 80g body / 60g sleeves. Too warm for touring uphill but excellent for chairlift days.'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Snowcrew Jacket';


-- ============================================
-- GARMENTS - Outdoor Research Carbide Jacket
-- ============================================
-- Hard shell, Pertex Shield 3L. No insulation, designed for layering.
-- Pit zips, powder skirt, fully seam-taped.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Outdoor Research', 'Carbide Jacket', 'hard_shell', 'jacket', true, true, false, false, 'helmet_compatible', 608, 349);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.20, 0.16, 0, 0.13, 25.0, 22.0, 0, 17.0, 0.20, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Carbide Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 20000, 'Pertex Shield 3L', 'taped'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Carbide Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_length_cm, ventilation_factor)
SELECT id, true, 28, 0.65
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Carbide Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 4, 6, 9, 8, -30, 10, -20, 15, 'Pertex Shield 3L shell jacket. Lighter and more breathable than Gore-Tex Pro at a lower price point. Excellent layering piece.'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Carbide Jacket';


-- ============================================
-- GARMENTS - Outdoor Research Carbide Bibs
-- ============================================
-- Hard shell bib, Pertex Shield 3L with 420D scuff guards.
-- Fully seam-taped, thigh vents.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Outdoor Research', 'Carbide Bibs', 'hard_shell', 'bib', false, false, true, false, 'none', 580, 349);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.22, 0.06, 0, 0, 25.0, 6.3, 0.20, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Carbide Bibs';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 20000, 'Pertex Shield 3L', 'taped'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Carbide Bibs';

INSERT INTO garment_ventilation (garment_id, has_thigh_vents, ventilation_factor)
SELECT id, true, 0.65
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Carbide Bibs';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 5, 9, 9, -30, 10, -20, 15, 'Pertex Shield 3L shell bib. 420D scuff guards at cuffs. Bib design adds core warmth and snow protection. Pairs with base layers for flexibility.'
FROM garments WHERE brand = 'Outdoor Research' AND model_name = 'Carbide Bibs';


-- ============================================
-- HANDWEAR - Outdoor Research Adrenaline 3-in-1 Gloves
-- ============================================
-- Modular 3-in-1 system: waterproof Ventia shell + EnduraLoft
-- 200g insulation + removable fleece liner.

INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Outdoor Research', 'Adrenaline 3-in-1 Gloves', 'insulated_glove', 210, 1.80, 5, true, true, false, -20, -10);


-- ============================================
-- HANDWEAR - Outdoor Research Stormtracker Sensor Gloves
-- ============================================
-- Gore-Tex Infinium Windstopper softshell with PrimaLoft 60g
-- insulation. Touchscreen compatible. Not fully waterproof.

INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Outdoor Research', 'Stormtracker Sensor Gloves', 'light_glove', 120, 1.10, 7, false, true, true, -10, 0);


-- ============================================
-- HEADWEAR - Turtle Fur Original Fleece Neck Gaiter
-- ============================================
-- Double-layer Original Turtle Fur fleece. Two walls trap heat.
-- UPF 50+. Classic heavyweight fleece neck warmer since 1982.

INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Turtle Fur', 'Original Fleece Neck Gaiter', 'buff_heavy', 70, false, true, false, true, 0.60, false, -10, 0);
