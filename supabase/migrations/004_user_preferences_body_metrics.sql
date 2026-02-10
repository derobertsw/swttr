-- Add optional body-metrics preferences used by thermal modeling.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS height_inches INT CHECK (height_inches BETWEEN 54 AND 84),
  ADD COLUMN IF NOT EXISTS weight_lbs INT CHECK (weight_lbs BETWEEN 90 AND 320);
