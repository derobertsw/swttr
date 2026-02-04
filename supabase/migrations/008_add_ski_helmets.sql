-- Add ski_helmet to the headwear_type enum
-- Note: This must be committed before inserting data (see migration 009)
ALTER TYPE headwear_type ADD VALUE 'ski_helmet';
