-- Extend wardrobe_item_type enum to include 'custom'
ALTER TYPE wardrobe_item_type ADD VALUE IF NOT EXISTS 'custom';

-- Create user_custom_items table
CREATE TABLE IF NOT EXISTS user_custom_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,

  -- Generic item definition
  body_part TEXT NOT NULL CHECK (body_part IN ('torso', 'legs', 'hands', 'headNeck')),
  layer_type TEXT NOT NULL CHECK (layer_type IN ('base', 'mid', 'outer')),
  generic_option TEXT NOT NULL, -- e.g., "Light", "Medium", "Pullover"

  -- User customization
  custom_name TEXT NOT NULL, -- e.g., "My favorite merino"

  -- Thermal value (from genericLayerClo.ts)
  rcl_clo DECIMAL(4,2) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicates: user can only create one custom item per generic option
  UNIQUE (user_id, body_part, layer_type, generic_option)
);

-- Indexes for fast lookup
CREATE INDEX idx_user_custom_items_user_id ON user_custom_items (user_id);
CREATE INDEX idx_user_custom_items_body_part ON user_custom_items (body_part);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_user_custom_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_custom_items_updated_at
  BEFORE UPDATE ON user_custom_items
  FOR EACH ROW
  EXECUTE FUNCTION update_user_custom_items_updated_at();

-- Enable RLS (policies use 'true' for now like user_wardrobe)
ALTER TABLE user_custom_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_custom_items_select ON user_custom_items FOR SELECT USING (true);
CREATE POLICY user_custom_items_insert ON user_custom_items FOR INSERT WITH CHECK (true);
CREATE POLICY user_custom_items_update ON user_custom_items FOR UPDATE USING (true);
CREATE POLICY user_custom_items_delete ON user_custom_items FOR DELETE USING (true);
