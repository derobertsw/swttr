# Catalog corrections for #41

Read-only audit of the live catalog on 2026-10-24: none of the five requested
products exists. Icebreaker has eight non-hooded base layers; Norrøna has shells,
down insulation and Falketind Flex1 pants, but neither requested jacket. The
Houdini is still `hard_shell`, and Heat Midweight Crew points to a removed SVG.
The image route also maps the crew to an unrelated REI image. Catalog read RLS
policies permit SELECT; permissions are not the cause of these gaps.

The two migrations add `windbreaker` (separately, so PostgreSQL commits the enum
value before it is used), recategorize the Houdini without changing its ID or
thermal data, repair Heat32's photo, and add all five named catalog products.
Brand aliases and case are checked before insertion; existing properties survive
replay. No user wardrobe or RLS policy changes are needed. Deploy the bundled
images with the app before applying the catalog migration to production. Apply
only these two migrations individually; do not push unrelated pending migrations.

## Manufacturer sources

Checked 2026-10-24. Images in `public/images/items/` are product photographs
from these manufacturer or retailer product records, not generated art.

- [Falketind Thermo40 Zip Hood, style 1814-24](https://www.norrona.com/en-GB/products/falketind/falketind-thermo40-hood-men/):
  320 g (men's L), 20D recycled nylon face (37 g/m²), recycled polyester fill
  (40 g/m²), full sleeves and a climbing-helmet-compatible hood. Windproof face,
  water-repellent only; no waterproof membrane claimed. Image: Norrøna
  Cloudinary `Auto/1814-24-5559-packshot-f.jpg`.
- [Senja Alpha90 Hood, style 5827-23](https://www.norrona.com/en-GB/products/senja/senja-alpha90-zip-hood-men/):
  302 g (men's L), full sleeves, close-fitting beanie-compatible hood. Power Grid
  (166 g/m²), Alpha 90 (95 g/m²), nylon face (49 g/m²). Wind protection is partial,
  at the front and shoulders; no waterproofness claimed. Image: Norrøna
  Cloudinary `Auto/5827-23-5567-packshot-f.jpg`.
- [32 Degrees men's midweight brushed baselayer crew](https://www.32degrees.com/products/mens-midweight-brushed-baselayer-crew-top):
  replacement photo from Shopify `T6FMQQ02RT_BLACK_3713.jpg`. Repairs both the
  catalog's missing SVG and the media route's incorrect hotlink. This is a current
  manufacturer reference photo, not verification of the original item's year.
- [Avalanche Weather Shield Ski Jacket, Sierra item 5JXFX](https://www.sierra.com/avalanche-weather-shield-ski-jacket-insulated~p~5jxfx/):
  polyester body, lining and insulation; water-resistant fabric, side vents,
  drawstring hood and full sleeves. The listing is the women's model pictured
  in Hydrangea/Graphite. Weight, insulation density, wind rating and waterproof
  pressure are unpublished and remain NULL. Do not promote water resistance
  to waterproofness. Photo: Sierra `5jxfx_01~460.2.jpg`.
- [Icebreaker Shifter Long Sleeve Zip Hood, style 104044](https://www.altitude-sports.com/p/icebreaker-shifter-long-sleeve-zip-hood-mens-ice-sol-104044):
  lightweight unbrushed terry with an adjustable, merino-lined hood and full
  sleeves. [Archived product specifications](https://www.yesmountain.com/goods/goods_view.php?goodsNo=186797915)
  identify 200 g/m² fabric, 88% merino / 9% nylon / 3% LYCRA, and 298 g (men's M).
  Photo: Altitude Sports `ice-sol-104044_gritstone-heather.jpg`.
- [Icebreaker GT 260 Quantum Hood Men](https://www.naturzeit.com/icebreaker-gt-260-quantum-hood-men/5288):
  archived technical hoodie, 98% merino / 2% Lycra, close hood, full sleeves,
  two-way zipper and underarm mesh. [Backcountry's GT260 record, ICE0407](https://www.backcountry.com/icebreaker-icebreaker-gt220-quantum-hooded-shirt-long-sleeve-mens-ice0407)
  confirms the 260 g/m² class and touring use. Weight remains NULL; a modern
  Quantum IV's weight or 100% merino composition must not be substituted.
  Photo: Naturzeit `51877.jpg`, visibly bearing the Icebreaker GT mark.

## Thermal estimates

Manufacturer specifications do **not** establish measured clo or evaporative
resistance. The new rows use `derived_from_similar`, confidence 0.4 (0.3 for Avalanche),
`generic_estimate=true`, and a source reference to this section. These are
engineering starting estimates, not product lab results. Activity scores are
editorial suitability estimates. No product temperature limits are invented.

| Product | Torso / arms / legs / whole-body clo | Recl torso / arms / legs / whole | Evap potential | Regional uncertainty allowance |
| --- | --- | --- | --- | --- |
| Falketind Thermo40 | 1.85 / 1.60 / 0 / 1.33 | 28.14 / 30.19 / 0 / 21.62 | 0.22 | 0.45 clo |
| Senja Alpha90 | 0.95 / 0.80 / 0 / 0.68 | 11 / 9 / 0 / 7.75 | 0.38 | 0.35 clo |
| Avalanche Weather Shield | 2.40 / 1.60 / 0 / 1.60 | 54.26 / 36.80 / 0 / 36.33 | 0.22 | 0.65 clo |
| Icebreaker Shifter | 0.65 / 0.55 / 0 / 0.46 | 14 / 12 / 0 / 10 | 0.30 | 0.25 clo |
| Icebreaker GT260 Quantum | 0.85 / 0.70 / 0 / 0.60 | 18 / 16 / 0 / 13 | 0.25 | 0.30 clo |

Before deployment these estimates were reconciled with migrations 035/036,
which are already live. Whole-body clo and Recl use the current 0.5 torso +
0.25 arms + 0.25 legs convention, rounded to two decimals.

Falketind uses 035's synthetic-fill curve, `0.70 + 0.0522 * fill^0.842`, at the
published 40 g/m², rounded to 0.05 clo (1.85 torso), with arms at about 0.87 of
torso (1.60). Recl scales the Nano-Air reference's regional values with clo
(35.59 * 1.85/2.34 and 38.49 * 1.60/2.04). Different fill and construction make
this approximate. Senja uses the R1 Air fleece regional proxy; its panel layout
does not support treating Alpha fill weight as whole-jacket insulation.

Avalanche uses the current calibrated Columbia Joy Peak Lite thermal proxy,
with a larger allowance because fill density is unpublished. It is an archetype
estimate, not a claim that Avalanche has Columbia's assumed 60/40 g/m² fill.
Snowdrifter was reclassified as an uninsulated shell in 036 and is unsuitable
as this product's thermal proxy. Avalanche's protection comes from its own
listing, with no waterproof membrane or wind rating inferred from the proxy.
Shifter uses 200 Oasis regional values; GT260 uses 260 Tech Crewe regional values,
with whole-body totals reconciled to the weights above. These proxies do not
establish the behavior of a different knit, fit or ventilation. Evap potential
is a catalog ranking estimate, not a measured im/clo ratio. Uncertainty allowances
are not statistical confidence intervals. No jacket mass is inferred from fabric
density. Avalanche is eligible for alpine use; both Icebreaker mid layers are
available to touring and other active pools.

Coverage is 1 for torso and arms, 0 for legs. All five have `covers_head=true`.
Existing hood handling (#44) maps `helmet_compatible` to 0.5 clo for Falketind
and `attached` to 0.4 for Senja; Senja's hood is not credited with a helmet.
The other three use `attached` (0.4 clo), with no helmet compatibility claimed.
These are the app's existing type-based estimates, not measured hood values.

## Identity choices

The user asked us to research the broad names rather than supply model links.
They do not establish which exact products the original author intended. For
“Avalanche ski jacket” we selected the documented Weather Shield model sold by
Sierra, consistent with the issue's retailer context. For “Icebreaker hoodie”
we selected Shifter style 104044; for “Icebreaker Merino GT hoodie” we selected
the archived GT260 Quantum. These are explicit catalog choices, not confirmed
identifications of someone's own garments. Shifter and GT260 Quantum are
different designs, avoiding two generic rows for the same hoodie. No later
100% merino Quantum generation is added as a duplicate of the legacy GT product.
The live catalog and local seeds were checked again before adding these three;
none has an existing hooded Icebreaker or Avalanche product.
Bulk REI/Sierra ingestion belongs to #94 and is not required for these repairs.

## Verification

PGlite tests apply both migrations after the existing catalog foundations, replay
them, verify relation completeness and preservation of IDs/properties/policies,
and exercise all five migrated rows through catalog browse/search data and
recommendations, including each researched Icebreaker mid and Avalanche outer.
The migration files are replayable and are applied individually during release;
the preflight audit itself is read-only.
