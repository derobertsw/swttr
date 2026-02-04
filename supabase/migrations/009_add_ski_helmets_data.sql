-- Insert ski helmet data (requires 008 to be committed first)

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
