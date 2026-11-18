-- #373: cycling requires a helmet, and a ski helmet doesn't stand in for one.
-- Commit the enum value before the following seed migration uses it (an enum
-- value added in a transaction can't be used until that transaction commits).
-- The recommendation code already tolerates the value being absent: cycling
-- then reports the helmet as missing, with a generic suggestion.
ALTER TYPE headwear_type ADD VALUE IF NOT EXISTS 'bike_helmet';
