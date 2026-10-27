-- Product photos for issue #84, using the direct item_image_url catalog contract.
-- Deploy the bundled public/images/items assets before applying this migration.
-- Sources and visual validation: docs/catalog-photos-84.md.
-- Only known legacy references and fallbacks are replaced; curated URLs survive.

UPDATE public.garments AS item
SET item_image_url = photo.image_url
FROM (VALUES
  ('Patagonia', 'Nano-Air Ultralight Full-Zip Hoody', '/images/items/patagonia-nano-air-ultralight-full-zip-hoody.jpg', NULL::text),
  ('Patagonia', 'DAS Light Hoody', '/images/items/patagonia-das-light-hoody.jpg', NULL::text),
  ('Smartwool', 'Classic Thermal Merino 1/4 Zip', '/images/items/smartwool-classic-thermal-merino-quarter-zip.png', NULL::text),
  ('Helly Hansen', 'Alpha LifaLoft Jacket', '/images/items/helly-hansen-alpha-lifaloft-jacket.jpg', NULL::text),
  ('Patagonia', 'Capilene Cool Lightweight', '/images/items/patagonia-capilene-cool-lightweight.jpg', 'https://www.rei.com/media/fd1306e6-96cb-46da-8f06-4ca4eff32420.jpg'),
  ('Patagonia', 'Capilene Midweight Bottoms', '/images/items/patagonia-capilene-midweight-bottoms.jpg', 'https://www.rei.com/media/cff8a526-16a4-47bc-a88f-d948f8e45fb9.jpg'),
  ('Patagonia', 'Capilene Thermal Weight Boot-Length Bottoms', '/images/items/patagonia-capilene-thermal-weight-boot-length-bottoms.jpg', 'https://www.rei.com/media/ed65e9ef-fbce-4f9a-a97f-6cb8f4c44bf2.jpg'),
  ('Patagonia', 'Nano-Air Hoody', '/images/items/patagonia-nano-air-hoody.jpg', 'https://www.rei.com/media/7c9e4ec6-2f43-4846-ab6d-df8f1c49f4ff.jpg'),
  ('32 Degrees', 'Heat Midweight Crew', '/images/items/32-degrees-heat-midweight-crew.jpg', 'https://www.rei.com/media/e95a1679-4f82-4d6b-b67c-0502c6af70f9.jpg'),
  ('Patagonia', 'R1 Pullover', '/images/items/patagonia-r1-pullover.jpg', NULL::text)
) AS photo(brand, model_name, image_url, previous_url)
WHERE item.brand = photo.brand
  AND item.model_name = photo.model_name
  AND item.item_image_url IS DISTINCT FROM photo.image_url
  AND (
    NULLIF(btrim(item.item_image_url), '') IS NULL
    OR starts_with(item.item_image_url, '/api/media/item-image')
    OR starts_with(item.item_image_url, '/media/items/')
    OR starts_with(item.item_image_url, '/images/silhouettes/')
    OR split_part(item.item_image_url, '?', 1) = photo.previous_url
  );

UPDATE public.handwear AS item
SET item_image_url = photo.image_url
FROM (VALUES
  ('Patagonia', 'Capilene Midweight Liner Glove', '/images/items/patagonia-capilene-midweight-liner-glove.jpg', 'https://www.rei.com/media/1ba1dc35-c207-4e7c-91eb-263744daa5d3.jpg'),
  ('Helly Hansen', 'Swift HT Gloves', '/images/items/helly-hansen-swift-ht-gloves.jpg', 'https://www.rei.com/media/7ea4c6a0-efc4-43fc-835f-2ce81e0172b1.jpg')
) AS photo(brand, model_name, image_url, previous_url)
WHERE item.brand = photo.brand
  AND item.model_name = photo.model_name
  AND item.item_image_url IS DISTINCT FROM photo.image_url
  AND (
    NULLIF(btrim(item.item_image_url), '') IS NULL
    OR starts_with(item.item_image_url, '/api/media/item-image')
    OR starts_with(item.item_image_url, '/media/items/')
    OR starts_with(item.item_image_url, '/images/silhouettes/')
    OR split_part(item.item_image_url, '?', 1) = photo.previous_url
  );

UPDATE public.headwear AS item
SET item_image_url = photo.image_url
FROM (VALUES
  ('Scott', 'Flow Pro MIPS', '/images/items/scott-flow-pro-mips.png', NULL::text),
  ('Smartwool', 'Thermal Merino Reversible Neck Gaiter', '/images/items/smartwool-thermal-merino-reversible-neck-gaiter.png', 'https://www.rei.com/media/ac0bc34a-7e30-4939-97f7-f06dd4996f8e.jpg')
) AS photo(brand, model_name, image_url, previous_url)
WHERE item.brand = photo.brand
  AND item.model_name = photo.model_name
  AND item.item_image_url IS DISTINCT FROM photo.image_url
  AND (
    NULLIF(btrim(item.item_image_url), '') IS NULL
    OR starts_with(item.item_image_url, '/api/media/item-image')
    OR starts_with(item.item_image_url, '/media/items/')
    OR starts_with(item.item_image_url, '/images/silhouettes/')
    OR split_part(item.item_image_url, '?', 1) = photo.previous_url
  );
