# Gear catalog thermal calibration, part 2 (proposal, 2026-10-18)

**Status: proposal, waiting for decisions.** Nothing has been written to production. This picks up where [catalog-thermal-audit.md](catalog-thermal-audit.md) ("Decision and what's still open") stops after migration 035: shells and insulated outerwear are still on the low scale, and the model has no wind/motion correction. Everything below was measured on main at `af861c4` (035 merged and applied in production; 116 live garments).

## Summary

1. **Model.** Add ISO 11079 Annex A's conversion from IREQ (the *resultant* insulation needed in wind and motion) to the *basic* insulation that garments are rated in, using ISO 9920's wind, walking-speed and outer-fabric air-permeability correction. Put it on the **requirement** side (`ireq.ts` / `thermal-targets.ts`). At 25°F with 12 mph wind, an alpine skier in a waterproof shell needs about 1.3–1.6× IREQ in basic clo, and a runner without a shell about 2.4×.
2. **Catalog.** Re-derive 45 live rows (36 in the golden fixture) onto USARIEM T21-03's single-garment scale. Hard shells and soft shells take their CoWEDA Table 2 analogue. Insulated jackets and pants add 035's fill-curve increment to the shell analogue, using published fill weights. The puffy-versus-insulated-jacket inversion goes away. Patagonia Snowdrifter Jacket and Bibs are uninsulated shells, so they move from `outer_insulated` to `hard_shell`.
3. **Neither part improves golden results on its own, and both together make them worse** (alpine 52.3 → 42.6). The runs show why. Three target and builder heuristics were tuned to the low scale, and they bind before the physics does:
   - Alpine sizes its targets for a steady-state chairlift ride (5–6 clo at 5°F to −15°F before any correction).
   - Alpine asks legs for 1.2× the whole-body target.
   - Running, biking and touring budget protective shells against the clo cap, and #306's requirement filter checks single garments against narrow regional bands.
4. **The alpine target fixes are independent of the scale question.** Computing alpine IREQ at the time-weighted ski/lift metabolic rate (ISO 8996), with legs at 1.0, lifts alpine from 52.3 to 74.9 on today's catalog. Only 12 scenarios change, and no other sport changes.
5. **Recommendation: two PRs.**
   - PR A, now: the alpine target fixes.
   - PR B: model, catalog (migration 036) and the builder fixes together. It is the physically consistent end state, but running and XC score lower until their builders stop dropping protective layers. See "Decisions".
6. **T21-03 itself is still unreachable.** DTIC showed its maintenance page on 2026-10-18 and refuses direct fetches; SSRN is behind a bot check. The four checkable `calibration_reference` rows are compared against CoWEDA Table 2 instead.

## 1. Model: ISO 11079 Annex A dynamic correction

### What's missing

`calculateRequiredInsulation` solves heat balance with a wind-dependent air layer, so `calculateIreq` returns roughly ISO 11079's IREQ: the **resultant** clothing insulation required. Every consumer then compares it with **basic** (static manikin) values: the catalog's regional clo, summed through the T21-03 regression. ISO 11079 doesn't compare those two directly. Annex A converts between them with ISO 9920's correction for wind, body motion and air permeability (the same equations as [pythermalcomfort's ISO 11079 port](https://github.com/CenterForTheBuiltEnvironment/pythermalcomfort/blob/development/pythermalcomfort/models/ireq.py)):

- resultant boundary air: `Ia,r = 0.092·exp(−0.15·v − 0.22·w) − 0.0045` m²K/W
- resultant / static total insulation: `CORR = 0.54·exp(−0.15·v − 0.22·w)·p^0.075 − 0.06·ln p + 0.5`
- basic insulation required: `ICL = (IREQ + Ia,r/fcl) / CORR − 0.085/fcl`, with `fcl = 1 + 1.197·IREQ`

Here v is relative air speed (0.4–18 m/s), w is walking speed (≤ 1.2 m/s; ISO's default is `0.0052·(M − 58)`), and p is the air permeability of the **outer fabric** in l/(m²·s) ([PMC12385740](https://pmc.ncbi.nlm.nih.gov/articles/PMC12385740/) defines it as the outer fabric's). In still air while standing (v = 0.4, w = 0, p = 1), CORR is 1.01 and the conversion is close to identity.

### Where it goes: the requirement, not the ensemble

The two placements are algebraically equivalent for one outfit in one exposure (`Icl,r ≥ IREQ` ⟺ `Icl ≥ ICL`). The choice is about the code and the data:

- **ISO 11079 does it on this side.** Its clothing-selection output is ICL, the basic insulation to look for in tables and manikin data. The Annex's reverse direction, basic to resultant, is only used for DLE.
- **Everything compares single garments or static sums with targets.** That covers the alpine/XC regional search, the running/biking/touring budgets, #306's requirement matching (`isSuitableForRegion`), the comfort score and the API's `target_clo_range` against `total_clo`. Converting the targets keeps all of them coherent without threading wind and motion through each builder. An ensemble-side correction would touch every one of them.
- **Alpine and touring blend phases in requirement units.** Alpine's minimum is 60 % skiing + 40 % chairlift, which only makes sense if both are in the units the outfit is measured in. Each phase is converted with its own exposure, then blended.
- **The catalog has no measured air permeability.** 0 of 116 garments have `air_permeability_cfm`, and none of the 28 `garment_materials` rows has a permeability. Permeability can only come from protection ratings, in four classes. So the ensemble side's one advantage, per-outfit permeability, is coarse anyway. The proposal keeps it where it is cheap: the scorer uses the outfit's least-permeable layer.

Displayed targets move to basic clo, so a user can compare a garment's clo with the target, which they can't do today.

### Inputs per phase

| Phase | v (relative air speed) | w | Outer fabric p, l/(m²·s) |
|---|---|---|---|
| Alpine skiing (60 %) | wind + 5 m/s | ISO default ≈ 0.45 | 1 (waterproof membrane: every alpine outer) |
| Chairlift (40 %) | wind | 0 (seated) | 1 |
| Touring climb / descent / transition | 0.3 × wind / wind + 5 / 1.5 × wind | ISO default ≈ 0.9 / 0.45 / 0.2 | 1 |
| Running | wind | 1.2 (cap) | 1 when wet, 5 when ≤ 0°C or wind > 8 m/s (the protection policy adds a shell), else 1000 |
| Biking | wind | 1.2 | 5 (always a wind shell) |
| XC | wind | 1.2 | 50 when a wind layer is needed (soft shells), else 1000 |
| Scorer (`scoreEnsemble`) | its effective wind | from M | least-permeable layer of the outfit |

Air-permeability classes from protection ratings: waterproof membrane 1; windproof 5 (≈ 1 CFM); wind-resistant 50 (≈ 10 CFM); none or unknown 1000 (knits and fleece run 100–300 CFM).

### How big it is

Basic clo needed per resultant clo at 25°F with 12 mph wind:

| Phase | CORR | 1.0 → | 2.0 → | 3.0 → |
|---|---|---|---|---|
| Alpine skiing, membrane | 0.60 | 1.31 | 3.02 | 4.71 |
| Chairlift, membrane | 0.74 | 1.15 | 2.53 | 3.90 |
| Running, no shell | 0.40 | 2.43 | 4.96 | 7.49 |
| Running or biking, windproof shell | 0.61 | 1.41 | 3.07 | 4.73 |
| XC, soft shell | 0.51 | 1.77 | 3.74 | 5.70 |
| Touring climb, membrane | 0.85 | 1.07 | 2.26 | 3.45 |

Regional targets are converted with the whole-body clothing area factor, so they still average back to the whole-body target. Hands and head keep the uncorrected IREQ: their heuristic multipliers already carry a wind factor.

### Caveats

- **Regions get the same correction.** ISO 9920 is whole-body only. [Lu et al. 2015, Part II](https://research.polyu.edu.hk/en/publications/clothing-resultant-thermal-insulation-determined-on-a-movable-the-2/) found that wind hits the chest, abdomen and pelvis hardest, while walking hits the forearm, thigh and lower leg hardest. Those effects roughly offset, so a uniform factor is a first approximation.
- **Running, biking and XC still use ambient wind as v**, in IREQ and in the correction. A cyclist at 7 m/s through calm air is underestimated on both sides. That changes IREQ itself, so it is listed as a follow-up.
- **The equations were fitted to walking at up to 1.2 m/s.** Running and biking are clamped there.
- **`targets.ts` adds its own wind margin (`windStress`).** With the correction in place, that margin partly double-counts and should be revisited.
- **Very small requirements can convert to 0.** In mild air, a few hundredths of a clo can convert to 0, because the static air layer that clothing carries is worth more than the requirement. The running/XC contract (#249) deliberately keeps a positive heat-balance minimum, so the implementation should never convert below the resultant value. That is the only invariant failure in the full package.

## 2. Catalog: outerwear on the T21-03 single-garment scale

### Analogues and rules

CoWEDA Table 2 ([PMC8346413](https://pmc.ncbi.nlm.nih.gov/articles/PMC8346413/)) reproduces T21-03's item-level regional values (m²K/W ÷ 0.155):

| T21-03 item | Torso / arms / legs clo | Ret torso / arms / legs |
|---|---|---|
| Wind jacket | 0.70 / 0.55 / – | 13.6 / 16.3 / – |
| Cold wet weather jacket (3L hard shell) | 0.88 / 0.69 / – | 34.3 / 31.8 / – |
| Soft shell jacket | 0.95 / 0.65 / – | 46.1 / 55.9 / – |
| Fleece jacket | 1.05 / 1.32 / – | 14.2 / 21.7 / – |
| Cold wet weather trousers | – / – / 0.70 | – / – / 39.4 |
| Soft shell trousers | – / – / 0.75 | – / – / 70.6 |
| Extreme cold weather parka | 3.69 / 2.94 / – | 65.9 / 65.4 / – |
| Extreme cold weather trousers | – / – / 2.50 | – / – / 69.1 |

| Type | Rule | Ret |
|---|---|---|
| Hard-shell jacket | ≤ 350 g → wind jacket; otherwise → cold wet weather jacket | kept: catalog shell Ret (8–40) already sits on T21-03's band |
| Hard-shell pants and bibs | cold wet weather trousers (legs 0.70); a bib's torso keeps its seeded torso/legs ratio | kept |
| Soft-shell jacket | raise to the analogue only where below it: thin woven → wind jacket, standard → soft shell jacket, fleece-backed → 1.05 / 0.85 floor | kept |
| Insulated jacket | torso = 0.88 + inc(body fill), arms = 0.69 + 0.87 × inc(sleeve fill), with 035's increment inc(f) = 0.0522 × f^0.842 (g/m²) | scaled with clo, keeping each garment's permeability index (as 035) |
| 3-in-1 (Bugaboo IV Interchange) | T21-03 regression of shell + fleece: 0.836 × (0.88 + 1.05), 0.809 × (0.69 + 1.32) | scaled with clo |
| Insulated pants and bibs | legs = 0.70 + 0.64 × inc(fill); 0.64 is the matched ECW trousers/parka pair's leg-to-torso increment ratio | scaled with clo |

Values are rounded to 0.05 clo, and whole-body values follow the 0.5 / 0.25 / 0.25 weights. With these rules, an insulated jacket sits 0.18 clo above a puffy of equal fill: Obermeyer Raze (60 g/m²) at 2.50 torso versus Micro Puff (65 g/m²) at 2.45, and Firefall/2 at 3.40. That resolves 035's inversion.

**Cross-check, high fill.** A civilian version of the ECW parka is listed with [200 g/m² PrimaLoft](https://laced.com.au/products/wild-things-monster-parka-black), where 035's curve predicts 5.2 clo against T21-03's measured 3.69. The military parka uses PrimaLoft Sport, a lower grade, but the curve probably still reads high above ~120 g/m². Every consumer jacket here is 40–100 g/m², close to the Nano-Air anchor at 60 g/m².

### Per-garment values (45 live rows)

Fill sources: [evo Firefall/2](https://www.evo.com/products/175709-mountain-hardwear-firefall-2-insulated-jacket), [REI Stretch Ozonic](https://www.rei.com/product/C07588/mountain-hardwear-stretch-ozonic-insulated-jacket-mens), [Spyder EU Leader](https://spyder.eu/products/leader-jacket-concrete), [REI Alpha 4.0](https://www.rei.com/product/229857), [evo Alpha LifaLoft](https://evo.com/insulated-jackets/helly-hansen-alpha-lifaloft-jacket), [evo Snowcrew](https://www.evo.com/products/207231-outdoor-research-snowcrew-jacket-men-s), [Obermeyer Raze](https://obermeyer.com/products/raze-jacket), [Altitude Sports Lofoten insulated](https://www.altitude-sports.com/p/norrona-lofoten-goretex-insulated-jacket-mens-nor-1001-18), [Switchback Jackson Glacier](https://www.switchbacktravel.com/reviews/patagonia-jackson-glacier-parka), [REI Bugaboo IV liner](https://www.rei.com/product/C08548/columbia-bugaboo-iv-interchange-3-in-1-jacket-mens), [evo Powder Bowl](https://www.evo.com/products/136074-patagonia-insulated-powder-bowl-pants), [Altitude Sports Bugaboo II](https://www.altitude-sports.com/products/columbia-bugaboo-ii-pant-womens-llll-col-2085941), [Cotswold Legendary](https://www.cotswoldoutdoor.com/p/helly-hansen-mens-legendary-insulated-pant-H1214262.html), [Miya Lofoten insulated pants](https://store.miyaradventures.com/products/norrona-lofoten-gore-tex-insulated-pants-mens), [Bob's Rossignol](https://www.bobssportschalet.com/rossignol/rossignol-insulated-ski-pants-169947), and Snowdrifter construction from [Switchback](https://switchbacktravel.com/reviews/patagonia-snowdrifter) and [evo](https://evo.com/shell-pants/patagonia-snowdrifter-bibs-womens-20). Rows marked "low" get `uncertainty_clo` 0.6 and confidence capped at 0.5 (035's convention); "medium" rows get 0.3.

| Garment | Type | Torso / arms / legs clo | Whole-body clo | Ret torso / arms / legs | Basis | Confidence | In fixture |
|---|---|---|---|---|---|---|---|
| Arc'teryx Alpha FL Jacket | Hard-shell jacket | 0.15 / 0.12 / 0 → **0.7 / 0.55 / 0** | 0.1 → **0.49** | 22 / 20 / 0 (kept) | T21-03 wind jacket | analogue | yes |
| Arc'teryx Beta AR Jacket | Hard-shell jacket | 0.25 / 0.2 / 0 → **0.88 / 0.69 / 0** | 0.17 → **0.61** | 30 / 28 / 0 (kept) | T21-03 cold wet weather jacket | analogue | yes |
| Arc'teryx Rush Jacket | Hard-shell jacket | 0.22 / 0.18 / 0 → **0.88 / 0.69 / 0** | 0.15 → **0.61** | 28 / 26 / 0 (kept) | T21-03 cold wet weather jacket | analogue | no |
| Helly Hansen Sogn Shell 2.0 Jacket | Hard-shell jacket | 0.22 / 0.18 / 0 → **0.88 / 0.69 / 0** | 0.15 → **0.61** | 28 / 26 / 0 (kept) | T21-03 cold wet weather jacket | analogue | yes |
| Helly Hansen Swift 3L Shell Jacket | Hard-shell jacket | 0.25 / 0.2 / 0 → **0.88 / 0.69 / 0** | 0.17 → **0.61** | 30 / 28 / 0 (kept) | T21-03 cold wet weather jacket | analogue | yes |
| Norrøna Lofoten Gore-Tex Pro Jacket | Hard-shell jacket | 0.18 / 0.15 / 0 → **0.88 / 0.69 / 0** | 0.12 → **0.61** | 26 / 24 / 0 (kept) | T21-03 cold wet weather jacket | analogue | yes |
| Norrøna Trollveggen Gore-Tex Pro Jacket | Hard-shell jacket | 0.28 / 0.22 / 0 → **0.88 / 0.69 / 0** | 0.19 → **0.61** | 32 / 30 / 0 (kept) | T21-03 cold wet weather jacket | analogue | yes |
| Norrøna Trollveggen Gore-Tex Pro Light Jacket | Hard-shell jacket | 0.2 / 0.15 / 0 → **0.88 / 0.69 / 0** | 0.13 → **0.61** | 28 / 26 / 0 (kept) | T21-03 cold wet weather jacket | analogue | yes |
| Outdoor Research Carbide Jacket | Hard-shell jacket | 0.2 / 0.16 / 0 → **0.88 / 0.69 / 0** | 0.13 → **0.61** | 25 / 22 / 0 (kept) | T21-03 cold wet weather jacket | analogue | yes |
| Outdoor Research Helium Rain Jacket | Hard-shell jacket | 0.12 / 0.1 / 0 → **0.7 / 0.55 / 0** | 0.09 → **0.49** | 40 / 35 / 0 (kept) | T21-03 wind jacket | analogue | yes |
| Patagonia Houdini Jacket | Hard-shell jacket | 0.15 / 0.12 / 0 → **0.7 / 0.55 / 0** | 0.11 → **0.49** | 8 / 6 / 0 (kept) | T21-03 wind jacket | analogue | yes |
| Patagonia Snowdrifter Jacket | Hard-shell jacket | 1.35 / 1.15 / 0 → **0.88 / 0.69 / 0** | 0.96 → **0.61** | 30 / 28 / 0 (kept) | T21-03 cold wet weather jacket; uninsulated 3L H2No shell with knit backer (reviews), seeded as insulated, so moved to hard_shell | analogue | yes |
| Arc'teryx Sabre Pant | Hard-shell pants/bib | 0 / 0 / 0.25 → **0 / 0 / 0.7** | 0.06 → **0.18** | 0 / 0 / 26 (kept) | T21-03 cold wet weather trousers | analogue | no |
| Helly Hansen Sogn Bib Shell Pants | Hard-shell pants/bib | 0.15 / 0 / 0.22 → **0.5 / 0 / 0.7** | 0.14 → **0.43** | 26 / 0 / 28 (kept) | T21-03 cold wet weather trousers | analogue | yes |
| Outdoor Research Carbide Bibs | Hard-shell pants/bib | 0 / 0 / 0.22 → **0 / 0 / 0.7** | 0.06 → **0.18** | 0 / 0 / 25 (kept) | T21-03 cold wet weather trousers | analogue | yes |
| Patagonia PowSlayer Pants | Hard-shell pants/bib | 0 / 0 / 0.22 → **0 / 0 / 0.7** | 0.06 → **0.18** | 0 / 0 / 28 (kept) | T21-03 cold wet weather trousers | analogue | yes |
| Patagonia Snowdrifter Bibs | Hard-shell pants/bib | 0.6 / 0 / 1.2 → **0.35 / 0 / 0.7** | 0.6 → **0.35** | 28 / 0 / 32 (kept) | T21-03 cold wet weather trousers; uninsulated 3L H2No bib (evo, reviews), seeded as insulated, so moved to hard_shell | analogue | yes |
| Spyder Sentinel Gore-Tex Pant | Hard-shell pants/bib | 0 / 0 / 0.2 → **0 / 0 / 0.7** | 0.05 → **0.18** | 0 / 0 / 28 (kept) | T21-03 cold wet weather trousers | analogue | yes |
| Lululemon Pace Breaker Jacket | Soft-shell jacket | 0.2 / 0.18 / 0 → **0.7 / 0.55 / 0** | 0.15 → **0.49** | 12 / 10 / 0 (kept) | T21-03 wind jacket | analogue | yes |
| Outdoor Research Ferrosi Hoodie | Soft-shell jacket | 0.55 / 0.48 / 0 → **0.7 / 0.55 / 0** | 0.4 → **0.49** | 12 / 10 / 0 (kept) | T21-03 wind jacket | analogue | yes |
| Patagonia R1 TechFace Jacket | Soft-shell jacket | 0.65 / 0.55 / 0 → **1.05 / 0.85 / 0** | 0.46 → **0.74** | 18 / 16 / 0 (kept) | fleece-backed floor 1.05 / 0.85 | analogue | yes |
| Patagonia Upstride Jacket | Soft-shell jacket | 0.65 / 0.55 / 0 → **1.05 / 0.85 / 0** | 0.45 → **0.74** | 14 / 12 / 0 (kept) | fleece-backed floor 1.05 / 0.85 | analogue | yes |
| Columbia Bugaboo IV Interchange Jacket | Insulated jacket | 1.5 / 1.25 / 0 → **1.6 / 1.65 / 0** | 1.06 → **1.21** | 35 / 32 / 0 → 37.3 / 42.2 / 0 | 3-in-1: shell + 250 g/m² microfleece liner (REI) ≈ T21-03 regression of cold wet weather + fleece jackets | medium | yes |
| Columbia Joy Peak Lite Hooded Jacket | Insulated jacket | 1.15 / 1 / 0 → **2.5 / 1.7 / 0** | 0.83 → **1.68** | 26 / 23 / 0 → 56.5 / 39.1 / 0 | Thermarator, weight unpublished; "Lite" assumed 60/40 | low | yes |
| Columbia Powder Lite Hooded Jacket | Insulated jacket | 1.25 / 1.05 / 0 → **2.5 / 1.7 / 0** | 0.89 → **1.68** | 28 / 25 / 0 → 56 / 40.5 / 0 | Thermarator + Omni-Heat, weight unpublished; assumed 60/40 | low | yes |
| FP Movement Care FP On The Ascend Insulated Jacket | Insulated jacket | 1.5 / 1.25 / 0 → **3.4 / 2.5 / 0** | 1.06 → **2.33** | 35 / 32 / 0 → 79.3 / 64 / 0 | PrimaLoft, weight unstated; seeded near Firefall/2, assumed 100/80 | low | no |
| FP Movement Downhill Diva Suit | Insulated jacket | 1.25 / 1.05 / 0.75 → **2.5 / 1.7 / 0.75** | 1.08 → **1.86** | 30 / 27 / 18 → 60 / 43.7 / 18 | puffer top, weight unstated; assumed 60/40; stretch legs keep 0.75 (T21-03 soft-shell trousers) | low | no |
| FP Movement Lift Love Jacket | Insulated jacket | 1.15 / 0.95 / 0 → **2.5 / 1.7 / 0** | 0.81 → **1.68** | 30 / 27 / 0 → 65.2 / 48.3 / 0 | PrimaLoft, weight unstated; "lightly insulated" assumed 60/40 | low | no |
| Helly Hansen Alpha 4.0 Insulated Jacket | Insulated jacket | 1.5 / 1.25 / 0 → **2.95 / 2.1 / 0** | 1.06 → **2** | 36 / 32 / 0 → 70.8 / 53.8 / 0 | 80 g PrimaLoft Black, body-mapped (REI; one retailer lists 100); sleeves assumed 60 | medium | yes |
| Helly Hansen Alpha Infinity Insulated Jacket | Insulated jacket | 1.45 / 1.2 / 0 → **2.95 / 2.1 / 0** | 1.03 → **2** | 34 / 30 / 0 → 69.2 / 52.5 / 0 | PrimaLoft Black Eco mapped, weight unpublished; assumed as Alpha 4.0 | low | yes |
| Helly Hansen Alpha LifaLoft Jacket | Insulated jacket | 1.8 / 1.4 / 0 → **2.95 / 2.1 / 0** | 1.25 → **2** | 40 / 35 / 0 → 65.6 / 52.5 / 0 | 80 g LifaLoft (evo; another source 100); sleeves assumed 60 | low | no |
| Mountain Hardwear Firefall/2 Insulated Jacket | Insulated jacket | 1.5 / 1.3 / 0 → **3.4 / 2.5 / 0** | 1.08 → **2.33** | 35 / 32 / 0 → 79.3 / 61.5 / 0 | 100 g/m² body, 80 g/m² sleeves (evo) | medium | yes |
| Mountain Hardwear Stretch Ozonic Insulated Jacket | Insulated jacket | 1.2 / 1.05 / 0 → **3.4 / 2.5 / 0** | 0.86 → **2.33** | 30 / 28 / 0 → 85 / 66.7 / 0 | 100 g mapped ThermoCloud (REI); sleeves assumed 80 | medium | yes |
| Norrøna Lofoten Gore-Tex Insulated Jacket | Insulated jacket | 1.8 / 1.3 / 0 → **2.3 / 2.1 / 0** | 1.23 → **1.68** | 42 / 38 / 0 → 53.7 / 61.4 / 0 | PrimaLoft Silver mapped: 60 g/m² front, shoulders, elbows; 40 g/m² collar and back | medium | yes |
| Obermeyer Raze Jacket | Insulated jacket | 1.4 / 1 / 0 → **2.5 / 1.7 / 0** | 0.95 → **1.68** | 36 / 30 / 0 → 64.3 / 51 / 0 | 60 g/m² body, 40 g/m² sleeves and hood (Obermeyer, REI) | medium | no |
| Outdoor Research Snowcrew Jacket | Insulated jacket | 1.6 / 1.2 / 0 → **2.95 / 2.1 / 0** | 1.1 → **2** | 38 / 32 / 0 → 70.1 / 56 / 0 | 80 g/m² body, 60 g/m² sleeves and hood VerticalX (evo) | medium | yes |
| Patagonia Jackson Glacier Parka | Insulated jacket | 2.2 / 1.8 / 0 → **3.4 / 2.5 / 0** | 1.55 → **2.33** | 45 / 40 / 0 → 69.6 / 55.6 / 0 | 5.9–6.6 oz 700FP down (Switchback, Better Trail); ≈ 100/80 g/m² synthetic-equivalent via Ghost Whisperer/2 in 035 | low | yes |
| Spyder Challenger Insulated Jacket | Insulated jacket | 1.2 / 1.05 / 0 → **2.95 / 2.1 / 0** | 0.86 → **2** | 28 / 25 / 0 → 68.8 / 50 / 0 | adult fill unpublished (kids 133 g); assumed 80/60 | low | yes |
| Spyder Leader Insulated Jacket | Insulated jacket | 1.55 / 1.3 / 0 → **3.4 / 2.5 / 0** | 1.1 → **2.33** | 35 / 32 / 0 → 76.8 / 61.5 / 0 | 100 g PrimaLoft Silver Eco (Spyder EU); sleeves assumed 80 | medium | yes |
| Columbia Bugaboo II Pants | Insulated pants/bib | 0 / 0 / 1.15 → **0 / 0 / 1.75** | 0.29 → **0.44** | 0 / 0 / 38 → 0 / 0 / 57.8 | 60 g Microtemp XF II (Altitude Sports) | medium | yes |
| FP Movement Lift Love Bib | Insulated pants/bib | 0.3 / 0 / 0.95 → **0.45 / 0 / 1.45** | 0.39 → **0.59** | 18 / 0 / 32 → 27.5 / 0 / 48.8 | weight unstated; "lightly insulated" assumed 40 | low | no |
| Helly Hansen Legendary Insulated Ski Pants | Insulated pants/bib | 0 / 0 / 1 → **0 / 0 / 1.75** | 0.25 → **0.44** | 0 / 0 / 32 → 0 / 0 / 56 | 60 g PrimaLoft Black (Cotswold, Barrabes) | medium | yes |
| Norrøna Lofoten Gore-Tex Insulated Pants | Insulated pants/bib | 0 / 0 / 1.4 → **0 / 0 / 1.45** | 0.35 → **0.36** | 0 / 0 / 35 → 0 / 0 / 36.3 | 40 g/m² PrimaLoft Silver (Miya, Ski Essentials) | medium | yes |
| Patagonia Insulated Powder Bowl Pants - Regular | Insulated pants/bib | 0 / 0 / 1.1 → **0 / 0 / 1.75** | 0.28 → **0.44** | 0 / 0 / 40 → 0 / 0 / 63.6 | 60 g Thermogreen (evo, Worn Wear) | medium | yes |
| Rossignol Insulated Ski Pants | Insulated pants/bib | 0 / 0 / 0.9 → **0 / 0 / 1.45** | 0.23 → **0.36** | 0 / 0 / 30 → 0 / 0 / 48.3 | Rossignol Insulated Ski Pant family 40 g PrimaLoft; SKU match unconfirmed | low | no |

## 3. What else the golden runs show

**Alpine targets are sized for a steady-state chairlift ride.** The minimum blends skiing and chairlift IREQ 60/40, but the neutral is the chairlift's steady-state IREQ. So the whole-body targets are 5.0–5.1 clo at 5°F and 6.2–6.3 at −15°F before the correction, and 8.2–9.3 with it. After re-derivation, the warmest catalog outfit reaches 4.4. The lift ride lasts minutes between runs; ISO 11079 handles bounded exposures with DLE, and ISO 8996 averages metabolic rate over a representative cycle ([ISO 8996 summary](https://www.researchgate.net/profile/Lesley-Anne-Hudie/publication/306013139_Ergonomics_of_the_thermal_environment_Determination_of_metabolic_rate/links/57aa26fc08ae3765c3b4a2b6/Ergonomics-of-the-thermal-environment-Determination-of-metabolic-rate.pdf)). **Option T** computes alpine IREQ at the time-weighted rate (0.6 × skiing + 0.4 × chairlift) and time-weighted relative air speed (wind + 3 m/s). DLE still comes from the lift.

**Alpine legs need 1.2× the whole-body target.** `REGIONAL_IREQ_MULTIPLIERS.alpine_skiing.legs` (1.20, "chairlift + wind = cold legs") has no cited source. Military cold-weather systems do the opposite: ECWCS's matched top and bottom pairs in Table 2 give legs 0.6–0.86× the torso (L7 trousers 2.50 against the parka's 3.69; L6 0.70 against 0.88). **Option L** sets alpine legs to 1.0, matching torso and arms, until regional data justify a bias.

**Builders budget protective shells against the clo cap.** `buildBreathableEnsemble` (running, biking) and the touring climb only add a shell if it fits under `maxClo`. At T21-03 values a shell is 0.5–0.6 whole-body clo. With the catalog change alone, biking has no torso shell in 9 of 12 scenarios, including rain (4 at baseline). **Option B** keeps protective shells outside the budget; with it, none lack one.

**#306's requirement filter interacts with realistic shell values.** `filterUnsuitableEnsemble` drops a garment that is thermally suitable for its region but fails the sport's breathability minimum. On the low scale, shells were never "thermally suitable", so they survived. At T21-03 values they are. In the full package the filter drops running's leg shell (a bib) at 25°F and −15°F, leaving legs at 0.29 against a 0.72 minimum at 25°F. It also drops XC's base bottoms at 45°F, where they fall just under the band, so XC is shown with bare legs. Running also ends with no torso shell: `retainRunningProtection` counts the bib as torso wind protection because it covers the torso, and the filter then removes it. This needs a fix in `requirements.ts` that keeps layers the protection policy requires. It is not prototyped here.

**The touring climb always tries a hard shell** ("prefer hard shells for protection on the climb"). At lab values that overdresses mild climbs: 45°F, 1.73 clo against a 0.58–0.82 target. The shell belongs in the pack unless it's wet or windy.

## Golden-test impact

Same harness as the audit (60 scenarios: 5 sports × 6 conditions × catalog/wardrobe), on main `af861c4`. Each variant ran the prototype with switches; the scripts and per-scenario diffs are in the hand-over folder.

| Variant | Mean comfort score: alpine / biking / running / ski touring / XC | Scenarios changed (of 60) | Golden tests failing (of 83) | Of which invariant failures |
|---|---|---|---|---|
| Baseline (035) | 52.3 / 64.4 / 76.9 / 65.2 / 97.3 | – | 0 | 0 |
| M: model only | 37.2 / 65.5 / 71.6 / 63.8 / 82.7 | 59 | 75 | 5: XC wind layer, running/XC contract ×2, alpine 45°F regional warning and comfort |
| K: catalog only | 56.4 / 57.6 / 69.5 / 64.1 / 91.5 | 54 | 61 | 1: alpine 45°F comfort |
| M + K | 42.6 / 62.0 / 67.5 / 65.4 / 87.4 | 60 | 74 | 3: running/XC contract ×2, alpine 45°F comfort |
| T: alpine time-weighted only | 70.5 / 64.4 / 76.9 / 65.2 / 97.3 | 12 | – | – |
| **T + L: alpine targets only (PR A)** | **74.9** / 64.4 / 76.9 / 65.2 / 97.3 | 12 | – | – |
| M + K + T | 67.1 / 62.0 / 67.5 / 65.4 / 87.4 | 60 | – | – |
| M + K + T + L | 75.7 / 62.0 / 67.5 / 65.4 / 87.4 | 60 | – | – |
| K + B | 56.4 / 73.8 / 73.6 / 60.8 / 91.5 | 56 | – | – |
| **M + K + T + L + B (PR A + PR B)** | **75.7 / 68.8 / 69.5 / 62.6 / 87.4** | 60 | 73 | 2: running/XC contract (the near-zero conversion; fixable) |

"–" means not run through `golden.test.ts`; those variants differ only in the switches above.

- **Alpine (T + L):** in the full package, catalog outfits come out comfortable at 45°F, 25°F and 18°F (25°F goes 59.7 → 96.8). 5°F (65.6), 36°F rain (74.5) and −15°F (51.0) stay short. Wardrobe runs stay limited by the wardrobe's only insulated pants, Bugaboo II.
- **Biking:** B restores the wind shell in all 12 scenarios, and M raises the cold targets enough that riders get a mid layer, fleece pants and a wind shell at 25°F and below.
- **Running and XC:** the remaining drop is the requirement filter above, plus one near-boundary case: easy running at 45°F, 0.27 clo against 0.31.
- **Ski touring:** descent targets rise 1.3–1.5× in wind, and the weight-biased pack choice falls short at 25°F and below. The mild-climb overdress comes from the hard-shell-on-climb rule.

## Calibration reference rows

`calibration_reference` is not read by any code. Four seeded rows are ECWCS items in CoWEDA Table 2:

| Row | Seeded torso / arm clo | Table 2 | Seeded torso / arm Ret | Table 2 |
|---|---|---|---|---|
| ECWCS Lightweight Undershirt | 0.55 / 0.36 | 0.55 / 0.41 | 9.86 / 9.41 | 9.86 / 6.52 |
| ECWCS Midweight Shirt | 0.69 / 0.55 | 0.69 / 0.68 | 12.96 / 13.18 | 12.96 / 13.33 |
| ECWCS Fleece Jacket | 1.05 / 0.94 | 1.05 / 1.32 | 14.20 / 14.63 | 14.20 / 21.70 |
| ECWCS ECW Parka | 3.69 / 2.38 | 3.69 / 2.94 | 75.60 / 60.53 | 65.91 / 65.41 |

Two seeded arm values equal Table 2 × the T21-03 arm regression coefficient 0.809 (0.68 → 0.55, 2.94 → 2.38), and two don't, so they look partly derived and partly mistyped. The SOF DAS row's arm, 2.94, is exactly the ECW parka's Table 2 arm, and so is the lab-tested DAS Parka garment row's. That may be a copy error that also affects a recommended garment. Proposal: set the four ECWCS rows to Table 2 in migration 036. Flag the DAS arm value, and the SOF and CAF rows, for when DTIC is back.

## Decisions needed

1. **Model:** ISO 11079 Annex A conversion on the requirement side, with the permeability classes and per-phase inputs above (recommended), or on the ensemble side.
2. **Catalog:** the analogue rules and the 45-row table, including moving Snowdrifter Jacket and Bibs to `hard_shell` and the 350 g wind-jacket threshold.
3. **Alpine targets:**
   - T, time-weighted IREQ: recommended.
   - L, legs multiplier 1.0: recommended. Another value is possible if you'd rather keep a leg bias.
4. **Builders:**
   - B, shells outside the clo budget: recommended.
   - The `requirements.ts` fix so the filter never drops layers the protection policy requires: needed before PR B, or running and XC regress.
   - The touring climb leaving the hard shell in the pack when dry and calm.
5. **Sequencing:**
   - Recommended: PR A (T + L, no migration) now, then PR B (M + K + B + filter fix + migration 036 + skill-guide update).
   - Or one PR.
   - Or PR B after the complete running/XC selectors (#247/#248).

## Implementation after approval

- **Migration 036**, applied by hand in the SQL editor:
  - the 45 rows above, in 035's style: explicit `(brand, model_name, old values…)` guards on every replaced field, `data_source` pointing here, and `uncertainty_clo` / confidence caps;
  - the two `category` moves;
  - the four `calibration_reference` corrections.
- **Same values in `gear-catalog.json`** (36 fixture rows), reviewed golden snapshot updates, and a PGlite replay test like `catalog-thermal-audit.database.test.ts`.
- **Code:**
  - `requiredBasicInsulation` and exposures in `ireq.ts` / `thermal-targets.ts` (floored at the resultant value);
  - converted IREQ for builders and display (`ireq.min`/`neutral` stay resultant, with basic `target_range`);
  - the scorer's outfit permeability;
  - alpine T + L;
  - builder B;
  - unit tests against hand-computed Annex A values;
  - removal of the prototype switches.
- **`references/thermal-estimation.md`** in the add-wardrobe-item skill moves to the new scale in the same PR. Rows added since 035 (FP Movement, Rossignol) were seeded from low-scale analogues and are in the table.

## Sources

- ISO 11079:2007 Annex A equations as implemented in [pythermalcomfort `ireq.py`](https://github.com/CenterForTheBuiltEnvironment/pythermalcomfort/blob/development/pythermalcomfort/models/ireq.py); outer-fabric air permeability and validity ranges per [IJERPH 2025, PMC12385740](https://pmc.ncbi.nlm.nih.gov/articles/PMC12385740/).
- ISO 9920:2007 (Havenith & Nilsson 2004 meta-analysis of movement and wind corrections).
- Lu Y. et al. *Clothing resultant thermal insulation determined on a movable thermal manikin. Part II: effects of wind and body movement on local insulation.* Int J Biometeorol 59:1487–1498 (2015). [PolyU record](https://research.polyu.edu.hk/en/publications/clothing-resultant-thermal-insulation-determined-on-a-movable-the-2/).
- Xu X. et al. *CoWEDA*, Int J Biometeorol 2021, Table 2. [PMC8346413](https://pmc.ncbi.nlm.nih.gov/articles/PMC8346413/).
- Rioux T.P. et al. USARIEM T21-03 (2020). [DTIC AD1115339](https://apps.dtic.mil/sti/pdfs/AD1115339.pdf): maintenance page on 2026-10-17 and 2026-10-18, HTTP 403 to direct fetches.
- ISO 8996 time-weighted metabolic rate ([summary](https://www.researchgate.net/profile/Lesley-Anne-Hudie/publication/306013139_Ergonomics_of_the_thermal_environment_Determination_of_metabolic_rate/links/57aa26fc08ae3765c3b4a2b6/Ergonomics-of-the-thermal-environment-Determination-of-metabolic-rate.pdf)).
- Fill weights: linked above the per-garment table.
