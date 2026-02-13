-- Map selected brands and items to uploaded static media assets in /public/media.
-- Non-mapped rows retain their existing fallback URLs from migration 007.

-- ============================================
-- Brand logo assets
-- ============================================

UPDATE garments SET brand_logo_url = '/media/brands/patagonia.svg' WHERE brand = 'Patagonia';
UPDATE handwear SET brand_logo_url = '/media/brands/patagonia.svg' WHERE brand = 'Patagonia';
UPDATE headwear SET brand_logo_url = '/media/brands/patagonia.svg' WHERE brand = 'Patagonia';

UPDATE garments SET brand_logo_url = '/media/brands/norrona.svg' WHERE brand = 'Norrøna';
UPDATE handwear SET brand_logo_url = '/media/brands/norrona.svg' WHERE brand = 'Norrøna';
UPDATE headwear SET brand_logo_url = '/media/brands/norrona.svg' WHERE brand = 'Norrøna';

UPDATE garments SET brand_logo_url = '/media/brands/lululemon.svg' WHERE brand = 'Lululemon';
UPDATE handwear SET brand_logo_url = '/media/brands/lululemon.svg' WHERE brand = 'Lululemon';
UPDATE headwear SET brand_logo_url = '/media/brands/lululemon.svg' WHERE brand = 'Lululemon';

UPDATE garments SET brand_logo_url = '/media/brands/32-degrees.svg' WHERE brand = '32 Degrees';
UPDATE handwear SET brand_logo_url = '/media/brands/32-degrees.svg' WHERE brand = '32 Degrees';
UPDATE headwear SET brand_logo_url = '/media/brands/32-degrees.svg' WHERE brand = '32 Degrees';

UPDATE garments SET brand_logo_url = '/media/brands/arcteryx.svg' WHERE brand = 'Arc''teryx';
UPDATE handwear SET brand_logo_url = '/media/brands/arcteryx.svg' WHERE brand = 'Arc''teryx';
UPDATE headwear SET brand_logo_url = '/media/brands/arcteryx.svg' WHERE brand = 'Arc''teryx';

UPDATE garments SET brand_logo_url = '/media/brands/black-diamond.svg' WHERE brand = 'Black Diamond';
UPDATE handwear SET brand_logo_url = '/media/brands/black-diamond.svg' WHERE brand = 'Black Diamond';
UPDATE headwear SET brand_logo_url = '/media/brands/black-diamond.svg' WHERE brand = 'Black Diamond';

UPDATE garments SET brand_logo_url = '/media/brands/outdoor-research.svg' WHERE brand = 'Outdoor Research';
UPDATE handwear SET brand_logo_url = '/media/brands/outdoor-research.svg' WHERE brand = 'Outdoor Research';
UPDATE headwear SET brand_logo_url = '/media/brands/outdoor-research.svg' WHERE brand = 'Outdoor Research';

UPDATE garments SET brand_logo_url = '/media/brands/smartwool.svg' WHERE brand = 'Smartwool';
UPDATE handwear SET brand_logo_url = '/media/brands/smartwool.svg' WHERE brand = 'Smartwool';
UPDATE headwear SET brand_logo_url = '/media/brands/smartwool.svg' WHERE brand = 'Smartwool';

UPDATE garments SET brand_logo_url = '/media/brands/helly-hansen.svg' WHERE brand = 'Helly Hansen';
UPDATE handwear SET brand_logo_url = '/media/brands/helly-hansen.svg' WHERE brand = 'Helly Hansen';
UPDATE headwear SET brand_logo_url = '/media/brands/helly-hansen.svg' WHERE brand = 'Helly Hansen';

-- ============================================
-- Garment item photo assets
-- ============================================

UPDATE garments
SET item_image_url = '/media/items/garment/norrona-lofoten-gore-tex-pro-jacket.svg'
WHERE brand = 'Norrøna' AND model_name = 'Lofoten Gore-Tex Pro Jacket';

UPDATE garments
SET item_image_url = '/media/items/garment/lululemon-pace-breaker-jacket.svg'
WHERE brand = 'Lululemon' AND model_name = 'Pace Breaker Jacket';

UPDATE garments
SET item_image_url = '/media/items/garment/patagonia-r1-pullover.svg'
WHERE brand = 'Patagonia' AND model_name = 'R1 Pullover';

UPDATE garments
SET item_image_url = '/media/items/garment/32-degrees-heat-midweight-crew.svg'
WHERE brand = '32 Degrees' AND model_name = 'Heat Midweight Crew';

UPDATE garments
SET item_image_url = '/media/items/garment/patagonia-capilene-cool-lightweight.svg'
WHERE brand = 'Patagonia' AND model_name = 'Capilene Cool Lightweight';

UPDATE garments
SET item_image_url = '/media/items/garment/patagonia-capilene-thermal-weight-boot-length-bottoms.svg'
WHERE brand = 'Patagonia' AND model_name = 'Capilene Thermal Weight Boot-Length Bottoms';

UPDATE garments
SET item_image_url = '/media/items/garment/patagonia-capilene-midweight-bottoms.svg'
WHERE brand = 'Patagonia' AND model_name = 'Capilene Midweight Bottoms';

UPDATE garments
SET item_image_url = '/media/items/garment/norrona-falketind-flex1-pants.svg'
WHERE brand = 'Norrøna' AND model_name = 'Falketind Flex1 Pants';

UPDATE garments
SET item_image_url = '/media/items/garment/patagonia-nano-air-hoody.svg'
WHERE brand = 'Patagonia' AND model_name = 'Nano-Air Hoody';

-- ============================================
-- Handwear item photo assets
-- ============================================

UPDATE handwear
SET item_image_url = '/media/items/handwear/patagonia-capilene-midweight-liner-glove.svg'
WHERE brand = 'Patagonia' AND model_name = 'Capilene Midweight Liner Glove';

UPDATE handwear
SET item_image_url = '/media/items/handwear/outdoor-research-stormtracker-sensor-gloves.svg'
WHERE brand = 'Outdoor Research' AND model_name = 'Stormtracker Sensor Gloves';

UPDATE handwear
SET item_image_url = '/media/items/handwear/helly-hansen-swift-ht-gloves.svg'
WHERE brand = 'Helly Hansen' AND model_name = 'Swift HT Gloves';

-- ============================================
-- Headwear item photo assets
-- ============================================

UPDATE headwear
SET item_image_url = '/media/items/headwear/patagonia-merino-air-balaclava.svg'
WHERE brand = 'Patagonia' AND model_name = 'Merino Air Balaclava';

UPDATE headwear
SET item_image_url = '/media/items/headwear/smartwool-thermal-merino-reversible-neck-gaiter.svg'
WHERE brand = 'Smartwool' AND model_name = 'Thermal Merino Reversible Neck Gaiter';

UPDATE headwear
SET item_image_url = '/media/items/headwear/patagonia-snowfarer-cap.svg'
WHERE brand = 'Patagonia' AND model_name = 'Snowfarer Cap';
