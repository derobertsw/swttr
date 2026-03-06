-- Seed data: OutdoorGearLab recommended items (March 2026)
-- Top-rated garments, handwear, and headwear from OGL reviews.

-- ============================================
-- GARMENTS - Arc'teryx Gamma Hoody
-- ============================================
-- OGL's #1 softshell. 200gsm Wee Burly shell (56% nylon, 34% poly, 10% elastane).
-- Helmet-compatible StormHood, FC0 DWR. 2025 update: relaxed fit, two chest pockets.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Arc''teryx', 'Gamma Hoody', 'soft_shell', 'jacket', true, true, false, false, 'helmet_compatible', 460, 300);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.95, 0.80, 0, 0.65, 22.0, 20.0, 0, 15.5, 0.25, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Gamma Hoody';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Gamma Hoody';

INSERT INTO garment_ventilation (garment_id, ventilation_factor)
SELECT id, 0.75
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Gamma Hoody';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 8, 7, 5, -10, 10, 0, 15, 'OGL #1 softshell. Exceptional breathability and weather protection with great mobility. Lighter than Gamma MX.'
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Gamma Hoody';


-- ============================================
-- GARMENTS - Arc'teryx Rush Jacket
-- ============================================
-- OGL top ski jacket for backcountry. Gore-Tex Pro ePE 3L, no insulation.
-- Helmet-compatible StormHood, RECCO reflector.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Arc''teryx', 'Rush Jacket', 'hard_shell', 'jacket', true, true, false, false, 'helmet_compatible', 590, 700);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.22, 0.18, 0, 0.15, 28.0, 26.0, 0, 20.0, 0.18, 'derived_from_similar', 0.75
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Rush Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 28000, 'Gore-Tex Pro ePE', 'taped'
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Rush Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_length_cm, ventilation_factor)
SELECT id, true, 30, 0.65
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Rush Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 4, 6, 9, 9, -30, 10, -20, 15, 'OGL top backcountry ski jacket. Gore-Tex Pro ePE shell, excellent layering piece. Roomier fit for mobility.'
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Rush Jacket';


-- ============================================
-- GARMENTS - Arc'teryx Sabre Pant
-- ============================================
-- OGL's #1 ski pant. 80D 3L ePE Gore-Tex, uninsulated with warm backer.
-- Thigh vents, RECCO reflector, articulated fit.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Arc''teryx', 'Sabre Pant', 'hard_shell', 'pants', false, false, true, false, 'none', 624, 600);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0, 0, 0.25, 0.06, 0, 0, 26.0, 6.5, 0.20, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Sabre Pant';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, membrane_type, seam_construction)
SELECT id, 'windproof', 'waterproof', 'Gore-Tex ePE 3L', 'taped'
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Sabre Pant';

INSERT INTO garment_ventilation (garment_id, has_thigh_vents, ventilation_factor)
SELECT id, true, 0.65
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Sabre Pant';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 4, 6, 9, 9, -30, 10, -20, 15, 'OGL #1 ski pant. Remarkably light Gore-Tex ePE shell with warm backer. Pairs with base layers for temperature tuning.'
FROM garments WHERE brand = 'Arc''teryx' AND model_name = 'Sabre Pant';


-- ============================================
-- GARMENTS - Rab Nebitron Pro Insulated
-- ============================================
-- OGL's #1 insulated jacket. PrimaLoft Silver RISE 279g fill.
-- 30D Pertex Quantum Pro shell. Helmet-compatible hood.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Rab', 'Nebitron Pro Insulated', 'insulation_synthetic', 'jacket', true, true, false, true, 'helmet_compatible', 568, 350);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 2.40, 1.90, 0, 1.60, 40.0, 36.0, 0, 28.0, 0.16, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Rab' AND model_name = 'Nebitron Pro Insulated';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Rab' AND model_name = 'Nebitron Pro Insulated';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 4, 8, 7, -25, -5, -15, 5, 'OGL #1 insulated jacket. 279g PrimaLoft Silver RISE fill with Pertex Quantum Pro shell. Excellent cold-weather warmth.'
FROM garments WHERE brand = 'Rab' AND model_name = 'Nebitron Pro Insulated';


-- ============================================
-- GARMENTS - Rab Borealis
-- ============================================
-- OGL's best value softshell. 130gsm Matrix fabric (88% recycled nylon, 12% elastane).
-- FC-free DWR. 2025 update: recycled materials, hand pockets.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Rab', 'Borealis', 'soft_shell', 'jacket', true, true, false, true, 'attached', 295, 120);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.70, 0.55, 0, 0.47, 16.0, 14.0, 0, 11.0, 0.30, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Rab' AND model_name = 'Borealis';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Rab' AND model_name = 'Borealis';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 7, 8, 6, 4, -5, 15, 5, 20, 'OGL best value softshell. Lightweight and very breathable. Less weather-resistant than Arc''teryx Gamma but excellent for high-output activities.'
FROM garments WHERE brand = 'Rab' AND model_name = 'Borealis';


-- ============================================
-- GARMENTS - Patagonia Nano-Air Ultralight Full-Zip Hoody
-- ============================================
-- OGL's most breathable insulated jacket. 20g FullRange insulation.
-- 100% recycled poly ripstop shell with mechanical stretch. 8.8 oz.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'Nano-Air Ultralight Full-Zip Hoody', 'insulation_synthetic', 'jacket', true, true, false, true, 'attached', 249, 250);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.80, 0.60, 0, 0.52, 12.0, 10.0, 0, 8.0, 0.35, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Nano-Air Ultralight Full-Zip Hoody';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Nano-Air Ultralight Full-Zip Hoody';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 9, 5, 4, -5, 10, 5, 15, 'OGL most breathable insulated jacket. Ultralight 20g FullRange insulation. Exceptional for high-output touring. Much lighter than standard Nano-Air (336g).'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'Nano-Air Ultralight Full-Zip Hoody';


-- ============================================
-- GARMENTS - Patagonia DAS Light Hoody
-- ============================================
-- OGL's most weather-resistant insulated jacket. 65g PlumaFill synthetic.
-- 10D Pertex Quantum Pro shell with PU dry coating. Self-stuffing.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Patagonia', 'DAS Light Hoody', 'insulation_synthetic', 'jacket', true, true, false, true, 'helmet_compatible', 320, 349);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 2.00, 1.60, 0, 1.35, 38.0, 34.0, 0, 27.0, 0.15, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Patagonia' AND model_name = 'DAS Light Hoody';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'windproof', 'DWR_only'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'DAS Light Hoody';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 4, 8, 7, -25, -5, -15, 5, 'OGL most weather-resistant insulated jacket. PlumaFill 65g synthetic with Pertex Quantum Pro shell. Lighter than DAS Parka (539g), excellent belay jacket.'
FROM garments WHERE brand = 'Patagonia' AND model_name = 'DAS Light Hoody';


-- ============================================
-- GARMENTS - The North Face Summit Breithorn Hoodie
-- ============================================
-- OGL's #1 down jacket. 800-fill ProDown with hydrophobic treatment.
-- 15D recycled nylon ripstop. Helmet-compatible hood.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'The North Face', 'Summit Breithorn Hoodie', 'insulation_down', 'jacket', true, true, false, true, 'helmet_compatible', 451, 430);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 2.60, 2.10, 0, 1.75, 42.0, 38.0, 0, 30.0, 0.14, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'The North Face' AND model_name = 'Summit Breithorn Hoodie';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'The North Face' AND model_name = 'Summit Breithorn Hoodie';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 4, 8, 7, -25, -5, -15, 0, 'OGL #1 down jacket. 800-fill hydrophobic ProDown. Cozy fit with knit wrist cuffs. Versatile as mid-layer or standalone.'
FROM garments WHERE brand = 'The North Face' AND model_name = 'Summit Breithorn Hoodie';


-- ============================================
-- GARMENTS - Rab Neutrino Pro
-- ============================================
-- OGL's best down jacket for extreme cold. 800FP European goose down.
-- Pertex Quantum Pro shell. Helmet-compatible hood.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Rab', 'Neutrino Pro', 'insulation_down', 'jacket', true, true, false, true, 'helmet_compatible', 585, 425);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 3.20, 2.60, 0, 2.15, 48.0, 42.0, 0, 34.0, 0.12, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Rab' AND model_name = 'Neutrino Pro';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'wind_resistant', 'DWR_only'
FROM garments WHERE brand = 'Rab' AND model_name = 'Neutrino Pro';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 2, 3, 7, 7, -35, -10, -25, -5, 'OGL best for extreme cold. 800FP hydrophobic goose down with Pertex Quantum Pro shell. Redesigned 2025 with new arm baffles and recycled fabric.'
FROM garments WHERE brand = 'Rab' AND model_name = 'Neutrino Pro';


-- ============================================
-- GARMENTS - Smartwool Classic Thermal Merino 1/4 Zip
-- ============================================
-- OGL's #1 base layer. 100% Merino wool, 250gsm weight.
-- Quarter-zip for versatile venting.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Smartwool', 'Classic Thermal Merino 1/4 Zip', 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', 250, 110);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 0.55, 0.45, 0, 0.37, 16.0, 14.0, 0, 11.0, 0.30, 'derived_from_similar', 0.70
FROM garments WHERE brand = 'Smartwool' AND model_name = 'Classic Thermal Merino 1/4 Zip';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating)
SELECT id, 'none', 'none'
FROM garments WHERE brand = 'Smartwool' AND model_name = 'Classic Thermal Merino 1/4 Zip';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 8, 8, 6, 6, -15, 5, -5, 10, 'OGL #1 base layer. 100% Merino 250gsm. Quarter-zip allows venting. Excellent moisture management and odor resistance.'
FROM garments WHERE brand = 'Smartwool' AND model_name = 'Classic Thermal Merino 1/4 Zip';


-- ============================================
-- GARMENTS - Helly Hansen Alpha LifaLoft Jacket
-- ============================================
-- OGL's #1 ski jacket (several years running). LifaLoft 100g insulation.
-- Waterproof shell with underarm vents. Detachable helmet-compatible hood.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Helly Hansen', 'Alpha LifaLoft Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'helmet_compatible', 850, 570);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.80, 1.40, 0, 1.20, 40.0, 35.0, 0, 28.0, 0.16, 'derived_from_similar', 0.65
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha LifaLoft Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, seam_construction)
SELECT id, 'windproof', 'waterproof', 'taped'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha LifaLoft Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, ventilation_factor)
SELECT id, true, 0.70
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha LifaLoft Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 2, 3, 8, 9, -25, -5, -15, 5, 'OGL #1 ski jacket (multiple years). LifaLoft 100g insulation, lightweight yet warm. RECCO, LIFE POCKET+, powder skirt.'
FROM garments WHERE brand = 'Helly Hansen' AND model_name = 'Alpha LifaLoft Jacket';


-- ============================================
-- GARMENTS - Obermeyer Raze Jacket
-- ============================================
-- OGL top ski jacket for fit/comfort. 60g body / 40g sleeves synthetic insulation.
-- HydroBlock Pro 15k/15k. 2-way stretch fabric.

INSERT INTO garments (id, brand, model_name, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, msrp_usd)
VALUES (gen_random_uuid(), 'Obermeyer', 'Raze Jacket', 'outer_insulated', 'jacket', true, true, false, true, 'helmet_compatible', 800, 350);

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, estimation_method, confidence_score)
SELECT id, 1.40, 1.00, 0, 0.90, 36.0, 30.0, 0, 24.0, 0.18, 'derived_from_similar', 0.60
FROM garments WHERE brand = 'Obermeyer' AND model_name = 'Raze Jacket';

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, seam_construction)
SELECT id, 'windproof', 'waterproof', 15000, 'taped'
FROM garments WHERE brand = 'Obermeyer' AND model_name = 'Raze Jacket';

INSERT INTO garment_ventilation (garment_id, has_pit_zips, ventilation_factor)
SELECT id, true, 0.70
FROM garments WHERE brand = 'Obermeyer' AND model_name = 'Raze Jacket';

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active, min_temp_static, max_temp_static, activity_notes)
SELECT id, 2, 3, 7, 9, -20, 0, -10, 5, 'OGL top ski jacket for fit. 2-way stretch with 60g/40g insulation. Excellent range of motion. HydroBlock Pro 15k/15k.'
FROM garments WHERE brand = 'Obermeyer' AND model_name = 'Raze Jacket';


-- ============================================
-- HEADWEAR - Smith Method Pro MIPS
-- ============================================
-- OGL's #1 ski helmet. Zonal KOROYD + MIPS.
-- AirEvac ventilation, micro-adjustable dial fit. 400g.

INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Smith', 'Method Pro MIPS', 'ski_helmet', 400, true, false, false, false, 0.75, true, -18, -8);


-- ============================================
-- HEADWEAR - Scott Flow Pro MIPS
-- ============================================
-- OGL's best impact test scores. In-mould construction.
-- MIPS + RECCO. 360° Pure Sound system. 98% recycled polycarbonate.

INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Scott', 'Flow Pro MIPS', 'ski_helmet', 500, true, false, false, false, 0.80, true, -20, -10);


-- ============================================
-- HEADWEAR - Giro Ratio MIPS
-- ============================================
-- OGL's best value helmet. Hard shell construction.
-- Thermostat Control adjustable venting (6 vents). In Form fit system.

INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Giro', 'Ratio MIPS', 'ski_helmet', 610, true, false, false, false, 0.80, true, -20, -10);
