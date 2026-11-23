-- #412: a warmer over-pant for cold ski-touring descents.
-- Live catalog checked read-only on 2026-11-22 before adding the product: no
-- insulation_synthetic or insulation_down leg garment, and no belay, puffy or
-- down pant. The warmest leg layers were the 1.80 clo insulated ski pants
-- (Helly Hansen Legendary, Patagonia Insulated Powder Bowl, Columbia Bugaboo
-- II), none with full side zips. Evidence and the before/after descent table:
-- docs/cycling-touring-calibration.md#descent-findings.
--
-- Black Diamond Solution 4.0 Pants (sold as the Belay Pants until 2025),
-- manufacturer page https://blackdiamondequipment.com/products/solution-4-0-pants
-- read 2026-11-22: "two-way insulation filled with 60 gsm of Primaloft Gold
-- Crosscore insulation and 40 gsm of Primaloft Rise insulation", 50D polyester
-- ripstop with DWR (80 gsm), 20D nylon taffeta lining (36 gsm), full-length
-- side zippers, worn over shell pants, 603 g, US$449. Retailers list the same
-- specs (VPO Canada, varuste.net).
--
-- Warmth, on 036's T21-03 scale (docs/catalog-thermal-calibration.md, Rules):
-- insulated pants legs = 0.65 + 0.70 x inc(fill), inc(f) = 0.0522 f^0.842.
-- ASSUMPTION: the two insulations are stacked, 100 g/m2 in all. The maker's
-- wording doesn't say whether they are layered or zoned. At 100 g/m2 the rule
-- gives 2.41 -> 2.40 clo, against T21-03's DAS Pants (a belay pant with
-- 100 g PrimaLoft One) at 2.60. If the insulation were zoned (about 50 g/m2 on
-- average) it would be about 1.65 clo, so uncertainty_clo is 0.6 and
-- confidence 0.5, 036's convention for rows resting on an assumption. The
-- aerogel in Gold Crosscore is ignored: the curve uses fill weight only.
-- Ret scales with clo at the DAS Pants' permeability (53.7 / 2.60).
-- Whole-body values follow the 0.5 / 0.25 / 0.25 weights.
--
-- Activity scores are editorial: a belay pant goes on over shell pants for
-- stops and descents, so it is rated for the touring descent only. The touring
-- catalog filter keys on 'ski_touring_uphill', so both touring keys are listed;
-- the uphill score of 2 keeps it off the climb. Alpine, XC, running and
-- cycling don't list it, since their builders would put it under a shell.

DO $$
DECLARE
  garment uuid;
BEGIN
  -- Match existing brand/model spellings and case before inserting.
  SELECT id INTO garment FROM garments
  WHERE lower(brand) = 'black diamond'
    AND lower(model_name) IN ('solution 4.0 pants', 'belay pants')
  ORDER BY created_at, id LIMIT 1;

  IF garment IS NULL THEN
    INSERT INTO garments (brand, model_name, msrp_usd, category, garment_type,
      covers_torso, covers_arms, covers_legs, covers_head, hood_type,
      weight_grams, coverage_torso, coverage_arms, coverage_legs,
      suitable_activities, brand_logo_url, item_image_url)
    VALUES ('Black Diamond', 'Solution 4.0 Pants', 449, 'insulation_synthetic', 'pants',
      false, false, true, false, 'none',
      603, 0, 0, 1,
      ARRAY['ski_touring_uphill', 'ski_touring_downhill'],
      '/media/brands/black-diamond.png', '/images/silhouettes/heavy-ski-pants.png')
    ON CONFLICT (brand, model_name) DO NOTHING
    RETURNING id INTO garment;
    IF garment IS NULL THEN
      SELECT id INTO garment FROM garments
      WHERE brand = 'Black Diamond' AND model_name = 'Solution 4.0 Pants';
    END IF;
  END IF;

  INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms,
    rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body,
    evap_potential, estimation_method, confidence_score, data_source,
    uncertainty_clo, generic_estimate)
  -- evap_potential 0.30 is an assumption between the catalog's DWR synthetic
  -- puffies (Macro Puff 0.28, Micro Puff 0.32).
  VALUES (garment, 0, 0, 2.40, 0.60, 0, 0, 49.57, 12.39,
    0.30, 'derived_from_similar', 0.5,
    'docs/cycling-touring-calibration.md#descent-findings ; 036 rule: T21-03 trousers + fill increment, 60 + 40 g/m2 assumed stacked',
    0.6, false)
  ON CONFLICT (garment_id) DO NOTHING;

  INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating,
    membrane_type, data_source, generic_estimate)
  VALUES (garment, 'wind_resistant', 'DWR_only', NULL,
    'https://blackdiamondequipment.com/products/solution-4-0-pants (50D ripstop with DWR, no membrane)', false)
  ON CONFLICT (garment_id) DO NOTHING;

  INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score,
    ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
  VALUES (garment, 2, 2, 7, 4,
    'Synthetic belay pant with full-length side zips, worn over shell pants for stops and descents. Editorial scores; warmth estimated, not lab-tested. See docs/cycling-touring-calibration.md#descent-findings.')
  ON CONFLICT (garment_id) DO NOTHING;

  -- The full-length side zips are recorded as side vents. No cooling factor
  -- is estimated for them (1.0), as in #41.
  INSERT INTO garment_ventilation (garment_id, has_pit_zips, has_side_vents, ventilation_factor)
  VALUES (garment, false, true, 1.0)
  ON CONFLICT (garment_id) DO NOTHING;

  INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
  SELECT garment, m.position::layer_position, m.material, m.gsm, 100 FROM (VALUES
    ('outer', '50D polyester ripstop with DWR', 80),
    ('insulation', 'PrimaLoft Gold Crosscore 100% polyester', 60),
    ('insulation', 'PrimaLoft Rise 100% polyester', 40),
    ('lining', '20D nylon taffeta', 36)
  ) AS m(position, material, gsm)
  WHERE NOT EXISTS (
    SELECT 1 FROM garment_materials existing WHERE existing.garment_id = garment
      AND existing.layer_position = m.position::layer_position
      AND existing.material_type = m.material
  );
END $$;
