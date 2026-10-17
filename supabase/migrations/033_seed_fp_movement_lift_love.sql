-- Seed: FP Movement Lift Love Jacket and Lift Love Bib (2026-10-17)
-- Adds a women's resort jacket/bib set from FP Movement's ski collection; the
-- catalog had one insulated bib. Duplicate check against the live catalog on
-- 2026-10-17: no existing or near-match rows (100 garments, 28 handwear,
-- 38 headwear at the time).
-- FP Movement publishes fabric content and features only (no fill weight,
-- waterproof rating or seam construction), so both items are scaled from
-- catalog analogues at low confidence; method and sources are in data_source.

-- ============================================
-- GARMENT - FP Movement Lift Love Jacket
-- ============================================
-- 100% polyamide shell sold as "fully waterproof"; PrimaLoft polyester fill
-- (weight and grade unstated); 67% nylon / 33% polyester lining. Adjustable
-- hood, snow skirt, waist belt, no pit zips. 8 customer reviews: "lightweight
-- but warm", one overheated with light layers, one found it too thin at the summit.
-- https://www.freepeople.com/fpmovement/shop/lift-love-jacket/
-- Calibrated against Columbia Joy Peak Lite Hooded (1.15/1.00), Spyder Challenger
-- (1.20/1.05) and Mountain Hardwear Stretch Ozonic (1.20/1.05); placed at the
-- light end per the reviews. Water-resistant, not waterproof, until taped seams
-- are confirmed. Wind-resistant: FP's ski guide lists the matching bib (same
-- shell) as "waterproof + wind-resistant" (https://www.freepeople.com/ski-clothing-guide/).

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type,
  covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams,
  usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Lift Love Jacket', NULL, 398, 'outer_insulated', 'jacket',
  true, true, false, true, 'attached', NULL,
  'standalone', 1, 1, 0, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id,
  rcl_torso, rcl_arms, rcl_legs, rcl_whole_body,
  recl_torso, recl_arms, recl_legs, recl_whole_body,
  evap_potential, im_whole_body,
  estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id,
  1.15, 0.95, 0, 0.81,
  30.0, 27.0, 0, 21.8,
  0.20, 0.35,
  'derived_from_similar', 0.45,
  'https://www.freepeople.com/fpmovement/shop/lift-love-jacket/ (fabric content, features, 8 reviews read 2026-10-17; no fill weight published); analogues: Columbia Joy Peak Lite Hooded Jacket, Spyder Challenger Insulated Jacket, Mountain Hardwear Stretch Ozonic Insulated Jacket',
  0.35, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Lift Love Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, air_permeability_cfm,
  waterproof_rating, waterproof_mm, breathability_mvtr, breathability_ret,
  membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'wind_resistant', NULL,
  'water_resistant', NULL, NULL, NULL,
  NULL, NULL,
  'https://www.freepeople.com/fpmovement/shop/lift-love-jacket/ ("fully waterproof"; no waterproof rating or seam construction published); https://www.freepeople.com/ski-clothing-guide/ (matching bib, same shell: "waterproof + wind-resistant")', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Lift Love Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score,
  ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active,
  min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 3, 5, 7, -15, 5, -5, 10,
  'Lightly insulated resort jacket (PrimaLoft, weight unstated) with a snow skirt and no pit zips. Reviews: warm with light layers on the lower mountain; one found it too thin at the summit.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Lift Love Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '100% polyamide', NULL, 100
FROM garments g
WHERE g.brand = 'FP Movement' AND g.model_name = 'Lift Love Jacket'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'insulation', 'PrimaLoft polyester (weight unstated)', NULL, 100
FROM garments g
WHERE g.brand = 'FP Movement' AND g.model_name = 'Lift Love Jacket'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'insulation');

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'lining', '67% nylon / 33% polyester', NULL, 100
FROM garments g
WHERE g.brand = 'FP Movement' AND g.model_name = 'Lift Love Jacket'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'lining');


-- ============================================
-- GARMENT - FP Movement Lift Love Bib
-- ============================================
-- Same shell, fill and lining as the jacket; "lightly insulated"; mesh-lined
-- inner leg vents, boot gaiters, front zip, elastic straps. 10 customer
-- reviews: warm enough at Mont Tremblant at -18°C over a waffle base layer; one
-- called the set thin; runs short.
-- https://www.freepeople.com/fpmovement/shop/lift-love-bib/
-- Legs calibrated against Helly Hansen Legendary Insulated Ski Pants (1.00) and
-- Patagonia Insulated Powder Bowl Pants (1.10). The bib bodice is probably a lined
-- shell over about half the torso, so torso sits between HH Sogn Bib (0.15) and
-- Patagonia Snowdrifter Bibs (0.60). Water-resistant until taped seams are confirmed;
-- wind-resistant per FP's ski guide ("waterproof + wind-resistant").

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type,
  covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams,
  usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Lift Love Bib', NULL, 378, 'outer_insulated', 'bib',
  true, false, true, false, 'none', NULL,
  'standalone', 0.5, 0, 1, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id,
  rcl_torso, rcl_arms, rcl_legs, rcl_whole_body,
  recl_torso, recl_arms, recl_legs, recl_whole_body,
  evap_potential, im_whole_body,
  estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id,
  0.30, 0, 0.95, 0.39,
  18.0, 0, 32.0, 17.0,
  0.22, 0.22,
  'derived_from_similar', 0.45,
  'https://www.freepeople.com/fpmovement/shop/lift-love-bib/ (fabric content, features, 10 reviews read 2026-10-17; no fill weight published); analogues: Helly Hansen Legendary Insulated Ski Pants, Patagonia Insulated Powder Bowl Pants, Patagonia Snowdrifter Bibs, Helly Hansen Sogn Bib Shell Pants',
  0.30, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Lift Love Bib'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, air_permeability_cfm,
  waterproof_rating, waterproof_mm, breathability_mvtr, breathability_ret,
  membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'wind_resistant', NULL,
  'water_resistant', NULL, NULL, NULL,
  NULL, NULL,
  'https://www.freepeople.com/fpmovement/shop/lift-love-bib/ ("waterproof fabrication"; no waterproof rating or seam construction published); https://www.freepeople.com/ski-clothing-guide/ ("waterproof + wind-resistant")', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Lift Love Bib'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_ventilation (garment_id, has_pit_zips, pit_zip_length_cm, has_side_vents,
  has_back_vent, has_thigh_vents, main_zip_two_way, mesh_lined_pockets, ventilation_factor)
SELECT id, false, NULL, false, false, true, false, false, 0.75
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Lift Love Bib'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score,
  ski_touring_downhill_score, alpine_skiing_score, min_temp_active, max_temp_active,
  min_temp_static, max_temp_static, activity_notes)
SELECT id, 3, 3, 5, 7, -20, 0, -10, 5,
  'Lightly insulated resort bib with mesh-lined inner leg vents and boot gaiters; runs short. One reviewer was warm enough at -18°C over a waffle base layer.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Lift Love Bib'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '100% polyamide', NULL, 100
FROM garments g
WHERE g.brand = 'FP Movement' AND g.model_name = 'Lift Love Bib'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'insulation', 'Polyester (weight unstated)', NULL, 100
FROM garments g
WHERE g.brand = 'FP Movement' AND g.model_name = 'Lift Love Bib'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'insulation');

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'lining', '67% nylon / 33% polyester', NULL, 100
FROM garments g
WHERE g.brand = 'FP Movement' AND g.model_name = 'Lift Love Bib'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'lining');
