-- User preferences, keyed by Clerk user id. No earlier migration created this
-- table, so this one does; it is idempotent for databases that already have it.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  temperature_sensitivity TEXT CHECK (temperature_sensitivity IN ('hot', 'neutral', 'cold')),
  default_activity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add optional body-metrics preferences used by thermal modeling.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS height_inches INT CHECK (height_inches BETWEEN 54 AND 84),
  ADD COLUMN IF NOT EXISTS weight_lbs INT CHECK (weight_lbs BETWEEN 90 AND 320);

-- Accessed only through the API (service role); no policies for public roles.
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
