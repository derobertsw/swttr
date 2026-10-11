# Running and XC foundations (#244 / #245)

These changes establish garment and target contracts for #243. They do not complete the outfit/accessory selectors (#246–#248), wardrobe requirements (#249), comfort presentation (#250), or preference wiring (#251). In particular, a zero accessory target does not yet cause the existing accessory selector to omit a hat/gloves.

## Evidence and metabolic conversion

The [2024 Adult Compendium](https://pacompendium.com/) defines a MET as approximately 1 kcal/kg/hour. Its [running references](https://pacompendium.com/running/) include 6.5 MET at 4–4.2 mph, 8.5 at 5–5.2 mph, and 11 at 7 mph. Its [winter references](https://pacompendium.com/winter-activities/) include XC ski walking at 6.8, moderate XC at 8.5, and vigorous XC at 11.3 MET.

| Sustained effort input | Running MET | XC MET | Interpretation |
| --- | ---: | ---: | --- |
| easy | 6.5 | 6.8 | Continuous slow movement, not rest or an outing dominated by stops |
| moderate | 8.5 | 8.5 | Continuous steady effort |
| hard | 11.0 | 11.3 | Sustained vigorous effort; not necessarily elite racing |

Mapping subjective effort to these reference activities is a SWTTR assumption. Pace, technique, terrain, fitness and individual physiology can change heat production substantially. The existing `racing` XC alias still maps to `hard`; no new input is mandatory. Frequent-stop outings are outside this sustained-phase calibration: guidance explicitly calls for additional clothing and a separate assessment for stops, without pretending that an average activity target protects a stationary person.

For running/XC, convert once: `M = MET × (4184 / 3600) × mass_kg / surface_area_m²`. Use the existing Du Bois area formula and sanitized body measurements, with the existing default of 69 inches / 170 lb when missing. The reference body has about 1.928 m² of area and an 8.5 MET heat flux of about 395 W/m². Do not additionally apply the old bounded body-size multiplier. The 58.2 W/m²/MET lookup convention remains available as a reference rate; the running/XC recommendation pipeline uses the mass-based conversion. Cycling, alpine/chairlift and touring still use their previous rates and size adjustment.

This is gross metabolic expenditure with the existing zero external-work assumption, not a validated measurement of an individual's net heat. No transient physiology or new exposure-duration model is introduced.

## Server policy and targets

`src/lib/biophysics/sport-policy.ts` owns `running_xc_v1`: activity, sustained phase, effort, actual heat flux, applicability of cold margins, separate wind/wet/pole-grip needs, and assumptions. `phaseTargets` computes one set of whole-body, regional and extremity bands. Selection reads those targets; the API echoes the policy and bands; the existing server ensemble evaluation reads those same bands. Future selector/evaluator work must reuse this contract rather than recomputing targets in the browser. Protection capabilities describe garments; protection needs describe conditions. Neither establishes ownership.

The cold-exposure applicability factor is the maximum of:

- `clamp((10 − air_temp_C) / 10, 0, 1)`;
- `clamp((effective_wind_m_s − 4) / 8, 0, 1)`;
- `0.7` when precipitation is present.

This continuous taper is an **unvalidated engineering assumption**, chosen to remove positive local floors in mild dry exercise while retaining allowances at freezing, in wet conditions and in strong wind. It is not a physiological threshold. It scales the whole-body minimum and the CoWEDA-inspired buffers, as well as both extremity bands. Regional minima still average back to the whole-body minimum. The upper range remains a comfort allowance above raw neutral IREQ; XC's base allowance decreases from 0.24 to 0.12 clo. Zero thermal targets allow exposed arms/lower legs and no thermal accessories; they do not waive body coverage, wind/wet protection, pole grip or sport safety equipment.

The [ISO 11079 scope](https://www.iso.org/standard/38900.html) concerns cold exposure and excludes specific precipitation effects. SWTTR handles wet protection separately. Published CoWEDA skin-temperature errors do not validate SWTTR, and converting them to clo is not a measured safety bound. Running/XC therefore report `coweda_inspired_unvalidated_swttr_margin` as the margin source. Other phase policies retain their prior behavior pending separate review.

The dry 56°F / 8 mph / moderate reference case now has zero regional minima and zero hand/head thermal targets. The generic shirt/shorts estimates pass the existing server comfort evaluation without accessories. This is a regression calculation, not evidence that every runner should wear an identical outfit.

## Garment semantics

`garment_type` already supports shorts and short sleeves in the database. `usage` explicitly distinguishes `standalone`, `underlayer`, `either` and `unknown`. Nullable `coverage_torso`, `coverage_arms` and `coverage_legs` describe the fraction of each region covered. Null/absent values mean unreviewed metadata; the original coverage booleans remain for compatibility. Existing base category labels alone do not establish standalone suitability.

**All regional rcl/recl values average over the entire region, including exposed skin, before ensemble regression.** Partial coverage is already incorporated into those values. Never multiply by coverage again. The historical linear/regional averaging and ensemble regression are approximations, especially for highly uneven coverage; this work does not claim local skin-temperature predictions. Uncovered regions contribute zero; missing covered-region values are unknown. The recommendation pool excludes garments without usable regional insulation/evaporative data and returns the existing targets-only no-gear state if none remain. Wardrobe browsing still exposes such items. Conversion preserves unknown covered values as NaN rather than inventing zero; it must not be used to score an unchecked garment.

`garmentCapabilities` separates standalone use, explicit coverage, usable thermal data, wind and wet protection. A standalone garment can provide several capabilities regardless of base/mid/outer labels. Shell category alone proves neither wind nor water resistance. Unknown protection is not an affirmative capability. A small running compatibility safeguard retains known wind/wet protection independently of the thermal budget (and warns when unavailable), so the changed defaults cannot remove essential weather protection solely by lowering IREQ. The complete rain/condition-specific outfit search belongs to #247/#248.

### Catalog estimates

Read-only preflight on 2026-10-09 found 97 garments, 28 handwear and 38 headwear. The live identities matched the fixture's relevant products; migrations were also inspected. No shorts or short-sleeve tops were present. Existing base-layer tights were thermal underwear, not standalone running tights. Reuse Patagonia Wind Shield Pants and Outdoor Research Ferrosi Joggers for standalone pants; Capilene Cool Lightweight and the existing breathable wind/soft-shell tops remain available. Reuse existing liner gloves and Capilene Cool Daily Headband instead of creating accessory duplicates. The explicitly listed usage annotations in migration 022 reflect a bounded review of the seed/catalog descriptions, not runtime name inference. Other legacy metadata remains unknown.

Add only three **generic archetypes**, labeled “SWTTR Generic …”, not precise estimates for branded products:

| Basic | Torso / arms / legs coverage | Regional torso / arm / leg clo | Regional clo uncertainty allowance |
| --- | --- | --- | --- |
| Lightweight running T-shirt | 1 / 0.2 / 0 | 0.10 / 0.02 / 0 | 0.08 |
| Running shorts | 0 / 0 / 0.3 | 0 / 0 / 0.06 | 0.08 |
| Standalone running/Nordic tights | 0 / 0 / 1 | 0 / 0 / 0.25 | 0.15 |

These rounded insulation values, regional evaporative resistance, coverage fractions and low confidence score are broad engineering estimates derived from lightweight catalog analogues and assumed fabric coverage. They have no product-specific test evidence. `generic_estimate`, `data_source`, `estimation_method` and `uncertainty_clo` disclose that limitation. The uncertainty is not a statistical confidence interval; the confidence score is a qualitative low-confidence annotation, not a probability. Generic entries assert no wind/water protection and have no invented price, weight or product imagery. Whole-body database estimates round to the schema's two decimal places; scoring uses regional values and regression. The generic entries are explicitly limited to running, plus XC for standalone tights, so they do not enter cycling, alpine or touring recommendations. Existing reviewed garments keep their thermal/protection values.

Migration 022 checks matching basics again at deployment time, adds only missing types, uses conflict guards and does not overwrite existing thermal data. Apply it before deploying code that reads the new wardrobe columns. Preparing/testing the migration does not change the production database.

## Manual evaluation (#244 follow-up)

The recommendation-to-layer conversion and manual picker retain garment type, usage,
coverage and estimate provenance. `/api/v1/ensembles/evaluate` accepts item references
alongside the legacy numeric arrays. With references present, it loads catalog
regional values on the server; submitted clo and standalone claims cannot override
the catalog. Custom wardrobe items are loaded only for their authenticated owner
and matching body area. Source-free estimates require an explicit generic-estimate
label. Neither an item reference nor its capabilities asserts ownership.

Regional thermal values already include partial coverage. They are not multiplied
by coverage again or replaced with whole-body values when missing. Unknown covered
insulation/evaporative data or a deleted item returns `thermal_data_status: unknown`
with no total, comfort decision, score or inferred gap. Known zero clo stays valid.
Database failures retain the existing failed-check/retry behavior. The view displays
comfort as unknown and does not fall back to the original recommendation's score.

Legacy numeric requests remain supported, with null representing unknown clo.
This change preserves the existing targets, accessory decisions and arm-target
context; complete selector and manual-edit comfort policy integration remains in
#247/#248/#250. No new catalog products or database migrations are needed.

## Validation and limits

Behavioral tests cover MET conversion, body size, effort and warmer-weather monotonicity, zero-target/taper boundaries, wet/strong-wind/cold cases, weighted regional consistency, partial-coverage arithmetic, standalone versus underlayer semantics, unknown data, catalog API/pool availability, and Postgres migration replay, deployment-time matching, range constraints and preservation of existing insulation/access policies. Golden response changes require semantic review; a snapshot update alone does not establish correctness. After removing newly added garment metadata, all 45 cycling/alpine/touring golden cases preserve their previous behavior. The 28 running/XC cases change targets and resulting outfits; mild XC becomes lighter, cold/wet targets remain positive, running retains known weather protection, and alpine chairlift/touring phases retain their prior targets and transitions. Some running/XC outcomes still reflect the old selection and comfort heuristics, including forced accessories and unsuitable layering. Those are pending integration work, not evidence of correctness from high comfort scores.

Field validation still needs real outfits and comfort feedback across mild running, near-freezing rain, spring XC, hard cold XC, descents, frequent stops and different body sizes. The model does not predict validated physiological injury or safe exposure duration. #243 remains open until the remaining children integrate and pass its full release matrix.
