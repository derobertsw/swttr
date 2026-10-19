-- Gear catalog thermal calibration, part 2 (docs/catalog-thermal-calibration.md).
-- Puts shells, soft shells and insulated outerwear on the USARIEM T21-03
-- single-garment scale that base layers, fleece and (since 035) puffies use,
-- fixes the Snowdrifter category, and corrects the seeded T21-03 reference
-- rows. Checked against the live catalog read-only on 2026-10-18 (116
-- garments, 035 applied); replaying 001–035 reproduces its thermal values.
-- No production mutation is performed by preparing this migration.

-- 1. Outerwear on the T21-03 scale, 48 rows. Rules (the doc has each row's basis):
--    - hard-shell jackets 0.75 / 0.60 clo torso / arms, the mean of T21-03's four
--      thin outer shells; hard-shell pants and bibs 0.65 legs, the mean of its
--      three membrane trousers. Shell Ret is kept: it already sits on T21-03's band.
--    - soft-shell jackets raised to their T21-03 analogue where below it.
--    - insulated jackets: torso 0.75 + inc(body fill), arms 0.60 + 0.87 inc(sleeve
--      fill), inc(f) = 0.0522 f^0.842 (035's curve); insulated pants: legs 0.65 +
--      0.70 inc(fill), between T21-03's Nano-Air Bottom and DAS Pants. Ret
--      scales with clo, keeping each garment's permeability index.
--    - 035's puffy vests x 2.00 / 2.34, T21-03's Nano-Air Vest over its Hoody.
--    Whole-body values follow the 0.5 / 0.25 / 0.25 weights. A row changes only
--    while every field this step replaces still has its 2026-10-18 value, so a
--    replay, or a value edited by hand since, is left alone.
UPDATE garment_thermal_properties t
SET rcl_torso = v.rcl_torso,
    rcl_arms = v.rcl_arms,
    rcl_legs = v.rcl_legs,
    recl_torso = v.recl_torso,
    recl_arms = v.recl_arms,
    recl_legs = v.recl_legs,
    rcl_whole_body = v.rcl_whole_body,
    recl_whole_body = v.recl_whole_body,
    confidence_score = v.confidence_score,
    uncertainty_clo = v.uncertainty_clo,
    data_source = v.data_source
FROM garments g,
(VALUES
  ('Patagonia', 'Insulated Powder Bowl Pants - Regular', 0.00, 0.00, 1.10, 0.00, 0.00, 40.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.00, 0.00, 1.80, 0.00, 0.00, 65.45, 0.45, 16.36, 0.70, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Patagonia', 'R1 TechFace Jacket', 0.65, 0.55, 0.00, 18.00, 16.00, 0.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 1.05, 0.85, 0.00, 18.00, 16.00, 0.00, 0.74, 13.00, 0.70, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Patagonia', 'Snowdrifter Bibs', 0.60, 0.00, 1.20, 28.00, 0.00, 32.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.35, 0.00, 0.65, 28.00, 0.00, 32.00, 0.34, 22.00, 0.70, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Patagonia', 'Snowdrifter Jacket', 1.35, 1.15, 0.00, 30.00, 28.00, 0.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 30.00, 28.00, 0.00, 0.53, 22.00, 0.70, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Patagonia', 'Nano-Air Light Vest', 1.85, 0.00, 0.00, 30.47, 0.00, 0.00, 0.75, 0.30, 'e924248933cd8135ecd57aeddf0430e1', 1.60, 0.00, 0.00, 26.35, 0.00, 0.00, 0.80, 13.18, 0.75, 0.30, 'docs/catalog-thermal-audit.md#puffy-recalibration ; 036: x T21-03 Nano-Air Vest/Hoody (2.00/2.34); see docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Patagonia', 'Houdini Jacket', 0.15, 0.12, 0.00, 8.00, 6.00, 0.00, 0.80, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 8.00, 6.00, 0.00, 0.53, 5.50, 0.80, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Norrøna', 'Lofoten Gore-Tex Insulated Jacket', 1.80, 1.30, 0.00, 42.00, 38.00, 0.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 2.15, 2.05, 0.00, 50.17, 59.92, 0.00, 1.59, 40.07, 0.70, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Norrøna', 'Lofoten Gore-Tex Insulated Pants', 0.00, 0.00, 1.40, 0.00, 0.00, 35.00, 0.65, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.00, 0.00, 1.45, 0.00, 0.00, 36.25, 0.36, 9.06, 0.65, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Arc''teryx', 'Beta AR Jacket', 0.25, 0.20, 0.00, 30.00, 28.00, 0.00, 0.80, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 30.00, 28.00, 0.00, 0.53, 22.00, 0.80, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Arc''teryx', 'Alpha FL Jacket', 0.15, 0.12, 0.00, 22.00, 20.00, 0.00, 0.75, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 22.00, 20.00, 0.00, 0.53, 16.00, 0.75, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Outdoor Research', 'Helium Rain Jacket', 0.12, 0.10, 0.00, 40.00, 35.00, 0.00, 0.65, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 40.00, 35.00, 0.00, 0.53, 28.75, 0.65, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Helly Hansen', 'Alpha 4.0 Insulated Jacket', 1.50, 1.25, 0.00, 36.00, 32.00, 0.00, 0.65, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 2.85, 2.05, 0.00, 68.40, 52.48, 0.00, 1.94, 47.32, 0.65, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Helly Hansen', 'Alpha Infinity Insulated Jacket', 1.45, 1.20, 0.00, 34.00, 30.00, 0.00, 0.60, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 2.85, 2.05, 0.00, 66.83, 51.25, 0.00, 1.94, 46.23, 0.50, 0.60, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Norrøna', 'Trollveggen Gore-Tex Pro Light Jacket', 0.20, 0.15, 0.00, 28.00, 26.00, 0.00, 0.80, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 28.00, 26.00, 0.00, 0.53, 20.50, 0.80, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Norrøna', 'Trollveggen Gore-Tex Pro Jacket', 0.28, 0.22, 0.00, 32.00, 30.00, 0.00, 0.75, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 32.00, 30.00, 0.00, 0.53, 23.50, 0.75, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Patagonia', 'Upstride Jacket', 0.65, 0.55, 0.00, 14.00, 12.00, 0.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 1.05, 0.85, 0.00, 14.00, 12.00, 0.00, 0.74, 10.00, 0.70, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Arc''teryx', 'Rush Jacket', 0.22, 0.18, 0.00, 28.00, 26.00, 0.00, 0.75, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 28.00, 26.00, 0.00, 0.53, 20.50, 0.75, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Arc''teryx', 'Sabre Pant', 0.00, 0.00, 0.25, 0.00, 0.00, 26.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.00, 0.00, 0.65, 0.00, 0.00, 26.00, 0.16, 6.50, 0.70, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Mountain Hardwear', 'Firefall/2 Insulated Jacket', 1.50, 1.30, 0.00, 35.00, 32.00, 0.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 3.25, 2.40, 0.00, 75.83, 59.08, 0.00, 2.23, 52.69, 0.70, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Mountain Hardwear', 'Stretch Ozonic Insulated Jacket', 1.20, 1.05, 0.00, 30.00, 28.00, 0.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 3.25, 2.40, 0.00, 81.25, 64.00, 0.00, 2.23, 56.63, 0.70, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Columbia', 'Joy Peak Lite Hooded Jacket', 1.15, 1.00, 0.00, 26.00, 23.00, 0.00, 0.60, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 2.40, 1.60, 0.00, 54.26, 36.80, 0.00, 1.60, 36.33, 0.50, 0.60, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Helly Hansen', 'Alpha LifaLoft Jacket', 1.80, 1.40, 0.00, 40.00, 35.00, 0.00, 0.65, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 2.85, 2.05, 0.00, 63.33, 51.25, 0.00, 1.94, 44.48, 0.50, 0.60, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Obermeyer', 'Raze Jacket', 1.40, 1.00, 0.00, 36.00, 30.00, 0.00, 0.60, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 2.40, 1.60, 0.00, 61.71, 48.00, 0.00, 1.60, 42.86, 0.60, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Outdoor Research', 'Ferrosi Hoodie', 0.55, 0.48, 0.00, 12.00, 10.00, 0.00, 0.75, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.70, 0.55, 0.00, 12.00, 10.00, 0.00, 0.49, 8.50, 0.75, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Columbia', 'Powder Lite Hooded Jacket', 1.25, 1.05, 0.00, 28.00, 25.00, 0.00, 0.65, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 2.40, 1.60, 0.00, 53.76, 38.10, 0.00, 1.60, 36.41, 0.50, 0.60, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Columbia', 'Powder Lite Vest', 2.00, 0.00, 0.00, 33.68, 0.00, 0.00, 0.50, 0.60, 'e924248933cd8135ecd57aeddf0430e1', 1.70, 0.00, 0.00, 28.63, 0.00, 0.00, 0.85, 14.32, 0.50, 0.60, 'docs/catalog-thermal-audit.md#puffy-recalibration ; 036: x T21-03 Nano-Air Vest/Hoody (2.00/2.34); see docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Columbia', 'Bugaboo IV Interchange Jacket', 1.50, 1.25, 0.00, 35.00, 32.00, 0.00, 0.60, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 1.50, 1.55, 0.00, 35.00, 39.68, 0.00, 1.14, 27.42, 0.60, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Spyder', 'Leader Insulated Jacket', 1.55, 1.30, 0.00, 35.00, 32.00, 0.00, 0.65, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 3.25, 2.40, 0.00, 73.39, 59.08, 0.00, 2.23, 51.47, 0.65, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Spyder', 'Challenger Insulated Jacket', 1.20, 1.05, 0.00, 28.00, 25.00, 0.00, 0.65, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 2.85, 2.05, 0.00, 66.50, 48.81, 0.00, 1.94, 45.45, 0.50, 0.60, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Spyder', 'Sentinel Gore-Tex Pant', 0.00, 0.00, 0.20, 0.00, 0.00, 28.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.00, 0.00, 0.65, 0.00, 0.00, 28.00, 0.16, 7.00, 0.70, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Patagonia', 'Jackson Glacier Parka', 2.20, 1.80, 0.00, 45.00, 40.00, 0.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 3.25, 2.40, 0.00, 66.48, 53.33, 0.00, 2.23, 46.57, 0.50, 0.60, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('FP Movement', 'Lift Love Jacket', 1.15, 0.95, 0.00, 30.00, 27.00, 0.00, 0.45, 0.35, 'de5e0c2f652b355a85c7b1542c5fe425', 2.40, 1.60, 0.00, 62.61, 45.47, 0.00, 1.60, 42.67, 0.45, 0.60, 'https://www.freepeople.com/fpmovement/shop/lift-love-jacket/ (fabric content, features, 8 reviews read 2026-10-17; no fill weight published); analogues: Columbia Joy Peak Lite Hooded Jacket, Spyder Challenger Insulated Jacket, Mountain Hardwear Stretch Ozonic Insulated Jacket ; 036: T21-03 shell + fill increment: PrimaLoft, weight unstated; "lightly insulated" assumed 60/40; see docs/catalog-thermal-calibration.md#per-garment-values'),
  ('FP Movement', 'Lift Love Bib', 0.30, 0.00, 0.95, 18.00, 0.00, 32.00, 0.45, 0.30, '02ab2ebf6c60d17a56eeec5fc3210ee0', 0.45, 0.00, 1.45, 27.47, 0.00, 48.84, 0.59, 25.95, 0.45, 0.60, 'https://www.freepeople.com/fpmovement/shop/lift-love-bib/ (fabric content, features, 10 reviews read 2026-10-17; no fill weight published); analogues: Helly Hansen Legendary Insulated Ski Pants, Patagonia Insulated Powder Bowl Pants, Patagonia Snowdrifter Bibs, Helly Hansen Sogn Bib Shell Pants ; 036: T21-03 trousers + fill increment: weight unstated; "lightly insulated" assumed 40; see docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Columbia', 'Bugaboo II Pants', 0.00, 0.00, 1.15, 0.00, 0.00, 38.00, 0.60, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.00, 0.00, 1.80, 0.00, 0.00, 59.48, 0.45, 14.87, 0.60, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Patagonia', 'PowSlayer Pants', 0.00, 0.00, 0.22, 0.00, 0.00, 28.00, 0.75, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.00, 0.00, 0.65, 0.00, 0.00, 28.00, 0.16, 7.00, 0.75, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Outdoor Research', 'Snowcrew Jacket', 1.60, 1.20, 0.00, 38.00, 32.00, 0.00, 0.65, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 2.85, 2.05, 0.00, 67.69, 54.67, 0.00, 1.94, 47.51, 0.65, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Outdoor Research', 'Carbide Jacket', 0.20, 0.16, 0.00, 25.00, 22.00, 0.00, 0.75, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 25.00, 22.00, 0.00, 0.53, 18.00, 0.75, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Outdoor Research', 'Carbide Bibs', 0.00, 0.00, 0.22, 0.00, 0.00, 25.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.00, 0.00, 0.65, 0.00, 0.00, 25.00, 0.16, 6.25, 0.70, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Helly Hansen', 'Sogn Shell 2.0 Jacket', 0.22, 0.18, 0.00, 28.00, 26.00, 0.00, 0.70, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 28.00, 26.00, 0.00, 0.53, 20.50, 0.70, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Helly Hansen', 'Swift 3L Shell Jacket', 0.25, 0.20, 0.00, 30.00, 28.00, 0.00, 0.65, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 30.00, 28.00, 0.00, 0.53, 22.00, 0.65, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Helly Hansen', 'Sogn Bib Shell Pants', 0.15, 0.00, 0.22, 26.00, 0.00, 28.00, 0.65, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.45, 0.00, 0.65, 26.00, 0.00, 28.00, 0.39, 20.00, 0.65, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Helly Hansen', 'Legendary Insulated Ski Pants', 0.00, 0.00, 1.00, 0.00, 0.00, 32.00, 0.65, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.00, 0.00, 1.80, 0.00, 0.00, 57.60, 0.45, 14.40, 0.65, 0.30, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Norrøna', 'Lofoten Gore-Tex Pro Jacket', 0.18, 0.15, 0.00, 26.00, 24.00, 0.00, 0.75, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.75, 0.60, 0.00, 26.00, 24.00, 0.00, 0.53, 19.00, 0.75, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Lululemon', 'Pace Breaker Jacket', 0.20, 0.18, 0.00, 12.00, 10.00, 0.00, 0.60, NULL::numeric, 'd41d8cd98f00b204e9800998ecf8427e', 0.70, 0.55, 0.00, 12.00, 10.00, 0.00, 0.49, 8.50, 0.60, 0.15, 'docs/catalog-thermal-calibration.md#per-garment-values'),
  ('FP Movement', 'Happy Trails Poncho', 2.00, 0.38, 0.00, 37.89, 8.42, 0.00, 0.40, 0.60, '53b5430e312eb5ce63a823ddae340604', 1.70, 0.30, 0.00, 32.21, 6.65, 0.00, 0.93, 17.77, 0.40, 0.60, 'https://www.freepeople.com/fpmovement/shop/happy-trails-poncho/ ; analogues: Columbia Powder Lite Vest (torso 0.95, Ret 16); Patagonia Micro Puff Hoody (1.10/0.95, Ret 20/18); Patagonia Nano-Air Hoody (lab 2.34/2.04). ; Vest is the nearest supported type for this short-sleeved poncho; arm clo already includes partial coverage. The peer estimate is 0.95 torso clo; a hypothetical equal-fill Nano-Air scaling gives about 2.0 (0.35 + (2.34 - 0.35) * (0.95 - 0.35) / (1.10 - 0.35)). Fill mass is unknown, so this is a sensitivity check, not a material calculation. Uncertainty spans the catalog scale gap. Restricted to alpine catalog use because loose open armholes are unsuitable for high-output selection. ; 035: recalibrated to the lab scale with its peer Columbia Powder Lite Vest (torso 0.95 -> 2.00, clo and Ret x2.105); see docs/catalog-thermal-audit.md#puffy-recalibration ; 036: x T21-03 Nano-Air Vest/Hoody (2.00/2.34); see docs/catalog-thermal-calibration.md#per-garment-values'),
  ('FP Movement', 'Care FP On The Ascend Insulated Jacket', 1.50, 1.25, 0.00, 35.00, 32.00, 0.00, 0.45, 0.50, '71da45fc806aa46b490fa36d4f898baa', 3.25, 2.40, 0.00, 75.83, 61.44, 0.00, 2.23, 53.28, 0.45, 0.60, 'https://www.freepeople.com/fpmovement/shop/care-fp-on-the-ascend-insulated-jacket/ ; analogues: FP Movement Lift Love Jacket (1.15/0.95, Ret 30/27); Obermeyer Raze Jacket (1.40/1.00, Ret 36/30); Mountain Hardwear Firefall/2 Insulated Jacket (1.50/1.30, Ret 35/32). ; Brand heavier-fill warmth tier places this above Lift Love and near Firefall/2; no exact fill ratio is claimed. Water resistance only pending sealed-seam verification; no invented waterproof mm or membrane. ; 036: T21-03 shell + fill increment: PrimaLoft, weight unstated; seeded near Firefall/2, assumed 100/80; see docs/catalog-thermal-calibration.md#per-garment-values'),
  ('FP Movement', 'Downhill Diva Suit', 1.25, 1.05, 0.75, 30.00, 27.00, 18.00, 0.45, 0.40, 'df288eb2ceb7c032c4f57c4e8c42daed', 2.40, 1.60, 0.75, 57.60, 41.14, 18.00, 1.79, 43.59, 0.45, 0.60, 'https://www.freepeople.com/fpmovement/shop/downhill-diva-suit/ ; analogues: Columbia Powder Lite Hooded Jacket (1.25/1.05, Ret 28/25); FP Movement Lift Love Jacket (1.15/0.95, Ret 30/27); Norrøna Falketind Flex1 Pants (legs 0.85, Ret 18). ; Torso/arms estimated as a light insulated resort top, legs separately as stretch softshell. The 5k/5k fabric claim is not a garment waterproof certification: waterproof_mm remains NULL. Alpine-only allow-list avoids builders without one-piece handling. ; 036: T21-03 shell + fill increment: puffer top, weight unstated; assumed 60/40; stretch legs keep 0.75 (T21-03 soft-shell trousers); see docs/catalog-thermal-calibration.md#per-garment-values'),
  ('Rossignol', 'Insulated Ski Pants', 0.00, 0.00, 0.90, 0.00, 0.00, 30.00, 0.65, 0.25, '5b15de23bff08b302a18c2948841f10d', 0.00, 0.00, 1.45, 0.00, 0.00, 48.33, 0.36, 12.08, 0.50, 0.60, 'https://www.freepeople.com/fpmovement/shop/rossignol-insulated-ski-pants/ ; https://www.rossignol.com/us-en/womens-insulated-ski-pants-regular-length-RLOWP05715.html ; analogues: Helly Hansen Legendary Insulated Ski Pants (legs 1.00, Ret 32); Patagonia Insulated Powder Bowl Pants - Regular (1.10, Ret 40); Columbia Bugaboo II Pants (1.15, Ret 38). ; Light insulated pant estimated just below Legendary. Waterproof classification is independently supported by retailer full taping. Leave mm, MVTR and exact insulation gsm NULL because the retailer-to-maker SKU match is unconfirmed; 20k/20k and 40g are family context only. ; 036: T21-03 trousers + fill increment: Rossignol Insulated Ski Pant family 40 g PrimaLoft; SKU match unconfirmed; see docs/catalog-thermal-calibration.md#per-garment-values')
) AS v(brand, model_name,
  old_torso, old_arms, old_legs, old_recl_torso, old_recl_arms, old_recl_legs, old_confidence, old_uncertainty, old_source_md5,
  rcl_torso, rcl_arms, rcl_legs, recl_torso, recl_arms, recl_legs, rcl_whole_body, recl_whole_body,
  confidence_score, uncertainty_clo, data_source)
WHERE t.garment_id = g.id
  AND g.brand = v.brand AND g.model_name = v.model_name
  AND t.rcl_torso IS NOT DISTINCT FROM v.old_torso AND t.rcl_arms IS NOT DISTINCT FROM v.old_arms
  AND t.rcl_legs IS NOT DISTINCT FROM v.old_legs
  AND t.recl_torso IS NOT DISTINCT FROM v.old_recl_torso AND t.recl_arms IS NOT DISTINCT FROM v.old_recl_arms
  AND t.recl_legs IS NOT DISTINCT FROM v.old_recl_legs
  AND t.confidence_score IS NOT DISTINCT FROM v.old_confidence
  AND t.uncertainty_clo IS NOT DISTINCT FROM v.old_uncertainty
  AND md5(COALESCE(t.data_source, '')) = v.old_source_md5;

-- 2. Patagonia Snowdrifter Jacket and Bibs are uninsulated 3L H2No shells
--    (Switchback, GearJunkie, Blister, evo). 002 seeded them as insulated, with
--    "60g insulation" in the notes and insulated-garment weights.
UPDATE garments g
SET category = 'hard_shell', weight_grams = v.weight_grams
FROM (VALUES
  ('Patagonia', 'Snowdrifter Jacket', 780, 615),
  ('Patagonia', 'Snowdrifter Bibs', 850, 584)
) AS v(brand, model_name, old_weight, weight_grams)
WHERE g.brand = v.brand AND g.model_name = v.model_name
  AND g.category = 'outer_insulated' AND g.weight_grams = v.old_weight;

UPDATE garment_activity_ratings a
SET activity_notes = v.activity_notes
FROM garments g,
(VALUES
  ('Patagonia', 'Snowdrifter Jacket', 'c449098ac3e45b0cbe1c6d14af37b225', 'Uninsulated 3-layer H2No stretch shell with a knit backer, for backcountry and resort skiing. Helmet-compatible hood and pit zips.'),
  ('Patagonia', 'Snowdrifter Bibs', 'c0c443d231a00a34f683e4d5156d0d54', 'Uninsulated 3-layer H2No shell bibs for backcountry and resort descents. Thigh vents for temperature regulation.')
) AS v(brand, model_name, old_notes_md5, activity_notes)
WHERE a.garment_id = g.id
  AND g.brand = v.brand AND g.model_name = v.model_name
  AND md5(COALESCE(a.activity_notes, '')) = v.old_notes_md5;

-- 3. Seeded T21-03 reference rows that differ from the report (Tables 4, 5, 7,
--    9, 10 and 12, hood down). No code reads this table.
UPDATE calibration_reference c
SET measured_rcl_torso = v.rcl_torso,
    measured_rcl_arm = v.rcl_arm,
    measured_recl_torso = v.recl_torso,
    measured_recl_arm = v.recl_arm
FROM (VALUES
  ('SOF Lightweight Crew (Base Layer)', 0.55, 0.34, 12.32, 12.15, 0.59, 0.43, 12.32, 12.39),
  ('ECWCS Lightweight Undershirt', 0.55, 0.36, 9.86, 9.41, 0.55, 0.41, 9.86, 6.52),
  ('ECWCS Midweight Shirt', 0.69, 0.55, 12.96, 13.18, 0.69, 0.68, 12.96, 13.33),
  ('ECWCS Fleece Jacket', 1.05, 0.94, 14.20, 14.63, 1.05, 1.32, 14.20, 21.70),
  ('CAF CADPAT IECS Parka', 4.68, 3.20, 82.49, 68.31, 4.68, 3.03, 78.51, 80.69),
  ('ECWCS ECW Parka', 3.69, 2.38, 75.60, 60.53, 3.69, 2.94, 65.91, 65.41)
) AS v(garment_description, old_rcl_torso, old_rcl_arm, old_recl_torso, old_recl_arm, rcl_torso, rcl_arm, recl_torso, recl_arm)
WHERE c.source_report = 'USARIEM T21-03' AND c.garment_description = v.garment_description
  AND c.measured_rcl_torso = v.old_rcl_torso AND c.measured_rcl_arm = v.old_rcl_arm
  AND c.measured_recl_torso = v.old_recl_torso AND c.measured_recl_arm = v.old_recl_arm;
