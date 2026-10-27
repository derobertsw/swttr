-- Replace the item-image lookup route with direct catalog URLs.
-- Apply before deploying the route removal. Existing explicit URLs are retained,
-- except for the seven paths verified missing from public/images/items.
-- Silhouettes preserve the existing presentation for items without product photos.

CREATE OR REPLACE FUNCTION public.set_item_media_urls()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
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

  -- A new item may have no photo. The UI handles that without a database lookup.
  NEW.item_image_url := NULLIF(btrim(NEW.item_image_url), '');
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  -- One-time copy of the old route's product mappings. All local targets exist.
  photos CONSTANT JSONB := $photos$
{
  "32 degrees|heat midweight crew": "https://www.rei.com/media/e95a1679-4f82-4d6b-b67c-0502c6af70f9.jpg?size=784x588",
  "helly hansen|swift ht gloves": "https://www.rei.com/media/7ea4c6a0-efc4-43fc-835f-2ce81e0172b1.jpg?size=784x588",
  "lululemon|pace breaker jacket": "/images/items/lululemon-pace-breaker-jacket.jpg",
  "norrona|falketind flex1 pants": "/images/items/norrona-falketind-flex1-pants.jpg",
  "norrona|lofoten gore tex pro jacket": "/images/items/norrona-lofoten-gore-tex-pro-jacket.jpg",
  "outdoor research|stormtracker sensor gloves": "/images/items/outdoor-research-stormtracker-sensor-gloves.png",
  "patagonia|capilene cool lightweight": "https://www.rei.com/media/fd1306e6-96cb-46da-8f06-4ca4eff32420.jpg?size=2000",
  "patagonia|capilene midweight": "/images/items/patagonia-capilene-midweight.png",
  "patagonia|capilene midweight bottoms": "https://www.rei.com/media/cff8a526-16a4-47bc-a88f-d948f8e45fb9.jpg?size=2000",
  "patagonia|capilene midweight liner glove": "https://www.rei.com/media/1ba1dc35-c207-4e7c-91eb-263744daa5d3.jpg?size=784x588",
  "patagonia|capilene thermal weight boot length bottoms": "https://www.rei.com/media/ed65e9ef-fbce-4f9a-a97f-6cb8f4c44bf2.jpg?size=2000",
  "patagonia|das parka": "/images/items/patagonia-das-parka.jpg",
  "patagonia|houdini jacket": "/images/items/patagonia-houdini-jacket.jpg",
  "patagonia|macro puff hoody": "/images/items/patagonia-macro-puff-hoody.jpg",
  "patagonia|merino air balaclava": "/images/items/patagonia-merino-air-balaclava.jpg",
  "patagonia|micro puff hoody": "/images/items/patagonia-micro-puff-hoody.jpg",
  "patagonia|nano air hoody": "https://www.rei.com/media/7c9e4ec6-2f43-4846-ab6d-df8f1c49f4ff.jpg?size=2000",
  "patagonia|snowdrifter jacket": "/images/items/patagonia-snowdrifter-jacket.jpg",
  "patagonia|snowfarer cap": "/images/items/patagonia-snowfarer-cap.jpg",
  "smartwool|thermal merino reversible neck gaiter": "https://www.rei.com/media/ac0bc34a-7e30-4939-97f7-f06dd4996f8e.jpg?size=784x588",
  "arc teryx|gamma mx hoody": "/images/items/arcteryx-gamma-mx-hoody.jpg",
  "arc teryx|fission sv gloves": "/images/items/arcteryx-fission-sv-gloves.jpg",
  "arc teryx|venta glove": "/images/items/arcteryx-venta-glove.jpg",
  "arc teryx|rho ltw beanie": "/images/items/arcteryx-rho-ltw-beanie.jpg",
  "icebreaker|merino 260 tech long sleeve crewe": "/images/items/icebreaker-merino-260-tech-long-sleeve-crewe.jpg",
  "icebreaker|merino 260 tech long sleeve half zip": "/images/items/icebreaker-merino-260-tech-long-sleeve-half-zip.jpg",
  "icebreaker|merino 260 tech leggings": "/images/items/icebreaker-merino-260-tech-leggings.jpg",
  "icebreaker|merino 200 oasis long sleeve crewe": "/images/items/icebreaker-merino-200-oasis-long-sleeve-crewe.jpg",
  "icebreaker|merino 200 zoneknit long sleeve half zip": "/images/items/icebreaker-merino-200-zoneknit-long-sleeve-half-zip.jpg",
  "icebreaker|merino 175 everyday long sleeve crewe": "/images/items/icebreaker-merino-175-everyday-long-sleeve-crewe.jpg",
  "mountain hardwear|ghost whisperer 2 jacket": "/images/items/mountain-hardwear-ghost-whisperer-2-jacket.jpg",
  "black diamond|guide glove": "/images/items/black-diamond-guide-glove.jpg",
  "black diamond|guide finger": "/images/items/black-diamond-guide-finger.jpg",
  "black diamond|mercury mitt": "/images/items/black-diamond-mercury-mitt.jpg",
  "outdoor research|helium rain jacket": "/images/items/outdoor-research-helium-rain-jacket.jpg",
  "outdoor research|ferrosi hoodie": "/images/items/outdoor-research-ferrosi-hoodie.png",
  "outdoor research|ferrosi joggers": "/images/items/outdoor-research-ferrosi-joggers.png",
  "outdoor research|snowcrew jacket": "/images/items/outdoor-research-snowcrew-jacket.png",
  "outdoor research|carbide jacket": "/images/items/outdoor-research-carbide-jacket.png",
  "outdoor research|carbide bibs": "/images/items/outdoor-research-carbide-bibs.png",
  "smith|vantage mips": "/images/items/smith-vantage-mips.jpg",
  "giro|range mips": "/images/items/giro-range-mips.jpg",
  "arc teryx|gamma hoody": "/images/items/arcteryx-gamma-hoody.jpg",
  "arc teryx|rush jacket": "/images/items/arcteryx-rush-jacket.jpg",
  "arc teryx|sabre pant": "/images/items/arcteryx-sabre-pant.jpg",
  "rab|nebitron pro insulated": "/images/items/rab-nebitron-pro-insulated.jpg",
  "rab|borealis": "/images/items/rab-borealis.jpg",
  "rab|neutrino pro": "/images/items/rab-neutrino-pro.png",
  "the north face|summit breithorn hoodie": "/images/items/the-north-face-summit-breithorn-hoodie.png",
  "obermeyer|raze jacket": "/images/items/obermeyer-raze-jacket.png",
  "smith|method pro mips": "/images/items/smith-method-pro-mips.png",
  "giro|ratio mips": "/images/items/giro-ratio-mips.webp",
  "patagonia|r1 air full zip hoody": "/images/items/patagonia-r1-air-full-zip-hoody.png",
  "patagonia|r1 techface jacket": "/images/items/patagonia-r1-techface-jacket.png",
  "hestra|ergo grip active": "/images/items/hestra-ergo-grip-active.png",
  "patagonia|wind shield pants": "/images/items/patagonia-wind-shield-pants.png"
}
$photos$::jsonb;
  item RECORD;
  media_key TEXT;
  image_url TEXT;
  silhouette TEXT;
BEGIN
  FOR item IN
    SELECT * FROM (
      SELECT 'garments' AS table_name, id, brand, model_name, item_image_url,
        category::text, garment_type::text, hood_type::text,
        NULL::text AS handwear_type, NULL::text AS headwear_type
      FROM public.garments
      UNION ALL
      SELECT 'handwear', id, brand, model_name, item_image_url,
        NULL, NULL, NULL, handwear_type::text, NULL
      FROM public.handwear
      UNION ALL
      SELECT 'headwear', id, brand, model_name, item_image_url,
        NULL, NULL, NULL, NULL, headwear_type::text
      FROM public.headwear
    ) AS catalog
    WHERE item_image_url IS NULL OR btrim(item_image_url) = ''
      OR starts_with(item_image_url, '/api/media/item-image')
      OR starts_with(item_image_url, '/media/items/')
      OR item_image_url = ANY (ARRAY[
        '/images/items/arcteryx-beta-ar-jacket.jpg',
        '/images/items/norrona-falketind-thermo40-zip-hood.jpg',
        '/images/items/norrona-senja-alpha90-hood.jpg',
        '/images/items/avalanche-weather-shield-ski-jacket.jpg',
        '/images/items/icebreaker-shifter-long-sleeve-zip-hood.jpg',
        '/images/items/icebreaker-gt260-quantum-hood.jpg',
        '/images/items/32-degrees-heat-midweight-crew.jpg'
      ])
  LOOP
    -- These existing catalog mappings use ASCII names apart from Norrøna.
    media_key := btrim(regexp_replace(lower(translate(item.brand, 'øØ', 'oO')), '[^a-z0-9]+', ' ', 'g'))
      || '|' || btrim(regexp_replace(lower(item.model_name), '[^a-z0-9]+', ' ', 'g'));
    image_url := photos ->> media_key;

    IF image_url IS NULL THEN
      silhouette := CASE
        WHEN item.table_name = 'headwear' THEN
          CASE WHEN item.headwear_type = 'ski_helmet' THEN 'ski-helmet' ELSE 'beanie' END
        WHEN item.table_name = 'handwear' THEN
          CASE
            WHEN item.handwear_type IN ('liner_glove', 'light_glove') THEN 'gloves-lightweight'
            WHEN item.handwear_type IN ('mitten', 'lobster_mitten', 'shell_overmitten') THEN 'mittens'
            ELSE 'gloves-heavy'
          END
        WHEN item.garment_type = 'vest' THEN 'vest'
        WHEN item.garment_type = 'shorts' THEN 'shorts'
        WHEN item.garment_type = 'bib' THEN 'ski-bibs'
        WHEN item.garment_type IN ('top_short_sleeve', 'top_sleeveless') THEN 'short-sleeve-shirt'
        WHEN item.garment_type = 'pants' THEN
          CASE WHEN item.category IN ('hard_shell', 'outer_insulated') THEN 'heavy-ski-pants' ELSE 'lightweight-legs' END
        WHEN item.garment_type IN ('jacket', 'one_piece') THEN
          CASE WHEN item.hood_type IS NOT NULL AND item.hood_type <> 'none' THEN 'hooded-jacket' ELSE 'jacket-no-hood' END
        WHEN item.garment_type = 'top_long_sleeve' THEN
          CASE WHEN item.category = 'base_layer' THEN 'base-layer-top' ELSE 'pullover-no-hood' END
        ELSE 'hooded-jacket'
      END;
      image_url := '/images/silhouettes/' || silhouette || '.png';
    END IF;

    EXECUTE format('UPDATE public.%I SET item_image_url = $1 WHERE id = $2', item.table_name)
      USING image_url, item.id;
  END LOOP;
END;
$$;
