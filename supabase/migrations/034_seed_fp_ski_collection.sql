-- Seed: missing FP Movement ski-collection models (2026-10-17)
-- User requested every missing item from the supplied collection.
-- Duplicate check: 102 live garments, 28 handwear, 38 headwear; no matching rows
-- except Lift Love Jacket/Bib, which are excluded. Repeated tiles and the
-- construction-identical Mountain High printed variant are consolidated.
-- All thermal values are analogue estimates, not product-specific lab measurements.
-- Existing rows are never updated; every insert is guarded for repeat application.


-- FP Movement Happy Trails Poncho
-- Nylon quilted poncho with PrimaLoft fill (grade and mass unstated), dropped armholes and fleece-lined attached hood; 23.75-inch length. No waterproof or DWR specification.
-- https://www.freepeople.com/fpmovement/shop/happy-trails-poncho/
-- Analogues: Columbia Powder Lite Vest (torso 0.95, Ret 16); Patagonia Micro Puff Hoody (1.10/0.95, Ret 20/18); Patagonia Nano-Air Hoody (lab 2.34/2.04).
-- Vest is the nearest supported type for this short-sleeved poncho; arm clo already includes partial coverage. The peer estimate is 0.95 torso clo; a hypothetical equal-fill Nano-Air scaling gives about 2.0 (0.35 + (2.34 - 0.35) * (0.95 - 0.35) / (1.10 - 0.35)). Fill mass is unknown, so this is a sensitivity check, not a material calculation. Uncertainty spans the catalog scale gap. Restricted to alpine catalog use because loose open armholes are unsuitable for high-output selection.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Happy Trails Poncho', NULL, 148, 'insulation_synthetic', 'vest', true, true, false, true, 'attached', NULL, 'either', 1, 0.2, 0, ARRAY['alpine_skiing'])
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 0.95, 0.18, 0, 0.52, 18, 4, 0, 10.0, 0.3, 0.489, 'derived_from_similar', 0.4, 'https://www.freepeople.com/fpmovement/shop/happy-trails-poncho/ ; analogues: Columbia Powder Lite Vest (torso 0.95, Ret 16); Patagonia Micro Puff Hoody (1.10/0.95, Ret 20/18); Patagonia Nano-Air Hoody (lab 2.34/2.04). ; Vest is the nearest supported type for this short-sleeved poncho; arm clo already includes partial coverage. The peer estimate is 0.95 torso clo; a hypothetical equal-fill Nano-Air scaling gives about 2.0 (0.35 + (2.34 - 0.35) * (0.95 - 0.35) / (1.10 - 0.35)). Fill mass is unknown, so this is a sensitivity check, not a material calculation. Uncertainty spans the catalog scale gap. Restricted to alpine catalog use because loose open armholes are unsuitable for high-output selection.', 1.05, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Happy Trails Poncho'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'wind_resistant', 'none', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/happy-trails-poncho/ ; analogues: Columbia Powder Lite Vest (torso 0.95, Ret 16); Patagonia Micro Puff Hoody (1.10/0.95, Ret 20/18); Patagonia Nano-Air Hoody (lab 2.34/2.04). ; Vest is the nearest supported type for this short-sleeved poncho; arm clo already includes partial coverage. The peer estimate is 0.95 torso clo; a hypothetical equal-fill Nano-Air scaling gives about 2.0 (0.35 + (2.34 - 0.35) * (0.95 - 0.35) / (1.10 - 0.35)). Fill mass is unknown, so this is a sensitivity check, not a material calculation. Uncertainty spans the catalog scale gap. Restricted to alpine catalog use because loose open armholes are unsuitable for high-output selection.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Happy Trails Poncho'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 3, 3, 4, 5, 'Nylon quilted poncho with PrimaLoft fill (grade and mass unstated), dropped armholes and fleece-lined attached hood; 23.75-inch length. No waterproof or DWR specification. Vest is the nearest supported type for this short-sleeved poncho; arm clo already includes partial coverage. The peer estimate is 0.95 torso clo; a hypothetical equal-fill Nano-Air scaling gives about 2.0 (0.35 + (2.34 - 0.35) * (0.95 - 0.35) / (1.10 - 0.35)). Fill mass is unknown, so this is a sensitivity check, not a material calculation. Uncertainty spans the catalog scale gap. Restricted to alpine catalog use because loose open armholes are unsuitable for high-output selection.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Happy Trails Poncho'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '100% nylon', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Happy Trails Poncho'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'insulation', 'PrimaLoft synthetic fill, grade and weight unstated', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Happy Trails Poncho'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'insulation');


-- FP Movement Myoko Pop Quarter-Zip Base Layer
-- Hip-length fitted knit top, quarter zip, high neck and long sleeves; 76% polyester / 20% polyamide / 4% elastane. No gsm or laboratory data.
-- https://www.freepeople.com/fpmovement/shop/myoko-pop-quarter-zip-base-layer/
-- Analogues: Spyder Dare Base Layer Crew (0.42/0.36, Ret 11/9); 32 Degrees Heat Midweight Crew (0.48/0.42, Ret 12/10); Patagonia Capilene Midweight (lab 0.69/0.55).
-- Bracketed as a midweight synthetic knit below the lab grid-knit Capilene; quarter zip is modest ventilation, not a measured fabric breathability gain.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Myoko Pop Quarter-Zip Base Layer', NULL, 108, 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', NULL, 'either', 1, 1, 0, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 0.48, 0.4, 0, 0.34, 12, 10, 0, 8.5, 0.35, 0.376, 'derived_from_similar', 0.5, 'https://www.freepeople.com/fpmovement/shop/myoko-pop-quarter-zip-base-layer/ ; analogues: Spyder Dare Base Layer Crew (0.42/0.36, Ret 11/9); 32 Degrees Heat Midweight Crew (0.48/0.42, Ret 12/10); Patagonia Capilene Midweight (lab 0.69/0.55). ; Bracketed as a midweight synthetic knit below the lab grid-knit Capilene; quarter zip is modest ventilation, not a measured fabric breathability gain.', 0.15, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Myoko Pop Quarter-Zip Base Layer'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'none', 'none', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/myoko-pop-quarter-zip-base-layer/ ; analogues: Spyder Dare Base Layer Crew (0.42/0.36, Ret 11/9); 32 Degrees Heat Midweight Crew (0.48/0.42, Ret 12/10); Patagonia Capilene Midweight (lab 0.69/0.55). ; Bracketed as a midweight synthetic knit below the lab grid-knit Capilene; quarter zip is modest ventilation, not a measured fabric breathability gain.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Myoko Pop Quarter-Zip Base Layer'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_ventilation (garment_id, has_pit_zips, has_side_vents, has_back_vent, has_thigh_vents, main_zip_two_way, mesh_lined_pockets, ventilation_factor)
SELECT id, false, false, false, false, false, false, 0.9
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Myoko Pop Quarter-Zip Base Layer'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 7, 7, 6, 7, 'Hip-length fitted knit top, quarter zip, high neck and long sleeves; 76% polyester / 20% polyamide / 4% elastane. No gsm or laboratory data. Bracketed as a midweight synthetic knit below the lab grid-knit Capilene; quarter zip is modest ventilation, not a measured fabric breathability gain.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Myoko Pop Quarter-Zip Base Layer'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '76% polyester / 20% polyamide / 4% elastane knit', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Myoko Pop Quarter-Zip Base Layer'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');


-- FP Movement Myoko Jacquard Base Layer
-- Cropped 20.75-inch fitted crew with thumbholes; 42% polyamide / 41% polypropylene / 12% polyester / 5% elastane. Knit gsm unstated.
-- https://www.freepeople.com/fpmovement/shop/myoko-jacquard-base-layer/
-- Analogues: Helly Hansen Lifa Active Crew (0.32/0.26, Ret 7/5.5); 32 Degrees Heat Midweight Crew (0.48/0.42, Ret 12/10); Spyder Dare Base Layer Crew (0.42/0.36).
-- Polypropylene blend placed between Lifa and midweight synthetics. Torso estimate includes cropped coverage; arms remain full length. No merino is claimed.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Myoko Jacquard Base Layer', NULL, 98, 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', NULL, 'either', 0.9, 1, 0, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 0.4, 0.4, 0, 0.3, 10, 10, 0, 7.5, 0.36, 0.376, 'derived_from_similar', 0.5, 'https://www.freepeople.com/fpmovement/shop/myoko-jacquard-base-layer/ ; analogues: Helly Hansen Lifa Active Crew (0.32/0.26, Ret 7/5.5); 32 Degrees Heat Midweight Crew (0.48/0.42, Ret 12/10); Spyder Dare Base Layer Crew (0.42/0.36). ; Polypropylene blend placed between Lifa and midweight synthetics. Torso estimate includes cropped coverage; arms remain full length. No merino is claimed.', 0.15, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Myoko Jacquard Base Layer'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'none', 'none', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/myoko-jacquard-base-layer/ ; analogues: Helly Hansen Lifa Active Crew (0.32/0.26, Ret 7/5.5); 32 Degrees Heat Midweight Crew (0.48/0.42, Ret 12/10); Spyder Dare Base Layer Crew (0.42/0.36). ; Polypropylene blend placed between Lifa and midweight synthetics. Torso estimate includes cropped coverage; arms remain full length. No merino is claimed.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Myoko Jacquard Base Layer'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 7, 7, 6, 7, 'Cropped 20.75-inch fitted crew with thumbholes; 42% polyamide / 41% polypropylene / 12% polyester / 5% elastane. Knit gsm unstated. Polypropylene blend placed between Lifa and midweight synthetics. Torso estimate includes cropped coverage; arms remain full length. No merino is claimed.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Myoko Jacquard Base Layer'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '42% polyamide / 41% polypropylene / 12% polyester / 5% elastane', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Myoko Jacquard Base Layer'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');


-- FP Movement Myoko Jacquard Base Leggings
-- High-rise fitted knit leggings, 27-inch inseam; 55% polyamide / 32% polypropylene / 9% polyester / 4% elastane. Fabric gsm unstated.
-- https://www.freepeople.com/fpmovement/shop/myoko-jacquard-base-leggings/
-- Analogues: Helly Hansen Lifa Active Pant (legs 0.30, Ret 7); Columbia Midweight Stretch Tight (0.40, Ret 10); Patagonia Capilene Midweight Bottoms (0.50, Ret 12).
-- Midweight synthetic blend bracketed between stretch tights and Capilene bottoms. Underlayer semantics prevent using thermal underwear as a standalone running/Nordic bottom.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Myoko Jacquard Base Leggings', NULL, 128, 'base_layer', 'pants', false, false, true, false, 'none', NULL, 'underlayer', 0, 0, 1, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 0, 0, 0.45, 0.11, 0, 0, 11, 2.8, 0.36, 0.369, 'derived_from_similar', 0.5, 'https://www.freepeople.com/fpmovement/shop/myoko-jacquard-base-leggings/ ; analogues: Helly Hansen Lifa Active Pant (legs 0.30, Ret 7); Columbia Midweight Stretch Tight (0.40, Ret 10); Patagonia Capilene Midweight Bottoms (0.50, Ret 12). ; Midweight synthetic blend bracketed between stretch tights and Capilene bottoms. Underlayer semantics prevent using thermal underwear as a standalone running/Nordic bottom.', 0.15, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Myoko Jacquard Base Leggings'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'none', 'none', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/myoko-jacquard-base-leggings/ ; analogues: Helly Hansen Lifa Active Pant (legs 0.30, Ret 7); Columbia Midweight Stretch Tight (0.40, Ret 10); Patagonia Capilene Midweight Bottoms (0.50, Ret 12). ; Midweight synthetic blend bracketed between stretch tights and Capilene bottoms. Underlayer semantics prevent using thermal underwear as a standalone running/Nordic bottom.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Myoko Jacquard Base Leggings'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 7, 7, 6, 7, 'High-rise fitted knit leggings, 27-inch inseam; 55% polyamide / 32% polypropylene / 9% polyester / 4% elastane. Fabric gsm unstated. Midweight synthetic blend bracketed between stretch tights and Capilene bottoms. Underlayer semantics prevent using thermal underwear as a standalone running/Nordic bottom.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Myoko Jacquard Base Leggings'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '55% polyamide / 32% polypropylene / 9% polyester / 4% elastane', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Myoko Jacquard Base Leggings'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');


-- FP Movement Mountain High Half-Zip Fleece
-- 100% polyester fleece pullover with half zip, high neck, drawcord hem and 23-inch slightly cropped length. Printed version has the same published fabric, cut and features ($128).
-- https://www.freepeople.com/fpmovement/shop/mountain-high-half-zip-fleece/
-- https://www.freepeople.com/fpmovement/shop/mountain-high-printed-half-zip-fleece/
-- Analogues: Helly Hansen Varde Fleece Jacket 2.0 (0.90/0.78, Ret 16/14); Patagonia R1 Pullover (0.80/0.70, Ret 16/14); USARIEM ECWCS fleece (lab 1.05/0.94).
-- Ordinary lofty fleece is warmer than grid R1 but below full ECWCS fleece after crop allowance. One entry covers plain and printed construction; price is the plain model MSRP.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Mountain High Half-Zip Fleece', NULL, 98, 'mid_layer_heavy', 'top_long_sleeve', true, true, false, false, 'none', NULL, 'either', 0.9, 1, 0, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 0.95, 0.8, 0, 0.68, 16, 14, 0, 11.5, 0.3, 0.556, 'derived_from_similar', 0.5, 'https://www.freepeople.com/fpmovement/shop/mountain-high-half-zip-fleece/ ; https://www.freepeople.com/fpmovement/shop/mountain-high-printed-half-zip-fleece/ ; analogues: Helly Hansen Varde Fleece Jacket 2.0 (0.90/0.78, Ret 16/14); Patagonia R1 Pullover (0.80/0.70, Ret 16/14); USARIEM ECWCS fleece (lab 1.05/0.94). ; Ordinary lofty fleece is warmer than grid R1 but below full ECWCS fleece after crop allowance. One entry covers plain and printed construction; price is the plain model MSRP.', 0.28, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Mountain High Half-Zip Fleece'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'none', 'none', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/mountain-high-half-zip-fleece/ ; https://www.freepeople.com/fpmovement/shop/mountain-high-printed-half-zip-fleece/ ; analogues: Helly Hansen Varde Fleece Jacket 2.0 (0.90/0.78, Ret 16/14); Patagonia R1 Pullover (0.80/0.70, Ret 16/14); USARIEM ECWCS fleece (lab 1.05/0.94). ; Ordinary lofty fleece is warmer than grid R1 but below full ECWCS fleece after crop allowance. One entry covers plain and printed construction; price is the plain model MSRP.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Mountain High Half-Zip Fleece'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_ventilation (garment_id, has_pit_zips, has_side_vents, has_back_vent, has_thigh_vents, main_zip_two_way, mesh_lined_pockets, ventilation_factor)
SELECT id, false, false, false, false, false, false, 0.85
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Mountain High Half-Zip Fleece'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 6, 6, 6, 7, '100% polyester fleece pullover with half zip, high neck, drawcord hem and 23-inch slightly cropped length. Printed version has the same published fabric, cut and features ($128). Ordinary lofty fleece is warmer than grid R1 but below full ECWCS fleece after crop allowance. One entry covers plain and printed construction; price is the plain model MSRP.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Mountain High Half-Zip Fleece'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '100% polyester fleece', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Mountain High Half-Zip Fleece'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');


-- FP Movement Field Tripper Jacket
-- 100% nylon shell with 100% polyester fleece lining; wind- and water-resistant claims, wind flap and ribbed cuffs; 23-inch length, no hood. No membrane, fill or seam-taping specification.
-- https://www.freepeople.com/fpmovement/shop/field-tripper-jacket/
-- Analogues: Helly Hansen Varde Fleece Jacket 2.0 (0.90/0.78, Ret 16/14); Columbia Joy Peak Lite Hooded Jacket (1.15/1.00, Ret 26/23); FP Movement Lift Love Jacket (1.15/0.95, Ret 30/27).
-- Fleece plus tight woven shell estimated above Varde for warmth and resistance. Soft-shell slot reflects fleece backing rather than unreported puffer fill. DWR_only is the conservative no-membrane catalog class for the stated water repellency; treatment chemistry is unknown.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Field Tripper Jacket', NULL, 198, 'soft_shell', 'jacket', true, true, false, false, 'none', NULL, 'standalone', 1, 1, 0, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 1.05, 0.9, 0, 0.75, 24, 21, 0, 17.3, 0.26, 0.408, 'derived_from_similar', 0.5, 'https://www.freepeople.com/fpmovement/shop/field-tripper-jacket/ ; analogues: Helly Hansen Varde Fleece Jacket 2.0 (0.90/0.78, Ret 16/14); Columbia Joy Peak Lite Hooded Jacket (1.15/1.00, Ret 26/23); FP Movement Lift Love Jacket (1.15/0.95, Ret 30/27). ; Fleece plus tight woven shell estimated above Varde for warmth and resistance. Soft-shell slot reflects fleece backing rather than unreported puffer fill. DWR_only is the conservative no-membrane catalog class for the stated water repellency; treatment chemistry is unknown.', 0.32, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Field Tripper Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'wind_resistant', 'DWR_only', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/field-tripper-jacket/ ; analogues: Helly Hansen Varde Fleece Jacket 2.0 (0.90/0.78, Ret 16/14); Columbia Joy Peak Lite Hooded Jacket (1.15/1.00, Ret 26/23); FP Movement Lift Love Jacket (1.15/0.95, Ret 30/27). ; Fleece plus tight woven shell estimated above Varde for warmth and resistance. Soft-shell slot reflects fleece backing rather than unreported puffer fill. DWR_only is the conservative no-membrane catalog class for the stated water repellency; treatment chemistry is unknown.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Field Tripper Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 5, 5, 5, 6, '100% nylon shell with 100% polyester fleece lining; wind- and water-resistant claims, wind flap and ribbed cuffs; 23-inch length, no hood. No membrane, fill or seam-taping specification. Fleece plus tight woven shell estimated above Varde for warmth and resistance. Soft-shell slot reflects fleece backing rather than unreported puffer fill. DWR_only is the conservative no-membrane catalog class for the stated water repellency; treatment chemistry is unknown.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Field Tripper Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '100% nylon', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Field Tripper Jacket'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'lining', '100% polyester fleece', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Field Tripper Jacket'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'lining');


-- FP Movement Sky High Fleece Vest
-- 100% polyester fleece vest, 19.5-inch cropped length, attached adjustable hood and full two-way front zipper. No gsm or weather-protection specification.
-- https://www.freepeople.com/fpmovement/shop/sky-high-fleece-vest/
-- Analogues: Helly Hansen Varde Fleece Jacket 2.0 (torso 0.90, Ret 16); Patagonia R1 Pullover (torso 0.80, Ret 16); Patagonia Nano-Air Light Vest (torso 0.85, Ret 14).
-- Varde torso warmth and Ret reduced for the short crop; zero arm coverage and insulation. Hood warmth is handled by hood_type, not added to torso.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Sky High Fleece Vest', NULL, 108, 'mid_layer_heavy', 'vest', true, false, false, true, 'attached', NULL, 'either', 0.8, 0, 0, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 0.75, 0, 0, 0.38, 13, 0, 0, 6.5, 0.32, 0.55, 'derived_from_similar', 0.5, 'https://www.freepeople.com/fpmovement/shop/sky-high-fleece-vest/ ; analogues: Helly Hansen Varde Fleece Jacket 2.0 (torso 0.90, Ret 16); Patagonia R1 Pullover (torso 0.80, Ret 16); Patagonia Nano-Air Light Vest (torso 0.85, Ret 14). ; Varde torso warmth and Ret reduced for the short crop; zero arm coverage and insulation. Hood warmth is handled by hood_type, not added to torso.', 0.25, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Sky High Fleece Vest'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'none', 'none', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/sky-high-fleece-vest/ ; analogues: Helly Hansen Varde Fleece Jacket 2.0 (torso 0.90, Ret 16); Patagonia R1 Pullover (torso 0.80, Ret 16); Patagonia Nano-Air Light Vest (torso 0.85, Ret 14). ; Varde torso warmth and Ret reduced for the short crop; zero arm coverage and insulation. Hood warmth is handled by hood_type, not added to torso.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Sky High Fleece Vest'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_ventilation (garment_id, has_pit_zips, has_side_vents, has_back_vent, has_thigh_vents, main_zip_two_way, mesh_lined_pockets, ventilation_factor)
SELECT id, false, false, false, false, true, false, 0.85
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Sky High Fleece Vest'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 6, 6, 6, 6, '100% polyester fleece vest, 19.5-inch cropped length, attached adjustable hood and full two-way front zipper. No gsm or weather-protection specification. Varde torso warmth and Ret reduced for the short crop; zero arm coverage and insulation. Hood warmth is handled by hood_type, not added to torso.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Sky High Fleece Vest'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '100% polyester fleece', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Sky High Fleece Vest'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');


-- FP Movement Care FP On The Ascend Insulated Jacket
-- Recycled nylon shell, recycled polyester PrimaLoft fill and nylon lining; helmet-adjustable hood, underarm vents, two-way front zipper and snow skirt. Waterproof marketing but no published mm, fill mass or sealed-seam confirmation.
-- https://www.freepeople.com/fpmovement/shop/care-fp-on-the-ascend-insulated-jacket/
-- Analogues: FP Movement Lift Love Jacket (1.15/0.95, Ret 30/27); Obermeyer Raze Jacket (1.40/1.00, Ret 36/30); Mountain Hardwear Firefall/2 Insulated Jacket (1.50/1.30, Ret 35/32).
-- Brand heavier-fill warmth tier places this above Lift Love and near Firefall/2; no exact fill ratio is claimed. Water resistance only pending sealed-seam verification; no invented waterproof mm or membrane.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Care FP On The Ascend Insulated Jacket', NULL, 398, 'outer_insulated', 'jacket', true, true, false, true, 'helmet_compatible', NULL, 'standalone', 1, 1, 0, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 1.5, 1.25, 0, 1.06, 35, 32, 0, 25.5, 0.18, 0.391, 'derived_from_similar', 0.45, 'https://www.freepeople.com/fpmovement/shop/care-fp-on-the-ascend-insulated-jacket/ ; analogues: FP Movement Lift Love Jacket (1.15/0.95, Ret 30/27); Obermeyer Raze Jacket (1.40/1.00, Ret 36/30); Mountain Hardwear Firefall/2 Insulated Jacket (1.50/1.30, Ret 35/32). ; Brand heavier-fill warmth tier places this above Lift Love and near Firefall/2; no exact fill ratio is claimed. Water resistance only pending sealed-seam verification; no invented waterproof mm or membrane.', 0.5, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Care FP On The Ascend Insulated Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'wind_resistant', 'water_resistant', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/care-fp-on-the-ascend-insulated-jacket/ ; analogues: FP Movement Lift Love Jacket (1.15/0.95, Ret 30/27); Obermeyer Raze Jacket (1.40/1.00, Ret 36/30); Mountain Hardwear Firefall/2 Insulated Jacket (1.50/1.30, Ret 35/32). ; Brand heavier-fill warmth tier places this above Lift Love and near Firefall/2; no exact fill ratio is claimed. Water resistance only pending sealed-seam verification; no invented waterproof mm or membrane.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Care FP On The Ascend Insulated Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_ventilation (garment_id, has_pit_zips, has_side_vents, has_back_vent, has_thigh_vents, main_zip_two_way, mesh_lined_pockets, ventilation_factor)
SELECT id, true, false, false, false, true, false, 0.65
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Care FP On The Ascend Insulated Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 2, 3, 6, 8, 'Recycled nylon shell, recycled polyester PrimaLoft fill and nylon lining; helmet-adjustable hood, underarm vents, two-way front zipper and snow skirt. Waterproof marketing but no published mm, fill mass or sealed-seam confirmation. Brand heavier-fill warmth tier places this above Lift Love and near Firefall/2; no exact fill ratio is claimed. Water resistance only pending sealed-seam verification; no invented waterproof mm or membrane.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Care FP On The Ascend Insulated Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '100% recycled nylon', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Care FP On The Ascend Insulated Jacket'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'insulation', 'PrimaLoft recycled polyester, fill grade and weight unstated', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Care FP On The Ascend Insulated Jacket'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'insulation');

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'lining', '100% nylon', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Care FP On The Ascend Insulated Jacket'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'lining');


-- FP Movement Chill Factor Leggings
-- Four-way stretch fitted ski leggings; shell 86% polyester / 14% elastane, shell base 92% polyester / 8% elastane; 29.5-inch inseam and water-resistant wording alongside waterproof fabric marketing. Seams and membrane unstated.
-- https://www.freepeople.com/fpmovement/shop/chill-factor-leggings2/
-- Analogues: Patagonia Wind Shield Pants (legs 0.55, Ret 12); Norrøna Falketind Flex1 Pants (0.85, Ret 18); Norrøna Falketind Flex1 Heavy Duty Pants (1.00, Ret 20).
-- Stretch snow softshell placed below Flex1 warmth, with similar resistance for the multilayer fabric. No hydrostatic head or confirmed seam seal; waterproof_mm remains NULL.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Chill Factor Leggings', NULL, 198, 'soft_shell', 'pants', false, false, true, false, 'none', NULL, 'standalone', 0, 0, 1, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 0, 0, 0.75, 0.19, 0, 0, 18, 4.5, 0.28, 0.397, 'derived_from_similar', 0.5, 'https://www.freepeople.com/fpmovement/shop/chill-factor-leggings2/ ; analogues: Patagonia Wind Shield Pants (legs 0.55, Ret 12); Norrøna Falketind Flex1 Pants (0.85, Ret 18); Norrøna Falketind Flex1 Heavy Duty Pants (1.00, Ret 20). ; Stretch snow softshell placed below Flex1 warmth, with similar resistance for the multilayer fabric. No hydrostatic head or confirmed seam seal; waterproof_mm remains NULL.', 0.23, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Chill Factor Leggings'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'wind_resistant', 'water_resistant', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/chill-factor-leggings2/ ; analogues: Patagonia Wind Shield Pants (legs 0.55, Ret 12); Norrøna Falketind Flex1 Pants (0.85, Ret 18); Norrøna Falketind Flex1 Heavy Duty Pants (1.00, Ret 20). ; Stretch snow softshell placed below Flex1 warmth, with similar resistance for the multilayer fabric. No hydrostatic head or confirmed seam seal; waterproof_mm remains NULL.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Chill Factor Leggings'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 6, 6, 6, 7, 'Four-way stretch fitted ski leggings; shell 86% polyester / 14% elastane, shell base 92% polyester / 8% elastane; 29.5-inch inseam and water-resistant wording alongside waterproof fabric marketing. Seams and membrane unstated. Stretch snow softshell placed below Flex1 warmth, with similar resistance for the multilayer fabric. No hydrostatic head or confirmed seam seal; waterproof_mm remains NULL.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Chill Factor Leggings'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '86% polyester / 14% elastane', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Chill Factor Leggings'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'lining', 'Shell base: 92% polyester / 8% elastane', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Chill Factor Leggings'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'lining');


-- FP Movement Downhill Diva Suit
-- Hybrid ski suit: nylon puffer top with recycled polyester fill and fitted 86% polyester / 14% elastane leggings; ribbed collar, no hood. Bottom fabric rated 5k/5k; no taped-seam confirmation or fill mass.
-- https://www.freepeople.com/fpmovement/shop/downhill-diva-suit/
-- Analogues: Columbia Powder Lite Hooded Jacket (1.25/1.05, Ret 28/25); FP Movement Lift Love Jacket (1.15/0.95, Ret 30/27); Norrøna Falketind Flex1 Pants (legs 0.85, Ret 18).
-- Torso/arms estimated as a light insulated resort top, legs separately as stretch softshell. The 5k/5k fabric claim is not a garment waterproof certification: waterproof_mm remains NULL. Alpine-only allow-list avoids builders without one-piece handling.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Downhill Diva Suit', NULL, 598, 'outer_insulated', 'one_piece', true, true, true, false, 'none', NULL, 'standalone', 1, 1, 1, ARRAY['alpine_skiing'])
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 1.25, 1.05, 0.75, 1.08, 30, 27, 18, 26.3, 0.2, 0.386, 'derived_from_similar', 0.45, 'https://www.freepeople.com/fpmovement/shop/downhill-diva-suit/ ; analogues: Columbia Powder Lite Hooded Jacket (1.25/1.05, Ret 28/25); FP Movement Lift Love Jacket (1.15/0.95, Ret 30/27); Norrøna Falketind Flex1 Pants (legs 0.85, Ret 18). ; Torso/arms estimated as a light insulated resort top, legs separately as stretch softshell. The 5k/5k fabric claim is not a garment waterproof certification: waterproof_mm remains NULL. Alpine-only allow-list avoids builders without one-piece handling.', 0.4, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Downhill Diva Suit'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'wind_resistant', 'water_resistant', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/downhill-diva-suit/ ; analogues: Columbia Powder Lite Hooded Jacket (1.25/1.05, Ret 28/25); FP Movement Lift Love Jacket (1.15/0.95, Ret 30/27); Norrøna Falketind Flex1 Pants (legs 0.85, Ret 18). ; Torso/arms estimated as a light insulated resort top, legs separately as stretch softshell. The 5k/5k fabric claim is not a garment waterproof certification: waterproof_mm remains NULL. Alpine-only allow-list avoids builders without one-piece handling.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Downhill Diva Suit'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 2, 2, 6, 7, 'Hybrid ski suit: nylon puffer top with recycled polyester fill and fitted 86% polyester / 14% elastane leggings; ribbed collar, no hood. Bottom fabric rated 5k/5k; no taped-seam confirmation or fill mass. Torso/arms estimated as a light insulated resort top, legs separately as stretch softshell. The 5k/5k fabric claim is not a garment waterproof certification: waterproof_mm remains NULL. Alpine-only allow-list avoids builders without one-piece handling.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Downhill Diva Suit'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', 'Top: 100% nylon; legs: 86% polyester / 14% elastane', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Downhill Diva Suit'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'insulation', 'Top only: 100% recycled polyester, weight unstated', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Downhill Diva Suit'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'insulation');


-- FP Movement Hit The Slopes Printed Fleece Jacket
-- Textured lofty fleece, hip-length relaxed cut, long raglan sleeves, high collar, snap front and nylon chest pocket. No hood, gsm or fiber composition published on this product page.
-- https://www.freepeople.com/fpmovement/shop/hit-the-slopes-printed-fleece-jacket/
-- Analogues: Helly Hansen Varde Fleece Jacket 2.0 (0.90/0.78, Ret 16/14); Norrøna Trollveggen Thermal Pro Jacket (1.45/1.20, Ret 16/14); USARIEM ECWCS fleece (lab 1.05/0.94).
-- Lofty full-length fleece bracketed above Varde and below Thermal Pro; close to the lab ECWCS anchor. Do not infer 100% polyester or a proprietary fleece brand from the marketing description.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Hit The Slopes Printed Fleece Jacket', NULL, 198, 'mid_layer_heavy', 'jacket', true, true, false, false, 'none', NULL, 'either', 1, 1, 0, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 1.1, 0.95, 0, 0.79, 17, 15, 0, 12.3, 0.28, 0.604, 'derived_from_similar', 0.45, 'https://www.freepeople.com/fpmovement/shop/hit-the-slopes-printed-fleece-jacket/ ; analogues: Helly Hansen Varde Fleece Jacket 2.0 (0.90/0.78, Ret 16/14); Norrøna Trollveggen Thermal Pro Jacket (1.45/1.20, Ret 16/14); USARIEM ECWCS fleece (lab 1.05/0.94). ; Lofty full-length fleece bracketed above Varde and below Thermal Pro; close to the lab ECWCS anchor. Do not infer 100% polyester or a proprietary fleece brand from the marketing description.', 0.33, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Hit The Slopes Printed Fleece Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'none', 'none', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/hit-the-slopes-printed-fleece-jacket/ ; analogues: Helly Hansen Varde Fleece Jacket 2.0 (0.90/0.78, Ret 16/14); Norrøna Trollveggen Thermal Pro Jacket (1.45/1.20, Ret 16/14); USARIEM ECWCS fleece (lab 1.05/0.94). ; Lofty full-length fleece bracketed above Varde and below Thermal Pro; close to the lab ECWCS anchor. Do not infer 100% polyester or a proprietary fleece brand from the marketing description.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Hit The Slopes Printed Fleece Jacket'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 5, 5, 6, 7, 'Textured lofty fleece, hip-length relaxed cut, long raglan sleeves, high collar, snap front and nylon chest pocket. No hood, gsm or fiber composition published on this product page. Lofty full-length fleece bracketed above Varde and below Thermal Pro; close to the lab ECWCS anchor. Do not infer 100% polyester or a proprietary fleece brand from the marketing description.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Hit The Slopes Printed Fleece Jacket'
ON CONFLICT (garment_id) DO NOTHING;


-- FP Movement Sundown Fleece Pants
-- 100% polyester fleece joggers with woven panels on both legs, 29.5-inch inseam, drawstring waist and ankle zippers; no weather-protection specification.
-- https://www.freepeople.com/fpmovement/shop/sundown-fleece-pants2/
-- Analogues: Patagonia R1 Fleece Pants (legs 0.75, Ret 16); Icebreaker Merino 260 Tech Leggings (0.80, Ret 17); Norrøna Falketind Flex1 Pants (0.85, Ret 18).
-- Lofty everyday fleece placed modestly above grid R1 bottoms for warmth and Ret; woven panels do not establish whole-garment windproofing. Ankle opening zips are not assumed to be ventilation zips.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('FP Movement', 'Sundown Fleece Pants', NULL, 198, 'mid_layer_heavy', 'pants', false, false, true, false, 'none', NULL, 'standalone', 0, 0, 1, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 0, 0, 0.85, 0.21, 0, 0, 18, 4.5, 0.3, 0.439, 'derived_from_similar', 0.5, 'https://www.freepeople.com/fpmovement/shop/sundown-fleece-pants2/ ; analogues: Patagonia R1 Fleece Pants (legs 0.75, Ret 16); Icebreaker Merino 260 Tech Leggings (0.80, Ret 17); Norrøna Falketind Flex1 Pants (0.85, Ret 18). ; Lofty everyday fleece placed modestly above grid R1 bottoms for warmth and Ret; woven panels do not establish whole-garment windproofing. Ankle opening zips are not assumed to be ventilation zips.', 0.26, false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Sundown Fleece Pants'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'none', 'none', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/sundown-fleece-pants2/ ; analogues: Patagonia R1 Fleece Pants (legs 0.75, Ret 16); Icebreaker Merino 260 Tech Leggings (0.80, Ret 17); Norrøna Falketind Flex1 Pants (0.85, Ret 18). ; Lofty everyday fleece placed modestly above grid R1 bottoms for warmth and Ret; woven panels do not establish whole-garment windproofing. Ankle opening zips are not assumed to be ventilation zips.', false
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Sundown Fleece Pants'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 6, 6, 6, 6, '100% polyester fleece joggers with woven panels on both legs, 29.5-inch inseam, drawstring waist and ankle zippers; no weather-protection specification. Lofty everyday fleece placed modestly above grid R1 bottoms for warmth and Ret; woven panels do not establish whole-garment windproofing. Ankle opening zips are not assumed to be ventilation zips.'
FROM garments WHERE brand = 'FP Movement' AND model_name = 'Sundown Fleece Pants'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '100% polyester fleece with woven panels', NULL, 100
FROM garments g WHERE g.brand = 'FP Movement' AND model_name = 'Sundown Fleece Pants'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');


-- Rossignol Insulated Ski Pants
-- Retailer confirms recycled polyester, PrimaLoft, built-in gaiters and fully taped seams. Rossignol regular-length Insulated Ski Pants family lists 40g insulation, 2L 20k/20k fabric and full taping; exact retailer SKU not supplied.
-- https://www.freepeople.com/fpmovement/shop/rossignol-insulated-ski-pants/
-- https://www.rossignol.com/us-en/womens-insulated-ski-pants-regular-length-RLOWP05715.html
-- Analogues: Helly Hansen Legendary Insulated Ski Pants (legs 1.00, Ret 32); Patagonia Insulated Powder Bowl Pants - Regular (1.10, Ret 40); Columbia Bugaboo II Pants (1.15, Ret 38).
-- Light insulated pant estimated just below Legendary. Waterproof classification is independently supported by retailer full taping. Leave mm, MVTR and exact insulation gsm NULL because the retailer-to-maker SKU match is unconfirmed; 20k/20k and 40g are family context only.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('Rossignol', 'Insulated Ski Pants', NULL, 230, 'outer_insulated', 'pants', false, false, true, false, 'none', NULL, 'standalone', 0, 0, 1, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 0, 0, 0.9, 0.23, 0, 0, 30, 7.5, 0.22, 0.288, 'derived_from_similar', 0.65, 'https://www.freepeople.com/fpmovement/shop/rossignol-insulated-ski-pants/ ; https://www.rossignol.com/us-en/womens-insulated-ski-pants-regular-length-RLOWP05715.html ; analogues: Helly Hansen Legendary Insulated Ski Pants (legs 1.00, Ret 32); Patagonia Insulated Powder Bowl Pants - Regular (1.10, Ret 40); Columbia Bugaboo II Pants (1.15, Ret 38). ; Light insulated pant estimated just below Legendary. Waterproof classification is independently supported by retailer full taping. Leave mm, MVTR and exact insulation gsm NULL because the retailer-to-maker SKU match is unconfirmed; 20k/20k and 40g are family context only.', 0.25, false
FROM garments WHERE brand = 'Rossignol' AND model_name = 'Insulated Ski Pants'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'windproof', 'waterproof', NULL, NULL, 'taped', 'https://www.freepeople.com/fpmovement/shop/rossignol-insulated-ski-pants/ ; https://www.rossignol.com/us-en/womens-insulated-ski-pants-regular-length-RLOWP05715.html ; analogues: Helly Hansen Legendary Insulated Ski Pants (legs 1.00, Ret 32); Patagonia Insulated Powder Bowl Pants - Regular (1.10, Ret 40); Columbia Bugaboo II Pants (1.15, Ret 38). ; Light insulated pant estimated just below Legendary. Waterproof classification is independently supported by retailer full taping. Leave mm, MVTR and exact insulation gsm NULL because the retailer-to-maker SKU match is unconfirmed; 20k/20k and 40g are family context only.', false
FROM garments WHERE brand = 'Rossignol' AND model_name = 'Insulated Ski Pants'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 3, 3, 7, 9, 'Retailer confirms recycled polyester, PrimaLoft, built-in gaiters and fully taped seams. Rossignol regular-length Insulated Ski Pants family lists 40g insulation, 2L 20k/20k fabric and full taping; exact retailer SKU not supplied. Light insulated pant estimated just below Legendary. Waterproof classification is independently supported by retailer full taping. Leave mm, MVTR and exact insulation gsm NULL because the retailer-to-maker SKU match is unconfirmed; 20k/20k and 40g are family context only.'
FROM garments WHERE brand = 'Rossignol' AND model_name = 'Insulated Ski Pants'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '100% recycled polyester', NULL, 100
FROM garments g WHERE g.brand = 'Rossignol' AND model_name = 'Insulated Ski Pants'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'insulation', 'PrimaLoft synthetic, retailer fill weight unstated', NULL, 100
FROM garments g WHERE g.brand = 'Rossignol' AND model_name = 'Insulated Ski Pants'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'insulation');


-- Goldbergh Triumph Base Layer
-- 85% recycled polyester / 15% elastane stretch jersey, brushed back, high neck and half zip; moisture management and quick-drying finish. No gsm, measured weight or test results from the retailer.
-- https://www.freepeople.com/fpmovement/shop/goldbergh-triumph-base-layer/
-- Analogues: Under Armour ColdGear Base 2.0 Crew (0.55/0.50, Ret 14/12); 32 Degrees Heat Midweight Crew (0.48/0.42, Ret 12/10); Patagonia Capilene Midweight (lab 0.69/0.55).
-- Brushed knit placed above flat midweight synthetics and below the lab grid-knit Capilene. MSRP $289 from the US collection; no converted foreign currency or unverified review weight.

INSERT INTO garments (brand, model_name, year_released, msrp_usd, category, garment_type, covers_torso, covers_arms, covers_legs, covers_head, hood_type, weight_grams, usage, coverage_torso, coverage_arms, coverage_legs, suitable_activities)
VALUES ('Goldbergh', 'Triumph Base Layer', NULL, 289, 'base_layer', 'top_long_sleeve', true, true, false, false, 'none', NULL, 'either', 1, 1, 0, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms, rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body, evap_potential, im_whole_body, estimation_method, confidence_score, data_source, uncertainty_clo, generic_estimate)
SELECT id, 0.55, 0.46, 0, 0.39, 14, 12, 0, 10.0, 0.33, 0.367, 'derived_from_similar', 0.6, 'https://www.freepeople.com/fpmovement/shop/goldbergh-triumph-base-layer/ ; analogues: Under Armour ColdGear Base 2.0 Crew (0.55/0.50, Ret 14/12); 32 Degrees Heat Midweight Crew (0.48/0.42, Ret 12/10); Patagonia Capilene Midweight (lab 0.69/0.55). ; Brushed knit placed above flat midweight synthetics and below the lab grid-knit Capilene. MSRP $289 from the US collection; no converted foreign currency or unverified review weight.', 0.17, false
FROM garments WHERE brand = 'Goldbergh' AND model_name = 'Triumph Base Layer'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating, waterproof_mm, membrane_type, seam_construction, data_source, generic_estimate)
SELECT id, 'none', 'none', NULL, NULL, NULL, 'https://www.freepeople.com/fpmovement/shop/goldbergh-triumph-base-layer/ ; analogues: Under Armour ColdGear Base 2.0 Crew (0.55/0.50, Ret 14/12); 32 Degrees Heat Midweight Crew (0.48/0.42, Ret 12/10); Patagonia Capilene Midweight (lab 0.69/0.55). ; Brushed knit placed above flat midweight synthetics and below the lab grid-knit Capilene. MSRP $289 from the US collection; no converted foreign currency or unverified review weight.', false
FROM garments WHERE brand = 'Goldbergh' AND model_name = 'Triumph Base Layer'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_ventilation (garment_id, has_pit_zips, has_side_vents, has_back_vent, has_thigh_vents, main_zip_two_way, mesh_lined_pockets, ventilation_factor)
SELECT id, false, false, false, false, false, false, 0.85
FROM garments WHERE brand = 'Goldbergh' AND model_name = 'Triumph Base Layer'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score, ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
SELECT id, 7, 7, 6, 7, '85% recycled polyester / 15% elastane stretch jersey, brushed back, high neck and half zip; moisture management and quick-drying finish. No gsm, measured weight or test results from the retailer. Brushed knit placed above flat midweight synthetics and below the lab grid-knit Capilene. MSRP $289 from the US collection; no converted foreign currency or unverified review weight.'
FROM garments WHERE brand = 'Goldbergh' AND model_name = 'Triumph Base Layer'
ON CONFLICT (garment_id) DO NOTHING;

INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
SELECT g.id, 'outer', '85% recycled polyester / 15% elastane, brushed-back jersey', NULL, 100
FROM garments g WHERE g.brand = 'Goldbergh' AND model_name = 'Triumph Base Layer'
  AND NOT EXISTS (SELECT 1 FROM garment_materials m WHERE m.garment_id = g.id AND m.layer_position = 'outer');
