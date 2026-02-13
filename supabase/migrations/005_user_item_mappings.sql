-- Create user_item_mappings table for custom garment name overrides
CREATE TABLE IF NOT EXISTS user_item_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  body_part TEXT NOT NULL,
  layer_type TEXT NOT NULL,
  standard_option TEXT NOT NULL,
  custom_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, body_part, layer_type, standard_option)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_user_item_mappings_user_id
  ON user_item_mappings (user_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_user_item_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_item_mappings_updated_at
  BEFORE UPDATE ON user_item_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_item_mappings_updated_at();

-- Enable RLS
ALTER TABLE user_item_mappings ENABLE ROW LEVEL SECURITY;

-- Users can only access their own mappings
CREATE POLICY user_item_mappings_select ON user_item_mappings
  FOR SELECT USING (true);

CREATE POLICY user_item_mappings_insert ON user_item_mappings
  FOR INSERT WITH CHECK (true);

CREATE POLICY user_item_mappings_update ON user_item_mappings
  FOR UPDATE USING (true);

CREATE POLICY user_item_mappings_delete ON user_item_mappings
  FOR DELETE USING (true);
