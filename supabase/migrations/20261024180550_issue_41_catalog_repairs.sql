-- #41: live catalog checked read-only on 2026-10-24 before adding products.
-- Sources, estimate derivations and product identity choices:
-- docs/catalog-issue-41.md. Replay preserves existing product IDs/properties.

UPDATE garments SET category = 'windbreaker'
WHERE brand = 'Patagonia' AND model_name = 'Houdini Jacket'
  AND category = 'hard_shell';

-- Migration 008 points at a removed SVG; the media route also had the wrong photo.
UPDATE garments SET item_image_url = '/images/items/32-degrees-heat-midweight-crew.jpg'
WHERE brand = '32 Degrees' AND model_name = 'Heat Midweight Crew';

DO $$
DECLARE
  product record;
  garment uuid;
BEGIN
  FOR product IN SELECT * FROM (VALUES
    ('Norrøna', 'Falketind Thermo40 Zip Hood', 'insulation_synthetic', 'helmet_compatible', 320,
      '/images/items/norrona-falketind-thermo40-zip-hood.jpg',
      1.85, 1.60, 1.33, 28.14, 30.19, 21.62, 0.22, 0.45,
      'windproof', 'DWR_only', 4, 6, 8, 7),
    ('Norrøna', 'Senja Alpha90 Hood', 'mid_layer_light', 'attached', 302,
      '/images/items/norrona-senja-alpha90-hood.jpg',
      0.95, 0.80, 0.68, 11.0, 9.0, 7.75, 0.38, 0.35,
      'wind_resistant', 'none', 9, 9, 6, 5),
    ('Avalanche', 'Weather Shield Ski Jacket', 'outer_insulated', 'attached', NULL,
      '/images/items/avalanche-weather-shield-ski-jacket.jpg',
      2.40, 1.60, 1.60, 54.26, 36.80, 36.33, 0.22, 0.65,
      NULL, 'water_resistant', 1, 1, 5, 8),
    ('Icebreaker', 'Shifter Long Sleeve Zip Hood', 'mid_layer_light', 'attached', 298,
      '/images/items/icebreaker-shifter-long-sleeve-zip-hood.jpg',
      0.65, 0.55, 0.46, 14.0, 12.0, 10.0, 0.30, 0.25,
      'none', 'none', 6, 6, 6, 6),
    ('Icebreaker', 'GT260 Quantum Hood', 'mid_layer_light', 'attached', NULL,
      '/images/items/icebreaker-gt260-quantum-hood.jpg',
      0.85, 0.70, 0.60, 18.0, 16.0, 13.0, 0.25, 0.30,
      'none', 'none', 7, 8, 7, 7)
  ) AS p(brand, model, category, hood, weight, image, torso, arms, whole_body,
         recl_torso, recl_arms, recl_whole, evap, uncertainty,
         wind, water, xc, up, down, alpine)
  LOOP
    -- Match both existing brand spellings and case before inserting.
    SELECT id INTO garment FROM garments
    WHERE translate(lower(brand), 'ø', 'o') = translate(lower(product.brand), 'ø', 'o')
      AND lower(model_name) = lower(product.model)
    ORDER BY created_at, id LIMIT 1;

    IF garment IS NULL THEN
      INSERT INTO garments (brand, model_name, category, garment_type,
        covers_torso, covers_arms, covers_legs, covers_head, hood_type,
        weight_grams, usage, coverage_torso, coverage_arms, coverage_legs,
        suitable_activities, brand_logo_url, item_image_url)
      VALUES (product.brand, product.model, product.category::garment_category, 'jacket',
        true, true, false, true, product.hood::hood_type, product.weight,
        'either', 1, 1, 0,
        CASE WHEN product.brand = 'Avalanche' THEN ARRAY['alpine_skiing']
          WHEN product.model IN ('Senja Alpha90 Hood', 'Shifter Long Sleeve Zip Hood', 'GT260 Quantum Hood')
          THEN ARRAY['running', 'xc_skiing', 'ski_touring_uphill', 'ski_touring_downhill', 'alpine_skiing']
          ELSE ARRAY['xc_skiing', 'ski_touring_uphill', 'ski_touring_downhill', 'alpine_skiing'] END,
        CASE product.brand WHEN 'Norrøna' THEN '/media/brands/norrona.png'
          WHEN 'Icebreaker' THEN '/media/brands/icebreaker.png' END, product.image)
      ON CONFLICT (brand, model_name) DO NOTHING
      RETURNING id INTO garment;
      IF garment IS NULL THEN
        SELECT id INTO garment FROM garments WHERE brand = product.brand AND model_name = product.model;
      END IF;
    END IF;

    INSERT INTO garment_thermal_properties (garment_id, rcl_torso, rcl_arms,
      rcl_legs, rcl_whole_body, recl_torso, recl_arms, recl_legs, recl_whole_body,
      evap_potential, estimation_method, confidence_score, data_source,
      uncertainty_clo, generic_estimate)
    VALUES (garment, product.torso, product.arms, 0, product.whole_body,
      product.recl_torso, product.recl_arms, 0, product.recl_whole, product.evap,
      'derived_from_similar', CASE WHEN product.brand = 'Avalanche' THEN 0.3 ELSE 0.4 END,
      'docs/catalog-issue-41.md#thermal-estimates',
      product.uncertainty, true)
    ON CONFLICT (garment_id) DO NOTHING;

    INSERT INTO garment_protection (garment_id, windproof_rating, waterproof_rating,
      data_source, generic_estimate)
    VALUES (garment, product.wind::windproof_rating, product.water::waterproof_rating,
      'docs/catalog-issue-41.md#manufacturer-sources', true)
    ON CONFLICT (garment_id) DO NOTHING;

    INSERT INTO garment_activity_ratings (garment_id, xc_skiing_score,
      ski_touring_uphill_score, ski_touring_downhill_score, alpine_skiing_score, activity_notes)
    VALUES (garment, product.xc, product.up, product.down, product.alpine,
      'Editorial suitability and thermal estimates, not laboratory-tested product data. See docs/catalog-issue-41.md.')
    ON CONFLICT (garment_id) DO NOTHING;

    -- Published Avalanche side vents; no unverified pit-zip claim or cooling factor.
    INSERT INTO garment_ventilation (garment_id, has_pit_zips, has_side_vents, ventilation_factor)
    VALUES (garment, false, product.brand = 'Avalanche', 1.0)
    ON CONFLICT (garment_id) DO NOTHING;

    -- Senja is panelled: do not let the table's 100% default imply that each
    -- material covers the entire jacket. Manufacturer panel fractions are unknown.
    INSERT INTO garment_materials (garment_id, layer_position, material_type, fabric_weight_gsm, coverage_percent)
    SELECT garment, m.position::layer_position, m.material, m.gsm, m.coverage FROM (VALUES
      ('Falketind Thermo40 Zip Hood', 'outer', '20D recycled nylon ripstop', 37, 100),
      ('Falketind Thermo40 Zip Hood', 'insulation', 'thermo40 recycled polyester', 40, 100),
      ('Senja Alpha90 Hood', 'outer', '20D recycled nylon ripstop (front and shoulders)', 49, NULL),
      ('Senja Alpha90 Hood', 'insulation', 'Polartec Alpha 90 polyester', 95, NULL),
      ('Senja Alpha90 Hood', 'outer', 'Polartec Power Grid 85% recycled polyester / 15% elastane (fleece panels)', 166, NULL),
      ('Weather Shield Ski Jacket', 'outer', '100% polyester Weather Shield fabric', NULL, 100),
      ('Weather Shield Ski Jacket', 'insulation', '100% polyester insulation (fill weight unpublished)', NULL, 100),
      ('Weather Shield Ski Jacket', 'lining', '100% polyester lining', NULL, 100),
      ('Shifter Long Sleeve Zip Hood', 'outer', '88% merino wool / 9% nylon / 3% LYCRA unbrushed terry', 200, 100),
      ('Shifter Long Sleeve Zip Hood', 'lining', '100% merino wool hood lining', NULL, NULL),
      ('GT260 Quantum Hood', 'outer', '98% merino wool / 2% Lycra with underarm mesh panels', 260, 100)
    ) AS m(model, position, material, gsm, coverage)
    WHERE m.model = product.model AND NOT EXISTS (
      SELECT 1 FROM garment_materials existing WHERE existing.garment_id = garment
        AND existing.layer_position = m.position::layer_position
        AND existing.material_type = m.material
    );
  END LOOP;
END $$;
