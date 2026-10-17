# Estimating thermal and protection values

Contents: [What the engine reads](#what-the-engine-reads) · [Units and conventions](#units-and-conventions) · [Lab anchors](#lab-anchors) · [Catalog scale](#catalog-scale) · [Scaling method](#scaling-method) · [Breathability (evap_potential)](#breathability-evap_potential) · [Protection](#protection) · [Category, usage and coverage](#category-usage-and-coverage) · [Activity scores and temperatures](#activity-scores-and-temperatures) · [Gloves and headwear](#gloves-and-headwear) · [Provenance](#provenance)

The catalog's values are on one shared scale, anchored to USARIEM manikin tests and tuned through golden recommendation tests. A new item is only useful if it lands on that scale, so calibrate against existing rows (`catalog-lookup.mjs analogues …`) rather than against outside clo tables. The live catalog beats the orientation numbers below whenever they disagree; re-check before relying on them.

## What the engine reads

Spend your care where the engine looks. Columns not listed (garment temperature ranges, `activity_notes`, ventilation, materials, `packed_volume_liters`) are stored for display and future use but not read by recommendation code today. Fill them, but don't agonize.

| Column | How it's used | Why it matters |
| --- | --- | --- |
| `rcl_torso/arms/legs` | Summed per region across the outfit, multiplied by USARIEM ensemble regression (torso 0.836, arm 0.809, leg 0.961), compared to regional IREQ targets | The main warmth numbers; arms are a common shortfall |
| `recl_torso/arms/legs` | Summed and regressed the same way (0.999 / 0.737 / 0.950) for outfit permeability | Outfit breathability and moisture risk |
| `rcl_whole_body` | Must be non-null for the item to be recommendable; used for insulation sorting and some totals | Wrong weighting mis-ranks items |
| `evap_potential` | Per-garment breathability: ranks garments and gates sports (table below) | Decides which sports can use the item |
| `hood_type` | Adds head clo: attached 0.4, removable 0.3, helmet_compatible 0.5; only helmet-compatible hoods count with a helmet | Keep the hood out of torso clo |
| `windproof_rating`, `waterproof_rating`, `waterproof_mm` | Wind/wet capabilities; shells ranked by `waterproof_mm`; **any `waterproof_mm > 0` makes the engine treat the garment as waterproof** | Weather protection for running, snow/rain outfits |
| `category`, `garment_type`, `covers_*` | Layer slot (base, mid, insulation, shell) and which regions it occupies; bibs occupy only leg slots | Ensemble structure |
| `usage`, `coverage_*`, `suitable_activities` | Standalone vs underlayer for running/XC; regional coverage; activity allow-list (NULL = all) | Running/XC outfits need standalone pieces |
| Activity scores | Catalog gates (table below) | Whether the item appears for a sport at all |
| `weight_grams` | Ski-touring pack weight and weight scoring | Touring choices |
| Handwear/headwear `rcl_clo`, `min_temp_active/static` | Picks the item closest to the extremity target, filtered by min temperature | Glove and hat choice |
| Provenance columns | Shown in item details and the API's thermal provenance | Honesty about estimates |

**Sport gates** (current code; check `src/lib/recommendations/sports/` if in doubt):

| Sport | Catalog score gate | Breathability gate (`evap_potential` ≥) |
| --- | --- | --- |
| Running | none | 0.30 |
| Biking | none | 0.25 |
| XC skiing | `xc_skiing_score` ≥ 6 | 0.25 (shells 0.20) |
| Ski touring | uphill or downhill score ≥ 6 | 0.20 for the uphill kit |
| Alpine | `alpine_skiing_score` ≥ 5 | — |

## Units and conventions

- **Regional clo is the garment alone, averaged over the whole region including any exposed skin.** Partial coverage is already folded in: a short-sleeve tee has arm clo ≈ 0.02, not its fabric's clo. Never multiply by coverage again. Uncovered regions are 0; covered regions must not be NULL.
- Values are for one garment on a manikin, before ensemble regression. Don't pre-discount for layering.
- **Ret** (`recl_*`) is garment evaporative resistance in m²Pa/W on the same manikin basis. A fabric's lab RET (ISO 11092, "RET < 6") is a fabric property: store it in `garment_protection.breathability_ret`. The garment Ret is much higher because it includes the whole fabric stack and trapped air. Don't copy fabric RET into `recl_*`.
- **Whole body** = 0.5 × torso + 0.25 × arms + 0.25 × legs, for both clo and Ret. Round clo to 2 decimals and Ret to 1. On 2026-10-17, 55 of 100 catalog garments were off this weighting by more than 0.02 clo. The worst stored something close to torso clo: Macro Puff 1.58 vs 1.19 weighted, Jackson Glacier Parka 2.05 vs 1.55. Don't copy an analogue's whole-body value; recompute it.
- **`im_whole_body`** = min(1, 9.40 × rcl_whole_body / recl_whole_body). That's the ISO 9920 permeability index (60.65 Pa/K × 0.155 m²K/W per clo). It's displayed in item details and is not the same as `evap_potential`.

## Lab anchors

USARIEM T21-03 single-garment manikin results, also in the `calibration_reference` table. These are the only measured anchors. Patagonia Capilene Midweight, Nano-Air Hoody and DAS Parka in the catalog carry these values as `lab_tested`.

| Garment | Torso clo | Arm clo | Torso Ret | Arm Ret | Weight |
| --- | ---: | ---: | ---: | ---: | ---: |
| SOF Lightweight Crew (synthetic knit) | 0.55 | 0.34 | 12.3 | 12.2 | 150 g |
| ECWCS Lightweight Undershirt | 0.55 | 0.36 | 9.9 | 9.4 | 180 g |
| ECWCS Midweight Shirt (grid fleece) | 0.69 | 0.55 | 13.0 | 13.2 | 220 g |
| ECWCS Fleece Jacket (Polartec) | 1.05 | 0.94 | 14.2 | 14.6 | 400 g |
| SOF Nano-Air Hoody (60 g/m² FullRange) | 2.34 | 2.04 | 35.6 | 38.5 | 336 g |
| ECWCS ECW Parka (synthetic) | 3.69 | 2.38 | 75.6 | 60.5 | 900 g |
| CAF CADPAT IECS Parka | 4.68 | 3.20 | 82.5 | 68.3 | 1200 g |
| SOF DAS Jacket (PrimaLoft) | 4.70 | 2.94 | 82.4 | 63.9 | 539 g |

## Catalog scale

Orientation only, from the live catalog on 2026-10-17 (torso unless noted). Always pull analogues for the specific item.

| Kind | Torso clo | Arms ÷ torso | Torso Ret | evap_potential |
| --- | --- | --- | --- | --- |
| Light synthetic base (Capilene Cool, Lifa Active) | 0.30–0.35 | 0.70–0.85 | 6–8 | 0.40–0.45 |
| Midweight synthetic base | 0.42–0.69 | 0.80–0.90 | 10–14 | 0.32–0.36 |
| Merino 175 / 200 / 250–260 | 0.50 / 0.62–0.68 / 0.75–0.90 | 0.82–0.85 | 11 / 12–15 / 16–19 | 0.35 / 0.29–0.34 / 0.24–0.28 |
| Base bottoms (legs) | 0.30 light – 0.80 merino 260 | — | 7–18 | 0.26–0.42 |
| Grid/air fleece mid (R1, R1 Air) | 0.80–0.95 | 0.84–0.88 | 11–16 | 0.38 |
| Wind shirt (Houdini, Pace Breaker) | 0.15–0.20 | 0.80–0.90 | 8–12 | 0.38–0.50 |
| Softshell jacket | 0.55–1.20 | 0.80–0.87 | 12–22 | 0.25–0.42 |
| Active/light synthetic (Nano-Air UL, Atom LT, Micro Puff) | 0.80–1.15 | 0.75–0.87 | 12–22 | 0.30–0.35 |
| Belay puffy, synthetic or down | 1.90–3.20 | 0.78–0.81 | 38–48 | 0.12–0.16 |
| 3L hardshell jacket | 0.15–0.28 | 0.79–0.83 | 22–32 | 0.15–0.22 |
| 2.5L rain shell (Helium) | 0.12 | 0.83 | 40 | 0.07 |
| Insulated ski jacket | 1.15–1.80 (parka 2.2) | 0.70–0.87 | 26–45 | 0.15–0.28 |
| Shell pants/bibs (legs) | 0.20–0.25 | — | 25–28 | 0.18–0.20 |
| Softshell / wind pants (legs) | 0.50–1.00 | — | 11–20 | 0.25–0.42 |
| Insulated ski pants (legs) | 1.00–1.40 | — | 32–40 | 0.16–0.22 |

**Known inconsistency: light synthetic insulation.** The lab-tested Nano-Air Hoody (60 g/m² FullRange) has 2.34 torso clo. Derived light puffies with similar fill (Atom LT at about 60 g/m² Coreloft, Micro Puff, Odin Light) sit at 1.10–1.15, while the derived DAS Light Hoody sits at 2.0. When you add light insulation, compute both a peer-consistent value (scaled from the closest derived peers) and a lab-scaled value (scaled from Nano-Air). Store the peer-consistent value so the item ranks fairly against what's already there. Size `uncertainty_clo` to reflect the gap, and put both numbers in the item card and PR. Recalibrating the whole category is a separate decision for the user, not something to do one item at a time.

## Scaling method

1. **Pick the closest analogue.** Same category, garment type and insulation or fabric family; prefer `lab_tested`, then rows with stated specs (`calculated_from_materials`). Two or three analogues that bracket the new item are better than one.
2. **Scale the insulation layer, not the whole garment.** Treat a jacket's torso clo as a base (shell + lining + trapped air, about 0.3–0.4 clo for a light jacket) plus an insulation term proportional to fill weight in g/m² within one insulation family:
   `clo_new ≈ base + (clo_ref − base) × fill_new / fill_ref`.
   Across families, scale by `material_reference.clo_per_oz_sqyd`: PrimaLoft Gold 0.84, Climashield APEX 0.78, FullRange 0.70, Alpha Direct 0.65, 800 FP down 1.1, 850 FP down 1.2. g/m² ÷ 33.9 = oz/yd². For a family that isn't listed, scale from the nearest listed one and say so. For down, scale by fill weight × fill power relative to a down analogue. If only total fill grams are published, convert using a comparable jacket's area, or scale from an analogue's total fill, and widen the uncertainty.
3. **Fabric layers scale with weight and structure.** Within a family, clo rises with gsm (see the merino row above). Grid, waffle and brushed knits run warmer and more breathable than flat knits of the same weight. Wool has higher Ret than synthetics at equal clo.
4. **Arms:** full sleeves are usually 0.80–0.88 × torso. Scale down for lighter sleeve fill (e.g. 60/40 g/m² body/sleeves). Approximate values: ¾ sleeves ≈ 0.75 × full sleeves, short sleeves 0.02–0.05, vests 0.
5. **Legs:** full-length 1.0; boot-length or ¾ tights about 0.8–0.9 of full; shorts 0.06–0.10. Bibs also get a torso value (shell bib about 0.15, insulated bib about 0.6).
6. **Ret follows construction.** Within a family, Ret rises with insulation: synthetic jackets run about 15–19 m²Pa/W of torso Ret per torso clo. Air-permeable insulation and shells (Alpha Direct, Pertex Quantum Air, "active" insulation) sit well below that. Membrane shells have a floor of about 22–32 (3L), with 2.5L near 40. Arms Ret is about 0.85–0.9 × torso.
7. **Cross-check.** Compare the result with the brand's intended use, comparable items' temperature ratings, and the weight (two jackets at the same weight and fill family shouldn't differ by 2×). If checks disagree, prefer the analogue-scaled value and widen the uncertainty.

## Breathability (evap_potential)

`evap_potential` is a hand-calibrated breathability scale, not the ISO im/clo formula. On the formula, Gamma Hoody would be about 0.6; the catalog stores 0.25, and the sport gates are tuned to the stored scale. Place new items by bracketing analogues with similar Ret and construction:

| Torso Ret | Typical evap_potential |
| --- | --- |
| 6–8 (light synthetic base, wind shirt) | 0.40–0.50 |
| 10–14 (midweight base, air-permeable active insulation) | 0.32–0.45 |
| 14–19 (merino, softshell) | 0.24–0.35 |
| 20–30 (light puffy, 3L hardshell) | 0.15–0.32 |
| 35–48 (insulated ski jacket, belay puffy) | 0.12–0.25 |
| 40+ with 2.5L laminate | ~0.07 |

Adjustments: air-permeable fabrics, mesh or grid construction, +0.03–0.08. Merino, −0.05 relative to a synthetic at the same Ret. Membranes sit at the low end of their band. Pick the value the product deserves. Don't tune it to clear a gate; report the gate outcome instead.

## Protection

- **`windproof_rating`:** when the brand states wind performance anywhere (product page, buying guide, spec sheet), use its wording; a lower claim like "wind-resistant" beats your own inference from a "waterproof" claim. The scorer deducts 10 weather points for `wind_resistant` in significant wind and none for `windproof`, so overstating it inflates scores. Search the brand's buying or fabric guides too: FP Movement's ski guide was the only place rating the Lift Love Bib as wind-resistant. Otherwise:
  - `windproof`: a windproof membrane or laminate (Gore-Tex, Windstopper/Infinium, Pertex Shield), or a stated air permeability of about 0–1 CFM.
  - `wind_resistant`: tight wovens, softshells, and puffies with down-proof or Pertex Quantum shells.
  - `none`: knits and fleece.
- **`waterproof_rating`:**
  - `waterproof`: a waterproof membrane with fully taped or welded seams.
  - `water_resistant`: a membrane without full taping, or a laminated softshell.
  - `DWR_only`: treated fabric with no membrane.
  - `none`: untreated knits.
- **Marketing claims without specs:** "fully waterproof" with no seam-taping or mm detail is `water_resistant` unless the brand or a reliable review confirms taped or sealed seams. Say so in the card, so the user can check the garment's tags. An unqualified "5k/5k" fabric is `water_resistant`.
- **`waterproof_mm`:** set it only for `waterproof` items. The engine treats any value > 0 as waterproof, so leave it NULL for a water-resistant softshell even if the brand quotes a number (put that in `activity_notes`). Gore-Tex products are seeded at 28000, citing Gore's minimum standard. For other membranes, use the stated figure or NULL. A NULL sorts below rated shells when the engine picks a shell, so mention that in the card.
- `breathability_ret` and `breathability_mvtr` (fabric values as published), `air_permeability_cfm`, `membrane_type`, `seam_construction`: copy from the brand when stated.
- **Ventilation:** add a row only when the item has vents or a two-way or half zip. Typical `ventilation_factor` values:

  | Feature | `ventilation_factor` |
  | --- | --- |
  | None | 1.0 |
  | Half-zip base or fleece | 0.85 |
  | Softshell with vents, or pants with thigh vents | 0.70–0.75 |
  | Shell with long pit zips | 0.60–0.65 |
  | Full side zips | about 0.60 |

## Category, usage and coverage

- **Category picks the layer slot:**
  - `base_layer`: next to skin.
  - `mid_layer_light`: grid or air fleece, active layers.
  - `mid_layer_heavy`: thick fleece, thermal pro.
  - `insulation_synthetic` / `insulation_down`: puffies.
  - `soft_shell`: includes wind shirts.
  - `hard_shell`: waterproof membrane shells.
  - `outer_insulated`: insulated waterproof ski jackets, pants and bibs.
- **There is no `windbreaker` enum value in prod**, although the code mentions one. File wind shirts as `soft_shell`. The Houdini filed as `hard_shell` makes ski touring treat it as the descent shell.
- **`usage`** (always set it for new items; 89 of 100 rows are still unreviewed):
  - `standalone`: worn as the only or outer piece, e.g. shells, softshells, running tights, wind pants.
  - `underlayer`: thermal underwear and liners not meant to be worn alone.
  - `either`: base tops that work alone, fleeces, puffies.
- **`coverage_torso/arms/legs`:** the fraction of each region the garment covers, from 0 to 1, consistent with `covers_*`. Use 0 when a region isn't covered.
- **`suitable_activities`:** leave NULL (meaning all sports) unless the item truly shouldn't appear for some sports. Values are `running`, `biking`, `xc_skiing`, `alpine_skiing`, `ski_touring_uphill`. XC doesn't filter on this column today.
- **`covers_head`** is true when there's a hood.
- **One-piece suits** (`garment_type = 'one_piece'`, usually `outer_insulated`): the catalog had none before 2026-10. Alpine and XC build outfits by regional occupancy, so a suit fills the torso, arm and leg outer slots at once. The touring, running and biking builders have no one-piece handling. Set `suitable_activities = ARRAY['alpine_skiing']` for a resort suit so it can't enter the touring pool through its downhill score. Hybrid suits (puffer top, stretch bottoms) get very different regional values, so estimate each region from its own construction.

## Activity scores and temperatures

Scores run from 1 to 10. Calibrate against analogues; typical bands (xc / touring up / touring down / alpine):

| Kind | Scores |
| --- | --- |
| Light breathable base, wind shirt | 8–9 / 8–9 / 4–7 / 3–5 |
| Merino midweight | 5–7 / 5–7 / 6–7 / 6–8 |
| Softshell | 6–8 / 8–9 / 6–8 / 4–7 |
| Light puffy | 6–7 / 7 / 5–6 / 5–6 |
| Belay puffy | 2–3 / 3–4 / 7–8 / 7 |
| 3L hardshell | 4–5 / 5–7 / 8–9 / 8–9 |
| Insulated ski jacket or pants | 2–3 / 3–4 / 7–8 / 8–9 |

Garment `min/max_temp_active/static` (°C): copy the pattern of close analogues; they aren't read by the engine for garments. Write `activity_notes` as one or two sentences on construction and best use.

## Gloves and headwear

The engine picks the item whose `rcl_clo` is closest to the extremity target and filters by `min_temp_active` or `min_temp_static`, so make those three values consistent.

- **Sanity rule** (Gao et al. 2016; catalog pattern): static minimum ≈ 10 − 10 × clo °C (1 clo → 0°C, 2 → −10, 3 → −20, 4 → −30); active minimum ≈ static − 10. Brand ratings are often optimistic.
- **Handwear clo / dexterity:**

  | Type | `rcl_clo` | `dexterity_score` |
  | --- | --- | --- |
  | `liner_glove` | 0.45–0.6 | 9 |
  | `light_glove` | 0.85–1.2 | 7–8 |
  | `insulated_glove` | 1.5–2.2 (a few to 2.7) | 4–6 |
  | `lobster_mitten` | 2.8–3.0 | 3–4 |
  | `mitten` | 1.8–4.0 | 1–3 |
  | `shell_overmitten` | 0.8–0.9 | 3 |

  `waterproof` needs a membrane insert; `windproof` needs a membrane or windproof shell. For a glove with a removable liner, store the combined system, and add the liner separately only if it's sold separately.
- **Headwear clo:**

  | Type | `rcl_clo` |
  | --- | --- |
  | `ski_helmet` | 0.5–0.85 (more venting and less liner → lower) |
  | `liner_beanie` | 0.45–0.5 |
  | `midweight_beanie` | 0.7–0.85 |
  | `heavy_beanie` | about 1.1 |
  | `balaclava_light` | 0.75–0.8 |
  | `balaclava_heavy` | 1.4–1.5 |
  | `buff_thin` | 0.3–0.35 |
  | `buff_heavy` | 0.55–0.65 |
  | `headband` | 0.3 |
  | `facemask` | about 0.9 |

  Set `covers_ears/neck/face`, `helmet_compatible` (a beanie or balaclava thin enough to wear under a helmet) and `windproof`.

## Provenance

- **`estimation_method`:**
  - `lab_tested`: only for a published manikin test of this exact product.
  - `calculated_from_materials`: built up from stated fill and fabric specs.
  - `derived_from_similar`: scaled from analogues. Most items.
- **`confidence_score`** (qualitative, not a probability):
  - 0.95+: lab tested.
  - 0.75–0.85: stated fill weight or fabric gsm plus a same-family analogue.
  - 0.6–0.7: partial specs.
  - 0.4–0.5: marketing copy only.
  - 0.3: generic archetypes.
- **`uncertainty_clo`:** an engineering allowance on regional clo, not a statistical interval. Roughly 10% of the largest regional value for lab data, 15–20% with good specs, 25–35% with thin data or a known catalog inconsistency, and never below 0.05.
- **`data_source`:** product URL, spec or review URLs, and the analogues used, e.g. `https://… ; spec: https://… ; analogues: Patagonia Nano-Air Hoody (USARIEM lab), Arc'teryx Atom LT Hoody`. Set it on both `garment_thermal_properties` and `garment_protection`.
- **`generic_estimate`:** false for branded products. True is reserved for "SWTTR Generic" archetypes, which follow `docs/running-xc-foundations.md`.
