# Hand and head accessory clo on the part-manikin scale (#376, 2026-11-19)

**Status: implemented in migration `20261119120000_anchor_accessory_clo.sql` (not applied in production) and the matching code.** Garments moved onto USARIEM T21-03's single-garment scale in migrations 035 and 036 ([catalog-thermal-audit.md](catalog-thermal-audit.md), [catalog-thermal-calibration.md](catalog-thermal-calibration.md)). Handwear and headwear `rcl_clo` stayed unanchored estimates, and the local hand and head bands were tuned against them (#370). This puts both on measured part-manikin data and keeps selection where it was. Finding 6 of the [algorithm review](algorithm-review.md) raised it.

## Summary

1. **The scale.** Hand and head clo is now *effective* insulation on a thermal hand or head manikin: the total insulation measured with the item on (ASTM F1291 conditions, 20°C air at 0.4 m/s), minus the bare manikin's boundary air layer. The anchors are USARIEM T18-01 (USMC glove insert, mitten liner and shell, microfleece cap, lightweight balaclava) and T22-14 (Army extreme-cold and trigger-finger mitten sets).
2. **The catalog ran high by a nearly constant factor per part.** Every analogue sits at 0.50–0.78× the catalog's estimate for hands and 0.40–0.50× for head items. The spread is no larger than the analogues' own rounding and product differences, so each part takes one factor: **hands 0.60, head 0.45** (`ACCESSORY_CLO_SCALE`). All 69 live rows (28 handwear, 41 headwear) are rescaled. The catalog's relative estimates within a part are kept.
3. **The local bands carry the same factors,** and so do every clo threshold applied to hands and head: the pole-grip and kept-glove allowance (0.55 → 0.33), the 0.05 clo selection tolerance, the comfort verdict's local terms, and the requirement-matching margins. A worn hood counts in the head budget at 0.45 of its hood-up value, which keeps the weight it had when the bands were tuned (see "Hoods"; counting hoods in full is an open decision).
4. **Selection doesn't move apart from rounding.** In the golden suite, 69 snapshots change in their numbers, and one changes its choice: XC in near-freezing rain from the wardrobe now wears the owned softshell glove instead of nothing, because a 0.02 clo margin between going without and the glove became a tie, which pole grip breaks. Across a wider sweep, 55 of 1,620 accessory assessments (3.4 %) change at a band edge, as many toward lighter items as toward warmer ones.
5. **Catalog ratings, the cross-check, are unchanged by construction.** At an item's static rating temperature, alpine's hand band minimum is about 1.75× the item's clo. At active ratings, cycling and the touring climb are within about 20 %. The alpine and descent hand bands are high against both the ratings and the Army's heaviest mitten set; that is a band question, not part of this change.

## The scale

ASTM F1291 manikins report total resistance `Rt`: the item, the air trapped under it, and the boundary air outside it. Three quantities follow from it:

- **Total**, `It = 6.45 · Rt` clo.
- **Effective**, `Icle = It − Ia`, with `Ia` the bare manikin's total. T18-01 reports this one for its body-part manikins, so their nude rows are in each table.
- **Intrinsic**, `Icl = It − Ia / fcl`, with `fcl` the clothing area factor. T21-03 garments, and so 035 and 036, use this one.

For head and hand items USARIEM itself takes `fcl = 1` (T22-14, "an fcl of 1 was used in all cases except for the footwear"), which makes intrinsic and effective the same. With a real `fcl` the difference is `Ia · (1 − 1/fcl)`: about 0.03–0.05 clo for a knit cap (`Ia` head 0.58 clo, `fcl` ≈ 1.1) and 0.15–0.2 clo for a mitten (`Ia` hand 0.45 clo, `fcl` 1.5–2). Both are inside the uncertainties below.

**Hand zones, not all zones.** T18-01's hand manikin reports all zones (1–8, including the wrist), the hand (1–7) and the fingers (1–5). The hand section matches the whole-body manikin's hand area (T18-01 Table 2), and T22-14 leaves the wrist out, so the anchors use the hand section. The all-zone values the issue quoted are listed alongside.

### Anchors

T18-01 Table 8, handwear (`Rt` in m²K/W; clo = 6.45 × (Rt − nude)):

| Item | Rt all zones / hand | Effective clo, hand zones (all zones) |
|---|---|---|
| Nude | 0.07 / 0.07 | – |
| Light-duty FR glove insert (I) | 0.12 / 0.11 | **0.26** (0.32) |
| Extreme-cold mitten liner (L) | 0.26 / 0.27 | 1.29 (1.23) |
| Extreme-cold mitten shell (S), worn alone | 0.29 / 0.30 | 1.48 (1.42) |
| I + S | 0.31 / 0.30 | 1.48 (1.55) |
| L + S | 0.36 / 0.34 | **1.74** (1.87) |
| I + L + S | 0.35 / 0.34 | **1.74** (1.81) |

T18-01 Table 7, headwear (head manikin, nude 0.09 m²K/W). The table labels the balaclava "USMC Protective Face Shield"; the text and Table 1 call it the Lightweight Balaclava.

| Item | Rt | Effective clo |
|---|---|---|
| Hardface microfleece cold-weather cap | 0.14 | **0.32** |
| Lightweight balaclava | 0.15 | **0.39** |
| Cap + balaclava | 0.20 | **0.71** |

T22-14 Table 3 (intrinsic with `fcl` = 1, hand section without the wrist, head without the neck):

| Item | Clo |
|---|---|
| Army extreme-cold mitten set: outer, liner and wool five-finger insert | **2.85** (hands) |
| Trigger-finger mitten set: outer and wool insert | **1.82** (hands) |
| Cold-weather cap and balaclava (measured in earlier USARIEM work) | 1.83 (head) |

**Limits of the data.**

- `Rt` is given to 0.01 m²K/W, so each anchor carries about ±0.065 clo from rounding alone, which is ±25 % for the glove insert.
- The mitten shell and the balaclava extend past the measured zones, so part of their insulation isn't counted (T18-01).
- T22-14's cap and balaclava (1.83) is 2.6× T18-01's similar-sounding pair (0.71). The report doesn't itemize them or describe their materials, so it is used only as the heavy end of the head range, not as an anchor.
- These are military analogues, not the catalog's products.

### One factor per part

| Type | Catalog mean, earlier scale | Analogue (hand zones) | Ratio |
|---|---|---|---|
| `liner_glove` | 0.53 | T18-01 insert 0.26 | 0.50 |
| `lobster_mitten` | 2.90 | T22-14 trigger-finger set 1.82 | 0.63 |
| `mitten`, Hestra Leather Box Mitt (wool liner) | 3.20 | T18-01 liner + shell 1.74 | 0.54 |
| `mitten`, expedition systems (Alti Mitt, Mercury Mitt and System) | 3.67 | T22-14 extreme-cold set 2.85 | 0.78 |
| **Hands** | | mean of the four ratios | **0.61 → 0.60** |
| `midweight_beanie` | 0.80 | T18-01 cap 0.32 | 0.40 |
| `balaclava_light` | 0.78 | T18-01 balaclava 0.39 | 0.50 |
| midweight beanie + light balaclava | 1.58 | T18-01 cap + balaclava 0.71 | 0.45 |
| **Head** | | | **0.45** |

A least-squares fit through the origin gives 0.66 for hands, with the heaviest mittens dominating it; the mean gives each type one vote. Type-specific ratios would re-rank items on differences no larger than the anchors' rounding, so they were rejected. One factor keeps the catalog's within-part ordering, which is the only product-specific information there is, and lets the bands carry the same factor.

**Confidence and uncertainty** follow 035 and 036's three tiers. `uncertainty_clo` is an engineering allowance, not a statistical interval, and is never below 0.07 clo (the anchors' rounding):

| Basis | Types | Confidence | Uncertainty |
|---|---|---|---|
| Direct analogue | liner gloves, lobster mitts, mitten systems, midweight beanies, light balaclavas | 0.6 | 25 % |
| Bracketed between analogues | light and insulated gloves, the light Arc'teryx Venta Mitten, liner and heavy beanies, heavy balaclavas, bike helmets (0.07 clo) | 0.5 | 35 % |
| No manikin data (part factor only) | neck gaiters and buffs, the headband, the face scarf, ski helmets | 0.4 | 50 % |
| Contradicted by an analogue | shell overmittens | 0.4 | 1.0 clo |

Handwear and headwear had no provenance columns; the migration adds `confidence_score`, `uncertainty_clo` and `data_source` to both tables, as `garment_thermal_properties` has them.

**Shell overmittens are unresolved.** T18-01 measured an extreme-cold mitten shell worn alone at 1.48 clo; the catalog's two shells (Outdoor Research Firebrand Mitt, Black Diamond Mercury Mitt Shell) scale to 0.48 and 0.54. A shell alone traps a lot of air, but the selector treats an overmitten as a standalone mitten, and at 1.48 it would win cold-day hand choices on its wind and wet ratings. They stay on the part factor with a 1.0 clo allowance. The fix belongs in the selector (treat overmittens as a layer over a glove), not in their clo.

**Helmets.** No head-manikin data for ski helmets was found, so they take the head factor (0.23–0.38 clo), as the bike-helmet seed did in reverse: it set 0.20 as twice the lab value because the catalog's head items ran about twice their lab values. Bike helmets land at 0.09, inside the 0–0.15 clo a head-manikin study measured over a bare head (Aljaste, Kuklane & Heidmets 2015, cited in `20261117031100_seed_bike_helmets.sql`).

**Neck pieces** have no data at all: head manikins stop at the neck guard zone. They take the head factor.

## Hoods

T21-03 measured jackets hood up and hood down on the whole-body manikin. The head region's intrinsic clo with the hood up:

| Jacket | Hood down | Hood up |
|---|---|---|
| SOF Mixed Range Jacket (soft shell) | 0.04 | 0.34 |
| SOF Stem Shell Jacket (thin shell) | 0.04 | 0.50 |
| CAF CADPAT IECS Parka | 0.00 | 0.74 |
| SOF DAS Jacket (insulated) | 0.18 | 1.40 |
| SOF Helo Parka | 0.12 | 1.44 |

`HOOD_CLO_VALUES` (attached 0.4, removable 0.3, helmet-compatible 0.5, insulated 1.0) already match these hood-up values, so they were on the manikin scale all along, while hats were at about 2.2× theirs. Counted in full against the rescaled head band, a hood would weigh 2.2× what it did when the bands were tuned. In a sweep (5 sports × 9 temperatures × 3 winds × 3 efforts, catalog and wardrobe), head choices then change in 30–60 of 81 scenarios per sport and mode, and mean comfort drops 13–15 points for running and XC from the catalog (6–7 from the wardrobe), mostly because a worn hood alone exceeds the head band.

The engine can't tell whether a hood is up, and it counts every worn hood. So `hoodInsulation` credits a worn hood at **0.45 of its hood-up value** (`HOOD_HEAD_CREDIT`), the weight it had when the bands were tuned. **That is an unvalidated assumption that keeps selection where it was, not evidence.** Counting hoods in full, or only when the phase calls for them (lift rides, descents, wind), is a product decision left open here.

## The bands

The heuristic multipliers (`EXTREMITY_IREQ_MULTIPLIERS`) still scale the whole-body IREQ of the phase the hands and head follow; `calculateExtremityIreq` then multiplies by `ACCESSORY_CLO_SCALE`. Everything else that compares hand or head clo with a threshold carries the same factor:

| Threshold | Earlier scale | Part-manikin scale | Where |
|---|---|---|---|
| CoWEDA-inspired extremity buffer | added as computed | × 0.60 / × 0.45 | `applyCowedaBufferToExtremityTargets` |
| XC pole-grip and kept-glove allowance | 0.55 | 0.33 | `POLE_GRIP_MAX_CLO` |
| Selection and manual-check tolerance | 0.05 | 0.03 hands, 0.0225 head | `EXTREMITY_CLO_EPSILON` |
| Comfort verdict and score, local terms | as given | divided back by the factor | `BodyPartClo.scale` in `comfort.ts` |
| Requirement matching: "light" label, needed, margin | 0.2 / 0.05 / 0.15 | × factor | `requirements.ts` |

The comfort verdict's local shortfall and excess terms were tuned in the earlier scale's units: their thresholds are absolute clo and the score's warmth penalty is per clo of excess. So hand and head parts carry their factor, and those terms divide by it. As a side effect, `decision.delta` for a verdict set by the hands or head is in the earlier scale's units. The response's `validation_buffer.extremity` still reports the allowance before the factor. Reported clo, bands and body-part deltas are on the manikin scale.

## Cross-checks

**Catalog temperature ratings.** Bands at the catalog's rating temperatures, 8 mph wind, moderate effort, against the fixture's 47 non-helmet accessories (item clo ÷ band minimum; head items include a 0.32 clo ski helmet for alpine and a 0.09 clo bike helmet for cycling). The rescale moves both sides by the same factor, so these ratios are what they were:

| Band | Rating used | Hands, median (range) | Head, median (range) |
|---|---|---|---|
| Alpine | static | 0.57 (0.28–0.94) | 0.87 (0.61–1.04) |
| Touring climb | active | 1.24 (0.64–1.98) | 0.82 (0.57–0.96) |
| Cycling | active | 1.16 (0.60–1.86) | 1.05 (0.77–1.32) |

At its static rating an item covers only about 57 % of alpine's hand minimum. At −40°C alpine asks for 3.73 clo on the hands and 2.24 on the head, against 2.85 and 1.83 for T22-14's Army target ensemble, whose modeled hand skin reached 15°C after 70 minutes, sedentary at −40°C in 1 m/s wind. Both say the alpine and descent hand bands run high; #370 already reports that no rated item reaches them in deep cold. Not changed here.

**Gao et al. 2016.** At −30.6°C and 0.4 m/s, windstopper fleece gloves (0.95 clo) and fleece-lined ski mittens (1.46 clo) held finger temperature at 7.9°C and 17.8°C. The abstract doesn't say how the glove values were measured; either way, a ski mitten near 1.5 clo sits with the rescaled mittens (1.1–2.4), not with the earlier 3.2–4.0.

## Golden and sweep impact

- **Golden suite:** 69 snapshots change; 68 only in accessory clo, bands, deltas, `maxExtremityDeficit`, generic estimates, and comfort scores within 1 point from rounding to 0.01 clo. The one choice that changes is XC, wardrobe, near-freezing rain: before, going without (0.38 clo of shortfall, counted double) beat the owned 1.0 clo softshell glove (0.40 of excess) by 0.02, and the hands were reported missing pole-grip gloves. Rescaled and rounded, the two tie at 0.24, and pole grip breaks the tie, so the glove is worn and reported warmer than the band. Comfort goes from 57.4 to 60.9.
- **Sweep** (the matrix in "Hoods", 1,620 accessory assessments): 55 change at a band edge. 19 move to lighter items, 19 to warmer ones, and 17 keep their items but change status. Rounding bands to 0.001 clo instead of 0.01 would remove only 8 of them, so bands stay at 0.01.

## Applying the migration

**Apply it before deploying the code.** Code and catalog must change together: with the new code and old values, bands are 0.45–0.60× while items aren't, so the selector picks items far too light for the cold. With the new values and the old code, items look short against the old bands and the selector picks the warmest rated items with shortfall warnings. That is the safer side of the gap, so apply first and deploy promptly.

Check first, as for 035 and 036: merged migrations have shown up in prod's history shortly after a merge. If `list_migrations` shows `anchor_accessory_clo`, only run the check query. Otherwise paste it as one script in the Supabase SQL editor:

```sql
BEGIN;
-- contents of supabase/migrations/20261119120000_anchor_accessory_clo.sql
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261119120000', 'anchor_accessory_clo');
COMMIT;
```

Then check it:

```sql
SELECT
  (SELECT count(*) FROM handwear WHERE data_source = 'docs/catalog-accessory-clo.md#per-item-values') AS handwear_rescaled,
  (SELECT count(*) FROM headwear WHERE data_source = 'docs/catalog-accessory-clo.md#per-item-values') AS headwear_rescaled,
  (SELECT count(*) FROM handwear WHERE data_source IS NULL) + (SELECT count(*) FROM headwear WHERE data_source IS NULL) AS not_rescaled;
```

Expect 28, 41 and 0. A row edited by hand since its seed is left alone and counts in `not_rescaled`; an accessory added after 2026-11-19 on the earlier scale does too, and needs converting.

## Still open

- Hoods: credit in full, or by phase (above).
- Shell overmittens: the selector should treat them as a layer over a glove.
- Alpine and descent hand bands sit about 1.75× above static ratings.
- Custom wardrobe items (`src/data/genericLayerClo.ts`) carry generic hand and head values (0.05–0.45 clo) on neither scale. They enter only manual checks, not selection.
- Neck pieces and ski helmets have no manikin data.

## Per-item values

Live catalog read-only on 2026-11-19 (no row edited since its seed). "Earlier clo" is the seeded value; the part-manikin value is it × 0.60 (hands) or × 0.45 (head), rounded to 0.01.

| Item | Type | Earlier clo | Part-manikin clo | ± clo | Confidence | Basis | In fixture |
|---|---|---|---|---|---|---|---|
| Helly Hansen Swift HT Gloves | `insulated_glove` | 1.50 | **0.90** | 0.32 | 0.5 | bracketed: between T18-01 glove insert 0.26 and T22-14 trigger-finger mitten set 1.82 | yes |
| Hestra All Mountain CZone | `insulated_glove` | 1.50 | **0.90** | 0.32 | 0.5 | bracketed: between T18-01 glove insert 0.26 and T22-14 trigger-finger mitten set 1.82 | yes |
| Hestra Ergo Grip Active | `insulated_glove` | 1.60 | **0.96** | 0.34 | 0.5 | bracketed: between T18-01 glove insert 0.26 and T22-14 trigger-finger mitten set 1.82 | yes |
| Hestra Freeride | `insulated_glove` | 1.80 | **1.08** | 0.38 | 0.5 | bracketed: between T18-01 glove insert 0.26 and T22-14 trigger-finger mitten set 1.82 | yes |
| Outdoor Research Adrenaline 3-in-1 Gloves | `insulated_glove` | 1.80 | **1.08** | 0.38 | 0.5 | bracketed: between T18-01 glove insert 0.26 and T22-14 trigger-finger mitten set 1.82 | yes |
| Hestra Fall Line | `insulated_glove` | 2.00 | **1.20** | 0.42 | 0.5 | bracketed: between T18-01 glove insert 0.26 and T22-14 trigger-finger mitten set 1.82 | yes |
| Hestra Army Leather Heli Ski | `insulated_glove` | 2.10 | **1.26** | 0.44 | 0.5 | bracketed: between T18-01 glove insert 0.26 and T22-14 trigger-finger mitten set 1.82 | yes |
| Black Diamond Guide Glove | `insulated_glove` | 2.20 | **1.32** | 0.46 | 0.5 | bracketed: between T18-01 glove insert 0.26 and T22-14 trigger-finger mitten set 1.82 | yes |
| Arc'teryx Fission SV Gloves | `insulated_glove` | 2.70 | **1.62** | 0.57 | 0.5 | bracketed: between T18-01 glove insert 0.26 and T22-14 trigger-finger mitten set 1.82 | yes |
| Outdoor Research Flurry Sensor Gloves | `light_glove` | 0.85 | **0.51** | 0.18 | 0.5 | bracketed: between T18-01 insert 0.26 and ECW mitten liner 1.29 | yes |
| Outdoor Research Vigor Lightweight | `light_glove` | 0.90 | **0.54** | 0.19 | 0.5 | bracketed: between T18-01 insert 0.26 and ECW mitten liner 1.29 | yes |
| Black Diamond Midweight Softshell | `light_glove` | 1.00 | **0.60** | 0.21 | 0.5 | bracketed: between T18-01 insert 0.26 and ECW mitten liner 1.29 | yes |
| Norrøna falketind dri short Gloves | `light_glove` | 1.00 | **0.60** | 0.21 | 0.5 | bracketed: between T18-01 insert 0.26 and ECW mitten liner 1.29 | yes |
| Outdoor Research Stormtracker Sensor Gloves | `light_glove` | 1.10 | **0.66** | 0.23 | 0.5 | bracketed: between T18-01 insert 0.26 and ECW mitten liner 1.29 | yes |
| Arc'teryx Venta Glove | `light_glove` | 1.20 | **0.72** | 0.25 | 0.5 | bracketed: between T18-01 insert 0.26 and ECW mitten liner 1.29 | yes |
| Patagonia Capilene Midweight Liner Glove | `liner_glove` | 0.45 | **0.27** | 0.07 | 0.6 | analogue: T18-01 light-duty glove insert 0.26 | yes |
| Smartwool Liner Glove | `liner_glove` | 0.50 | **0.30** | 0.08 | 0.6 | analogue: T18-01 light-duty glove insert 0.26 | yes |
| Black Diamond Lightweight Screentap | `liner_glove` | 0.55 | **0.33** | 0.08 | 0.6 | analogue: T18-01 light-duty glove insert 0.26 | yes |
| HEAD Ultrafit Multi-Sport Running Gloves | `liner_glove` | 0.60 | **0.36** | 0.09 | 0.6 | analogue: T18-01 light-duty glove insert 0.26 | yes |
| Hestra Army Leather Heli 3-Finger | `lobster_mitten` | 2.80 | **1.68** | 0.42 | 0.6 | analogue: T22-14 trigger-finger mitten set 1.82 | yes |
| Black Diamond Guide Finger | `lobster_mitten` | 3.00 | **1.80** | 0.45 | 0.6 | analogue: T22-14 trigger-finger mitten set 1.82 | yes |
| Arc'teryx Venta Mitten | `mitten` | 1.80 | **1.08** | 0.38 | 0.5 | bracketed: light mitt: near T18-01 ECW mitten liner 1.29 | yes |
| Hestra Leather Box Mitt | `mitten` | 3.20 | **1.92** | 0.48 | 0.6 | analogue: T18-01 ECW mitten liner + shell 1.74; T22-14 ECW mitten set 2.85 | yes |
| Black Diamond Mercury Mitt | `mitten` | 3.50 | **2.10** | 0.53 | 0.6 | analogue: T18-01 ECW mitten liner + shell 1.74; T22-14 ECW mitten set 2.85 | yes |
| Black Diamond Mercury Mitt System | `mitten` | 3.50 | **2.10** | 0.53 | 0.6 | analogue: T18-01 ECW mitten liner + shell 1.74; T22-14 ECW mitten set 2.85 | yes |
| Outdoor Research Alti Mitt | `mitten` | 4.00 | **2.40** | 0.60 | 0.6 | analogue: T18-01 ECW mitten liner + shell 1.74; T22-14 ECW mitten set 2.85 | yes |
| Outdoor Research Firebrand Mitt | `shell_overmitten` | 0.80 | **0.48** | 1.00 | 0.4 | assumed: part scale; T18-01 measured a mitten shell alone at 1.48 (unresolved) | yes |
| Black Diamond Mercury Mitt Shell | `shell_overmitten` | 0.90 | **0.54** | 1.00 | 0.4 | assumed: part scale; T18-01 measured a mitten shell alone at 1.48 (unresolved) | yes |
| BlackStrap Expedition Hood Balaclava | `balaclava_heavy` | 1.40 | **0.63** | 0.22 | 0.5 | bracketed: between T18-01 lightweight balaclava 0.39 and T22-14 cap + balaclava 1.83 | yes |
| Outdoor Research Ninjaclava | `balaclava_heavy` | 1.50 | **0.68** | 0.24 | 0.5 | bracketed: between T18-01 lightweight balaclava 0.39 and T22-14 cap + balaclava 1.83 | yes |
| Patagonia Merino Air Balaclava | `balaclava_light` | 0.75 | **0.34** | 0.09 | 0.6 | analogue: T18-01 lightweight balaclava 0.39 | yes |
| Smartwool Merino 250 Balaclava | `balaclava_light` | 0.80 | **0.36** | 0.09 | 0.6 | analogue: T18-01 lightweight balaclava 0.39 | yes |
| Giro Syntax MIPS | `bike_helmet` | 0.20 | **0.09** | 0.07 | 0.5 | bracketed: Aljaste et al. 2015 head manikin: 0 to 0.15 over a bare head | yes |
| Smith Signal MIPS | `bike_helmet` | 0.20 | **0.09** | 0.07 | 0.5 | bracketed: Aljaste et al. 2015 head manikin: 0 to 0.15 over a bare head | yes |
| Specialized Align II MIPS | `bike_helmet` | 0.20 | **0.09** | 0.07 | 0.5 | bracketed: Aljaste et al. 2015 head manikin: 0 to 0.15 over a bare head | yes |
| Smartwool Thermal Merino Reversible Neck Gaiter | `buff_heavy` | 0.55 | **0.25** | 0.13 | 0.4 | assumed: part scale; head manikins exclude the neck | yes |
| Buff Thermonet | `buff_heavy` | 0.60 | **0.27** | 0.14 | 0.4 | assumed: part scale; head manikins exclude the neck | yes |
| Turtle Fur Original Fleece Neck Gaiter | `buff_heavy` | 0.60 | **0.27** | 0.14 | 0.4 | assumed: part scale; head manikins exclude the neck | yes |
| Smartwool Merino 250 Neck Gaiter | `buff_heavy` | 0.65 | **0.29** | 0.15 | 0.4 | assumed: part scale; head manikins exclude the neck | yes |
| Buff Original | `buff_thin` | 0.30 | **0.14** | 0.07 | 0.4 | assumed: part scale; head manikins exclude the neck | yes |
| Smartwool Merino 150 Neck Gaiter | `buff_thin` | 0.35 | **0.16** | 0.08 | 0.4 | assumed: part scale; head manikins exclude the neck | yes |
| Seirus Neofleece Combo Scarf | `facemask` | 0.90 | **0.41** | 0.21 | 0.4 | assumed: part scale; no manikin data | yes |
| Patagonia Capilene Cool Daily Headband | `headband` | 0.30 | **0.14** | 0.07 | 0.4 | assumed: part scale; no manikin data | yes |
| Smartwool Cozy Cabin Hat | `heavy_beanie` | 1.10 | **0.50** | 0.18 | 0.5 | bracketed: above T18-01 microfleece cap 0.32 | yes |
| Patagonia Capilene Cool Daily Beanie | `liner_beanie` | 0.45 | **0.20** | 0.07 | 0.5 | bracketed: thinner than T18-01 microfleece cap 0.32 | yes |
| Smartwool Merino 150 Beanie | `liner_beanie` | 0.50 | **0.23** | 0.08 | 0.5 | bracketed: thinner than T18-01 microfleece cap 0.32 | yes |
| Arc'teryx Rho LTW Beanie | `midweight_beanie` | 0.70 | **0.32** | 0.08 | 0.6 | analogue: T18-01 microfleece cap 0.32 | yes |
| Patagonia Brodeo Beanie | `midweight_beanie` | 0.80 | **0.36** | 0.09 | 0.6 | analogue: T18-01 microfleece cap 0.32 | yes |
| Patagonia Snowfarer Cap | `midweight_beanie` | 0.85 | **0.38** | 0.10 | 0.6 | analogue: T18-01 microfleece cap 0.32 | yes |
| Smartwool Merino 250 Cuffed Beanie | `midweight_beanie` | 0.85 | **0.38** | 0.10 | 0.6 | analogue: T18-01 microfleece cap 0.32 | yes |
| Atomic Backland CTD | `ski_helmet` | 0.50 | **0.23** | 0.12 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Salomon MTN Lab | `ski_helmet` | 0.55 | **0.25** | 0.13 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Giro Ledge MIPS | `ski_helmet` | 0.60 | **0.27** | 0.14 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Smith Mission MIPS | `ski_helmet` | 0.65 | **0.29** | 0.15 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Oakley MOD3 MIPS | `ski_helmet` | 0.70 | **0.32** | 0.16 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| POC Meninx RS MIPS | `ski_helmet` | 0.70 | **0.32** | 0.16 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Smith Level MIPS | `ski_helmet` | 0.70 | **0.32** | 0.16 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Giro Neo MIPS | `ski_helmet` | 0.75 | **0.34** | 0.17 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Salomon Husk Prime MIPS | `ski_helmet` | 0.75 | **0.34** | 0.17 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Smith Method Pro MIPS | `ski_helmet` | 0.75 | **0.34** | 0.17 | 0.4 | assumed: part scale; no helmet manikin data found | no |
| Atomic Savor MIPS | `ski_helmet` | 0.80 | **0.36** | 0.18 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Giro Ratio MIPS | `ski_helmet` | 0.80 | **0.36** | 0.18 | 0.4 | assumed: part scale; no helmet manikin data found | no |
| Oakley MOD5 MIPS | `ski_helmet` | 0.80 | **0.36** | 0.18 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| POC Obex MIPS | `ski_helmet` | 0.80 | **0.36** | 0.18 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Scott Flow Pro MIPS | `ski_helmet` | 0.80 | **0.36** | 0.18 | 0.4 | assumed: part scale; no helmet manikin data found | no |
| Smith Vantage MIPS | `ski_helmet` | 0.80 | **0.36** | 0.18 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Sweet Protection Switcher MIPS | `ski_helmet` | 0.80 | **0.36** | 0.18 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Giro Range MIPS | `ski_helmet` | 0.85 | **0.38** | 0.19 | 0.4 | assumed: part scale; no helmet manikin data found | yes |
| Sweet Protection Igniter 2Vi MIPS | `ski_helmet` | 0.85 | **0.38** | 0.19 | 0.4 | assumed: part scale; no helmet manikin data found | yes |

## Sources

- Rioux T.P., Karis A.J., Moore B.A., Xu X. *Biophysical evaluation of individual component levels and selected configurations of the United States Marine Corps cold-weather clothing ensemble.* USARIEM T18-01, January 2018: Tables 2, 7 and 8, read from the user's copy.
- Rioux T.P., D'Angelo P., Hirst E., Castellani M.P., Xu X. *Determining energy requirements for heated clothing and individual equipment using manikin and modeling methods.* USARIEM T22-14, August 2022: Tables 3 and 6, read from the user's copy.
- Rioux T.P. et al. *Biophysical properties of five cold weather clothing systems and the predicted regional properties of ensembles.* USARIEM T21-03, November 2020: Tables 2 and 4–5 (hood-up head values), read from the user's copy.
- Gao C., Halder A., Kuklane K., Lin L.-Y. 2016, Lund University ([record](https://lup.lub.lu.se/search/publication/0254db92-7a67-4d07-9eab-3d4aaf22ad03)).
- Aljaste, Kuklane & Heidmets, International Cycling Safety Conference 2015, as cited in `20261117031100_seed_bike_helmets.sql`.
- ASTM F1291-16; ISO 9920:2007 for the intrinsic, effective and total definitions.
