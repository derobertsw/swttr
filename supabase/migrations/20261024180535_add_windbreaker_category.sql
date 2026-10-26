-- Commit the enum value before the following data migration uses it.
-- The recommendation pipeline already recognizes windbreaker as a shell.
ALTER TYPE garment_category ADD VALUE IF NOT EXISTS 'windbreaker';
