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

This continuous taper is an **unvalidated engineering assumption**, chosen to remove positive local floors in mild dry exercise while retaining allowances at freezing, in wet conditions and in strong wind. It is not a physiological threshold. It scales only the activity allowance above the whole-body heat-balance minimum and the CoWEDA-inspired buffers, as well as both extremity bands. The minimum before adding the tapered CoWEDA-inspired margin is `raw_ireq_min + max(0, activity_min − raw_ireq_min) × exposure_factor`, rounded to 0.01 clo. The heat-balance minimum itself is never tapered: smaller bodies and easy efforts can still require insulation in mild air. Local hand/head bands are wholly heuristic, since IREQ supplies no local heat-balance calculation, and may taper to zero independently. Regional minima still average back to the whole-body minimum. The upper range remains a comfort allowance above raw neutral IREQ; XC's base allowance decreases from 0.24 to 0.12 clo. Zero thermal targets allow exposed arms/lower legs and no thermal accessories; they do not waive body coverage, wind/wet protection, pole grip or sport safety equipment.

The [ISO 11079 scope](https://www.iso.org/standard/38900.html) concerns cold exposure and excludes specific precipitation effects. SWTTR handles wet protection separately. Published CoWEDA skin-temperature errors do not validate SWTTR, and converting them to clo is not a measured safety bound. Running/XC therefore report `coweda_inspired_unvalidated_swttr_margin` as the margin source. Other phase policies retain their prior behavior pending separate review.

The dry 56°F / 8 mph / moderate reference run has a 0.03–0.23 clo whole-body band and zero hand/head thermal targets. The generic shirt/shorts estimates pass the existing server comfort evaluation against the actual regional minima without accessories. This is a regression calculation, not evidence that every runner should wear an identical outfit.

### Reference calculations (#245)

The following deterministic calculations use 50% humidity when dry, 95% when wet, 8 mph wind (3.57632 m/s) unless shown otherwise, and the 69 in / 170 lb reference body except for the smaller-body rows. They are model checks, not observed physiological measurements.

| Sport and conditions | Heat flux W/m² | Raw IREQ min–neutral, clo | Final whole-body band, clo | Hand / head minimum, clo |
| --- | ---: | --- | --- | --- |
| Running, 56°F, moderate, dry | 395.2 | 0.03–0.11 | 0.03–0.23 | 0 / 0 |
| XC, 56°F, moderate, dry | 395.2 | 0.03–0.11 | 0.03–0.25 | 0 / 0 |
| Running, 10°C, easy, dry, 62 in / 110 lb | 254.2 | 0.32–0.43 | 0.32–0.55 | 0 / 0 |
| XC, 10°C, easy, dry, 62 in / 110 lb | 266.0 | 0.29–0.40 | 0.29–0.54 | 0 / 0 |
| Running, 0°C, moderate, wet | 395.2 | 0.30–0.37 | 0.35–0.52 | 0.35 / 0.31 |
| XC, 0°C, moderate, wet | 395.2 | 0.30–0.37 | 0.36–0.54 | 0.36 / 0.31 |
| Running, −15°C, hard, dry, 8 m/s wind | 511.4 | 0.50–0.56 | 0.58–0.90 | 0.72 / 0.63 |
| XC, −15°C, hard, dry, 8 m/s wind | 525.3 | 0.49–0.54 | 0.57–0.90 | 0.74 / 0.62 |
| Running, 20°C, hard, dry | 511.4 | 0–0 | 0–0.12 | 0 / 0 |
| XC, 20°C, hard, dry | 525.3 | 0–0 | 0–0.14 | 0 / 0 |

Since migration 036 ([catalog-thermal-calibration.md](catalog-thermal-calibration.md)), the final whole-body and regional bands are converted from these resultant values to the basic clo garments are rated in, for each sport's wind, motion and outer fabric (ISO 11079 Annex A). Raw IREQ and the hand/head minimums above are unchanged.

The earlier implementation multiplied the entire whole-body minimum by the exposure factor. That incorrectly turned the smaller runner's 0.32 clo heat-balance requirement into zero at 10°C. Regression tests now preserve that requirement and verify the shirt/shorts case using the server evaluator. Sensitivity checks cover both sports, all three efforts, three body sizes, wet/dry conditions, temperatures from −25°C to 25°C, and wind around the 4 and 12 m/s taper boundaries. Both regional bands average back to their whole-body band within rounding tolerance, and warmer weather or greater effort never raises a thermal target in that matrix.

Golden review of this correction changes eight running/XC responses: easy effort at 45°F and near-freezing rain, in both catalog and wardrobe modes. Whole-body and regional minima rise to retain heat balance; upper bands and accessory targets stay unchanged. Running's garments stay unchanged. XC's rain outfits change to reduce arm shortfalls: catalog arm clo rises from 0.30 to 0.35, and wardrobe arm clo from 0.30 to 0.32, against a 0.32 minimum. Those choices trade breathability for the corrected regional budget and still use the existing selector; full wet/standalone suitability remains #248's responsibility. All 45 cycling, alpine and touring golden responses remain byte-for-byte unchanged, preserving chairlift and climb/descent behavior.

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

## Optional accessories (#246)

Sustained running/XC now select accessories from the same server-generated local bands that manual checks use. Bare hands and no thermal head/neck layer are intentional candidates whenever they meet the local minimum within the existing 0.05 clo display tolerance. Suitable known gloves compete by functional protection and then lower insulation. Headbands, beanies and non-overlapping neck layers compete as combinations against one head/neck budget, including worn hood insulation. A neck-only item cannot meet a head need without a head layer or hood. These remain coarse local-clo heuristics, not predictions for exposed ears or skin temperatures.

`ireq.extremity.max` supplies explicit upper comfort limits for these two sports. Running's upper limits follow the existing neutral accessory targets. XC's hand upper limit is at least 0.55 clo, allowing the catalog's existing 0.50–0.55 clo liner gloves for pole grip and friction protection even when thermal demand is zero. This bounded catalog-based allowance and the existing 0.05 clo tolerance are **unvalidated engineering assumptions**, not measured physiological limits. Pole handling uses an explicit compatibility mapping from existing metadata: liner/light/insulated gloves with dexterity at least 5. Mittens, overmittens and unknown dexterity do not establish that capability. No runtime product-name inference or new catalog entries are involved. Below freezing or in wind/wet conditions, known windproof/waterproof gloves are preferred among thermally suitable choices, with protection gaps disclosed when necessary.

When nothing fits the local band, the selector weighs going without against the nearest item instead of always going without: how far each option lies outside the accepted range, with a shortfall counting double an excess. So a much warmer item never wins merely because it is the only one (a 3 clo mitten at freezing still loses to bare hands), but a slightly warm glove beats bare hands that would be well short, as at 25°F with 12 mph wind. An item that still falls short is worn and reported `missing` with a check-warmth warning; a warmer-than-range item is reported `over`, which the outfit check scores as local excess. XC chooses among gloves that grip poles whenever any exist. The response's `recommendation.accessories.hands/head` distinguishes `selected`, `not_needed`, `missing` and `unknown`, with selected IDs, actual clo, local bounds, thermal status and a thermal/pole-grip purpose. Known zero coverage is not unknown data. Unknown candidates are not worn or scored as if their insulation were known; a bare but insufficient body area still gets its cold assessment. Requirement matching consumes the actual accessory decision and keeps ownership per item kind. When both head and neck layers are selected, the head requirement matches the head-warmth item regardless of inventory order; a selected neck layer is the fallback only when no head layer is selected. Targets-only responses include accessory states too. Because the no-garment fast path has not loaded accessories, positive accessory needs report unknown availability rather than falsely claiming that no gloves or hats exist.

The layer view forwards these upper limits unchanged to `/api/v1/ensembles/evaluate`; all thermal calculations stay on the server. Manual addition/removal uses the same local bounds and tolerance, and local excess can lower comfort even when whole-body clo is in range. Catalog hood insulation is resolved from worn torso garments during those checks, including helmet compatibility. A manual XC glove removal does not invent thermal demand at a zero hand minimum; the recommendation's separate functional guidance explains the grip purpose. Full editing-aware functional explanations and the broader comfort policy remain #250's integration work.

**Deep cold and catalog ratings (follow-up to #338).** The local hand/head bands are heuristic, since IREQ has no local method. At −15°F with 10 mph wind they accept a 1.2 clo softshell glove rated only to −10°C and reject everything warmer, so the first version left owned −25°C gloves and balaclavas unworn and reported nothing suitable. Catalog `min_temp_active` ratings now check the bands. An item rated for active use only above the air temperature plus 10°C (two 5°C rating steps) gives way to items rated for these conditions, when any exist. Neck pieces must themselves be rated. When a part's inventory holds both rated and unrated items, the ratings say the conditions are colder than the lighter gear is meant for. In that case going without is no longer an option when it would leave the part short, and a hood that leaves the head short gets a hat. If the lightest rated choice is still above the band, it sets that part's upper limit: `assessments.*.max` and `ireq.extremity.max` both report the raised limit, so response scoring and manual checks don't call it overheating. When nothing rated is owned, the nearest unrated item is worn with a warning that it isn't rated for this cold. The tolerance and the double weighting of shortfalls are **unvalidated engineering assumptions**. Manual checks still judge local clo alone, so swapping a rated item for a lighter unrated one isn't flagged (#250).

Cycling, alpine and touring call the shared selector with explicit sport/phase context and retain their previous active/static temperature rules and target matching. Alpine and touring descent still select required helmets independently. Touring retains separate climb/descent gloves and carryover behavior. No thresholds for those sports are recalibrated here.

The accessory golden review changes 28 running/XC responses while every cycling/alpine/touring response remains identical. Whole-body/regional targets and torso/leg outfits are unchanged. The earlier forced heavy head layers disappear; narrow local budgets can now expose missing suitable accessories in sparse wardrobes instead of assigning expedition gear and a misleading high comfort score. Existing hood warmth can itself exceed the local maximum, which lowers the accessory-aware score even when no extra hat is selected. These outcomes are intentional visibility of the current catalog/policy limits, not evidence of physiological validation.

The deep-cold follow-up changes 10 running/XC golden responses; garments and all cycling/alpine/touring responses stay identical:

- At −15°F, runners and skiers in both wardrobe and catalog modes wear handwear rated to −20°C (1.8 clo) and a balaclava rated to −25°C, judged in range. Previously the wardrobe cases went without both (comfort 26 and 25) and the catalog cases used a 1.1–1.2 clo glove rated to −10°C, plus no hat or a 0.45 clo beanie.
- At 18–25°F, wardrobe runners wear their lightest glove (a 0.8 clo shell mitt) instead of going without. Comfort rises from 41–45 to 64–69, with a warmer-than-range warning. XC wardrobes wear a 1.0 clo softshell glove that grips poles instead of nothing (comfort 40–44 → 62–65).
- At 5°F with 20 mph wind, the XC wardrobe swaps an in-range shell overmitt that can't grip poles for that softshell glove, 0.16 clo above the band (comfort 74.6 → 72.4). Grip is the reviewed trade-off here.
- In near-freezing rain, catalog runners again wear a 0.45 clo liner glove instead of nothing (comfort 58.2 → 62.1).
- At 18°F, catalog runners and skiers move from a 0.45 clo liner rated to 0°C to a 0.55 clo liner rated to −5°C.

## XC standalone outfits and exposure (#248)

XC retains the regional search shared with alpine, including one garment per slot per covered region, no repeated IDs, bibs under torso jackets, and no shell over insulated outer pants. Only XC opts into a new candidate assessment. A reviewed standalone Nordic tight/pant or top can satisfy clothing coverage regardless of its category. A base under a reviewed covering outer can also form a wearable combination; thermal underwear alone, unknown usage and unknown thermal data cannot establish suitable clothing. Full torso/arm and leg coverage is required for these Nordic combinations. Regional insulation already includes coverage and is never scaled twice.

Actual full-region wind/wet capabilities rank first, with waterproof coverage preferred over merely water-resistant coverage when wet. A category name alone proves neither. Excess beyond the existing 0.15 clo wardrobe allowance ranks before filling missing clothing coverage, followed by combined regional cold deficit and warmth excess, breathability and layer count. Cold comparisons use the shared 0.05 clo tolerance. A protected outfit can exceed its warmth budget when protection is necessary; final evaluation and missing requirements retain that mismatch. Requirement matching assesses the selected combination, so a suitable single pant is a match and unsuitable owned underwear cannot silently fill it. No new catalog items or database changes are needed.

The request accepts optional `outing_pattern` (`continuous`, `frequent_stops`, `unknown`) and `xc_exposure` (`sheltered`, `exposed`, `descents`, `unknown`). Gear up provides independent XC controls and forwards them with the existing easy/moderate/hard effort. The outing, session draft and saved kit retain this context. Invalid values are rejected; older clients remain unknown. Technique (classic/skate) does not set effort. Relaxed moving effort should use Easy; frequent stops describe time out of movement, not a replacement for that control.

`ireq.policy.xc` discloses the resolved context. The effective wind is the **maximum**, not sum, of ambient wind and an exposure floor: ambient wind unchanged for sheltered/unknown skiing, 4 m/s for exposed terrain, 5 m/s for long descents. Ordinary motion is already included in the merged dynamic insulation correction; no ordinary movement speed is added to ambient wind here. Sheltered terrain does not discount reported ambient wind. That effective wind enters IREQ, the existing basic-clo conversion, targets, accessories and moving evaluation once; scoring keeps a normal exposure multiplier. Wind protection is requested above 8 m/s, at 4 m/s or more when air is at most 5°C, or at 2 m/s or more when air is at most −10°C. Freezing alone does not demand an extra garment, and existing protected pants/tops can meet the need. These floors and thresholds are **unvalidated engineering assumptions**, not measured ski speed, an aerodynamic wind-vector model, or a physiological boundary. Unknown terrain assumes ordinary continuous skiing and explicitly says so; long exposed descents should use the corresponding exposure choice.

When precipitation is present, snow below −1°C is treated as dry snow. Snow at/above −1°C, rain, mixed or unknown precipitation is treated as wet. This is a conservative engineering distinction using available weather inputs; there is no snow-water measurement. Dry snowfall does not force waterproof layers or the wet-exposure allowance, although cold/wind requirements remain. Wet conditions retain the wet allowance and request real wet protection. Input assumptions and selected/omitted protection appear in the reasons.

Moving targets continue to use the chosen moving effort. Frequent stops do not inflate the moving outfit or its score. Separate `carry_items` advice recommends generic extra insulation for frequent stops, temperatures at/below 5°C, or wet precipitation. Gear up labels it **Carry**, explains its break/after-session purpose, and saves it separately from worn layers in trip kits. This generic advice asserts no product ownership. The accessory path from #246 still chooses thin pole-grip gloves and appropriate head coverage from the same local bands; it never adopts running's bare-hand rule for XC.

This design is consistent with [Salomon's XC clothing guidance](https://www.salomon.com/en-gb/sg/a/how-to-dress-for-cross-country-skiing), which describes commonly wearing one bottom layer, one or two upper layers, thin gloves/headwear for intense outings, and keeping warmth ready for afterward. That practical guidance does not validate the numerical thresholds above. Field checks remain necessary across body sizes, snow moisture, exposure and stop patterns.

Behavioral coverage includes spring skiing, sustained hard effort below freezing, cold wind/long descents, wet snow/rain, frequent stops, sparse wardrobes, unknown thermal/protection data, standalone pants competing with base-plus-shell combinations, independent arm/leg fit and duplicate identities. Route tests verify request validation, legacy effort aliases, explicit unknown assumptions, pole-grip purpose, and identical moving outfit/scores when only the stop pattern changes. Alpine retains its catalog/wardrobe/sparse-wardrobe parity matrix. Only XC snapshots are updated for this slice; non-XC golden responses must remain unchanged from main.

## Validation and limits

Behavioral tests cover MET conversion, body size, effort and warmer-weather monotonicity, zero-target/taper boundaries, wet/strong-wind/cold cases, weighted regional consistency, partial-coverage arithmetic, standalone versus underlayer semantics, unknown data, catalog API/pool availability, and Postgres migration replay, deployment-time matching, range constraints and preservation of existing insulation/access policies. Golden response changes require semantic review; a snapshot update alone does not establish correctness. After removing newly added garment metadata, all 45 cycling/alpine/touring golden cases preserve their previous behavior. The 28 running/XC cases change targets and resulting outfits; mild XC becomes lighter, cold/wet targets remain positive, running retains known weather protection, and alpine chairlift/touring phases retain their prior targets and transitions. Some running/XC outcomes still reflect the old selection and comfort heuristics, including unsuitable torso/leg layering outside this accessory change. Those are pending integration work, not evidence of correctness from high comfort scores.

Field validation still needs real outfits and comfort feedback across mild running, near-freezing rain, spring XC, hard cold XC, descents, frequent stops and different body sizes. The model does not predict validated physiological injury or safe exposure duration. #243 remains open until the remaining children integrate and pass its full release matrix.
