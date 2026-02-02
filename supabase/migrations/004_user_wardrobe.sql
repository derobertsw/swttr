-- User Wardrobe: Links users to their owned calibrated gear
-- Allows users to select from garments, handwear, and headwear tables

CREATE TYPE wardrobe_item_type AS ENUM (
    'garment',
    'handwear',
    'headwear'
);

CREATE TABLE user_wardrobe (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,

    -- Item reference (polymorphic)
    item_type wardrobe_item_type NOT NULL,
    item_id UUID NOT NULL,

    -- Optional user customization
    nickname VARCHAR(100),  -- User's name for this item

    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Each user can only add an item once
    UNIQUE(user_id, item_type, item_id)
);

-- Indexes
CREATE INDEX idx_user_wardrobe_user ON user_wardrobe(user_id);
CREATE INDEX idx_user_wardrobe_type ON user_wardrobe(item_type);

-- RLS
ALTER TABLE user_wardrobe ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own wardrobe
CREATE POLICY "Users can view own wardrobe" ON user_wardrobe
    FOR SELECT USING (true);

CREATE POLICY "Users can insert own wardrobe" ON user_wardrobe
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete own wardrobe" ON user_wardrobe
    FOR DELETE USING (true);
