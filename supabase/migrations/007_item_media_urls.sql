-- Add first-party media URL columns for wardrobe item cards.
-- These are used by the UI to render brand logos and item thumbnails
-- without relying on third-party logo/image hosts.

ALTER TABLE garments
  ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS item_image_url TEXT;

ALTER TABLE handwear
  ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS item_image_url TEXT;

ALTER TABLE headwear
  ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS item_image_url TEXT;

CREATE OR REPLACE FUNCTION set_item_media_urls()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  item_type_text TEXT := TG_ARGV[0];
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  IF NEW.brand_logo_url IS NULL OR NEW.brand_logo_url = '' THEN
    NEW.brand_logo_url := '/api/media/brand-logo?item_type=' || item_type_text || '&item_id=' || NEW.id::text;
  END IF;

  IF NEW.item_image_url IS NULL OR NEW.item_image_url = '' THEN
    NEW.item_image_url := '/api/media/item-image?item_type=' || item_type_text || '&item_id=' || NEW.id::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_garment_media_urls ON garments;
CREATE TRIGGER set_garment_media_urls
BEFORE INSERT OR UPDATE ON garments
FOR EACH ROW
EXECUTE FUNCTION set_item_media_urls('garment');

DROP TRIGGER IF EXISTS set_handwear_media_urls ON handwear;
CREATE TRIGGER set_handwear_media_urls
BEFORE INSERT OR UPDATE ON handwear
FOR EACH ROW
EXECUTE FUNCTION set_item_media_urls('handwear');

DROP TRIGGER IF EXISTS set_headwear_media_urls ON headwear;
CREATE TRIGGER set_headwear_media_urls
BEFORE INSERT OR UPDATE ON headwear
FOR EACH ROW
EXECUTE FUNCTION set_item_media_urls('headwear');

UPDATE garments
SET
  brand_logo_url = '/api/media/brand-logo?item_type=garment&item_id=' || id::text,
  item_image_url = '/api/media/item-image?item_type=garment&item_id=' || id::text
WHERE
  brand_logo_url IS NULL OR brand_logo_url = ''
  OR item_image_url IS NULL OR item_image_url = '';

UPDATE handwear
SET
  brand_logo_url = '/api/media/brand-logo?item_type=handwear&item_id=' || id::text,
  item_image_url = '/api/media/item-image?item_type=handwear&item_id=' || id::text
WHERE
  brand_logo_url IS NULL OR brand_logo_url = ''
  OR item_image_url IS NULL OR item_image_url = '';

UPDATE headwear
SET
  brand_logo_url = '/api/media/brand-logo?item_type=headwear&item_id=' || id::text,
  item_image_url = '/api/media/item-image?item_type=headwear&item_id=' || id::text
WHERE
  brand_logo_url IS NULL OR brand_logo_url = ''
  OR item_image_url IS NULL OR item_image_url = '';
