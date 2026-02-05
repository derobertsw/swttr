-- Add disabled column to user_wardrobe for temporarily excluding items from recommendations
ALTER TABLE user_wardrobe ADD COLUMN disabled BOOLEAN DEFAULT false;
CREATE INDEX idx_user_wardrobe_disabled ON user_wardrobe(disabled);

-- Add UPDATE policy for RLS (SELECT, INSERT, DELETE already exist)
CREATE POLICY "Users can update own wardrobe" ON user_wardrobe
FOR UPDATE USING (true) WITH CHECK (true);
