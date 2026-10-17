-- Gear catalog thermal audit, option C (docs/catalog-thermal-audit.md).
-- Checked the live catalog read-only on 2026-10-17 (100 garments). Replaying
-- 001, 002, 006–009, 011 and 022 reproduces its thermal values exactly.
-- No production mutation is performed by preparing this migration.

-- 1. Puffy recalibration: re-derive 14 derived puffies on the lab scale, a
--    fill-weight curve through the two USARIEM T21-03 rows (Nano-Air Hoody,
--    DAS Parka): torso = 0.70 + 0.0522 * fill^0.842 (fill in g/m²), arms at
--    Nano-Air's 0.87 of torso. Ret scales with clo so each garment keeps its
--    permeability index. Fill weights and per-row reasoning are in the audit.
--    A row changes only while it still has the audited torso and arms clo, so a
--    replay, or a value edited by hand since, is left alone.
UPDATE garment_thermal_properties t
SET rcl_torso = v.rcl_torso,
    rcl_arms = v.rcl_arms,
    recl_torso = v.recl_torso,
    recl_arms = v.recl_arms,
    data_source = 'docs/catalog-thermal-audit.md#puffy-recalibration',
    uncertainty_clo = v.uncertainty_clo,
    confidence_score = LEAST(t.confidence_score, v.max_confidence)
FROM garments g,
(VALUES
  ('Patagonia', 'Nano-Air Light Vest', 0.85, 0.00, 1.85, 0.00, 30.47, 0.00, 0.30, 1.00),
  ('Patagonia', 'Macro Puff Hoody', 1.65, 1.45, 3.95, 2.60, 67.03, 44.83, 0.30, 1.00),
  ('Patagonia', 'Micro Puff Hoody', 1.10, 0.95, 2.45, 2.15, 44.55, 40.74, 0.30, 1.00),
  ('Arc''teryx', 'Atom LT Hoody', 1.15, 1.00, 2.35, 2.05, 44.96, 41.00, 0.30, 1.00),
  ('Norrøna', 'Lyngen Down850 Hood Jacket', 2.80, 2.20, 4.45, 3.50, 71.52, 63.64, 0.60, 0.50),
  ('Rab', 'Nebitron Pro Insulated', 2.40, 1.90, 4.70, 2.95, 78.33, 55.89, 0.60, 0.50),
  ('Patagonia', 'Nano-Air Ultralight Full-Zip Hoody', 0.80, 0.60, 1.35, 1.20, 20.25, 20.00, 0.30, 1.00),
  ('Mountain Hardwear', 'Ghost Whisperer/2 Jacket', 1.45, 1.30, 2.55, 2.25, 38.69, 34.62, 0.60, 0.50),
  ('Patagonia', 'DAS Light Hoody', 2.00, 1.60, 2.45, 2.15, 46.55, 45.69, 0.30, 1.00),
  ('The North Face', 'Summit Breithorn Hoodie', 2.60, 2.10, 4.15, 3.35, 67.04, 60.62, 0.60, 0.50),
  ('Rab', 'Neutrino Pro', 3.20, 2.60, 5.50, 3.50, 82.50, 56.54, 0.60, 0.50),
  ('Columbia', 'Powder Lite Vest', 0.95, 0.00, 2.00, 0.00, 33.68, 0.00, 0.60, 0.50),
  ('Helly Hansen', 'Odin Stretch Hooded Light Insulator 2.0', 1.15, 1.00, 2.35, 2.05, 44.96, 41.00, 0.60, 0.50),
  ('Helly Hansen', 'Odin Stretch Hooded Insulator 2.0', 1.55, 1.35, 2.80, 2.45, 50.58, 45.37, 0.60, 0.50)
) AS v(brand, model_name, old_torso, old_arms, rcl_torso, rcl_arms, recl_torso, recl_arms, uncertainty_clo, max_confidence)
WHERE t.garment_id = g.id
  AND g.brand = v.brand AND g.model_name = v.model_name
  AND t.rcl_torso = v.old_torso AND t.rcl_arms = v.old_arms;

-- 2. Whole-body clo and Ret follow REGIONAL_WEIGHTS (0.5 torso, 0.25 arms,
--    0.25 legs; an uncovered region counts as zero), as predictEnsembleThermal
--    computes them. 58 audited rows, each updated only while it is off by
--    more than 0.02 clo or 0.5 m²Pa/W. Regional values are not changed here.
UPDATE garment_thermal_properties t
SET rcl_whole_body = CASE WHEN ABS(t.rcl_whole_body - w.clo) > 0.02 THEN ROUND(w.clo, 2) ELSE t.rcl_whole_body END,
    recl_whole_body = CASE WHEN ABS(t.recl_whole_body - w.ret) > 0.5 THEN ROUND(w.ret, 2) ELSE t.recl_whole_body END
FROM (
  SELECT tp.garment_id,
         0.5 * COALESCE(tp.rcl_torso, 0) + 0.25 * COALESCE(tp.rcl_arms, 0) + 0.25 * COALESCE(tp.rcl_legs, 0) AS clo,
         0.5 * COALESCE(tp.recl_torso, 0) + 0.25 * COALESCE(tp.recl_arms, 0) + 0.25 * COALESCE(tp.recl_legs, 0) AS ret
  FROM garment_thermal_properties tp
  JOIN garments g ON g.id = tp.garment_id
  JOIN (VALUES
    ('Patagonia', 'R1 TechFace Jacket'),
    ('Patagonia', 'Snowdrifter Bibs'),
    ('Patagonia', 'Snowdrifter Jacket'),
    ('Patagonia', 'Nano-Air Light Vest'),
    ('Patagonia', 'Macro Puff Hoody'),
    ('Patagonia', 'Micro Puff Hoody'),
    ('Patagonia', 'Houdini Jacket'),
    ('Norrøna', 'Lofoten Gore-Tex Insulated Jacket'),
    ('32 Degrees', 'Heat Lightweight Crew'),
    ('Arc''teryx', 'Gamma MX Hoody'),
    ('Arc''teryx', 'Beta AR Jacket'),
    ('Arc''teryx', 'Atom LT Hoody'),
    ('Outdoor Research', 'Helium Rain Jacket'),
    ('Smartwool', 'Merino 250 Base Layer Crew'),
    ('Helly Hansen', 'Lifa Active Crew'),
    ('Helly Hansen', 'Alpha 4.0 Insulated Jacket'),
    ('Helly Hansen', 'Alpha Infinity Insulated Jacket'),
    ('Patagonia', 'Capilene Midweight'),
    ('Patagonia', 'R1 Air Full-Zip Hoody'),
    ('Patagonia', 'DAS Parka'),
    ('Norrøna', 'Lyngen Down850 Hood Jacket'),
    ('Norrøna', 'Trollveggen Thermal Pro Jacket'),
    ('Arc''teryx', 'Gamma Hoody'),
    ('Icebreaker', 'Merino 260 Tech Long Sleeve Half-Zip'),
    ('Icebreaker', 'Merino 200 Oasis Long Sleeve Half-Zip'),
    ('Rab', 'Nebitron Pro Insulated'),
    ('Patagonia', 'Nano-Air Ultralight Full-Zip Hoody'),
    ('Mountain Hardwear', 'Ghost Whisperer/2 Jacket'),
    ('Mountain Hardwear', 'Firefall/2 Insulated Jacket'),
    ('Mountain Hardwear', 'Stretch Ozonic Insulated Jacket'),
    ('Columbia', 'Joy Peak Lite Hooded Jacket'),
    ('Patagonia', 'DAS Light Hoody'),
    ('Under Armour', 'ColdGear Base 2.0 Crew'),
    ('The North Face', 'Summit Breithorn Hoodie'),
    ('Rab', 'Neutrino Pro'),
    ('Helly Hansen', 'Alpha LifaLoft Jacket'),
    ('Obermeyer', 'Raze Jacket'),
    ('Outdoor Research', 'Ferrosi Hoodie'),
    ('Fjallraven', 'Övik Fleece Half Zip'),
    ('Columbia', 'Powder Lite Hooded Jacket'),
    ('Columbia', 'Powder Lite Vest'),
    ('Columbia', 'Bugaboo IV Interchange Jacket'),
    ('Columbia', 'Silver Ridge Base Layer Crew'),
    ('Spyder', 'Leader Insulated Jacket'),
    ('Spyder', 'Challenger Insulated Jacket'),
    ('Spyder', 'Dare Base Layer Crew'),
    ('Spyder', 'Sentinel Gore-Tex Pant'),
    ('Patagonia', 'Jackson Glacier Parka'),
    ('Outdoor Research', 'Snowcrew Jacket'),
    ('Outdoor Research', 'Carbide Jacket'),
    ('Helly Hansen', 'Lifa Merino Midweight Crew'),
    ('Helly Hansen', 'Varde Fleece Jacket 2.0'),
    ('Helly Hansen', 'Odin Stretch Hooded Light Insulator 2.0'),
    ('Helly Hansen', 'Odin Stretch Hooded Insulator 2.0'),
    ('Lululemon', 'Pace Breaker Jacket'),
    ('Patagonia', 'R1 Pullover'),
    ('32 Degrees', 'Heat Midweight Crew'),
    ('Patagonia', 'Nano-Air Hoody')
  ) AS a(brand, model_name) ON a.brand = g.brand AND a.model_name = g.model_name
) w
WHERE t.garment_id = w.garment_id
  AND (ABS(t.rcl_whole_body - w.clo) > 0.02 OR ABS(t.recl_whole_body - w.ret) > 0.5);
