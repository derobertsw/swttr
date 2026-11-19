-- #376: hand and head accessories on the part-manikin clo scale
-- (docs/catalog-accessory-clo.md).
--
-- Scale: effective insulation, the total insulation an item gives a thermal
-- hand or head manikin (ASTM F1291 conditions: 20°C, 0.4 m/s) minus the bare
-- manikin's boundary air layer. Anchors: USARIEM T18-01 (2018) Tables 7 and 8
-- (USMC glove insert, mitten liner and shell, microfleece cap, lightweight
-- balaclava) and USARIEM T22-14 (2022) Table 3 (Army extreme cold weather and
-- trigger-finger mitten sets, cap and balaclava). Garments (035, 036) use
-- T21-03's intrinsic clo; for head and hand items USARIEM itself uses a
-- clothing area factor of 1, which makes the two the same quantity.
--
-- Every analogue sits at 0.50-0.78 x the catalog's estimate for hands and
-- 0.40-0.50 x for head items, and the spread is within the analogues' own
-- rounding (0.01 m2K/W, about 0.065 clo) and product differences. So each
-- part takes one factor, the mean of its anchors: hands 0.60, head 0.45. The
-- catalog's relative estimates within a part are kept. The local hand and
-- head bands carry the same factors in code (ACCESSORY_CLO_SCALE), so
-- selection does not move; apply this before deploying that code.
--
-- Checked against the live catalog read-only on 2026-11-19 (28 handwear,
-- 41 headwear rows; no row has been edited since its seed). A row changes
-- only while it still has its seeded rcl_clo and no data_source, so a replay,
-- or a value edited by hand since, is left alone.
-- No production mutation is performed by preparing this migration.

-- 1. Provenance columns, as garment_thermal_properties has.
ALTER TABLE handwear
  ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS uncertainty_clo DECIMAL(3,2) CHECK (uncertainty_clo >= 0),
  ADD COLUMN IF NOT EXISTS data_source TEXT;
ALTER TABLE headwear
  ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS uncertainty_clo DECIMAL(3,2) CHECK (uncertainty_clo >= 0),
  ADD COLUMN IF NOT EXISTS data_source TEXT;

COMMENT ON COLUMN handwear.rcl_clo IS
  'Effective clo on a thermal hand manikin: total insulation minus the bare hand''s air layer (docs/catalog-accessory-clo.md).';
COMMENT ON COLUMN headwear.rcl_clo IS
  'Effective clo on a thermal head manikin: total insulation minus the bare head''s air layer (docs/catalog-accessory-clo.md).';

-- 2. Handwear x 0.60. Confidence and uncertainty by basis: a direct analogue
--    (liners, lobster mitts, mittens) 0.6 and 25 %; bracketed between
--    analogues (light and insulated gloves, the light Venta Mitten) 0.5 and
--    35 %; shell overmittens 0.4 and 1.0 clo, because T18-01 measured a mitten
--    shell worn alone at 1.48, far above this estimate (unresolved, see the doc).
--    Uncertainty is never below 0.07 clo, the analogues' rounding.
UPDATE handwear h
SET rcl_clo = v.rcl_clo,
    confidence_score = v.confidence_score,
    uncertainty_clo = v.uncertainty_clo,
    data_source = 'docs/catalog-accessory-clo.md#per-item-values',
    updated_at = NOW()
FROM (VALUES
  ('Hestra', 'All Mountain CZone', 1.50, 0.90, 0.50, 0.32),
  ('Helly Hansen', 'Swift HT Gloves', 1.50, 0.90, 0.50, 0.32),
  ('Hestra', 'Ergo Grip Active', 1.60, 0.96, 0.50, 0.34),
  ('Outdoor Research', 'Adrenaline 3-in-1 Gloves', 1.80, 1.08, 0.50, 0.38),
  ('Hestra', 'Freeride', 1.80, 1.08, 0.50, 0.38),
  ('Hestra', 'Fall Line', 2.00, 1.20, 0.50, 0.42),
  ('Hestra', 'Army Leather Heli Ski', 2.10, 1.26, 0.50, 0.44),
  ('Black Diamond', 'Guide Glove', 2.20, 1.32, 0.50, 0.46),
  ('Arc''teryx', 'Fission SV Gloves', 2.70, 1.62, 0.50, 0.57),
  ('Outdoor Research', 'Flurry Sensor Gloves', 0.85, 0.51, 0.50, 0.18),
  ('Outdoor Research', 'Vigor Lightweight', 0.90, 0.54, 0.50, 0.19),
  ('Norrøna', 'falketind dri short Gloves', 1.00, 0.60, 0.50, 0.21),
  ('Black Diamond', 'Midweight Softshell', 1.00, 0.60, 0.50, 0.21),
  ('Outdoor Research', 'Stormtracker Sensor Gloves', 1.10, 0.66, 0.50, 0.23),
  ('Arc''teryx', 'Venta Glove', 1.20, 0.72, 0.50, 0.25),
  ('Patagonia', 'Capilene Midweight Liner Glove', 0.45, 0.27, 0.60, 0.07),
  ('Smartwool', 'Liner Glove', 0.50, 0.30, 0.60, 0.08),
  ('Black Diamond', 'Lightweight Screentap', 0.55, 0.33, 0.60, 0.08),
  ('HEAD', 'Ultrafit Multi-Sport Running Gloves', 0.60, 0.36, 0.60, 0.09),
  ('Hestra', 'Army Leather Heli 3-Finger', 2.80, 1.68, 0.60, 0.42),
  ('Black Diamond', 'Guide Finger', 3.00, 1.80, 0.60, 0.45),
  ('Arc''teryx', 'Venta Mitten', 1.80, 1.08, 0.50, 0.38),
  ('Hestra', 'Leather Box Mitt', 3.20, 1.92, 0.60, 0.48),
  ('Black Diamond', 'Mercury Mitt System', 3.50, 2.10, 0.60, 0.53),
  ('Black Diamond', 'Mercury Mitt', 3.50, 2.10, 0.60, 0.53),
  ('Outdoor Research', 'Alti Mitt', 4.00, 2.40, 0.60, 0.60),
  ('Outdoor Research', 'Firebrand Mitt', 0.80, 0.48, 0.40, 1.00),
  ('Black Diamond', 'Mercury Mitt Shell', 0.90, 0.54, 0.40, 1.00)
) AS v(brand, model_name, old_rcl_clo, rcl_clo, confidence_score, uncertainty_clo)
WHERE h.brand = v.brand AND h.model_name = v.model_name
  AND h.rcl_clo = v.old_rcl_clo AND h.data_source IS NULL;

-- 3. Headwear x 0.45. Direct analogues (midweight beanies, light balaclavas)
--    0.6 and 25 %; bracketed (liner and heavy beanies, heavy balaclavas, and
--    bike helmets, which a 2015 head-manikin study puts at 0-0.15 clo) 0.5 and
--    35 % (bike helmets 0.07 clo); no manikin data (neck pieces, the headband,
--    the face scarf and ski helmets) 0.4 and 50 %.
UPDATE headwear h
SET rcl_clo = v.rcl_clo,
    confidence_score = v.confidence_score,
    uncertainty_clo = v.uncertainty_clo,
    data_source = 'docs/catalog-accessory-clo.md#per-item-values',
    updated_at = NOW()
FROM (VALUES
  ('BlackStrap', 'Expedition Hood Balaclava', 1.40, 0.63, 0.50, 0.22),
  ('Outdoor Research', 'Ninjaclava', 1.50, 0.68, 0.50, 0.24),
  ('Patagonia', 'Merino Air Balaclava', 0.75, 0.34, 0.60, 0.09),
  ('Smartwool', 'Merino 250 Balaclava', 0.80, 0.36, 0.60, 0.09),
  ('Giro', 'Syntax MIPS', 0.20, 0.09, 0.50, 0.07),
  ('Smith', 'Signal MIPS', 0.20, 0.09, 0.50, 0.07),
  ('Specialized', 'Align II MIPS', 0.20, 0.09, 0.50, 0.07),
  ('Smartwool', 'Thermal Merino Reversible Neck Gaiter', 0.55, 0.25, 0.40, 0.13),
  ('Turtle Fur', 'Original Fleece Neck Gaiter', 0.60, 0.27, 0.40, 0.14),
  ('Buff', 'Thermonet', 0.60, 0.27, 0.40, 0.14),
  ('Smartwool', 'Merino 250 Neck Gaiter', 0.65, 0.29, 0.40, 0.15),
  ('Buff', 'Original', 0.30, 0.14, 0.40, 0.07),
  ('Smartwool', 'Merino 150 Neck Gaiter', 0.35, 0.16, 0.40, 0.08),
  ('Seirus', 'Neofleece Combo Scarf', 0.90, 0.41, 0.40, 0.21),
  ('Patagonia', 'Capilene Cool Daily Headband', 0.30, 0.14, 0.40, 0.07),
  ('Smartwool', 'Cozy Cabin Hat', 1.10, 0.50, 0.50, 0.18),
  ('Patagonia', 'Capilene Cool Daily Beanie', 0.45, 0.20, 0.50, 0.07),
  ('Smartwool', 'Merino 150 Beanie', 0.50, 0.23, 0.50, 0.08),
  ('Arc''teryx', 'Rho LTW Beanie', 0.70, 0.32, 0.60, 0.08),
  ('Patagonia', 'Brodeo Beanie', 0.80, 0.36, 0.60, 0.09),
  ('Smartwool', 'Merino 250 Cuffed Beanie', 0.85, 0.38, 0.60, 0.10),
  ('Patagonia', 'Snowfarer Cap', 0.85, 0.38, 0.60, 0.10),
  ('Atomic', 'Backland CTD', 0.50, 0.23, 0.40, 0.12),
  ('Salomon', 'MTN Lab', 0.55, 0.25, 0.40, 0.13),
  ('Giro', 'Ledge MIPS', 0.60, 0.27, 0.40, 0.14),
  ('Smith', 'Mission MIPS', 0.65, 0.29, 0.40, 0.15),
  ('Smith', 'Level MIPS', 0.70, 0.32, 0.40, 0.16),
  ('POC', 'Meninx RS MIPS', 0.70, 0.32, 0.40, 0.16),
  ('Oakley', 'MOD3 MIPS', 0.70, 0.32, 0.40, 0.16),
  ('Giro', 'Neo MIPS', 0.75, 0.34, 0.40, 0.17),
  ('Salomon', 'Husk Prime MIPS', 0.75, 0.34, 0.40, 0.17),
  ('Smith', 'Method Pro MIPS', 0.75, 0.34, 0.40, 0.17),
  ('Smith', 'Vantage MIPS', 0.80, 0.36, 0.40, 0.18),
  ('Giro', 'Ratio MIPS', 0.80, 0.36, 0.40, 0.18),
  ('Scott', 'Flow Pro MIPS', 0.80, 0.36, 0.40, 0.18),
  ('POC', 'Obex MIPS', 0.80, 0.36, 0.40, 0.18),
  ('Atomic', 'Savor MIPS', 0.80, 0.36, 0.40, 0.18),
  ('Oakley', 'MOD5 MIPS', 0.80, 0.36, 0.40, 0.18),
  ('Sweet Protection', 'Switcher MIPS', 0.80, 0.36, 0.40, 0.18),
  ('Sweet Protection', 'Igniter 2Vi MIPS', 0.85, 0.38, 0.40, 0.19),
  ('Giro', 'Range MIPS', 0.85, 0.38, 0.40, 0.19)
) AS v(brand, model_name, old_rcl_clo, rcl_clo, confidence_score, uncertainty_clo)
WHERE h.brand = v.brand AND h.model_name = v.model_name
  AND h.rcl_clo = v.old_rcl_clo AND h.data_source IS NULL;
