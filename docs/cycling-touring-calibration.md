# Cycling and touring-climb calibration (#374)

#245 calibrated running and XC ([Running and XC foundations](running-xc-foundations.md)). This change gives cycling and the ski-touring climb the same treatment: one MET convention, Compendium-based rates, an air-speed assumption for riding, and tapered cold margins. Everything here is a SWTTR modelling choice. None of it is validated against field data (#8), and agreement with a published table is not physiological validation.

## Decision

On 2026-11-19 the user chose option 2 of #374: calibrate cycling and the touring climb only. Alpine skiing, the chairlift, the touring transition and the touring descent keep their inputs. #318 tuned alpine's 60/40 ski-and-lift cycle target with today's alpine rates, so changing them would undo that tuning without new evidence. The descent and transition stay as they were until there is field feedback.

Chairlift and skiing remain separate phases inside alpine's cycle, and climb, transition and descent remain separate touring phases, each with its own IREQ and targets.

## Metabolic rates

Running, XC, cycling and the touring climb now share one conversion: `M = MET × (4184 / 3600) × mass_kg / Du Bois area_m²`, with the user's sanitized height and weight (default 69 in / 170 lb, about 46.5 W/m² per MET). The old bounded body-size factor (0.88–1.12) is not applied on top. Alpine, the chairlift, the descent and the transition still use 58.2 W/m² per "MET" label and that size factor.

| Effort | Cycling (2024 Compendium) | Touring climb (assumption) |
| --- | --- | --- |
| Easy | 4.3 MET, 01015 "self-selected easy pace", 200 W/m² | 5.3 MET, 19190 "snow shoeing, moderate effort", 246 W/m² |
| Moderate | 7.0 MET, 01016 "self-selected moderate pace", 325 W/m² | 6.8 MET, 19080 "cross country, 2.5 mph, slow or light effort, ski walking", 316 W/m² |
| Hard | 9.0 MET, 01017 "self-selected vigorous pace", 418 W/m² | 8.5 MET, 19090 "cross country, 4.0–4.9 mph, moderate speed and effort", 395 W/m² |
| Before | 233 / 290 / 349 W/m² | 175 / 233 / 290 W/m² |

Sources: [Compendium bicycling](https://pacompendium.com/bicycling/), [Compendium winter activities](https://pacompendium.com/winter-activities/). W/m² are for the default body.

- **Cycling.** The Compendium's self-selected rows match SWTTR's Easy / Moderate / Hard question directly. Mapping a user's own label onto them is still an assumption: terrain, bike, wind and fitness change heat production a lot.
- **Touring climb (assumption).** The Compendium has no skinning or ski-touring row. Snowshoeing at moderate effort, XC ski walking and moderate XC skiing are the nearest uphill-on-snow references. The Compendium also lists vigorous snowshoeing at 10.0 MET and maximum uphill snow mountaineering at 15.5 MET; Hard stays below both, which leans warm (a lower rate asks for more clothing). The climb's 0.3 × ambient wind, its protection rules and its catalog filter are unchanged.

The new rates raise every climb rate and cycling's moderate and hard rates; cycling's easy rate falls from 233 to 200 W/m².

## Cycling air speed

Before this change cycling's heat balance used ambient wind only. Riding at 5 m/s in still air strips heat like a 5 m/s wind, so the outfit came out too light and under-protected in wind.

| Effort | Assumed riding speed | Reference |
| --- | --- | --- |
| Easy | 3.0 m/s (about 7 mph) | Between 01018 (5.5 mph, 3.5 MET) and 01019 (9.4 mph, 5.8 MET), for 4.3 MET |
| Moderate | 5.0 m/s (about 11 mph) | 01020, 10–11.9 mph, 6.8 MET, for 7.0 MET |
| Hard | 6.3 m/s (about 14 mph) | Between 01030 (12–13.9 mph, 8.0 MET) and 01040 (14–15.9 mph, 10.0 MET), for 9.0 MET |

These speeds are an **assumption**. They take the Compendium's flat-road speed rows nearest each self-selected MET. Gravel, trail riding and climbs are slower at the same effort, and descents faster. A faster assumed speed asks for more clothing, so road speeds lean cold.

Relative air speed = `√(riding speed² + ambient wind²)`, capped at 18 m/s (the upper limit of ISO 11079 Annex A's correction). Wind direction is unknown. The right-angle sum is a little above the average over all headings, so it also leans cold. The response echoes it as `conditions.relative_air_speed_ms`.

Relative air speed enters only the heat balance (IREQ) and the conversion from resultant to basic clo (`requiredBasicInsulation`). The cold-margin taper, the target-range wind term and the hand and head wind factor still read ambient wind. Riding speed is self-generated, not weather exposure. Cycling's hand multiplier (1.2) already assumed riding wind. Feeding riding speed into those heuristics would also make a harder effort's margins wider. The protection policy (wind at or below 0°C or above 8 m/s, rain in any precipitation) still reads ambient wind.

## Tapered cold margins

Cycling and the touring climb now use the running/XC taper (`coldExposureFactor` in `sport-policy.ts`): the maximum of `(10 − air °C) / 10`, `(wind − 4) / 8` and 0.7 in precipitation, each clamped to 0–1. It scales the activity allowance above the heat-balance minimum, the CoWEDA-inspired buffers, and both hand and head bands. The heat-balance minimum itself is never tapered. Like running/XC, the taper is an **unvalidated engineering assumption**. The CoWEDA validation data are volunteers sitting or walking on a treadmill at 0 to −40°C in 1.1–1.3 m/s air, not cycling or skinning.

- Cycling's wind term reads ambient wind.
- The climb's wind term reads the climb's 0.3 × ambient wind, the wind its IREQ already uses. Its wet term follows the climb's protection rule: rain, mixed, or snow at −1°C and warmer.
- Neither sport takes on the rest of the running/XC policy: no Run Warm or Run Cold, no pole-grip limit, no `policy` block in the response. The applicability factor is echoed as `ireq.cold_exposure_factor` for cycling and `ireq.uphill_cold_exposure_factor` for the climb, with `coweda_inspired_unvalidated_swttr_margin` as the margin source. The descent keeps full margins under the existing `validation_source`.

## Monotonic targets

Under otherwise equal conditions, warmer weather or a harder effort never raises a cycling or climb target. That holds for the whole-body band, the torso, arm and leg bands and the hand and head bands, minimum and upper limit alike. `cycling-touring-calibration.test.ts` checks it for all three efforts, three body sizes, dry, rain and snow, 15 temperatures from −25 to 25°C (including 0°C, 10°C and the −1°C wet-snow switch), and 11 wind speeds across the taper's 4 and 12 m/s edges and the 18 m/s cap.

For cycling, harder efforts ride faster, so convective loss rises with effort. Three things keep targets monotonic:

1. Heat production rises faster with effort than riding speed raises the heat balance. From Easy to Hard, heat flux more than doubles (200 → 418 W/m²) while relative air speed rises from 3 to 6.3 m/s in still air.
2. Riding speed never reaches the margins or heuristic wind terms (above). Otherwise a hard ride in mild, calm air would get a margin an easy ride doesn't.
3. Faster riding raises the resultant-to-basic conversion. Where the resultant upper band sits at cycling's 1.70 clo range cap (deep cold, small bodies), a harder effort's upper band could come out higher in basic clo. In the test grid that happened only at −25°C for the smallest body, by 0.01–0.05 clo. So cycling bounds each effort's bands by the next easier effort's (`noWarmerThan` in `thermal-targets.ts`). Elsewhere the bound changes nothing.

The climb's air speed does not depend on effort, so only its rates change with effort.

## Reference calculations

Default body, 50% humidity, dry. Old → new. Raw IREQ is resultant clo. The whole-body band is in the basic clo garments are rated in, after the margins and the ISO 11079 Annex A conversion. The margin factor is `coldExposureFactor` (1 meant untapered before this change). These are model outputs, not measurements.

### Cycling

| Conditions | Effort | Heat flux, W/m² | Air speed, m/s | Raw IREQ min–neutral, clo | Whole-body band, clo | Hand / head minimum, clo | Margin factor |
| --- | --- | ---: | ---: | --- | --- | --- | ---: |
| 70°F, 5 mph | easy | 233 → 200 | 2.2 → 3.7 | 0.00–0.06 → 0.05–0.19 | 0.11–0.26 → 0.05–0.35 | 0.09 / 0.09 → 0 / 0 | 0 |
| 70°F, 5 mph | moderate | 290 → 325 | 2.2 → 5.5 | 0.00–0.00 → 0.00–0.06 | 0.05–0.19 → 0.00–0.22 | 0.07 / 0.07 → 0 / 0 | 0 |
| 70°F, 5 mph | hard | 349 → 418 | 2.2 → 6.7 | 0.00–0.00 → 0.00–0.01 | 0.05–0.19 → 0.00–0.17 | 0.07 / 0.07 → 0 / 0 | 0 |
| 56°F, 8 mph | easy | 233 → 200 | 3.6 → 4.7 | 0.26–0.38 → 0.38–0.52 | 0.38–0.69 → 0.38–0.87 | 0.37 / 0.32 → 0 / 0 | 0 |
| 56°F, 8 mph | moderate | 290 → 325 | 3.6 → 6.1 | 0.15–0.25 → 0.17–0.25 | 0.26–0.49 → 0.17–0.46 | 0.23 / 0.20 → 0 / 0 | 0 |
| 56°F, 8 mph | hard | 349 → 418 | 3.6 → 7.2 | 0.08–0.16 → 0.10–0.16 | 0.19–0.37 → 0.10–0.34 | 0.16 / 0.14 → 0 / 0 | 0 |
| 45°F, 4 mph | easy | 233 → 200 | 1.8 → 3.5 | 0.37–0.49 → 0.59–0.73 | 0.51–0.77 → 0.72–1.12 | 0.46 / 0.40 → 0.20 / 0.17 | 0.28 |
| 45°F, 4 mph | moderate | 290 → 325 | 1.8 → 5.3 | 0.22–0.32 → 0.30–0.39 | 0.32–0.54 → 0.32–0.66 | 0.30 / 0.27 → 0.10 / 0.09 | 0.28 |
| 45°F, 4 mph | hard | 349 → 418 | 1.8 → 6.5 | 0.11–0.20 → 0.20–0.27 | 0.22–0.39 → 0.22–0.48 | 0.18 / 0.16 → 0.08 / 0.07 | 0.28 |
| 32°F, 8 mph | easy | 233 → 200 | 3.6 → 4.7 | 0.71–0.84 → 0.91–1.05 | 0.95–1.35 → 1.30–1.75 | 0.85 / 0.73 → 1.08 / 0.92 | 1 |
| 32°F, 8 mph | moderate | 290 → 325 | 3.6 → 6.1 | 0.52–0.62 → 0.49–0.58 | 0.67–1.02 → 0.64–1.06 | 0.63 / 0.54 → 0.59 / 0.50 | 1 |
| 32°F, 8 mph | hard | 349 → 418 | 3.6 → 7.2 | 0.38–0.47 → 0.35–0.42 | 0.48–0.81 → 0.43–0.82 | 0.47 / 0.41 → 0.44 / 0.38 | 1 |
| 14°F, 12 mph | easy | 233 → 200 | 5.4 → 6.1 | 1.11–1.24 → 1.35–1.49 | 1.69–2.28 → 2.16–2.65 | 1.65 / 1.39 → 1.99 / 1.68 | 1 |
| 14°F, 12 mph | moderate | 290 → 325 | 5.4 → 7.3 | 0.85–0.95 → 0.76–0.85 | 1.24–1.80 → 1.17–1.78 | 1.26 / 1.07 → 1.13 / 0.95 | 1 |
| 14°F, 12 mph | hard | 349 → 418 | 5.4 → 8.3 | 0.67–0.75 → 0.56–0.63 | 0.95–1.48 → 0.84–1.43 | 1.00 / 0.85 → 0.85 / 0.72 | 1 |
| −4°F, 8 mph | easy | 233 → 200 | 3.6 → 4.7 | 1.43–1.56 → 1.74–1.89 | 2.03–2.33 → 2.63–2.82 | 2.00 / 1.68 → 2.42 / 2.04 | 1 |
| −4°F, 8 mph | moderate | 290 → 325 | 3.6 → 6.1 | 1.09–1.19 → 1.00–1.10 | 1.51–2.10 → 1.55–2.23 | 1.53 / 1.29 → 1.40 / 1.18 | 1 |
| −4°F, 8 mph | hard | 349 → 418 | 3.6 → 7.2 | 0.86–0.94 → 0.75–0.82 | 1.18–1.74 → 1.17–1.84 | 1.21 / 1.02 → 1.07 / 0.90 | 1 |

The #116 review's example (45°F, 4 mph, moderate, 290 W/m²) had IREQ 0.22–0.32 with ambient wind only. The calibrated moderate ride gives 0.30–0.39, at a higher heat flux and 5.3 m/s air.

Easy rides now ask for more clothing in cool air: the rate falls and riding air is added. Moderate and hard rides in the cold are close to before, because the higher rates and the added air roughly cancel. Their upper limits widen, because the faster air raises the basic-clo conversion. In mild dry air the margins and hand and head targets go to zero, but the heat-balance minimum stays (0.38 clo for an easy ride at 56°F).

### Touring climb

The climb's air speed is 0.3 × ambient wind, as before.

| Conditions | Effort | Heat flux, W/m² | Climb air, m/s | Raw IREQ min–neutral, clo | Whole-body band, clo | Hand / head minimum, clo | Margin factor |
| --- | --- | ---: | ---: | --- | --- | --- | ---: |
| 56°F, 8 mph | easy | 175 → 246 | 1.1 | 0.26–0.43 → 0.04–0.16 | 0.46–0.66 → 0.04–0.34 | 0.35 / 0.32 → 0 / 0 | 0 |
| 56°F, 8 mph | moderate | 233 → 316 | 1.1 | 0.07–0.20 → 0.00–0.02 | 0.24–0.42 → 0.00–0.20 | 0.15 / 0.14 → 0 / 0 | 0 |
| 56°F, 8 mph | hard | 290 → 395 | 1.1 | 0.00–0.07 → 0.00–0.00 | 0.11–0.28 → 0.00–0.18 | 0.07 / 0.07 → 0 / 0 | 0 |
| 45°F, 4 mph | easy | 175 → 246 | 0.5 | 0.42–0.59 → 0.11–0.23 | 0.60–0.82 → 0.16–0.42 | 0.48 / 0.44 → 0.06 / 0.05 | 0.28 |
| 45°F, 4 mph | moderate | 233 → 316 | 0.5 | 0.15–0.29 → 0.00–0.05 | 0.32–0.51 → 0.02–0.24 | 0.22 / 0.21 → 0.02 / 0.02 | 0.28 |
| 45°F, 4 mph | hard | 290 → 395 | 0.5 | 0.00–0.11 → 0.00–0.00 | 0.15–0.32 → 0.01–0.19 | 0.08 / 0.08 → 0.02 / 0.02 | 0.28 |
| 32°F, 8 mph | easy | 175 → 246 | 1.1 | 0.87–1.03 → 0.48–0.60 | 1.02–1.32 → 0.59–0.83 | 0.87 / 0.80 → 0.51 / 0.47 | 1 |
| 32°F, 8 mph | moderate | 233 → 316 | 1.1 | 0.53–0.66 → 0.26–0.36 | 0.65–0.90 → 0.37–0.57 | 0.56 / 0.52 → 0.30 / 0.27 | 1 |
| 32°F, 8 mph | hard | 290 → 395 | 1.1 | 0.33–0.44 → 0.11–0.19 | 0.44–0.65 → 0.22–0.40 | 0.37 / 0.34 → 0.17 / 0.16 | 1 |
| 14°F, 12 mph | easy | 175 → 246 | 1.6 | 1.40–1.57 → 0.88–0.99 | 1.63–2.07 → 1.00–1.40 | 1.66 / 1.51 → 1.06 / 0.97 | 1 |
| 14°F, 12 mph | moderate | 233 → 316 | 1.6 | 0.95–1.08 → 0.59–0.69 | 1.09–1.50 → 0.66–1.03 | 1.15 / 1.05 → 0.72 / 0.66 | 1 |
| 14°F, 12 mph | hard | 290 → 395 | 1.6 | 0.68–0.78 → 0.39–0.47 | 0.75–1.14 → 0.46–0.78 | 0.83 / 0.76 → 0.50 / 0.46 | 1 |
| −4°F, 8 mph | easy | 175 → 246 | 1.1 | 1.82–1.99 → 1.14–1.27 | 2.08–2.22 → 1.30–1.79 | 2.10 / 1.91 → 1.33 / 1.21 | 1 |
| −4°F, 8 mph | moderate | 233 → 316 | 1.1 | 1.24–1.37 → 0.78–0.88 | 1.42–1.91 → 0.88–1.34 | 1.44 / 1.32 → 0.92 / 0.83 | 1 |
| −4°F, 8 mph | hard | 290 → 395 | 1.1 | 0.90–1.00 → 0.53–0.60 | 1.01–1.48 → 0.61–1.03 | 1.06 / 0.96 → 0.64 / 0.59 | 1 |

Climb targets fall by roughly a third to two thirds, so the climb now dresses closer to what skinners often wear: a base or light fleece with light pants in the cold, a single layer in mild air. Descent and transition IREQ, targets and margins are unchanged in every golden response.

## Golden review

Compared with `main` after #375 (equal regional multipliers), 29 snapshots change, all of them cycling or ski touring. Running, XC and alpine are unchanged.

- **Cycling.**
  - Easy rides in cool air get warmer targets and warmer outfits. At 45°F, 4 mph, easy, the band goes 0.51–0.77 → 0.72–1.12. The catalog outfit goes from a Ferrosi Hoodie and Ferrosi Joggers (0.52 clo) to a base pant, the Upstride Jacket and joggers (0.80).
  - Moderate and hard targets in the cold barely move; their upper limits widen.
  - Several garment and glove choices change at about the same warmth. Comfort moves by up to 19 points; catalog near-freezing rain, for example, goes 93.5 → 74.9.
  - Where the hand and head bands taper (45°F dry, 36°F rain), a jacket's hood or the wardrobe's gloves now read "over". Accessory choice is #370's work, and a hood is always counted as worn.
- **Touring climb.**
  - Climb outfits get lighter throughout: in mild air, a single top and light pants.
  - Catalog climbs from 25°F down to extreme cold stay "Likely comfortable" (92–99). The wardrobe extreme-cold climb improves from 67.6 to 92.1.
  - The mild and rain climbs read warmer (catalog 96.4 → 75.9 and 74.4 → 63.5). At 45°F, easy, the catalog's lightest pants (0.48 clo) sit over the lowered leg band (0.42). In rain the same protective outfit as before now exceeds the lower band. Wardrobe climbs sometimes read "over" where the lightest suitable hat or glove is above the lower band.
- **Touring descent.** Its targets are unchanged, but the outfit is the climb clothing plus the pack, so lighter climbing pants leave the legs shorter. See the next section.
- **API additions.** Cycling gets `conditions.relative_air_speed_ms` and `ireq.cold_exposure_factor`; the climb gets `ireq.uphill_cold_exposure_factor` and `ireq.uphill_validation_source`. Cycling's `ireq.validation_source` is now `coweda_inspired_unvalidated_swttr_margin`.

## Descent findings

Every golden touring case, `main` (after #375) → this branch:

| Case | Descent comfort | Summary | Regions short of minimum, clo | Descent legs / minimum, clo | Climb legs, clo |
| --- | --- | --- | --- | --- | --- |
| catalog: mild, calm, dry, easy | 91 → 68 | Likely comfortable → Warmer than recommended | none → none | 2.45 → 2.21 / 1.92 | 0.72 → 0.48 |
| catalog: cool, breezy, moderate | 73.1 → 74.6 | Warmer than recommended → Cooler than recommended | none → legs 0.38 | 2.74 → 2.21 / 2.59 | 1.01 → 0.48 |
| catalog: cold, windy, snowing, hard | 57.3 → 54.4 | Uneven warmth → Uneven warmth | legs 0.37 → legs 0.80 | 2.93 → 2.50 / 3.30 | 1.20 → 0.77 |
| catalog: extreme cold | 62.5 → 55.3 | Uneven warmth → Cooler than recommended | legs 1.21 → arms 0.36, legs 1.84 | 3.56 → 2.93 / 4.77 | 1.83 → 1.20 |
| catalog: near-freezing rain | 73.7 → 73.7 | Warmer than recommended (unchanged) | none → none | 2.64 → 2.64 / 1.93 | 0.91 → 0.91 |
| catalog: large body | 68.9 → 75 | Uneven warmth → Cooler than recommended | legs 0.12 → legs 0.36 | 2.45 → 2.21 / 2.57 | 0.72 → 0.48 |
| catalog: light pack, cold, windy | 73.4 → 67.1 | Cooler than recommended (unchanged) | arms 0.52, legs 0.37 → arms 0.48, legs 0.80 | 2.93 → 2.50 / 3.30 | 1.20 → 0.77 |
| empty wardrobe, catalog fallback | 13 → 13 | Uneven warmth → Cooler than recommended | none → legs 0.38 | 2.74 → 2.21 / 2.59 | 1.01 → 0.48 |
| wardrobe: mild, calm, dry, easy | 90 → 61.9 | Likely comfortable → Warmer than recommended | none → none | 2.55 → 2.26 / 1.92 | 0.82 → 0.53 |
| wardrobe: cool, breezy, moderate | 63 → 63 | Warmer than recommended → Uneven warmth | none → legs 0.33 | 2.55 → 2.26 / 2.59 | 0.82 → 0.53 |
| wardrobe: cold, windy, snowing, hard | 65.8 → 68.1 | Cooler than recommended → Uneven warmth | arms 0.35, legs 0.37 → legs 0.75 | 2.93 → 2.55 / 3.30 | 1.20 → 0.82 |
| wardrobe: extreme cold | 56.9 → 55.3 | Cooler than recommended (unchanged) | arms 0.74, legs 1.74 → arms 1.09, legs 1.84 | 3.03 → 2.93 / 4.77 | 1.30 → 1.20 |
| wardrobe: near-freezing rain | 67.5 → 67.5 | Warmer than recommended (unchanged) | none → none | 2.64 → 2.64 / 1.93 | 0.91 → 0.91 |
| wardrobe: large body | 62.8 → 70.3 | Warmer than recommended → Uneven warmth | none → legs 0.31 | 2.55 → 2.26 / 2.57 | 0.82 → 0.53 |

Comfort can rise while a shortfall appears, because the comfort score also counts excess warmth elsewhere. Every shortfall is reported in the descent evaluation ("Legs needs more insulation"), not hidden.

**Why the pack doesn't close the leg gap.** I checked the three suspected causes:

- **No candidate filtered out.** Every catalog insulated pant passes the descent filter (downhill score 7–8) and the over-pant category rule. So does the wardrobe's Columbia Bugaboo II.
- **The leg layer is already the warmest available.** The pack adds one leg layer over the climbing pants. In every short case it picks a 1.8 clo insulated pant: Helly Hansen Legendary, the lightest of the catalog's three 1.8 clo pants, or the wardrobe's Bugaboo II. No catalog over-pant is warmer.
- **The ceiling is the climb pants plus 1.8 clo.** Descent legs = 0.961 × (climb legs + over-pant). Reaching the minimum needs regressed climb legs of at least the minimum − 1.73 clo. That is 0.86 at 25°F against the climb's 0.78 upper limit, 1.57 against 1.10 in cold, windy, snowing conditions at hard effort, and 3.04 against 1.66 in extreme cold.

So no climb outfit inside its own band, combined with the catalog's warmest over-pant, reaches the descent's leg minimum in these cases. Before this change the climb wore heavier pants, and the same ceiling already left cold, windy and extreme-cold descents 0.37 and 1.21 clo short. This is a target-design and catalog question, not a selection bug, so it is recorded here rather than forced:

- **The descent target uses rates this change was told to leave alone.** The descent's 146 W/m² is half the Compendium's moderate downhill active time (6.3 MET, 293 W/m²), plus 5 m/s of skiing air. A low rate makes the target warmer. Since #375 the leg band also equals the whole-body band. Recalibrating the descent is option 3 of #374 and needs field feedback (#8).
- **Catalog gap.** There are no insulated over-pants or belay pants warmer than 1.8 clo with regional data.
- **Model limit.** Only one leg layer can be added at the transition. Base and fleece layers would go underneath, which would mean taking boots and pants off.

**One selection fix made here.** When no layer reaches the descent minimum, the pack used to trade the gap it closes against weight (70/30). In the wardrobe's extreme-cold case that chose a 226 g down jacket over an owned 539 g synthetic puffy that closes more of the gap. Now, unless a light pack is asked for, the layer leaving the smallest remaining gap wins and weight only breaks ties (`packForRegion` in `ski-touring-outfit.ts`). In that case the torso shortfall drops from 0.63 to none and the arms from 1.37 to 1.09 clo. The descent's metabolic rate, air speed and margins are unchanged.

## Limits

- The MET mapping, riding speeds, the wind combination, the margin taper and the conversion of CoWEDA errors to clo are assumptions. Nothing here measures an individual's heat production, and there are no field data (#8).
- Cycling assumes continuous riding. Stops and long descents still need the extra layer the guidance mentions. The climb assumes continuous skinning; the transition handles stops.
- The IREQ solver is simplified, with no skin-evaporation term (see the [algorithm review](algorithm-review.md)).
- The regional and extremity multipliers are untouched here. #375 has since set every regional multiplier to 1.0; the reference calculations above are whole-body, IREQ and hand/head values, which #375 doesn't change.
