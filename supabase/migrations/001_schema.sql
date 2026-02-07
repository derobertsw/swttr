-- Biophysical Clothing Recommendation System — Consolidated Schema
-- Based on USARIEM Technical Reports T21-03 and T18-02, ISO 11079 (IREQ standard)

-- ============================================
-- ENUM TYPES — Garments
-- ============================================

CREATE TYPE garment_category AS ENUM (
    'base_layer',
    'mid_layer_light',
    'mid_layer_heavy',
    'insulation_synthetic',
    'insulation_down',
    'soft_shell',
    'hard_shell',
    'outer_insulated'
);

CREATE TYPE garment_type AS ENUM (
    'top_sleeveless',
    'top_short_sleeve',
    'top_long_sleeve',
    'jacket',
    'vest',
    'pants',
    'shorts',
    'bib',
    'one_piece'
);

CREATE TYPE hood_type AS ENUM (
    'none',
    'attached',
    'removable',
    'helmet_compatible'
);

CREATE TYPE estimation_method AS ENUM (
    'lab_tested',
    'derived_from_similar',
    'calculated_from_materials'
);

CREATE TYPE windproof_rating AS ENUM (
    'none',
    'wind_resistant',
    'windproof'
);

CREATE TYPE waterproof_rating AS ENUM (
    'none',
    'DWR_only',
    'water_resistant',
    'waterproof'
);

CREATE TYPE seam_construction AS ENUM (
    'sewn',
    'taped',
    'welded'
);

CREATE TYPE layer_position AS ENUM (
    'outer',
    'membrane',
    'insulation',
    'lining'
);

CREATE TYPE material_category AS ENUM (
    'synthetic_woven',
    'synthetic_knit',
    'synthetic_fleece',
    'synthetic_insulation',
    'down_insulation',
    'membrane',
    'wool',
    'merino',
    'hybrid'
);

-- ============================================
-- ENUM TYPES — Extremities
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
    'facemask',
    'ski_helmet'
);

-- ============================================
-- ENUM TYPES — User Wardrobe
-- ============================================

CREATE TYPE wardrobe_item_type AS ENUM (
    'garment',
    'handwear',
    'headwear'
);

-- ============================================
-- GARMENT TABLES
-- ============================================

CREATE TABLE garments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic identification
    brand VARCHAR(100) NOT NULL,
    model_name VARCHAR(200) NOT NULL,
    year_released INT,
    msrp_usd DECIMAL(8,2),

    -- Classification
    category garment_category NOT NULL,
    garment_type garment_type NOT NULL,

    -- Body coverage (for regional calculations)
    covers_torso BOOLEAN DEFAULT false,
    covers_arms BOOLEAN DEFAULT false,
    covers_legs BOOLEAN DEFAULT false,
    covers_head BOOLEAN DEFAULT false,
    hood_type hood_type DEFAULT 'none',

    -- Physical properties
    weight_grams INT,
    packed_volume_liters DECIMAL(4,2),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(brand, model_name)
);

CREATE TABLE garment_thermal_properties (
    garment_id UUID PRIMARY KEY REFERENCES garments(id) ON DELETE CASCADE,

    -- Thermal resistance (clo units)
    rcl_whole_body DECIMAL(4,2),
    rcl_torso DECIMAL(4,2),
    rcl_arms DECIMAL(4,2),
    rcl_legs DECIMAL(4,2),

    -- Evaporative resistance (m²Pa/W)
    recl_whole_body DECIMAL(6,2),
    recl_torso DECIMAL(6,2),
    recl_arms DECIMAL(6,2),
    recl_legs DECIMAL(6,2),

    -- Derived values
    im_whole_body DECIMAL(3,2),       -- permeability index (0-1)
    evap_potential DECIMAL(4,3),      -- im/clo ratio (higher = more breathable per unit warmth)

    -- Data quality
    estimation_method estimation_method DEFAULT 'calculated_from_materials',
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE garment_protection (
    garment_id UUID PRIMARY KEY REFERENCES garments(id) ON DELETE CASCADE,

    -- Wind resistance
    windproof_rating windproof_rating DEFAULT 'none',
    air_permeability_cfm DECIMAL(6,2),

    -- Water resistance
    waterproof_rating waterproof_rating DEFAULT 'none',
    waterproof_mm INT,
    breathability_mvtr INT,           -- Moisture Vapor Transmission Rate (g/m²/24hr)
    breathability_ret DECIMAL(4,1),   -- Resistance to Evaporative Transfer (lower = more breathable)

    -- Membrane details
    membrane_type VARCHAR(100),
    seam_construction seam_construction,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE garment_ventilation (
    garment_id UUID PRIMARY KEY REFERENCES garments(id) ON DELETE CASCADE,

    has_pit_zips BOOLEAN DEFAULT false,
    pit_zip_length_cm INT,
    has_side_vents BOOLEAN DEFAULT false,
    has_back_vent BOOLEAN DEFAULT false,
    has_thigh_vents BOOLEAN DEFAULT false,
    main_zip_two_way BOOLEAN DEFAULT false,
    mesh_lined_pockets BOOLEAN DEFAULT false,

    -- Estimated effectiveness (multiplier when vents open)
    -- 0.7 = 30% reduction in effective Recl
    ventilation_factor DECIMAL(3,2) CHECK (ventilation_factor BETWEEN 0.3 AND 1.0) DEFAULT 1.0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE garment_activity_ratings (
    garment_id UUID PRIMARY KEY REFERENCES garments(id) ON DELETE CASCADE,

    -- Suitability scores 1-10
    xc_skiing_score INT CHECK (xc_skiing_score BETWEEN 1 AND 10),
    ski_touring_uphill_score INT CHECK (ski_touring_uphill_score BETWEEN 1 AND 10),
    ski_touring_downhill_score INT CHECK (ski_touring_downhill_score BETWEEN 1 AND 10),
    alpine_skiing_score INT CHECK (alpine_skiing_score BETWEEN 1 AND 10),

    -- Temperature ranges (Celsius)
    min_temp_active INT,   -- Minimum temp when exercising
    max_temp_active INT,   -- Maximum temp when exercising
    min_temp_static INT,   -- Minimum temp when stationary
    max_temp_static INT,   -- Maximum temp when stationary

    activity_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE garment_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    garment_id UUID REFERENCES garments(id) ON DELETE CASCADE,

    layer_position layer_position NOT NULL,
    material_type VARCHAR(100),
    fabric_weight_gsm INT,

    -- Material thermal properties (from reference table)
    material_thermal_resistance DECIMAL(4,3),
    material_evap_resistance DECIMAL(6,2),
    material_air_permeability DECIMAL(6,2),

    coverage_percent INT DEFAULT 100 CHECK (coverage_percent BETWEEN 0 AND 100),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE material_reference (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_name VARCHAR(200) NOT NULL,
    manufacturer VARCHAR(100),

    -- Thermal properties
    thermal_resistance_per_mm DECIMAL(5,4),
    base_evap_resistance DECIMAL(6,2),

    material_category material_category NOT NULL,

    -- For insulation types
    fill_power INT,
    clo_per_oz_sqyd DECIMAL(4,3),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(material_name, manufacturer)
);

CREATE TABLE calibration_reference (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_report VARCHAR(50),
    garment_description TEXT,

    measured_rcl_torso DECIMAL(4,2),
    measured_rcl_arm DECIMAL(4,2),
    measured_rcl_leg DECIMAL(4,2),
    measured_rcl_whole DECIMAL(4,2),

    measured_recl_torso DECIMAL(6,2),
    measured_recl_arm DECIMAL(6,2),
    measured_recl_leg DECIMAL(6,2),
    measured_recl_whole DECIMAL(6,2),

    garment_category garment_category,
    approximate_weight_grams INT,
    primary_material VARCHAR(100),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EXTREMITY TABLES
-- ============================================

CREATE TABLE handwear (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    brand VARCHAR(100) NOT NULL,
    model_name VARCHAR(200) NOT NULL,
    year_released INT,
    msrp_usd DECIMAL(8,2),

    handwear_type handwear_type NOT NULL,

    weight_grams_pair INT,

    rcl_clo DECIMAL(3,2) NOT NULL,

    -- Dexterity (1=mitten, 10=liner)
    dexterity_score INT CHECK (dexterity_score BETWEEN 1 AND 10),

    waterproof BOOLEAN DEFAULT false,
    windproof BOOLEAN DEFAULT false,
    touchscreen_compatible BOOLEAN DEFAULT false,

    -- Temperature ranges (Celsius)
    min_temp_active INT,
    min_temp_static INT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(brand, model_name)
);

CREATE TABLE headwear (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    brand VARCHAR(100) NOT NULL,
    model_name VARCHAR(200) NOT NULL,
    year_released INT,
    msrp_usd DECIMAL(8,2),

    headwear_type headwear_type NOT NULL,

    weight_grams INT,

    covers_ears BOOLEAN DEFAULT true,
    covers_neck BOOLEAN DEFAULT false,
    covers_face BOOLEAN DEFAULT false,
    helmet_compatible BOOLEAN DEFAULT false,

    rcl_clo DECIMAL(3,2) NOT NULL,

    windproof BOOLEAN DEFAULT false,

    -- Temperature ranges (Celsius)
    min_temp_active INT,
    min_temp_static INT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(brand, model_name)
);

-- ============================================
-- USER WARDROBE TABLE
-- ============================================

CREATE TABLE user_wardrobe (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,

    -- Item reference (polymorphic)
    item_type wardrobe_item_type NOT NULL,
    item_id UUID NOT NULL,

    -- Optional user customization
    nickname VARCHAR(100),

    -- Temporarily exclude from recommendations
    disabled BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, item_type, item_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Garments
CREATE INDEX idx_garments_category ON garments(category);
CREATE INDEX idx_garments_brand ON garments(brand);
CREATE INDEX idx_garments_type ON garments(garment_type);
CREATE INDEX idx_thermal_evap_potential ON garment_thermal_properties(evap_potential);
CREATE INDEX idx_thermal_rcl ON garment_thermal_properties(rcl_whole_body);
CREATE INDEX idx_activity_xc ON garment_activity_ratings(xc_skiing_score);
CREATE INDEX idx_activity_touring_up ON garment_activity_ratings(ski_touring_uphill_score);
CREATE INDEX idx_activity_touring_down ON garment_activity_ratings(ski_touring_downhill_score);
CREATE INDEX idx_activity_alpine ON garment_activity_ratings(alpine_skiing_score);
CREATE INDEX idx_garment_materials_garment ON garment_materials(garment_id);
CREATE INDEX idx_material_reference_category ON material_reference(material_category);

-- Extremities
CREATE INDEX idx_handwear_type ON handwear(handwear_type);
CREATE INDEX idx_handwear_brand ON handwear(brand);
CREATE INDEX idx_handwear_rcl ON handwear(rcl_clo);
CREATE INDEX idx_handwear_dexterity ON handwear(dexterity_score);
CREATE INDEX idx_headwear_type ON headwear(headwear_type);
CREATE INDEX idx_headwear_brand ON headwear(brand);
CREATE INDEX idx_headwear_rcl ON headwear(rcl_clo);

-- User wardrobe
CREATE INDEX idx_user_wardrobe_user ON user_wardrobe(user_id);
CREATE INDEX idx_user_wardrobe_type ON user_wardrobe(item_type);
CREATE INDEX idx_user_wardrobe_disabled ON user_wardrobe(disabled);

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_garments_updated_at
    BEFORE UPDATE ON garments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_thermal_properties_updated_at
    BEFORE UPDATE ON garment_thermal_properties
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_protection_updated_at
    BEFORE UPDATE ON garment_protection
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ventilation_updated_at
    BEFORE UPDATE ON garment_ventilation
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activity_ratings_updated_at
    BEFORE UPDATE ON garment_activity_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

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

ALTER TABLE garments ENABLE ROW LEVEL SECURITY;
ALTER TABLE garment_thermal_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE garment_protection ENABLE ROW LEVEL SECURITY;
ALTER TABLE garment_ventilation ENABLE ROW LEVEL SECURITY;
ALTER TABLE garment_activity_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE garment_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE handwear ENABLE ROW LEVEL SECURITY;
ALTER TABLE headwear ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wardrobe ENABLE ROW LEVEL SECURITY;

-- Public read access for catalog tables
CREATE POLICY "Allow public read access" ON garments FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON garment_thermal_properties FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON garment_protection FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON garment_ventilation FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON garment_activity_ratings FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON garment_materials FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON material_reference FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON calibration_reference FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON handwear FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON headwear FOR SELECT USING (true);

-- User wardrobe policies
CREATE POLICY "Users can view own wardrobe" ON user_wardrobe
    FOR SELECT USING (true);

CREATE POLICY "Users can insert own wardrobe" ON user_wardrobe
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete own wardrobe" ON user_wardrobe
    FOR DELETE USING (true);

CREATE POLICY "Users can update own wardrobe" ON user_wardrobe
    FOR UPDATE USING (true) WITH CHECK (true);
