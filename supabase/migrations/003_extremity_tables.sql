-- Extremity Thermal Tables: Handwear and Headwear
-- Hands and head require separate targeting due to high surface-area-to-volume ratios
-- and reduced local metabolic heat production

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE handwear_type AS ENUM (
    'liner_glove',
    'light_glove',
    'insulated_glove',
    'mitten',
    'lobster_mitten',
    'shell_overmitten'
);

CREATE TYPE headwear_type AS ENUM (
    'liner_beanie',
    'midweight_beanie',
    'heavy_beanie',
    'balaclava_light',
    'balaclava_heavy',
    'headband',
    'buff_thin',
    'buff_heavy',
    'facemask'
);

-- ============================================
-- HANDWEAR TABLE
-- ============================================

CREATE TABLE handwear (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic identification
    brand VARCHAR(100) NOT NULL,
    model_name VARCHAR(200) NOT NULL,
    year_released INT,
    msrp_usd DECIMAL(8,2),

    -- Classification
    handwear_type handwear_type NOT NULL,

    -- Physical properties
    weight_grams_pair INT,

    -- Thermal properties
    rcl_clo DECIMAL(3,2) NOT NULL,

    -- Dexterity (1=mitten, 10=liner)
    dexterity_score INT CHECK (dexterity_score BETWEEN 1 AND 10),

    -- Features
    waterproof BOOLEAN DEFAULT false,
    windproof BOOLEAN DEFAULT false,
    touchscreen_compatible BOOLEAN DEFAULT false,

    -- Temperature ranges (Celsius)
    min_temp_active INT,   -- Minimum temp when active (e.g., XC skiing)
    min_temp_static INT,   -- Minimum temp when stationary (e.g., chairlift)

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(brand, model_name)
);

-- ============================================
-- HEADWEAR TABLE
-- ============================================

CREATE TABLE headwear (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic identification
    brand VARCHAR(100) NOT NULL,
    model_name VARCHAR(200) NOT NULL,
    year_released INT,
    msrp_usd DECIMAL(8,2),

    -- Classification
    headwear_type headwear_type NOT NULL,

    -- Physical properties
    weight_grams INT,

    -- Coverage
    covers_ears BOOLEAN DEFAULT true,
    covers_neck BOOLEAN DEFAULT false,
    covers_face BOOLEAN DEFAULT false,
    helmet_compatible BOOLEAN DEFAULT false,

    -- Thermal properties
    rcl_clo DECIMAL(3,2) NOT NULL,

    -- Features
    windproof BOOLEAN DEFAULT false,

    -- Temperature ranges (Celsius)
    min_temp_active INT,
    min_temp_static INT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(brand, model_name)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_handwear_type ON handwear(handwear_type);
CREATE INDEX idx_handwear_brand ON handwear(brand);
CREATE INDEX idx_handwear_rcl ON handwear(rcl_clo);
CREATE INDEX idx_handwear_dexterity ON handwear(dexterity_score);

CREATE INDEX idx_headwear_type ON headwear(headwear_type);
CREATE INDEX idx_headwear_brand ON headwear(brand);
CREATE INDEX idx_headwear_rcl ON headwear(rcl_clo);

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================

CREATE TRIGGER update_handwear_updated_at
    BEFORE UPDATE ON handwear
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_headwear_updated_at
    BEFORE UPDATE ON headwear
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE handwear ENABLE ROW LEVEL SECURITY;
ALTER TABLE headwear ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON handwear FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON headwear FOR SELECT USING (true);

-- ============================================
-- SEED DATA: HANDWEAR
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

-- ============================================
-- SEED DATA: HEADWEAR
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

-- Heavy beanies
('Smartwool', 'Merino 250 Cuffed Beanie', 'heavy_beanie', 70, true, false, false, true, 1.20, false, -20, -10),

-- Light balaclavas
('Smartwool', 'Merino 250 Balaclava', 'balaclava_light', 60, true, true, true, true, 0.80, false, -15, -5),

-- Heavy balaclavas
('Outdoor Research', 'Ninjaclava', 'balaclava_heavy', 100, true, true, true, true, 1.50, true, -30, -20),

-- Buffs
('Buff', 'Original', 'buff_thin', 35, false, true, false, true, 0.30, false, 5, 10),
('Buff', 'Thermonet', 'buff_heavy', 45, false, true, false, true, 0.60, false, -5, 5),

-- Facemasks
('Seirus', 'Neofleece Combo Scarf', 'facemask', 80, true, true, true, true, 0.90, true, -20, -10);
