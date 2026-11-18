-- #373: seed bike helmets so cycling can suggest one from the catalog.
-- Live catalog checked read-only on 2026-11-17 before adding products:
-- 38 headwear rows, 19 of them ski_helmet, no other helmet rows, no model
-- named for cycling, and no headwear_type value for a bike helmet.
--
-- Warmth: Aljaste, Kuklane & Heidmets (International Cycling Safety
-- Conference 2015; Lund thermal head manikin, 20°C, 1.6 m/s, with a wig)
-- measured whole-head insulation of 0.066-0.090 m²K/W with commercial and
-- mock-up bicycle helmets against 0.067 for the bare head: at most about
-- 0.15 clo added. SWTTR's head items sit at about twice comparable lab
-- values (algorithm review, finding 6), so 0.20 clo puts a bike helmet on the
-- catalog's scale, well below ski helmets (0.50-0.85). Estimate, ±0.10 clo.
-- Unrated for temperature (NULL): a helmet is protection, not warmth.
-- No ear, neck or face coverage; not windproof.
-- Weights are size M; year and price left unset.

-- ============================================
-- HEADWEAR - Giro Syntax MIPS
-- ============================================
-- Road helmet, 25 vents with internal channelling, MIPS liner.
-- 296 g measured by road.cc (size 55-59 cm); retailers quote 260-270 g from Giro.
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Giro', 'Syntax MIPS', 'bike_helmet', 296, false, false, false, false, 0.20, false, NULL, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

-- ============================================
-- HEADWEAR - Smith Signal MIPS
-- ============================================
-- Road and commuting helmet, MIPS liner. 300 g, size M (smithoptics.com).
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Smith', 'Signal MIPS', 'bike_helmet', 300, false, false, false, false, 0.20, false, NULL, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;

-- ============================================
-- HEADWEAR - Specialized Align II MIPS
-- ============================================
-- Entry-level road and commuting helmet, MIPS liner. 374 g, size M/L (BikeRadar).
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Specialized', 'Align II MIPS', 'bike_helmet', 374, false, false, false, false, 0.20, false, NULL, NULL)
ON CONFLICT (brand, model_name) DO NOTHING;
