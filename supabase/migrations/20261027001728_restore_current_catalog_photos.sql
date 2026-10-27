-- The first direct-URL migration was prepared on an older working branch.
-- These six product photos already exist on main and in production. Restore
-- their direct paths, without replacing photos subsequently edited by an admin.
UPDATE public.garments AS garment
SET item_image_url = photo.item_image_url
FROM (VALUES
  ('32 Degrees', 'Heat Midweight Crew',
    'https://www.rei.com/media/e95a1679-4f82-4d6b-b67c-0502c6af70f9.jpg?size=784x588',
    '/images/items/32-degrees-heat-midweight-crew.jpg'),
  ('Avalanche', 'Weather Shield Ski Jacket',
    '/images/silhouettes/hooded-jacket.png',
    '/images/items/avalanche-weather-shield-ski-jacket.jpg'),
  ('Icebreaker', 'GT260 Quantum Hood',
    '/images/silhouettes/hooded-jacket.png',
    '/images/items/icebreaker-gt260-quantum-hood.jpg'),
  ('Icebreaker', 'Shifter Long Sleeve Zip Hood',
    '/images/silhouettes/hooded-jacket.png',
    '/images/items/icebreaker-shifter-long-sleeve-zip-hood.jpg'),
  ('Norrøna', 'Falketind Thermo40 Zip Hood',
    '/images/silhouettes/hooded-jacket.png',
    '/images/items/norrona-falketind-thermo40-zip-hood.jpg'),
  ('Norrøna', 'Senja Alpha90 Hood',
    '/images/silhouettes/hooded-jacket.png',
    '/images/items/norrona-senja-alpha90-hood.jpg')
) AS photo(brand, model_name, previous_url, item_image_url)
WHERE garment.brand = photo.brand
  AND garment.model_name = photo.model_name
  AND garment.item_image_url = photo.previous_url;
