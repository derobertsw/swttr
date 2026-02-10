-- Seed data: Handwear, headwear, and ski helmets

-- ============================================
-- HANDWEAR
-- ============================================

INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static) VALUES
-- Liners
('Smartwool', 'Liner Glove', 'liner_glove', 40, 0.50, 9, false, false, true, 0, 5),
('Black Diamond', 'Lightweight Screentap', 'liner_glove', 45, 0.55, 9, false, false, true, -5, 5),

-- Light gloves
('Black Diamond', 'Midweight Softshell', 'light_glove', 85, 1.00, 7, false, true, false, -10, 0),
('Outdoor Research', 'Vigor Lightweight', 'light_glove', 70, 0.90, 8, false, true, true, -8, 2),

-- Insulated gloves
('Hestra', 'Fall Line', 'insulated_glove', 280, 2.00, 5, true, true, false, -20, -10),
('Black Diamond', 'Guide Glove', 'insulated_glove', 320, 2.20, 4, true, true, false, -25, -15),

-- Lobster mittens
('Hestra', 'Army Leather Heli 3-Finger', 'lobster_mitten', 350, 2.80, 4, true, true, false, -25, -15),
('Black Diamond', 'Guide Finger', 'lobster_mitten', 380, 3.00, 3, true, true, false, -30, -20),

-- Mittens
('Black Diamond', 'Mercury Mitt', 'mitten', 400, 3.50, 2, true, true, false, -35, -25),
('Outdoor Research', 'Alti Mitt', 'mitten', 450, 4.00, 1, true, true, false, -40, -30),

-- Shell overmittens
('Outdoor Research', 'Firebrand Mitt', 'shell_overmitten', 150, 0.80, 3, true, true, false, -15, -5);

-- Arc'teryx Fission SV Gloves
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Arc''teryx', 'Fission SV Gloves', 'insulated_glove', 280, 2.70, 6, true, true, false, -18, -7);

-- HEAD Ultrafit Multi-Sport Running Gloves
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('HEAD', 'Ultrafit Multi-Sport Running Gloves', 'liner_glove', 60, 0.60, 9, false, false, true, -7, 5);

-- Norrøna falketind dri short Gloves
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Norrøna', 'falketind dri short Gloves', 'light_glove', 109, 1.00, 7, true, true, false, -5, 5);

-- Hestra Ergo Grip Gloves (Active insulated glove with good dexterity)
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Hestra', 'Ergo Grip Active', 'insulated_glove', 200, 1.60, 6, false, true, false, -15, -5);

-- Arc'teryx Venta Mitten (Windproof GORE-TEX INFINIUM)
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Arc''teryx', 'Venta Mitten', 'mitten', 95, 1.80, 3, false, true, false, -20, -10);

-- Arc'teryx Venta Glove (Windproof GORE-TEX INFINIUM)
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Arc''teryx', 'Venta Glove', 'light_glove', 75, 1.20, 7, false, true, true, -10, 0);

-- Patagonia Capilene Midweight Liner Glove
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Patagonia', 'Capilene Midweight Liner Glove', 'liner_glove', 35, 0.45, 9, false, false, true, 0, 5);

-- Black Diamond Mercury Mitt (Shell only)
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Black Diamond', 'Mercury Mitt Shell', 'shell_overmitten', 180, 0.90, 3, true, true, false, -10, 0);

-- Black Diamond Mercury Mitt (Shell + Liner - full system)
-- Note: Already exists as 'Mercury Mitt', adding clarification for completeness
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Black Diamond', 'Mercury Mitt System', 'mitten', 400, 3.50, 2, true, true, false, -35, -25);

-- Outdoor Research Flurry Sensor Gloves
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Outdoor Research', 'Flurry Sensor Gloves', 'light_glove', 65, 0.85, 8, false, false, true, -5, 5);

-- Hestra gloves (4 models)
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static) VALUES
('Hestra', 'Army Leather Heli Ski', 'insulated_glove', 300, 2.10, 5, true, true, false, -25, -15),
('Hestra', 'Leather Box Mitt', 'mitten', 360, 3.20, 2, false, true, false, -30, -20),
('Hestra', 'Freeride', 'insulated_glove', 260, 1.80, 5, true, true, false, -20, -10),
('Hestra', 'All Mountain CZone', 'insulated_glove', 220, 1.50, 6, true, true, false, -15, -5)
ON CONFLICT (brand, model_name) DO NOTHING;


-- ============================================
-- HEADWEAR
-- ============================================

INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static) VALUES
-- Headbands
('Patagonia', 'Capilene Cool Daily Headband', 'headband', 25, true, false, false, true, 0.30, false, 5, 10),

-- Liner beanies
('Smartwool', 'Merino 150 Beanie', 'liner_beanie', 35, true, false, false, true, 0.50, false, 0, 5),
('Patagonia', 'Capilene Cool Daily Beanie', 'liner_beanie', 30, true, false, false, true, 0.45, false, 0, 5),

-- Midweight beanies
('Patagonia', 'Brodeo Beanie', 'midweight_beanie', 85, true, false, false, false, 0.80, false, -10, 0),
('Arc''teryx', 'Rho LTW Beanie', 'midweight_beanie', 45, true, false, false, true, 0.70, false, -8, 2),

-- Midweight beanies (corrected from original heavy_beanie via 006 update)
('Smartwool', 'Merino 250 Cuffed Beanie', 'midweight_beanie', 60, true, false, false, true, 0.85, false, -15, -5),

-- Light balaclavas
('Smartwool', 'Merino 250 Balaclava', 'balaclava_light', 60, true, true, true, true, 0.80, false, -15, -5),

-- Heavy balaclavas
('Outdoor Research', 'Ninjaclava', 'balaclava_heavy', 100, true, true, true, true, 1.50, true, -30, -20),

-- Buffs
('Buff', 'Original', 'buff_thin', 35, false, true, false, true, 0.30, false, 5, 10),
('Buff', 'Thermonet', 'buff_heavy', 45, false, true, false, true, 0.60, false, -5, 5),

-- Facemasks
('Seirus', 'Neofleece Combo Scarf', 'facemask', 80, true, true, true, true, 0.90, true, -20, -10);

-- Smartwool Thermal Merino Reversible Neck Gaiter
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Smartwool', 'Thermal Merino Reversible Neck Gaiter', 'buff_heavy', 90, false, true, false, true, 0.55, false, -10, 0);

-- Patagonia Merino Air Balaclava
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Patagonia', 'Merino Air Balaclava', 'balaclava_light', 55, true, true, true, true, 0.75, false, -15, -5);

-- Patagonia Snowfarer Cap (insulated cap)
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Patagonia', 'Snowfarer Cap', 'midweight_beanie', 65, true, false, false, true, 0.85, false, -10, 0);

-- BlackStrap Expedition Hood Balaclava
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('BlackStrap', 'Expedition Hood Balaclava', 'balaclava_heavy', 85, true, true, true, true, 1.40, true, -25, -15);

-- Smartwool Cozy Cabin Hat
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static)
VALUES ('Smartwool', 'Cozy Cabin Hat', 'heavy_beanie', 75, true, false, false, false, 1.10, false, -15, -5);

-- Ski helmets
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static) VALUES
-- Smith helmets
('Smith', 'Vantage MIPS', 'ski_helmet', 450, true, false, false, false, 0.80, true, -20, -10),
('Smith', 'Level MIPS', 'ski_helmet', 400, true, false, false, false, 0.70, true, -15, -5),
('Smith', 'Mission MIPS', 'ski_helmet', 380, true, false, false, false, 0.65, true, -15, -5),

-- Giro helmets
('Giro', 'Range MIPS', 'ski_helmet', 470, true, false, false, false, 0.85, true, -20, -10),
('Giro', 'Ledge MIPS', 'ski_helmet', 360, true, false, false, false, 0.60, true, -10, 0),
('Giro', 'Neo MIPS', 'ski_helmet', 420, true, false, false, false, 0.75, true, -18, -8),

-- POC helmets
('POC', 'Obex MIPS', 'ski_helmet', 480, true, false, false, false, 0.80, true, -20, -10),
('POC', 'Meninx RS MIPS', 'ski_helmet', 400, true, false, false, false, 0.70, true, -15, -5),

-- Sweet Protection helmets
('Sweet Protection', 'Igniter 2Vi MIPS', 'ski_helmet', 500, true, false, false, false, 0.85, true, -22, -12),
('Sweet Protection', 'Switcher MIPS', 'ski_helmet', 460, true, false, false, false, 0.80, true, -20, -10),

-- Oakley helmets
('Oakley', 'MOD5 MIPS', 'ski_helmet', 490, true, false, false, false, 0.80, true, -20, -10),
('Oakley', 'MOD3 MIPS', 'ski_helmet', 400, true, false, false, false, 0.70, true, -15, -5),

-- Salomon helmets
('Salomon', 'MTN Lab', 'ski_helmet', 350, true, false, false, false, 0.55, true, -10, 0),
('Salomon', 'Husk Prime MIPS', 'ski_helmet', 430, true, false, false, false, 0.75, true, -18, -8),

-- Atomic helmets
('Atomic', 'Backland CTD', 'ski_helmet', 330, true, false, false, false, 0.50, true, -8, 2),
('Atomic', 'Savor MIPS', 'ski_helmet', 450, true, false, false, false, 0.80, true, -20, -10);

-- Smartwool neck gaiters
INSERT INTO headwear (brand, model_name, headwear_type, weight_grams, covers_ears, covers_neck, covers_face, helmet_compatible, rcl_clo, windproof, min_temp_active, min_temp_static) VALUES
('Smartwool', 'Merino 150 Neck Gaiter', 'buff_thin', 30, false, true, false, true, 0.35, false, 5, 10),
('Smartwool', 'Merino 250 Neck Gaiter', 'buff_heavy', 50, false, true, false, true, 0.65, false, -10, 0)
ON CONFLICT (brand, model_name) DO NOTHING;

-- Helly Hansen Swift HT Gloves
INSERT INTO handwear (brand, model_name, handwear_type, weight_grams_pair, rcl_clo, dexterity_score, waterproof, windproof, touchscreen_compatible, min_temp_active, min_temp_static)
VALUES ('Helly Hansen', 'Swift HT Gloves', 'insulated_glove', 200, 1.50, 6, true, true, true, -15, -5)
ON CONFLICT (brand, model_name) DO NOTHING;
