# Algorithm review (#116), 2026-11-10

A review of the layer-recommendation algorithms and their documentation, checked by running the code on `main` (`b4e63d7`) and by reading the five source papers in the project's research folder. It records which steps of #116 still apply, what was found, and the follow-up issues filed from it (#370–#376). Nothing here changes a recommendation: the code changes are comments only.

**Headline.** Running and XC were rebuilt under #243. Alpine, cycling and ski touring were not, and since #250 they are judged by the same comfort check. They now recommend outfits that check rejects in most conditions. That is the main thing left from #116's cross-sport list.

## Review record

| | |
|---|---|
| Date | 2026-11-10 |
| Revision | `main` at `b4e63d7` |
| Model | Claude Fable 5.2 (`claude-fable-5-2`), in Claude Code. One model, not several: see step 1 below |
| Context read | README "How Layer Recommendations Work"; `src/lib/biophysics/`; `src/lib/recommendations/` and `sports/`; `docs/running-xc-foundations.md`, `docs/catalog-thermal-audit.md`, `docs/catalog-thermal-calibration.md`; issues #86, #243–#251, #67; the five papers under "Sources checked" |
| Request | Do #116, read the research folder, and check that each step still applies, since the issue is old |

**How findings were checked.** Each finding below was reproduced on `main` or checked against a paper. Ideas that could not be checked are listed under "Assumptions without support", not as findings.

- **Response matrix.** 100 responses: 5 sports × 10 conditions × catalog and wardrobe-only modes, on the golden fixture (`src/test/fixtures/gear-catalog.json`) with the golden tests' wardrobe. Conditions: 65°F / 4 mph moderate; 56°F / 8 mph moderate; 45°F / 4 mph easy and hard; 36°F / 8 mph rain; 32°F / 5 mph moderate; 25°F / 12 mph moderate and hard; 5°F / 20 mph snow, hard; −15°F / 10 mph moderate.
- **Committed snapshot.** Comfort scores and statuses read from `golden.test.ts.snap` as merged, so the main finding does not rest on the extra matrix.
- **IREQ reference.** `calculateIreq` compared with an independent implementation of the ISO 11079 Annex F program (the equations in pythermalcomfort's `ireq.py`). That implementation reproduces USARIEM T18-02 Table 3 to its printed precision.
- **Constants.** Checked against the papers. Metabolic rates checked against the [2024 Compendium](https://pacompendium.com/) bicycling and winter pages.

The harness was a throwaway vitest file calling the route handlers with auth mocked, as the golden tests do. It is not committed.

### Prompt for another model

Give the model the context listed above, then:

> Review SWTTR's layer-recommendation algorithms and their documentation. For insulation calculations, activity-specific layer selection, ensemble scoring and extremity recommendations, list concrete weaknesses, unsupported assumptions, edge cases and improvements. For each, say what in the code or the cited sources supports it, give a scenario (sport, temperature, wind, effort, catalog or wardrobe) where it changes the recommendation, and say how to test a fix. Separate what you verified from what you suspect. Do not describe an agreement between the model and a paper as physiological validation. Check whether selection, targets, final scoring and manual evaluation agree for every sport, and keep nonthermal protection (helmets, functional gloves) separate from optional insulation.

## What became of each step in #116

| Step in #116 | Verdict | Why |
|---|---|---|
| Review with multiple newer models; record versions, prompts and date | **Outstanding** | One model is recorded here, so this step is not met. It stays open on #116 until further models are run or the issue is changed. Recommendation, for the maintainer to decide: narrow it to one recorded review plus the rerunnable prompt above. Since the issue was written, the algorithms went through more than a dozen reviewed PRs from Claude and Codex sessions, and what found the defects below was running the code and reading the sources, which a second model can repeat. |
| Ask for weaknesses, assumptions, edge cases and ideas | **Done** | Findings and assumptions below. |
| Compare findings, validate against implementation and sources, prioritize | **Done, except comparing models** | Findings are ordered by expected effect on recommendations, then effort. |
| Update the algorithm docs | **Done in this change** | See "Doc corrections in this change". |
| Capture improvements in linked follow-up issues | **Done** | #370–#376, nested under #116. The additions for #243 and #86 are listed below and have not been posted. |
| Check cycling: base selection, shells, movement and wind; selection, targets, scoring and manual evaluation should agree | **Still needed, now confirmed** | Findings 1, 2 and the assumptions table. |
| Check ski-touring uphill for excess warmth and optional accessories | **Still needed, now confirmed** | Findings 1–3. Transition, descent and pack lists are still separate. |
| Verify shared wardrobe-gap, preference and comfort-consistency fixes across sports | **Split three ways** | *Comfort consistency:* verified. Every sport goes through `evaluatePhase` (#250), which is what exposes finding 1. *Wardrobe gaps:* only running and XC report them (`requirementFirst`); the other sports still wear whatever is owned without saying what is missing. That moves into #370–#372. *Preferences:* #251 is open and nothing is wired (the setting reaches static guidance only), so the cross-sport check stays in #251's acceptance. Running's thresholds and bare-hand choice were not copied: only running and XC have a `policy`. |
| Keep alpine's chairlift and downhill requirements distinct; coordinate with #153, preserve #152 | **Superseded** | #153 closed on 2026-10-08. #317/#318 replaced the chairlift-sized range with a 60/40 ski-and-lift cycle target; the response still reports skiing and chairlift IREQ separately and takes the exposure estimate from the chairlift. What is left for alpine is headwear (finding 2). |
| Audit nonthermal protective requirements separately from optional insulation | **Done here; one gap** | Finding 4. |
| Validate the energy-expenditure references and CoWEDA-inspired margins | **Done here** | The result is a list of unsupported assumptions, not a validation. |
| Turn remaining validated gaps into scoped issues; document what #243 covers | **Done** | "Follow-up issues" and "Already covered elsewhere". |

## Sources checked

| Source | Result |
|---|---|
| Rioux et al., *Biophysical properties of five cold weather clothing systems*, USARIEM T21-03 (2020) | Eqs. 7–14 match `ENSEMBLE_REGRESSION`. Eq. 1 is a parallel, area-weighted average of manikin zones; it does not define the 0.5 / 0.25 / 0.25 weights a code comment attributed to it. Parka hoods add 0.8–1.5 clo on the head (hood up against hood down), so `HOOD_CLO_VALUES.insulated` at 1.0 is inside the measured range. The warmest ensembles carry 0.45–0.54× the torso's clo on the legs. |
| Potter et al., *Validation of … CoWEDA*, Informatics in Medicine Unlocked 18:100301 (2020) | The error figures in `coweda.ts` match: all skin MAE 1.85 / RMSE 2.28°C, finger 2.68 / 2.68, mean skin 1.06 / 1.25, R² 0.98 at rest and 0.80 in exercise. The data are 23 volunteers sitting or walking on a treadmill, at 0 to −40°C in 1.1–1.3 m/s air. Table 1 gives skin area shares: trunk 35.9 %, arms 13.4 %, legs 31.7 %. |
| Rioux et al., *Biophysical evaluation of … the USMC cold-weather clothing ensemble*, USARIEM T18-01 (2018) | New to this project. Manikin surface areas (Table 2): torso 0.587, arms 0.297, legs 0.574 m² of 1.814. Hand, head and foot manikin values for gloves, mittens, caps, a balaclava, socks and booties (finding 6). Summing layers predicted six measured ensembles with 1–28 % error. |
| Potter et al., *Comparison of cold weather clothing biophysical properties*, USARIEM T18-02 (2018) | New to this project. Table 3 gives ISO 11079 IREQ at −10, −20 and −30°C for 1 and 2 MET, used as the reference in finding 7. Its 22 military ensembles measure 1.3–3.1 clo whole-body; none meets resting IREQ at −10°C. |
| Potter et al., *Does facial hair provide significant thermoregulatory advantage…*, Military Medicine (2025) | Nothing to apply. It models beards in CoWEDA, which treats the head as one segment. It supports the gap #86 already lists: there is no facial-temperature model here. |

## Findings, in priority order

### 1. Alpine, cycling and touring recommend outfits their own comfort check rejects

Since #250 every sport's outfit is judged by `evaluatePhase`, which counts local excess and accessories. Only the running and XC selectors were rebuilt to choose against that check.

| Sport | "Likely comfortable" in the 20-response matrix | Other verdicts | Mean comfort score in the committed snapshot (12 scenarios) | Same mean after #318, per the calibration doc |
|---|---|---|---|---|
| Alpine | 3 | 9 warmer, 4 cooler, 4 uneven | 56.6 | 75.2 |
| Cycling | 0 | 13 warmer, 7 uneven | 35.9 | 67.5 |
| Touring climb | 0 | 16 warmer, 4 uneven | 30.6 | 65.5 |

- **Cycling, 56°F / 8 mph / moderate, catalog.** Base top, base tights, wind jacket, soft-shell joggers, liner gloves and a headband: 0.82 clo against a 0.26–0.49 target, all four body parts over, comfort 60.5. At 65°F it is the same outfit against 0.07–0.21.
- **Touring climb, 25°F / 12 mph / moderate, catalog.** 1.44 clo against 0.86–1.17. A 1.5 clo balaclava, a 0.9 clo neck piece and two hoods put the head at 3.2 clo against a 0.85 target. At 65°F the climb wears a hard-shell jacket and hard-shell bibs.

Causes, all in the selectors:

- `buildBreathableEnsemble` always takes a base top and a base bottom, and cycling always adds a torso shell and a leg shell. At T21-03 values that is already about 0.8 clo.
- The touring climb prefers a hard shell whenever one fits its clo cap (the open item in `catalog-thermal-calibration.md`).
- Neither builder searches regions or uses standalone-garment semantics, and neither sport reports clothing gaps.
- Accessories come from the legacy rules (finding 2).

### 2. Legacy head and neck rule picks the warmest item at 0°C and below, on top of the helmet

`selectBestFromCategory` considers items rated for the temperature or unrated, or every item when none qualifies. It takes the lightest of them above 0°C and the warmest otherwise, and a neck piece is added below 0°C. The evaluator then counts the helmet as well. Head and neck are over target in 13 of 20 alpine responses and all 20 for cycling and the touring climb.

- **Alpine, 25°F / 12 mph / moderate, catalog.** Helmet, helmet-compatible hood, a 1.5 clo balaclava and a 0.9 clo neck piece: 3.75 clo against 2.29. Torso, legs and hands are in range, yet the verdict is "Warmer than recommended" with comfort 29.8 in the committed snapshot. The calibration doc recorded at least 85 for this case before #250.
- **Cycling, catalog.** A liner beanie at 36°F, a 1.5 clo balaclava at 32°F against a 0.55 target.

### 3. Touring descent: legs never get a layer, and hand and head targets pass any glove made

The pack adds one insulation piece and a hard shell. Legs stay in their climb layers, so they are under their minimum in 18 of 20 descents: at 25°F, 1.0 clo against a 2.87 minimum while the torso is over its target.

Descent hand and head targets follow the whole-body IREQ of a low-output phase. At −15°F they are 5.4–5.8 clo for hands and 4.3–4.6 for the head; the warmest catalog mitten is 4.0, and the USMC extreme-cold mitten system measured 1.8–1.9 clo (T18-01). At 45°F / easy the descent asks for 1.9–2.2 clo and picks a glove rated to −25°C.

### 4. A missing helmet is silent, and cycling has no helmet

Alpine and the touring descent always select a helmet when one is available, in all 40 matrix responses. With a wardrobe that holds no helmet, both return `helmet: null` with no warning and no requirement. Cycling never recommends one: only `ski_helmet` exists, and it is selected for alpine and descents only. XC's pole-grip gloves are the only functional glove requirement; nothing else nonthermal (cycling gloves, eye protection) is modeled.

### 5. Whole-body clo: the 0.5 / 0.25 / 0.25 weights and the leg bias have no source

- **Weights.** `REGIONAL_WEIGHTS` was commented as "USARIEM Eq. 1". That equation is a parallel average over manikin zone areas. By area, torso, arms and legs are 40 / 20 / 39 % of the three (T18-01) or 44 / 17 / 39 % (CoWEDA), so legs carry about 0.39, not 0.25.
- **Scale.** SWTTR's whole-body clo is a linear mean of torso, arms and legs. It leaves out head, hands and feet and is not comparable with a manikin's whole-body clo. T21-03's ECWCS Ensemble 4 is 1.7 clo whole-body and 5.9 on SWTTR's scale. Comparing SWTTR's number with IREQ amounts to requiring roughly uniform insulation over torso, arms and legs, which real cold-weather outfits do not have. That is one reason cold alpine targets cannot be met from the catalog. T18-02's result is separate and sits on the paper's own scale: its ensembles measure 1.3–3.1 clo whole-body against a resting IREQ of 5.1–5.5 clo at −10°C, so steady-state IREQ at rest is beyond real clothing whatever the scale. `catalog-thermal-calibration.md` flagged the scale question and left it open.
- **Leg bias.** Running, cycling, XC and the touring phases ask legs for 1.15–1.4× the torso's clo (`REGIONAL_IREQ_MULTIPLIERS`), with no cited source. T21-03's ensembles carry about half the torso's clo on the legs, which is why #317 set alpine's legs to 1.0.

### 6. Hand and head catalog clo has no lab anchor

Garments were moved to T21-03's scale in migrations 035 and 036. Handwear and headwear `rcl_clo` are still estimates. T18-01's part-manikin values, as total minus the bare manikin's air layer:

| T18-01 item | clo | Nearest catalog items | Catalog clo |
|---|---|---|---|
| Light-duty glove insert | 0.32 | Liner gloves | 0.45–0.60 |
| Extreme-cold mitten liner + shell (with or without insert) | 1.8–1.9 | Mittens | 3.2–4.0 |
| Microfleece cap | 0.32 | Midweight beanies | 0.70–0.85 |
| Lightweight balaclava | 0.39 | Balaclavas | 0.75–1.5 |
| Cap + balaclava | 0.71 | | |

These are analogues, not the same products. The local targets were tuned against the catalog's scale, so both would move together.

### 7. `calculateIreq` is a simplified ISO 11079 solver

It uses fixed skin temperatures (33.7 and 30°C), no skin-evaporation term, and no validity limits. ISO 11079 lowers skin temperature with metabolic rate, includes skin wettedness, and applies to 58–400 W/m² at 10°C and below.

| Case | SWTTR min–neutral, clo | ISO 11079 reference | T18-02 Table 3 |
|---|---|---|---|
| −10°C, 58 W/m², still air | 4.71–5.22 | 5.07–5.46 | 5.1–5.5 |
| −10°C, 116 W/m², 0.5 m/s | 2.11–2.36 | 2.19–2.52 | 2.2–2.5 |
| −30°C, 116 W/m², 0.5 m/s | 3.58–3.85 | 3.54–3.87 | 3.5–3.9 |
| Touring climb, 233 W/m², 25°F, 1.6 m/s | 0.73–0.86 | 0.62–0.88 | |
| Cycling, 290 W/m², 25°F, 12 mph | 0.67–0.77 | 0.54–0.78 | |
| XC, 316 W/m², 18°F, 6 mph | 0.61–0.71 | 0.45–0.69 | |
| Running, 395 W/m², 25°F, 12 mph | 0.43–0.51 | 0.27–0.48 | |

Neutral IREQ agrees within 0.25 clo everywhere tested and within 0.03 for the cases at 233–395 W/m². The minimum is up to 0.36 clo low at rest and 0.11–0.16 clo high at 233–395 W/m², so the band for high-output sports is narrower than ISO's and its floor is warmer. Hard running and XC (511–525 W/m²) and anything warmer than 10°C are outside ISO 11079's stated range.

### 8. XC in near-freezing rain picks an insulated ski jacket

In the committed snapshot (catalog, 36°F / 8 mph rain) XC wears a light base top, an insulated waterproof ski jacket and soft-shell joggers: 2.16 clo against 0.31–0.49, comfort 16.8, "Protection incomplete". Waterproof coverage ranks before excess warmth. This belongs to #243's release matrix (wet conditions), not a new issue.

## Assumptions without support

Recorded, not validated. None of these has field data behind it (#8).

| Assumption | Where | What the evidence says |
|---|---|---|
| Metabolic rates for cycling, alpine and touring | `METABOLIC_RATES`, `exertion.ts` | For the default body a Compendium MET is 46.5 W/m². Cycling uses 233 / 290 / 349 W/m² against the Compendium's self-selected easy, moderate and vigorous at 200 / 325 / 418. Alpine skiing uses 116 / 146 / 175 against 200 / 293 / 372 for active time. The Compendium has no ski-touring row; the climb's 175 / 233 / 290 sits below snowshoeing (246 moderate) and XC ski walking (316). Low rates make the outfit warmer. |
| Two MET conventions | `constants.ts` comments, `bodyMetrics.ts` | Running and XC convert Compendium METs by body mass. The other sports' "MET" labels assume 58.2 W/m² per MET, with a bounded size factor. |
| Air speed from movement | `biking.ts`, `alpine.ts`, `ski-touring.ts`, `xc-policy.ts` | Cycling uses ambient wind only. At 45°F / 4 mph a 6 m/s ride raises IREQ from 0.22–0.32 to 0.40–0.50. Alpine and the touring descent add a fixed 5 m/s; XC uses exposure floors. |
| 60/40 ski-and-lift split | `alpine.ts` | Chosen with #318; no source. |
| CoWEDA-inspired margins | `coweda.ts` | The errors are real, the conversion to clo is SWTTR's. They are applied in wind and at outputs outside the paper's data, added to both ends of the band, and not tapered for cycling or the touring climb. |
| Regional multipliers and extremity multipliers | `constants.ts` | No source (finding 5). Hand and head factors of 0.9–1.45, a 0.8–1.0 temperature factor and 3 % per m/s of wind are heuristics; ISO 11079 has no local method. |
| Target-range profile | `targets.ts` | Per-sport buffers, caps and floors, and cold, wind and exposure terms. The wind term partly double-counts the Annex A correction (noted in the calibration doc). |
| Exposure estimate | `ireq.ts` | A bounded heuristic that ignores the outfit (#86). |
| Breathability thresholds | `scorer.ts`, sport modules | 0.15–0.30 evaporative potential by output (#67). |
| `ALPINE_CLO_TARGETS` | `constants.ts` | Unused outside a test. |

## Already covered elsewhere

- **#243** (running and XC; #244–#250 closed, #251 open). Garment semantics, MET calibration, optional accessories, complete running and XC outfits, wardrobe requirements and the shared comfort check. Its release matrix is still open; add finding 8 to it.
- **#251.** Warm and cold preference, including its cross-sport check.
- **#86.** Exposure estimate, footwear and timed profiles. Add finding 7 and T18-01's foot values (sock 0.39 clo, extreme-cold bootie 1.42 clo) as a starting point for footwear.
- **#8.** Field feedback, the only thing that can validate any band above.
- **#67.** The 0.1 clo hard shells it reported were a catalog-scale error, corrected by migration 036 (hard shells are 0.53 whole-body clo). Whether 036 is applied in production is unconfirmed: the migration listing timed out on 2026-11-10. Its wider request is still open. Evaporative resistance enters only the separate moisture heuristic and the breathability score, and the heat balance has no skin-evaporation term (finding 7), so a garment's vapor permeability does not yet affect the thermal result. #250's rule that evaporative resistance never changes clo rules out one fix, raising clo for unbreathable shells; it does not close the gap. Keep #67 open and re-scope it to evaporative heat loss.
- **#290.** Vent advice.
- **`catalog-thermal-calibration.md` open items.** The Capilene Midweight lab row, and the touring climb's hard-shell rule (#372).

## Follow-up issues

Filed on 2026-11-11 and nested under #116. Ordered by expected improvement, then effort. Each keeps calculations on the server, updates the README diagrams, and reviews golden changes by meaning.

**#370. Accessories: choose head, neck and hand warmth against local bands for alpine, cycling and touring** (high effect, medium effort)
- *Reproduce:* alpine 25°F / 12 mph / moderate, catalog: head 3.75 clo against 2.29, comfort 29.8. Cycling 32°F: 1.5 clo balaclava against a 0.55 target.
- *Scope:* use the running/XC combination selector with each sport's own bands. The helmet and a worn hood count in the head budget. No 0°C switch. Descent and chairlift targets capped at what rated gear can supply (finding 3). Do not copy running's bare-hand choice: alpine and descents keep gloves.
- *Accept:* in the matrix, head and hands are in range wherever the inventory allows; colder or windier conditions never pick lighter accessories; the helmet is always kept.

**#371. Cycling: choose a complete outfit the shared check accepts** (high effect, medium to high effort)
- *Reproduce:* 56°F / 8 mph / moderate, catalog: 0.82 clo against 0.26–0.49; 0 of 20 matrix responses near target.
- *Scope:* a complete-outfit search like running's, with standalone semantics, a wind shell only when the policy asks for one, puffies allowed in deep cold, and clothing requirements with gaps.
- *Accept:* near target wherever a suitable outfit exists; warmer weather or harder effort never adds insulation; wind and rain protection is kept; sparse wardrobes report gaps.
- *Depends on:* #374 for the policy inputs. Can ship first against today's targets.

**#372. Ski touring: a climb outfit that matches its target, and a descent plan that covers the legs** (high effect, high effort)
- *Reproduce:* 25°F / 12 mph / moderate, catalog: climb 1.44 clo against 0.86–1.17; descent legs 1.0 against a 2.87 minimum.
- *Scope:* shell on the climb only for wind or wet; regional fit on the climb; decide whether the descent adds a leg layer or the descent leg target changes; keep transition, descent and pack lists separate.
- *Accept:* climbs near target in mild and cool conditions; descents no longer short on legs by construction; pack weight reported as now.

**#373. Report missing required protection, and give cycling a helmet** (small effort)
- *Reproduce:* wardrobe without a helmet: alpine and touring return `helmet: null` and no warning.
- *Scope:* a requirement and warning when required protection is not owned; a cycling helmet type and requirement. Protection is never dropped because thermal demand is low.
- *Accept:* route tests for owned, missing and catalog cases in alpine, touring descent and cycling.

**#374. Policy inputs for cycling, alpine and touring: metabolic rate, air speed, margins** (medium to high effect, needs a decision)
- *Evidence:* the assumptions table.
- *Scope:* one MET convention; Compendium-based rates with documented mapping from Easy, Moderate and Hard; a rider air-speed assumption; whether cold margins taper as they do for running and XC. Alpine's change must be weighed against the #318 decision.
- *Accept:* reference calculations like #245's table; monotonic in temperature and effort; chairlift, climb and descent phases stay separate.

**#375. Regional model: body-area weights and the leg bias** (medium effect, touches every golden response)
- *Evidence:* finding 5.
- *Scope:* decide the whole-body weights (0.5 / 0.25 / 0.25 or manikin areas) and whether running, cycling, XC and touring keep a leg bias; say in the UI copy and API docs what "whole-body clo" means.
- *Accept:* regional targets still average back to the whole-body band; a reviewed golden diff.

**#376. Catalog: anchor handwear and headwear clo to part-manikin data** (medium effect, data work; fits under #264)
- *Evidence:* finding 6.
- *Scope:* re-derive `rcl_clo` for gloves, mittens, hats and balaclavas from T18-01 analogues and re-derive the local bands on that scale, as migrations 035 and 036 did for garments.
- *Accept:* a PGlite replay test like the garment audits; accessory choices in the matrix reviewed.

## Doc corrections in this change

- **README.** The pipeline section now says what the IREQ solver is and where it was checked. The #243 pointer no longer says selector and presentation work is still to come. The generic builder's guards, the cycling and touring variants, the touring shell rules and the legacy accessory branch match the code. The thermal-targets section states the whole-body weights and links here.
- **`docs/running-xc-foundations.md`.** The opening no longer lists #248–#250 as pending.
- **Code comments.** `constants.ts` (weights, MET convention), `ensemble.ts` (linear, not parallel, mean) and `ireq.ts` (simplified solver). No behavior changes.

`catalog-thermal-calibration.md` is a dated record and is left as written; its statement that alpine's 45°F and 25°F catalog cases score at least 85 no longer holds after #250 (finding 2).
