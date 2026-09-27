-- 004 now creates user_preferences, but a database that already recorded the
-- original 004 (which only added columns to a table made by hand) never runs
-- that definition. Bring any such table to the same shape: timestamps, RLS,
-- and the updated_at trigger. Safe to run on any database.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
