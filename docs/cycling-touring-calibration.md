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

All running, XC and alpine golden responses are unchanged. The cycling and touring changes, by meaning:

- **Cycling.** Easy rides in cool air get warmer targets and warmer outfits. At 45°F, 4 mph, easy, the band goes 0.51–0.77 → 0.72–1.12, and the catalog outfit goes from tights and a Ferrosi Hoodie (0.60 clo) to tights, the Upstride Jacket and Wind Shield Pants (0.84). Moderate and hard targets in the cold barely move, with wider upper limits. Several garment and glove choices change at about the same warmth. Comfort scores move by up to 12 points either way. Where the hand and head bands taper (45°F dry, 36°F rain), a jacket's hood or the wardrobe's gloves now read as "over". Accessory choice is #370's work, and the hood is counted as worn.
- **Touring climb.** Lighter climb outfits: catalog 25°F / 12 mph / moderate goes from base + fleece + two pants (1.01 clo) to an R1 Pullover and R1 Fleece Pants (0.66), with comfort 81.5 → 99.3. Extreme cold goes 1.90 → 1.33 clo, comfort 75.5 → 96.2, and torso is no longer over. In mild air one top and light pants. Wardrobe-only climbs sometimes read "over" where the wardrobe's lightest suitable item is above the lower band.
- **Touring descent, a knock-on effect.** The descent wears the climb clothing plus the pack, and its targets are unchanged, so a lighter climb leaves the pack more to do. With the catalog's warmest over-pants (1.8 clo) the descent legs now fall short in several cold cases (25°F / 12 mph: 2.45 against a 2.87 minimum, "Cooler than recommended", reported in the descent evaluation). In mild air the pack picks a warmer puffy to cover the arms, so the descent torso reads "over". Descent comfort falls in those cases (catalog mild 94.7 → 63.4, cold and windy 77.4 → 46.3). This comes from the descent's own targets and pack selection, which this change leaves alone. It belongs with the descent's leg target and pack rules (#372's open question, field feedback #8).
- **API additions.** Cycling's `conditions.relative_air_speed_ms` and `ireq.cold_exposure_factor`, and the climb's `ireq.uphill_cold_exposure_factor` and `ireq.uphill_validation_source`. Cycling's `ireq.validation_source` is now `coweda_inspired_unvalidated_swttr_margin`.

## Limits

- The MET mapping, riding speeds, the wind combination, the margin taper and the conversion of CoWEDA errors to clo are assumptions. Nothing here measures an individual's heat production, and there are no field data (#8).
- Cycling assumes continuous riding. Stops and long descents still need the extra layer the guidance mentions. The climb assumes continuous skinning; the transition handles stops.
- The IREQ solver is simplified, with no skin-evaporation term (see the [algorithm review](algorithm-review.md)).
- The regional and extremity multipliers are untouched here; #375 owns the regional weights and leg bias.
