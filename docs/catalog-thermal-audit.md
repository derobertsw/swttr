# Gear catalog thermal audit (2026-10-17)

This audit checks the gear catalog's thermal values for internal consistency. The audit itself was research only: nothing was written to production, and the corrected fixtures used for its golden runs were thrown away afterwards. On 2026-10-17 option C was chosen. Migration 034 implements it, and it has not been applied to production yet (see "Applying migration 034").

## Summary

1. **Whole-body clo.** 54 of 100 garments store an `rcl_whole_body` more than 0.02 clo away from the 0.5 / 0.25 / 0.25 torso / arms / legs weighting (55 if the one row at exactly 0.020 is counted). 35 are too high, 19 too low. Worst: Jackson Glacier Parka 2.05 vs 1.55, Macro Puff Hoody 1.58 vs 1.19. `recl_whole_body` drifts the same way: 43 rows are off by more than 0.5 m²Pa/W. Fixing both touches 58 rows. Alpine and XC don't read whole-body values, so they don't change. Running, biking and ski touring change in 13 of the 60 golden scenarios.
2. **Light synthetic insulation scale.** The lab-tested Nano-Air Hoody (torso 2.34 clo) and the derived Atom LT, Micro Puff and Odin Light (1.10–1.15) have about the same fill, but they sit on two different scales. Base layers and fleece follow the lab scale. Shells, insulated outerwear and most puffies follow a scale roughly 0.25–0.5× of it. The ensemble model and the targets assume the lab scale, but the IREQ side leaves out the wind-and-motion correction that would make lab values usable for active sports. Recalibrating only the puffies makes things less consistent, not more. The coherent fix is a separate calibration project.
3. **Usage and coverage.** 89 of 100 garments have `usage` and all three `coverage_*` fractions unreviewed (NULL), with the same semantics as migration 022. Nothing in recommendation selection reads them yet, so there is no behavior change today, but they block #247 and #248.

**Decision (2026-10-17): option C.** Fix the whole-body values and recalibrate the 16 puffies to the lab scale. `supabase/migrations/034_catalog_whole_body_and_puffy_clo.sql` does both. The golden fixture and snapshots carry the same values, and `catalog-thermal-audit.database.test.ts` checks the migration against the fixture. The audit had recommended option B (whole-body only). The rest of the calibration — shells, insulated outerwear and the wind-and-motion correction — is still open, and so are the inversions option C introduces (see "Decision and what's still open").

## How this was checked

- **Live catalog.** Read on 2026-10-17 with the add-wardrobe-item skill's `catalog-lookup.mjs` (PostgREST GETs only): 100 garments, 28 handwear, 38 headwear.
- **Golden fixture.** `src/test/fixtures/gear-catalog.json` holds 88 of the 100 garments, with thermal values identical to production. The 12 live-only garments include DAS Light Hoody, Nebitron Pro, Neutrino Pro, Summit Breithorn and Nano-Air Ultralight, so changes to those don't show up in golden results.
- **Variant runs.** Corrected fixtures were built in a throwaway worktree on the local branch `audit/tmp-thermal-golden` (not pushed). Each was run through `golden.test.ts` and through a temporary harness that records each of the 60 golden scenarios (5 sports × 6 conditions × catalog/wardrobe): targets, outfit, regional clo, comfort score and warnings. Tests were run with `NODE_OPTIONS=--no-experimental-webstorage`.
- **Sources.** USARIEM T21-03 itself (DTIC AD1115339) could not be fetched: DTIC returned "Under Maintenance" on every attempt that day. The CoWEDA paper's Table 2 reproduces T21-03's item-level regional resistances for 13 ECWCS items, and those are used below as the T21-03 reference.

## 1. Whole-body values don't follow the regional weighting

### What's wrong

`predictEnsembleThermal` computes whole-body clo as `0.5 × torso + 0.25 × arms + 0.25 × legs` (`REGIONAL_WEIGHTS`), with an uncovered region counting as zero. Pants rows follow that rule (Bugaboo II: legs 1.15 → whole body 0.29), as do the three generic running items added in 022. Most tops and jackets don't. The off-formula rows fall into three patterns:

| Pattern | Rows | Where from | Example |
|---|---|---|---|
| Mean over covered regions only (uncovered legs left out, not counted as zero) | 22 | all 002 | Macro Puff: (0.5 × 1.65 + 0.25 × 1.45) / 0.75 = 1.58 |
| Other values above the formula | 13 | all 002 | Spyder Leader: 1.40 vs 1.10 |
| Below the formula (about two-thirds of torso, like the lab rows) | 19 | 002, 006, 011 | DAS Light Hoody: 1.35 vs 1.40 |

The three `lab_tested` rows are in the last group: Nano-Air 1.65 vs 1.68, DAS Parka 2.85 vs 3.09, Capilene Midweight 0.45 vs 0.48. Their whole-body values were not measured, though. All eight `calibration_reference` rows in `002_seed_garments.sql` have `measured_rcl_whole` and `measured_recl_whole` NULL, so those numbers were written by hand. T21-03 does report a whole-body column for each garment. Even so, a manikin whole-body value includes the head, hands and feet, so it is not the torso/arms/legs quantity the code uses. The formula value is the right one for this code.

`recl_whole_body` follows the same patterns: 72 rows differ by more than 0.01 and 43 by more than 0.5 m²Pa/W. Worst: Jackson Glacier 43 vs 32.5, and Helium Rain Jacket 38 vs 28.75.

### Where it matters

- `getEnsembleClo` and the per-layer budget in `breathable-ensemble.ts`: running and biking pick mids and shells against a whole-body budget.
- The ski-touring climb builder and `selectPackableInsulation` (which insulation goes in the pack).
- `retainRunningProtection`: it uses `sortByInsulation(…, false)` to pick the protective shell with the lowest whole-body clo.
- The API's per-garment `rcl`/`recl`, and the clo shown in the wardrobe (`getClo`, `GarmentDetails`).
- Not used by alpine, by XC (both use the regional search), by the comfort score (regional), or by `hasUsableThermalData`, which only checks that a number is present. All 100 rows have one.

### Whole-body correction (migration 034, step 2)

Rule: for every garment whose stored whole-body value differs from the formula by more than 0.02 clo (or 0.5 m²Pa/W for Ret), store the formula value rounded to two decimals the way Postgres `ROUND` does. That gives 58 rows: 54 clo and 43 Ret changes. Rows are sorted by the size of the clo change. The table shows the values from the current regional values. For the 16 puffies, step 1 of the migration re-derives the regional values first, so their final whole-body values are the ones in "Puffy recalibration" below.

| Garment | Category | Seeded in | Torso / arms / legs clo | Whole-body clo | Whole-body Ret | Pattern | In fixture |
|---|---|---|---|---|---|---|---|
| Patagonia Jackson Glacier Parka | outer_insulated | 002 | 2.2 / 1.8 / 0 | 2.05 → **1.55** | 43 → **32.5** | mean over covered regions only | yes |
| Patagonia Macro Puff Hoody | insulation_synthetic | 002 | 1.65 / 1.45 / 0 | 1.58 → **1.19** | 27 → **20.25** | mean over covered regions only | yes |
| Helly Hansen Odin Stretch Hooded Insulator 2.0 | insulation_synthetic | 002 | 1.55 / 1.35 / 0 | 1.48 → **1.11** | 27 → **20.25** | mean over covered regions only | yes |
| Mountain Hardwear Ghost Whisperer/2 Jacket | insulation_down | 002 | 1.45 / 1.3 / 0 | 1.4 → **1.05** | 21 → **16** | mean over covered regions only | yes |
| Mountain Hardwear Firefall/2 Insulated Jacket | outer_insulated | 002 | 1.5 / 1.3 / 0 | 1.42 → **1.08** | 34 → **25.5** | mean over covered regions only | yes |
| Helly Hansen Alpha 4.0 Insulated Jacket | outer_insulated | 002 | 1.5 / 1.25 / 0 | 1.4 → **1.06** | 34 → **26** | mean over covered regions only | yes |
| Helly Hansen Alpha Infinity Insulated Jacket | outer_insulated | 002 | 1.45 / 1.2 / 0 | 1.35 → **1.03** | 32 → **24.5** | mean over covered regions only | yes |
| Patagonia Snowdrifter Jacket | outer_insulated | 002 | 1.35 / 1.15 / 0 | 1.28 → **0.96** | 29 → **22** | mean over covered regions only | yes |
| Spyder Leader Insulated Jacket | outer_insulated | 002 | 1.55 / 1.3 / 0 | 1.4 → **1.1** | 34 → **25.5** | above formula | yes |
| Columbia Bugaboo IV Interchange Jacket | outer_insulated | 002 | 1.5 / 1.25 / 0 | 1.35 → **1.06** | 34 → **25.5** | above formula | yes |
| Mountain Hardwear Stretch Ozonic Insulated Jacket | outer_insulated | 002 | 1.2 / 1.05 / 0 | 1.15 → **0.86** | 29 → **22** | mean over covered regions only | yes |
| Columbia Joy Peak Lite Hooded Jacket | outer_insulated | 002 | 1.15 / 1 / 0 | 1.1 → **0.83** | 25 → **18.75** | mean over covered regions only | yes |
| Arc'teryx Atom LT Hoody | insulation_synthetic | 002 | 1.15 / 1 / 0 | 1.1 → **0.83** | 21 → **16** | mean over covered regions only | yes |
| Helly Hansen Odin Stretch Hooded Light Insulator 2.0 | insulation_synthetic | 002 | 1.15 / 1 / 0 | 1.1 → **0.83** | 21 → **16** | mean over covered regions only | yes |
| Patagonia Micro Puff Hoody | insulation_synthetic | 002 | 1.1 / 0.95 / 0 | 1.05 → **0.79** | 19 → **14.5** | mean over covered regions only | yes |
| Columbia Powder Lite Hooded Jacket | outer_insulated | 002 | 1.25 / 1.05 / 0 | 1.15 → **0.89** | 27 → **20.25** | above formula | yes |
| Spyder Challenger Insulated Jacket | outer_insulated | 002 | 1.2 / 1.05 / 0 | 1.1 → **0.86** | 27 → **20.25** | above formula | yes |
| Patagonia DAS Parka | insulation_synthetic | 002 | 4.7 / 2.94 / 0 | 2.85 → **3.09** | 55 → **57.19** | lab row, whole body hand-written | yes |
| Helly Hansen Varde Fleece Jacket 2.0 | mid_layer_heavy | 002 | 0.9 / 0.78 / 0 | 0.85 → **0.65** | 15 → **11.5** | mean over covered regions only | yes |
| Patagonia R1 Pullover | mid_layer_heavy | 002 | 0.8 / 0.7 / 0 | 0.76 → **0.58** | 15 → **11.5** | mean over covered regions only | yes |
| Fjallraven Övik Fleece Half Zip | mid_layer_light | 002 | 0.7 / 0.6 / 0 | 0.66 → **0.5** | 14 → **10.75** | mean over covered regions only | yes |
| Patagonia Snowdrifter Bibs | outer_insulated | 002 | 0.6 / 0 / 1.2 | 0.75 → **0.6** | 28 → **22** | above formula | yes |
| Patagonia R1 TechFace Jacket | soft_shell | 002 | 0.65 / 0.55 / 0 | 0.6 → **0.46** | 17 → **13** | mean over covered regions only | yes |
| Under Armour ColdGear Base 2.0 Crew | base_layer | 002 | 0.55 / 0.5 / 0 | 0.53 → **0.4** | 13 → **10** | mean over covered regions only | yes |
| Outdoor Research Ferrosi Hoodie | soft_shell | 002 | 0.55 / 0.48 / 0 | 0.52 → **0.4** | 11 → **8.5** | mean over covered regions only | yes |
| Rab Neutrino Pro | insulation_down | 011 | 3.2 / 2.6 / 0 | 2.15 → **2.25** | 34 (ok) | below formula | no |
| Norrøna Lofoten Gore-Tex Insulated Jacket | outer_insulated | 002 | 1.8 / 1.3 / 0 | 1.15 → **1.23** | 30 (ok) | below formula | yes |
| The North Face Summit Breithorn Hoodie | insulation_down | 011 | 2.6 / 2.1 / 0 | 1.75 → **1.83** | 30 (ok) | below formula | no |
| Rab Nebitron Pro Insulated | insulation_synthetic | 011 | 2.4 / 1.9 / 0 | 1.6 → **1.68** | 28 → **29** | below formula | no |
| Columbia Powder Lite Vest | insulation_synthetic | 002 | 0.95 / 0 / 0 | 0.55 → **0.48** | 9 → **8** | above formula | yes |
| Spyder Sentinel Gore-Tex Pant | hard_shell | 002 | 0 / 0 / 0.2 | 0.12 → **0.05** | 7 (ok) | above formula | yes |
| 32 Degrees Heat Midweight Crew | base_layer | 002 | 0.48 / 0.42 / 0 | 0.4 → **0.35** | 11 → **8.5** | above formula | yes |
| Outdoor Research Snowcrew Jacket | outer_insulated | 006 | 1.6 / 1.2 / 0 | 1.05 → **1.1** | 26 → **27** | below formula | yes |
| Helly Hansen Alpha LifaLoft Jacket | outer_insulated | 011 | 1.8 / 1.4 / 0 | 1.2 → **1.25** | 28 → **28.75** | below formula | no |
| Norrøna Lyngen Down850 Hood Jacket | insulation_down | 002 | 2.8 / 2.2 / 0 | 1.9 → **1.95** | 32 (ok) | below formula | yes |
| Norrøna Trollveggen Thermal Pro Jacket | mid_layer_heavy | 002 | 1.45 / 1.2 / 0 | 0.98 → **1.03** | 11 (ok) | below formula | yes |
| Spyder Dare Base Layer Crew | base_layer | 002 | 0.42 / 0.36 / 0 | 0.35 → **0.3** | 10 → **7.75** | above formula | yes |
| Obermeyer Raze Jacket | outer_insulated | 011 | 1.4 / 1 / 0 | 0.9 → **0.95** | 24 → **25.5** | below formula | no |
| Arc'teryx Gamma MX Hoody | soft_shell | 002 | 1.2 / 1 / 0 | 0.8 → **0.85** | 15.5 (ok) | below formula | yes |
| Patagonia DAS Light Hoody | insulation_synthetic | 011 | 2 / 1.6 / 0 | 1.35 → **1.4** | 27 (ok) | below formula | no |
| Smartwool Merino 250 Base Layer Crew | base_layer | 002 | 0.79 / 0.65 / 0 | 0.52 → **0.56** | 12 → **12.62** | below formula | yes |
| Lululemon Pace Breaker Jacket | soft_shell | 002 | 0.2 / 0.18 / 0 | 0.19 → **0.15** | 11 → **8.5** | mean over covered regions only | yes |
| 32 Degrees Heat Lightweight Crew | base_layer | 002 | 0.3 / 0.25 / 0 | 0.25 → **0.21** | 7 → **5.5** | above formula | yes |
| Patagonia R1 Air Full-Zip Hoody | mid_layer_light | 002 | 0.95 / 0.8 / 0 | 0.65 → **0.68** | 7.5 (ok) | below formula | yes |
| Arc'teryx Gamma Hoody | soft_shell | 011 | 0.95 / 0.8 / 0 | 0.65 → **0.68** | 15.5 (ok) | below formula | no |
| Patagonia Nano-Air Ultralight Full-Zip Hoody | insulation_synthetic | 011 | 0.8 / 0.6 / 0 | 0.52 → **0.55** | 8 (ok) | below formula | no |
| Helly Hansen Lifa Merino Midweight Crew | base_layer | 002 | 0.75 / 0.62 / 0 | 0.5 → **0.53** | 11.5 (ok) | below formula | yes |
| Patagonia Nano-Air Hoody | insulation_synthetic | 002 | 2.34 / 2.04 / 0 | 1.65 → **1.68** | 27 (ok) | lab row, whole body hand-written | yes |
| Patagonia Houdini Jacket | hard_shell | 002 | 0.15 / 0.12 / 0 | 0.14 → **0.11** | 7 → **5.5** | mean over covered regions only | yes |
| Helly Hansen Lifa Active Crew | base_layer | 002 | 0.32 / 0.26 / 0 | 0.26 → **0.23** | 6 → **4.88** | above formula | yes |
| Columbia Silver Ridge Base Layer Crew | base_layer | 002 | 0.38 / 0.32 / 0 | 0.3 → **0.27** | 9 → **7** | above formula | yes |
| Patagonia Capilene Midweight | base_layer | 002 | 0.69 / 0.55 / 0 | 0.45 → **0.48** | 8.5 (ok) | lab row, whole body hand-written | yes |
| Patagonia Nano-Air Light Vest | insulation_synthetic | 002 | 0.85 / 0 / 0 | 0.45 → **0.43** | 7 (ok) | above formula | yes |
| Outdoor Research Helium Rain Jacket | hard_shell | 002 | 0.12 / 0.1 / 0 | 0.11 → **0.09** | 38 → **28.75** | mean over covered regions only | yes |
| Arc'teryx Beta AR Jacket | hard_shell | 002 | 0.25 / 0.2 / 0 | 0.17 (ok) | 21 → **22** | Ret only | yes |
| Outdoor Research Carbide Jacket | hard_shell | 006 | 0.2 / 0.16 / 0 | 0.13 (ok) | 17 → **18** | Ret only | yes |
| Icebreaker Merino 260 Tech Long Sleeve Half-Zip | base_layer | 002 | 0.9 / 0.75 / 0 | 0.62 (ok) | 13 → **13.75** | Ret only | yes |
| Icebreaker Merino 200 Oasis Long Sleeve Half-Zip | base_layer | 002 | 0.68 / 0.58 / 0 | 0.47 (ok) | 10 → **10.75** | Ret only | yes |

`evap_potential` and `im_whole_body` are left alone. They are not derived from the stored clo and Ret: for 99 of 100 rows, `evap_potential` differs by more than 0.05 from the im/clo ratio computed from the whole-body values. They are hand-set indices, a separate question (see "Other things found").

## 2. Light synthetic insulation sits on two scales

### The anchor and its peers

Published fill weights were used to compare garments with the same insulation:

| Garment | Fill | Torso / arms clo | Ratio to the lab curve at the same fill |
|---|---|---|---|
| Patagonia Nano-Air Hoody (lab, T21-03) | 60 g/m² FullRange | 2.34 / 2.04 | 1.00 |
| Arc'teryx Atom LT Hoody (002) | 60 g/m² Coreloft | 1.15 / 1.00 | 0.49 |
| Patagonia Micro Puff Hoody (002) | 65 g/m² PlumaFill | 1.10 / 0.95 | 0.45 |
| Helly Hansen Odin Light Insulator 2.0 (002) | PrimaLoft Gold Active, weight unpublished | 1.15 / 1.00 | ≈ 0.49 if 60 g/m² |
| Patagonia Macro Puff Hoody (002) | 135 g/m² body, 90 g/m² sleeves PlumaFill | 1.65 / 1.45 | 0.42 |
| Patagonia DAS Light Hoody (011) | 65 g/m² PlumaFill, the same fill as Micro Puff | 2.00 / 1.60 | 0.81 |
| Rab Nebitron Pro (011) | 279 g PrimaLoft Silver, size M (about DAS Parka) | 2.40 / 1.90 | 0.51 of DAS |
| Patagonia DAS Parka (lab, T21-03) | 133 g/m² PrimaLoft Gold + 40 g/m² extra in the core | 4.70 / 2.94 | 1.00 |

Two seed-time inversions show the problem without any physics: Micro Puff and DAS Light Hoody share the same 65 g PlumaFill but differ by 1.8×, and the 135 g Macro Puff rates below the 60 g Nano-Air.

The "lab curve" is a fit through the two lab garments. It starts at the T21-03 wind jacket's 0.70 clo torso, which stands for two thin fabric layers plus enclosed air, and adds the insulation: torso ≈ 0.70 + 0.0522 × fill^0.842 (fill in g/m²), with arms at 0.87 × torso (Nano-Air's ratio). On that basis Nano-Air's batting contributes 1.64 clo for 1.77 oz/yd², or 0.93 clo per oz/yd². That is close to the catalog's own `material_reference` figures (FullRange 0.70, Climashield APEX 0.78, PrimaLoft Gold 0.84) once a quilted garment's extra enclosed air is allowed for. The derived peers imply 0.25 clo per oz/yd² on the same basis, or 0.54 even if the shell contributed only the catalog's hard-shell 0.2 clo. So the lab value is the physically coherent one.

### What scale the rest of the catalog uses

CoWEDA's Table 2 gives T21-03's single-garment regional values, measured alone on the manikin. Against those values, the catalog splits by layer type:

| Layer type | T21-03 item (CoWEDA Table 2) | T21-03 clo | Catalog median (range) | Catalog / T21-03 |
|---|---|---|---|---|
| Base top, torso | Lightweight undershirt / midweight shirt | 0.55 / 0.69 | 0.55 (0.30–0.90), n = 17 | 0.8–1.0 |
| Base bottom, legs | Lightweight / midweight drawers | 0.34 / 0.59 | 0.47 (0.25–0.80), n = 12 | about 1 |
| Fleece, torso | Fleece jacket | 1.05 | 0.90 (0.70–1.45), n = 5 | 0.86 |
| Soft-shell pants, legs | Soft shell trousers | 0.75 | 0.70 (0.50–1.00), n = 4 | 0.93 |
| Soft-shell jacket, torso | Soft shell jacket / wind jacket | 0.95 / 0.70 | 0.65 (0.20–1.20), n = 7 | 0.7–0.9 |
| Hard-shell jacket, torso | Cold wet weather jacket | 0.88 | 0.20 (0.12–0.28), n = 11 | **0.23** |
| Hard-shell pants, legs | Cold wet weather trousers | 0.70 | 0.22 (0.20–0.25), n = 5 | **0.31** |
| Insulated jacket, torso | Extreme cold parka (heavier than ski jackets) | 3.69 | 1.50 (1.15–2.20), n = 15 | **0.41** |
| Insulated pants, legs | Extreme cold trousers (heavier than ski pants) | 2.50 | 1.15 (1.00–1.40), n = 5 | **0.46** |
| Puffy, torso | Nano-Air / DAS (lab rows) | 2.34 / 4.70 | 002 puffies at 0.42–0.49× of the curve | **≈ 0.45** |

Base layers, fleece and soft-shell pants are on the T21-03 scale. Shells, insulated outerwear and the 002 puffies are on a scale about 0.25–0.5× of it, and so are most of the catalog's insulating and protective layers. The 011 items sit higher than the 002 ones but still below the lab curve: DAS Light at 0.81, Nebitron at about 0.51 of DAS. Within this catalog, then, the derived peers (1.10–1.15) are the majority convention and the lab Nano-Air (2.34) is the outlier. That's despite Nano-Air being the measured number.

The seed's calibration rows have a problem of their own. Four of them are the same ECWCS items as Table 2. Their torso clo matches exactly (0.55, 0.69, 1.05, 3.69), and so does torso Ret for three of the four; the ECW parka is seeded at 75.60 against Table 2's 65.91. Their arm values don't match for any of the four: clo 0.36 vs 0.41, 0.55 vs 0.68, 0.94 vs 1.32 and 2.38 vs 2.94, and Ret 9.41 vs 6.52, 13.18 vs 13.33, 14.63 vs 21.70 and 60.53 vs 65.41. The DAS row's seeded arm value of 2.94 is also exactly Table 2's extreme cold parka arm. The arms need checking against T21-03 itself once DTIC is back.

### What scale the targets assume

- **The ensemble model assumes the lab scale.** `ENSEMBLE_REGRESSION` (torso 0.836, arms 0.809, legs 0.961) was fitted to T21-03 single-garment values, each measured alone on the manikin. Its sub-1 coefficients account for the air layers that compress when garments are stacked. Values that never included those air layers get discounted twice. Regional targets are IREQ split across regions so that they average back to it (`calculateRegionalTargets`), and they are compared with that regression output.
- **The IREQ side lacks a correction.** `calculateRequiredInsulation` in `ireq.ts` solves for the static intrinsic insulation needed at the wind speed. It doesn't apply ISO 9920 / ISO 11079's reduction of clothing insulation for wind and body movement. ISO 9920's dynamic-insulation equation gives a factor of roughly 0.4–0.75, depending on wind and walking speed. Static lab values compared with that requirement overstate what clothing delivers in wind and motion. The catalog's low scale (≈ 0.45×) happens to be about the size of that missing correction. That is a coincidence of magnitude, not a modeled correction. It doesn't vary with wind or activity, and it doesn't treat air-permeable garments such as Nano-Air (35–40 CFM) differently.
- **Golden runs confirm both halves.** On the current scale, alpine outfits fall short of their targets: 7 alpine scenarios carry regional-insulation warnings, and the mean alpine comfort score is 52. With shells and insulated outerwear also moved to T21-03 values (the rough sensitivity "C" below), alpine rises to a mean of 68.5, and catalog legs reach 4.18 clo against a 4.25 minimum at 25°F. High-output sports then overdress, because a lab-scale shell alone exceeds their whole target. Ski touring at 45°F reaches 1.41 clo against an 0.82 maximum, running in 36°F rain drops from a score of 97 to 72, and the biking mean falls from 64.6 to 59.8.

**Conclusion.** The lab Nano-Air value is the right number for that garment. The targets are consistent with the lab scale for low-output alpine. Running, biking and ski touring only look right because the catalog's low scale is standing in for the missing correction. No single catalog scale is consistent with every sport until the model gains that correction.

### Puffy recalibration

Step 1 of migration 034 applies these values, the same ones used for the "B" golden run. Every puffy goes on the lab curve, with Ret scaled by the same factor as clo so each garment keeps its permeability index. The two lab rows keep their regional values. Each of the 14 re-derived rows also gets:

- `data_source` pointing at this section;
- `uncertainty_clo` of 0.3 where the fill weight is published, or 0.6 where it is unpublished or estimated;
- for the low-confidence rows, `confidence_score` capped at 0.5.

A row changes only while it still has the torso and arms clo it had at audit time, so a value edited by hand since is left alone.

| Garment | Torso / arms clo now | Proposed torso / arms | Proposed Ret torso / arms | Whole-body clo / Ret | Basis | Confidence | In fixture |
|---|---|---|---|---|---|---|---|
| Patagonia Nano-Air Hoody | 2.34 / 2.04 | **2.34 / 2.04** | 35.59 / 38.49 | 1.68 / 27.42 | lab (T21-03) | high | yes |
| Patagonia DAS Parka | 4.7 / 2.94 | **4.7 / 2.94** | 82.43 / 63.9 | 3.09 / 57.19 | lab (T21-03) | high | yes |
| Patagonia Nano-Air Ultralight Full-Zip Hoody | 0.8 / 0.6 | **1.35 / 1.2** | 20.25 / 20 | 0.98 / 15.13 | curve @ 20 g/m² FullRange | medium | no |
| Patagonia Nano-Air Light Vest | 0.85 / 0 | **1.85 / 0** | 30.47 / 0 | 0.93 / 15.24 | curve @ 40 g/m² FullRange | medium | yes |
| Arc'teryx Atom LT Hoody | 1.15 / 1 | **2.35 / 2.05** | 44.96 / 41 | 1.69 / 32.73 | curve @ 60 g/m² Coreloft | medium | yes |
| Patagonia Micro Puff Hoody | 1.1 / 0.95 | **2.45 / 2.15** | 44.55 / 40.74 | 1.76 / 32.46 | curve @ 65 g/m² PlumaFill | medium | yes |
| Patagonia DAS Light Hoody | 2 / 1.6 | **2.45 / 2.15** | 46.55 / 45.69 | 1.76 / 34.7 | curve @ 65 g/m² PlumaFill | medium | no |
| Patagonia Macro Puff Hoody | 1.65 / 1.45 | **3.95 / 2.6** | 67.03 / 44.83 | 2.63 / 44.72 | curve @ 135 g/m² body, 90 g/m² sleeves PlumaFill | medium | yes |
| Columbia Powder Lite Vest | 0.95 / 0 | **2 / 0** | 33.68 / 0 | 1 / 16.84 | fill unpublished; assumed ~45 g/m² (seed rated it just above Nano-Air Light Vest) | low | yes |
| Helly Hansen Odin Stretch Hooded Light Insulator 2.0 | 1.15 / 1 | **2.35 / 2.05** | 44.96 / 41 | 1.69 / 32.73 | fill unpublished; assumed 60 g/m² (seed rated it = Atom LT) | low | yes |
| Mountain Hardwear Ghost Whisperer/2 Jacket | 1.45 / 1.3 | **2.55 / 2.25** | 38.69 / 34.62 | 1.84 / 28 | 85 g 800FP total; treated as ~70 g/m² synthetic-equivalent (reviews: a little warmer than Micro Puff) | low | yes |
| Helly Hansen Odin Stretch Hooded Insulator 2.0 | 1.55 / 1.35 | **2.8 / 2.45** | 50.58 / 45.37 | 2.01 / 36.63 | fill unpublished; v1 was 80 g LIFALOFT | low | yes |
| The North Face Summit Breithorn Hoodie | 2.6 / 2.1 | **4.15 / 3.35** | 67.04 / 60.62 | 2.91 / 48.68 | fill unpublished; ×1.6 (mean factor of its heavy peers) | low | no |
| Norrøna Lyngen Down850 Hood Jacket | 2.8 / 2.2 | **4.45 / 3.5** | 71.52 / 63.64 | 3.1 / 51.67 | fill unpublished; ×1.6 (mean factor of its heavy peers) | low | yes |
| Rab Nebitron Pro Insulated | 2.4 / 1.9 | **4.7 / 2.95** | 78.33 / 55.89 | 3.09 / 53.14 | 279 g PrimaLoft Silver (M) ≈ DAS Parka fill | low | no |
| Rab Neutrino Pro | 3.2 / 2.6 | **5.5 / 3.5** | 82.5 / 56.54 | 3.63 / 55.39 | 212 g 800FP (M) ≈ 1.25× DAS PrimaLoft-equivalent | low | no |

## 3. Usage and coverage are unreviewed for 89 garments

89 of 100 garments have `usage` NULL. The same 89 also have `coverage_torso`, `coverage_arms` and `coverage_legs` all NULL, which migration 022 defines as "unreviewed". Only the three generic SWTTR items have `suitable_activities`. The 11 reviewed rows are the eight listed in 022's `UPDATE`s and the three generic running items.

| Category | Unreviewed |
|---|---|
| base_layer | 24 |
| outer_insulated | 20 |
| hard_shell | 16 |
| insulation_synthetic | 12 |
| soft_shell | 7 |
| mid_layer_heavy | 4 |
| insulation_down | 4 |
| mid_layer_light | 2 |

**Current effect: none on recommendations.** `garmentCapabilities()` computes `standalone` and `coverage`, but no selector reads them. The running protection safeguard uses only its wind and wet flags. The values reach clients through `garment-metadata.ts` and `/api/wardrobe/available`. They are what #247 (running: complete outfits without mandatory thermal base layers) and #248 (XC: standalone Nordic layers) need.

**Suggested approach.** Run one reviewed migration in 022's style (explicit rows, `AND usage IS NULL`), using per-type starting points and checking each item against the maker's description:

| garment_type / category | Starting usage | Starting coverage T / A / L |
|---|---|---|
| top_long_sleeve, base_layer | `either` for midweight merino/synthetic crews; `underlayer` for thermal underwear | 1 / 1 / 0 |
| pants, base_layer | `underlayer` (long johns); `standalone` only for tights sold as outerwear | 0 / 0 / 1 (0.8 boot-length, per 022) |
| jacket, mid_layer and insulation | `either` | 1 / 1 / 0 |
| vest | `either` | 1 / 0 / 0 |
| jacket and pants, hard_shell, soft_shell and outer_insulated | `standalone` | 1 / 1 / 0 and 0 / 0 / 1 |
| bib | `standalone` | partial torso (needs a decision, e.g. 0.5) / 0 / 1 |

## Golden-test impact

Each variant replaced `src/test/fixtures/gear-catalog.json` in the throwaway worktree.

| Variant | What changed | Golden tests failing (of 83) | Invariant failures | Scenario summaries changed (of 60) | Mean comfort score: alpine / biking / running / ski touring / XC |
|---|---|---|---|---|---|
| Baseline | — | 0 | 0 | — | 52.2 / 64.6 / 75.7 / 65.2 / 97.3 |
| **A: whole-body fix (Option B)** | 58 rows per section 1 | 62 | 0 | 13: running 7, ski touring 4, biking 2 | 52.2 / 64.4 / 76.9 / 65.2 / 97.3 |
| **B: A + puffies on the lab curve (Option C)** | + 16 puffies per section 2 | 62 | 0 | 30: alpine 12, ski touring 9, running 7, biking 2 | 52.3 / 64.4 / 76.9 / 65.2 / 97.3 |
| C: B + shells and outerwear at T21-03 analogues (rough sensitivity, not a proposal) | hard shells set to Table 2 values, soft-shell jackets × 1.5, insulated outerwear × 2 | 62 | 0 | 54 (all sports) | 68.5 / 59.8 / 79.2 / 64.1 / 93.3 |
| D: A + puffies aligned down to the 002 scale | B's puffy values × 0.49 (Nano-Air → 1.15) | 62 | 0 | 23: ski touring 8, running 7, alpine 6, biking 2 | 52.3 / 64.4 / 76.9 / 65.2 / 97.3 |

All 62 failures are snapshot mismatches. Every invariant assertion still passes in all four variants: one layer per slot, the puffy/outer pairing, XC wind layers, score > 0, alpine comfort at 45°F, and the calibration contract. The snapshot count is the same for every variant because each recommended garment's whole-body `rcl`/`recl` is serialized in the response. The scenario summaries separate real outfit changes from those display fields.

### A — whole-body fix

- **Alpine and XC:** unchanged in all 24 scenarios.
- **Running (7):**
  - **Shell picks.** The protection safeguard picks the shell with the lowest whole-body clo. It now chooses Spyder Sentinel Gore-Tex Pant (0.12 → 0.05) over PowSlayer (0.06), and OR Helium Rain Jacket (0.11 → 0.09) over Arc'teryx Alpha FL (0.10). Two cold scenarios gain "Limited breathability may cause moisture buildup", because Helium's Ret is higher.
  - **5°F, hard.** R1 Pullover (0.76 → 0.58) now fits the budget. Whole-body clo rises 0.59 → 0.86 (catalog) and 0.43 → 0.90 (wardrobe), against a 0.59–0.93 target. Scores go 59.6 → 68.9 and 61.4 → 68.9, and the wardrobe's "Insufficient overall insulation" warning goes away.
  - **Other scenarios:** scores move by 2.1 points or less.
- **Ski touring (4):**
  - **Pack choice.** The packed insulation changes: Nano-Air Light Vest → Atom LT in the catalog at 25°F, and Atom LT → Ghost Whisperer/2 in the wardrobe at 25°F, 5°F and 18°F.
  - **Warnings.** The descent warning, which uses regional values, shrinks or disappears: catalog 25°F "1.5 vs 1.8" is gone, and wardrobe 5°F goes from 1.7 to 1.8 vs 2.0.
  - **Scores:** unchanged, because they score the climb outfit.
- **Biking (2):** at 25°F the leg shell changes from Carbide Bibs to Sentinel; the score goes 61.1 → 60.

### B — puffies on the lab scale

- **Alpine (12 of 12 outfits change).** Puffies replace insulated jackets: catalog 25°F swaps Trollveggen Thermal Pro and Jackson Glacier for Lyngen Down850 and Houdini. Torso and arms rise (3.80 → 4.31, 3.03 → 3.33), but legs stay at 2.83, so scores don't move (59.7 → 59.7). The wardrobe at 5°F, −15°F and 18°F picks Macro Puff and Beta AR, and torso rises 3.43 → 4.22. Regional warnings drop from 7 to 6, and one new arms warning appears (wardrobe, 36°F rain).
- **New inversions.** A puffy plus a wind shell now out-insulates every insulated ski jacket. Micro Puff (2.45) is warmer than Firefall/2 (1.50), even though Firefall/2 has 100 g/m² fill plus a 2-layer shell. The calibration split moves to the boundary between puffies and outerwear instead of going away.
- **Ski touring (9):** the pack moves to lighter items (Nano-Air Light Vest, Powder Lite Vest), since they now carry more clo per gram.

### C and D

- **C:** the scale-sensitivity case behind section 2's target conclusion. Alpine improves (catalog 25°F 59.7 → 83.7, 5°F 45.8 → 64.3). Running, biking and ski touring overdress in mild and wet conditions.
- **D:** keeps the catalog's majority convention but discards two measurements. Alpine scores don't change, because legs still decide them. Cold alpine torso falls (5°F catalog 4.87 → 3.80), because DAS Parka drops to 2.30 torso clo and is no longer picked.

## Other things found (not fixed here)

1. **`evap_potential` is hand-set, not derived.** 99 of 100 rows differ by more than 0.05 from im/clo computed from their own whole-body values. Breathability sorting depends on it.
2. **Seeded calibration arm values disagree with CoWEDA Table 2** for all four checkable rows. Check against T21-03 when DTIC is reachable, and seed the whole-body columns at the same time.
3. **No wind/motion correction of clothing insulation in IREQ** (`ireq.ts`). This is the missing piece for any scale fix.
4. **Running's protective-shell pick flips on 0.01–0.02 clo.** It chooses the lowest whole-body shell, so Option B changes which shell running gets, and adds a breathability warning, without any thermal reason.
5. **`ALPINE_CLO_TARGETS` / `getAlpineCloTargets` are unused** (`constants.ts`).
6. **Misleading comment.** `predictEnsembleThermal`'s comment says "parallel weighted average", but the code takes an arithmetic area-weighted (serial-type) mean.
7. **The golden fixture lacks 12 live garments**, including 5 puffies, so catalog changes to them aren't covered by golden tests.

## Options

- **A. Leave as is.** No work. Whole-body numbers stay inconsistent: wardrobe shows Macro Puff at 1.58 clo and Atom LT at 1.10, where their own regional values give 1.19 and 0.83. Running, biking and ski touring keep budgeting with values off by up to 0.5 clo, and the puffies keep their 2× spread at equal fill.
- **B. Fix whole-body only (recommended).** One hand-applied migration for the 58 rows in section 1, plus the same values in the fixture and a reviewed snapshot update. This removes a clear data error without changing the calibration. Golden impact is limited to 13 running, biking and ski-touring scenarios, mostly small; alpine and XC are unchanged. The shell-pick sensitivity (item 4 above) shows up in review and may deserve its own fix.
- **C. Fix whole-body and recalibrate the puffies to the lab scale (chosen 2026-10-17).** Section 2's 16-row table on top of B. It makes the puffies consistent with each other and with the measured Nano-Air. But it widens the split between puffies and the rest of the catalog: puffy plus wind shell beats insulated jackets. It doesn't help alpine scores, because legs still bind. And it makes air-permeable puffies look warmer in wind than they are. I'd only do it inside a calibration project that also moves shells and outerwear to the T21-03 scale and adds the ISO 9920 dynamic correction to the model, with its own golden review.

## Decision and what's still open

Option C was chosen on 2026-10-17. Migration 034 uses variant B's values, and the golden snapshots updated with it reproduce the B run in "Golden-test impact" exactly: 30 of 60 scenarios change, and no invariant fails. What it leaves open:

- **Puffies now out-insulate insulated outerwear.** Micro Puff (2.45 torso) is warmer than Firefall/2 (1.50), and alpine picks a puffy plus a wind shell over an insulated parka at 25°F and 18°F. Insulated jackets and pants, and shells, are still on the low scale.
- **Alpine scores don't improve**, because legs (insulated pants, still on the low scale) bind.
- **Air-permeable puffies look warmer in wind than they are.** The lab values are static, and `ireq.ts` has no wind/motion correction.
- **The rest of the calibration.** Shells and insulated outerwear still need to move to T21-03 values, and the model needs ISO 9920's dynamic correction. That needs its own golden review (see variant C), plus items 1, 2 and 4 under "Other things found".

## Applying migration 034

**Check first.** Since 2026-10-17, merged migrations have shown up in prod's history within about a minute of the merge, under a timestamp version. That is probably Supabase's GitHub integration, but it's unconfirmed. After merging, check the migration history (MCP `list_migrations`). If `catalog_whole_body_and_puffy_clo` is already there, skip the paste and only run the check query. 034 doesn't depend on 033.

Otherwise, apply it by hand in the Supabase SQL editor. Paste this as one script:

```sql
BEGIN;
-- contents of supabase/migrations/034_catalog_whole_body_and_puffy_clo.sql
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('034', 'catalog_whole_body_and_puffy_clo');
COMMIT;
```

Then check it:

```sql
SELECT
  count(*) FILTER (WHERE abs(rcl_whole_body - (0.5 * coalesce(rcl_torso, 0) + 0.25 * coalesce(rcl_arms, 0) + 0.25 * coalesce(rcl_legs, 0))) > 0.02) AS clo_off_weighting,
  count(*) FILTER (WHERE abs(recl_whole_body - (0.5 * coalesce(recl_torso, 0) + 0.25 * coalesce(recl_arms, 0) + 0.25 * coalesce(recl_legs, 0))) > 0.5) AS ret_off_weighting,
  count(*) FILTER (WHERE data_source = 'docs/catalog-thermal-audit.md#puffy-recalibration') AS recalibrated_puffies
FROM garment_thermal_properties;
```

Expect 0, 0 and 14. The two garments migration 033 added (FP Movement Lift Love Jacket and Bib) already follow the weighting. Garments added later can add to the first two counts.

**The add-wardrobe-item skill's guide needs the new scale.** `.claude/skills/add-wardrobe-item/references/thermal-estimation.md` (#311) still describes the pre-034 catalog. Its "Catalog scale" table puts light synthetics at 0.80–1.15 torso clo and belay puffies at 1.90–3.20, and its "Known inconsistency" paragraph says to store the peer-consistent low value. After 034, puffy peers are on the lab scale (light synthetics 1.35–2.45, belay puffies 4.15–5.50), while insulated outerwear stays on the low scale.

## Sources

- Rioux TP, Gonzalez JA, Karis AJ, Potter AW, Xu X. *Biophysical properties of five cold weather clothing systems and the predicted regional properties of ensembles.* USARIEM Technical Report T21-03, 2020. [DTIC AD1115339](https://apps.dtic.mil/sti/pdfs/AD1115339.pdf) — not reachable on 2026-10-17 (DTIC maintenance).
- Xu X, et al. *A digital tool for prevention and management of cold weather injuries—Cold Weather Ensemble Decision Aid (CoWEDA).* Int J Biometeorol 2021. [PMC8346413](https://pmc.ncbi.nlm.nih.gov/articles/PMC8346413/), Table 2 (intrinsic regional resistances of 13 ECWCS items, in m²·K/W; divided by 0.155 for clo here).
- Fill weights:
  - Nano-Air 60 g FullRange — [Altitude Sports](https://www.altitude-sports.com/products/patagonia-nano-air-hoody-mens-llll-pat-84367)
  - DAS Parka 133 g PrimaLoft Gold Eco + 40 g core — [Switchback Travel](https://Switchbacktravel.com/reviews/patagonia-das-parka)
  - DAS Light Hoody 65 g PlumaFill — [Patagonia Bend](https://www.patagoniabend.com/products/ms-das-light-hoody)
  - Micro Puff 65 g PlumaFill — [Gear Patrol](https://www.gearpatrol.com/outdoors/a403334/patagonia-micro-puff-hoody-review/)
  - Macro Puff 135 g body / 90 g sleeves — [Patagonia Worn Wear](https://wornwear.patagonia.com/products/mens-macro-puff-hoody_80120_blk)
  - Atom LT Coreloft 60 — [REI](https://www.rei.com/product/870291)
  - Nano-Air Light Vest 40 g FullRange — [Alpine Institute shop](https://shop.alpineinstitute.com/products/ms-nano-air-light-vest)
  - Nano-Air Ultralight 20 g FullRange — [GearJunkie](https://gearjunkie.com/apparel/patagonia-nano-air-ultralight)
  - Odin 2.0 PrimaLoft Gold Active (weight unpublished) — [Cotswold Outdoor](https://www.cotswoldoutdoor.com/p/helly-hansen-mens-odin-lightweight-stretch-hooded-insulator-2-0-jacket-E12ACA0240.html)
  - Ghost Whisperer/2 3 oz 800FP — [Switchback Travel](https://www.switchbacktravel.com/reviews/mountain-hardwear-ghost-whisperer-2-hoody)
  - Nebitron Pro 279 g PrimaLoft Silver — [OutdoorGearLab](https://www.outdoorgearlab.com/reviews/clothing-mens/insulated-jacket-men/rab-nebitron-pro)
  - Neutrino Pro 212 g 800FP — [Trekkit](https://trekkit.in/rab-neutrino-pro-down-jacket.html)
  - Firefall/2 100 / 80 g/m² — [evo](https://www.evo.com/products/175709-mountain-hardwear-firefall-2-insulated-jacket)
- Code: `src/lib/biophysics/constants.ts` (`REGIONAL_WEIGHTS`, `ENSEMBLE_REGRESSION`), `src/lib/biophysics/ensemble.ts`, `src/lib/biophysics/ireq.ts`, `src/lib/biophysics/targets.ts`, `src/lib/recommendations/sorting.ts`, `src/lib/recommendations/sports/breathable-ensemble.ts`, `src/lib/recommendations/sports/ski-touring.ts`, `src/lib/recommendations/sports/running-protection.ts`, `src/lib/recommendations/garment-semantics.ts`; `supabase/migrations/002_seed_garments.sql`, `009_fix_arm_clo_values.sql`, `022_running_xc_clothing_semantics.sql`.
