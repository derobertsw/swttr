# Gear catalog thermal calibration, part 2 (2026-10-18)

**Status: approved 2026-10-18, being implemented** (see "Decisions"). Nothing has been written to production yet. This picks up where [catalog-thermal-audit.md](catalog-thermal-audit.md) ("Decision and what's still open") stops after migration 035: shells and insulated outerwear are still on the low scale, and the model has no wind/motion correction. Everything below was measured on main at `af861c4` (035 merged and applied in production; 116 live garments). USARIEM T21-03 itself was read from the user's copy (DTIC was still down), so every analogue and seeded reference row below is checked against the report, not only CoWEDA's excerpt.

## Implementation status after PR #317 review

PR A (#317) now retains the existing conservative alpine baseline: a 60/40 blend of the skiing and chairlift **minimums**, with **neutral IREQ and DLE from the chairlift**. It only removes the regional leg bias. The lower cycle-based baseline is deferred to PR B (#318), where it must land with the wind/motion correction. When updating the stacked PR, resolve `alpine.ts` by retaining PR B's corrected cycle calculation; do not carry the uncorrected conservative baseline into that model.

The golden comparisons below describe the original calibration experiments, including the lower cycle targets; they are not the final PR A results after review. Retaining the conservative baseline restores the catalog's 45°F comfort check. At 25°F, regional arm insulation still falls below its minimum, so that case explicitly tests the shortfall instead of claiming a comfortable score from whole-body clo alone.

## Summary

1. **Model.** Add ISO 11079 Annex A's conversion from IREQ (the *resultant* insulation needed in wind and motion) to the *basic* insulation that garments are rated in, using ISO 9920's wind, walking-speed and outer-fabric air-permeability correction. Put it on the **requirement** side (`ireq.ts` / `thermal-targets.ts`). At 25°F with 12 mph wind, an alpine skier in a waterproof shell needs about 1.3–1.6× IREQ in basic clo, and a runner without a shell about 2.4×.
2. **Catalog.** Re-derive 48 live rows (38 in the golden fixture) onto T21-03's single-garment scale. Hard shells and soft shells take T21-03 analogues. Insulated jackets and pants add 035's fill-curve increment to the shell analogue, using published fill weights; T21-03's two lab pants with known fill check the pants rule within 7 %. 035's three vests drop by T21-03's lab vest/hoody ratio. Patagonia Snowdrifter Jacket and Bibs are uninsulated shells, so they move from `outer_insulated` to `hard_shell`. The puffy-versus-insulated-jacket inversion goes away.
3. **Neither part improves golden results on its own, and together they make alpine worse** (52.3 → 44.3). Four target and builder heuristics were tuned to the low scale, and they bind before the physics does:
   - Alpine sizes its targets for a steady-state chairlift ride (5–6 clo at 5°F to −15°F before any correction).
   - Alpine asks legs for 1.2× the whole-body target.
   - Running and biking budget protective shells against the clo cap.
   - #306's requirement filter drops layers the regional search or protection policy chose, once shells carry realistic clo.
4. **The alpine target fixes do most of the alpine work.** Computing alpine IREQ at the time-weighted ski/lift metabolic rate (ISO 8996), with legs at 1.0, lifts alpine from 52.3 to 74.9 on today's catalog. Only 12 scenarios change, and no other sport changes. They still shouldn't ship without the correction (item 6).
5. **With all of it plus a filter fix,** mean comfort is 74.9 / 67.2 / 77.5 / 65.0 / 94.7 (alpine / biking / running / touring / XC), against 52.3 / 64.4 / 76.9 / 65.2 / 97.3 today. The only remaining assertion failures are the running/XC contract's near-zero minimum, which needs a one-line floor.
6. **Revised plan after review: two independently deployable stages.**
   - PR A: remove the alpine leg bias and retain the conservative phase baseline.
   - PR B, stacked on PR A: lower cycle targets together with the model correction, catalog (migration 036), shells outside the running/biking budget, and the requirement-filter fix.

   The original PR A with lower cycle targets would under-dress cold, windy days until the correction lands (see "Decisions").
7. **T21-03 checks:**
   - the regression coefficients in `constants.ts` match it;
   - 6 of the 8 seeded `calibration_reference` rows have wrong arm values (and some Ret);
   - the DAS Parka's 2.94 arm value is genuine;
   - the "lab-tested" Capilene Midweight row matches no garment in the report.

## 1. Model: ISO 11079 Annex A dynamic correction

### What's missing

`calculateRequiredInsulation` solves heat balance with a wind-dependent air layer, so `calculateIreq` returns roughly ISO 11079's IREQ: the **resultant** clothing insulation required. Every consumer then compares it with **basic** (static manikin) values: the catalog's regional clo, summed through the T21-03 regression. T21-03 measured every garment on a standing manikin at 20°C and 0.4 m/s air (ASTM F1291), which is ISO 9920's basic insulation. ISO 11079 doesn't compare those two directly. Annex A converts between them with ISO 9920's correction for wind, body motion and air permeability (the same equations as [pythermalcomfort's ISO 11079 port](https://github.com/CenterForTheBuiltEnvironment/pythermalcomfort/blob/development/pythermalcomfort/models/ireq.py)):

- resultant boundary air: `Ia,r = 0.092·exp(−0.15·v − 0.22·w) − 0.0045` m²K/W
- resultant / static total insulation: `CORR = 0.54·exp(−0.15·v − 0.22·w)·p^0.075 − 0.06·ln p + 0.5`
- basic insulation required: `ICL = (IREQ + Ia,r/fcl) / CORR − 0.085/fcl`, with `fcl = 1 + 1.197·IREQ`. `IREQ`, `Ia,r`, and `ICL` are in m²·K/W, and `fcl` and `CORR` are dimensionless. Convert input IREQ from clo to SI before applying either equation (`1 clo = 0.155 m²·K/W`), then divide the resulting `ICL` by 0.155 to display clo.

Here v is relative air speed (0.4–18 m/s), w is walking speed (explicit walking inputs are limited to 1.2 m/s; when speed is estimated from metabolism, use `min(0.7, max(0, 0.0052·(M − 58)))`, with M in W/m²), and p is the air permeability of the **outer fabric** in l/(m²·s) ([PMC12385740](https://pmc.ncbi.nlm.nih.gov/articles/PMC12385740/) defines it as the outer fabric's). In still air while standing (v = 0.4, w = 0, p = 1), CORR is 1.01 and the conversion is close to identity.

### Where it goes: the requirement, not the ensemble

The two placements are algebraically equivalent for one outfit in one exposure (`Icl,r ≥ IREQ` ⟺ `Icl ≥ ICL`). The choice is about the code and the data:

- **ISO 11079 does it on this side.** Its clothing-selection output is ICL, the basic insulation to look for in tables and manikin data. The Annex's reverse direction, basic to resultant, is only used for DLE.
- **Everything compares single garments or static sums with targets.** That covers the alpine/XC regional search, the running/biking/touring budgets, #306's requirement matching (`isSuitableForRegion`), the comfort score and the API's `target_clo_range` against `total_clo`. Converting the targets keeps all of them coherent without threading wind and motion through each builder. An ensemble-side correction would touch every one of them.
- **Convert each target with the exposure it represents.** The planned alpine cycle target uses the time-weighted metabolic rate and relative air speed; convert that cycle IREQ with the cycle exposure. Touring converts each phase with its own exposure. The current conservative alpine baseline remains in place until that correction ships.
- **The catalog has no measured air permeability.** 0 of 116 garments have `air_permeability_cfm`, and none of the 28 `garment_materials` rows has a permeability. Permeability can only come from protection ratings, in four classes. So the ensemble side's one advantage, per-outfit permeability, is coarse anyway. The proposal keeps it where it is cheap: the scorer uses the outfit's least-permeable layer.

Displayed targets move to basic clo, so a user can compare a garment's clo with the target, which they can't do today.

### Inputs per phase

| Phase | v (relative air speed) | w | Outer fabric p, l/(m²·s) |
|---|---|---|---|
| Alpine skiing (60 %) | wind + 5 m/s | ISO default ≈ 0.45 | 1 (waterproof membrane: every alpine outer) |
| Chairlift (40 %) | wind | 0 (seated) | 1 |
| Touring climb / descent / transition | 0.3 × wind / wind + 5 / 1.5 × wind | ISO estimate capped at 0.7 / ≈ 0.45 / ≈ 0.2 | 1 |
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
| Touring climb, membrane | 0.86 | 1.06 | 2.23 | 3.40 |

The touring-climb row uses `v = 0.3 × 12 mph = 1.609344 m/s`, `w = 0.7 m/s`, and `p = 1`; the uncapped ≈ 0.9 m/s metabolic estimate must not enter the correction. The default-estimate cap follows the [ISO 11079 implementation in Appendix B](https://pmc.ncbi.nlm.nih.gov/articles/PMC12385740/).

Regional targets are converted with the whole-body clothing area factor, so they still average back to the whole-body target. Hands and head keep the uncorrected IREQ: their heuristic multipliers already carry a wind factor.

### Caveats

- **Regions get the same correction.** ISO 9920 is whole-body only. [Lu et al. 2015, Part II](https://research.polyu.edu.hk/en/publications/clothing-resultant-thermal-insulation-determined-on-a-movable-the-2/) found that wind hits the chest, abdomen and pelvis hardest, while walking hits the forearm, thigh and lower leg hardest. Those effects roughly offset, so a uniform factor is a first approximation.
- **Running, biking and XC still use ambient wind as v**, in IREQ and in the correction. A cyclist at 7 m/s through calm air is underestimated on both sides. That changes IREQ itself, so it is listed as a follow-up.
- **The equations were fitted to walking at up to 1.2 m/s.** Running and biking are clamped there.
- **`targets.ts` adds its own wind margin (`windStress`).** With the correction in place, that margin partly double-counts and should be revisited.
- **Very small requirements can convert to 0.** In mild air, a few hundredths of a clo can convert to 0, because the static air layer that clothing carries is worth more than the requirement. The running/XC contract (#249) deliberately keeps a positive heat-balance minimum, so the implementation should never convert below the resultant value. Those two contract tests are the only assertion failures left once the filter is fixed.

## 2. Catalog: outerwear on the T21-03 single-garment scale

### Analogues from T21-03

T21-03 Tables 4–13 give regional intrinsic resistance for 60 garments, each measured alone on the manikin. The outerwear analogues (clo; Ret in m²Pa/W):

| T21-03 garment (system) | Torso / arms / legs clo | Ret torso / arms / legs |
|---|---|---|
| Wind Jacket (ECWCS) | 0.70 / 0.55 / – | 13.6 / 16.3 / – |
| Extreme Cold/Wet Weather Jacket, 3L membrane (ECWCS) | 0.88 / 0.69 / – | 34.3 / 31.8 / – |
| Stem Shell Jacket, hood down (SOF, Patagonia) | 0.69 / 0.50 / – | 27.9 / 28.3 / – |
| Lightweight Exposure Suit Jacket (USMC) | 0.68 / 0.67 / – | 15.1 / 32.5 / – |
| Soft Shell Jacket (ECWCS) | 0.95 / 0.65 / – | 46.1 / 55.9 / – |
| Mixed Range Jacket, hood down (SOF soft shell) | 0.75 / 0.67 / – | 14.6 / 19.2 / – |
| Fleece Jacket (ECWCS) | 1.05 / 1.32 / – | 14.2 / 21.7 / – |
| Wind Pro Jacket (USMC) | 1.18 / 1.17 / – | 24.8 / 24.2 / – |
| Extreme Cold/Wet Weather Trouser (ECWCS) | – / – / 0.70 | – / – / 39.4 |
| Lightweight Exposure Suit Trousers (USMC) | – / – / 0.58 | – / – / 33.4 |
| M/02 Membrane Field Pants (NAF) | – / – / 0.69 | – / – / 36.2 |
| Nano Air Hoody, hood down (SOF, 60 g/m² FullRange) | 2.34 / 2.04 / – | 35.6 / 38.5 / – |
| Nano Air Vest (SOF, 60 g/m²) | 2.00 / – / – | 27.6 / – / – |
| Nano Air Bottom (SOF, 60 g/m² FullRange) | – / – / 1.75 | – / – / 35.9 |
| DAS Jacket, hood down (SOF) | 4.70 / 2.94 / – | 82.4 / 63.9 / – |
| DAS Pants (SOF, 100 g PrimaLoft One) | – / – / 2.60 | – / – / 53.7 |
| Extreme Cold Weather Parka / Trouser (ECWCS) | 3.69 / 2.94 / 2.50 | 65.9 / 65.4 / 69.1 |

Fill weights for the SOF pants come from Patagonia's consumer versions: [Nano-Air Pants 60 g FullRange](https://www.altitude-sports.com/p/patagonia-nanoair-pants-mens-pat-85100) and [DAS Pants 100 g PrimaLoft One](https://www.backcountry.com/patagonia-das-insulated-pant-mens).

### Rules

| Type | Rule | Ret |
|---|---|---|
| Hard-shell jacket | **0.75 / 0.60**: the mean of T21-03's four thin outer shells. They range 0.68–0.88 by cut, and Patagonia's own technical shell measured 0.69 / 0.50, so fabric weight doesn't justify a split. | kept: catalog shell Ret (8–40) already sits on T21-03's 14–34 band |
| Hard-shell pants and bibs | **0.65 legs**: the mean of the three membrane trousers. A bib's torso keeps its seeded torso/legs ratio. | kept |
| Soft-shell jacket | raise to the analogue only where below it: thin woven → wind jacket 0.70 / 0.55; standard → soft shell jacket 0.95 / 0.65; fleece-backed → 1.05 / 0.85 floor (the ECWCS fleece torso; USMC Wind Pro measured 1.18 / 1.17) | kept |
| Insulated jacket | torso = 0.75 + inc(body fill), arms = 0.60 + 0.87 × inc(sleeve fill), with 035's increment inc(f) = 0.0522 × f^0.842 (g/m²) | scaled with clo, keeping each garment's permeability index (as 035) |
| 3-in-1 (Bugaboo IV Interchange) | T21-03 regression of shell + fleece: 0.836 × (0.75 + 1.05), 0.809 × (0.60 + 1.32) | scaled with clo |
| Insulated pants and bibs | legs = 0.65 + 0.70 × inc(fill). The two lab pants with published fill give 0.67 (Nano-Air Bottom) and 0.77 (DAS Pants), and the ECWCS trousers/parka pair gives 0.64. At 0.70 the rule gives 1.80 for Nano-Air's 60 g (lab 1.75) and 2.41 for DAS's 100 g (lab 2.60). | scaled with clo |
| Puffy vests (035 rows) | × 2.00 / 2.34: T21-03's Nano-Air Vest against the Nano-Air Hoody at the same fill. 035 put vests on the jacket curve. | scaled with clo |

Values are rounded to 0.05 clo, and whole-body values follow the 0.5 / 0.25 / 0.25 weights. An insulated jacket now sits 0.05 clo above a puffy of equal fill (Obermeyer Raze at 60 g/m²: 2.40 torso, against Nano-Air's 2.34), and Firefall/2 (100 g/m²) is at 3.25 against Micro Puff's 2.45. That resolves 035's inversion.

**High fill is the least certain.** T21-03's heavy garments scatter widely at unknown fill, from 3.41 (NAF cold weather jacket) and 3.69 (ECW parka) to 4.68 (CAF IECS parka) and 7.03 (Canada Goose Snow Mantra). A civilian ECW-parka copy is [listed at 200 g/m²](https://laced.com.au/products/wild-things-monster-parka-black), where the curve gives 5.2. Every consumer jacket here is 40–100 g/m², between the two lab anchors.

### Per-garment values (48 live rows)

Fill sources: [evo Firefall/2](https://www.evo.com/products/175709-mountain-hardwear-firefall-2-insulated-jacket), [REI Stretch Ozonic](https://www.rei.com/product/C07588/mountain-hardwear-stretch-ozonic-insulated-jacket-mens), [Spyder EU Leader](https://spyder.eu/products/leader-jacket-concrete), [REI Alpha 4.0](https://www.rei.com/product/229857), [evo Alpha LifaLoft](https://evo.com/insulated-jackets/helly-hansen-alpha-lifaloft-jacket), [evo Snowcrew](https://www.evo.com/products/207231-outdoor-research-snowcrew-jacket-men-s), [Obermeyer Raze](https://obermeyer.com/products/raze-jacket), [Altitude Sports Lofoten insulated](https://www.altitude-sports.com/p/norrona-lofoten-goretex-insulated-jacket-mens-nor-1001-18), [Switchback Jackson Glacier](https://www.switchbacktravel.com/reviews/patagonia-jackson-glacier-parka), [REI Bugaboo IV liner](https://www.rei.com/product/C08548/columbia-bugaboo-iv-interchange-3-in-1-jacket-mens), [evo Powder Bowl](https://www.evo.com/products/136074-patagonia-insulated-powder-bowl-pants), [Altitude Sports Bugaboo II](https://www.altitude-sports.com/products/columbia-bugaboo-ii-pant-womens-llll-col-2085941), [Cotswold Legendary](https://www.cotswoldoutdoor.com/p/helly-hansen-mens-legendary-insulated-pant-H1214262.html), [Miya Lofoten insulated pants](https://store.miyaradventures.com/products/norrona-lofoten-gore-tex-insulated-pants-mens), [Bob's Rossignol](https://www.bobssportschalet.com/rossignol/rossignol-insulated-ski-pants-169947), and Snowdrifter construction from [Switchback](https://switchbacktravel.com/reviews/patagonia-snowdrifter) and [evo](https://evo.com/shell-pants/patagonia-snowdrifter-bibs-womens-20). Rows marked "low" get `uncertainty_clo` 0.6 and confidence capped at 0.5 (035's convention); "medium" rows get 0.3; analogue rows get 0.15.

| Garment | Type | Torso / arms / legs clo | Whole-body clo | Ret torso / arms / legs | Basis | Confidence | In fixture |
|---|---|---|---|---|---|---|---|
| Arc'teryx Alpha FL Jacket | Hard-shell jacket | 0.15 / 0.12 / 0 → **0.75 / 0.6 / 0** | 0.1 → **0.53** | 22 / 20 / 0 (kept) | T21-03 thin-shell mean | analogue | yes |
| Arc'teryx Beta AR Jacket | Hard-shell jacket | 0.25 / 0.2 / 0 → **0.75 / 0.6 / 0** | 0.17 → **0.53** | 30 / 28 / 0 (kept) | T21-03 thin-shell mean | analogue | yes |
| Arc'teryx Rush Jacket | Hard-shell jacket | 0.22 / 0.18 / 0 → **0.75 / 0.6 / 0** | 0.15 → **0.53** | 28 / 26 / 0 (kept) | T21-03 thin-shell mean | analogue | no |
| Helly Hansen Sogn Shell 2.0 Jacket | Hard-shell jacket | 0.22 / 0.18 / 0 → **0.75 / 0.6 / 0** | 0.15 → **0.53** | 28 / 26 / 0 (kept) | T21-03 thin-shell mean | analogue | yes |
| Helly Hansen Swift 3L Shell Jacket | Hard-shell jacket | 0.25 / 0.2 / 0 → **0.75 / 0.6 / 0** | 0.17 → **0.53** | 30 / 28 / 0 (kept) | T21-03 thin-shell mean | analogue | yes |
| Norrøna Lofoten Gore-Tex Pro Jacket | Hard-shell jacket | 0.18 / 0.15 / 0 → **0.75 / 0.6 / 0** | 0.12 → **0.53** | 26 / 24 / 0 (kept) | T21-03 thin-shell mean | analogue | yes |
| Norrøna Trollveggen Gore-Tex Pro Jacket | Hard-shell jacket | 0.28 / 0.22 / 0 → **0.75 / 0.6 / 0** | 0.19 → **0.53** | 32 / 30 / 0 (kept) | T21-03 thin-shell mean | analogue | yes |
| Norrøna Trollveggen Gore-Tex Pro Light Jacket | Hard-shell jacket | 0.2 / 0.15 / 0 → **0.75 / 0.6 / 0** | 0.13 → **0.53** | 28 / 26 / 0 (kept) | T21-03 thin-shell mean | analogue | yes |
| Outdoor Research Carbide Jacket | Hard-shell jacket | 0.2 / 0.16 / 0 → **0.75 / 0.6 / 0** | 0.13 → **0.53** | 25 / 22 / 0 (kept) | T21-03 thin-shell mean | analogue | yes |
| Outdoor Research Helium Rain Jacket | Hard-shell jacket | 0.12 / 0.1 / 0 → **0.75 / 0.6 / 0** | 0.09 → **0.53** | 40 / 35 / 0 (kept) | T21-03 thin-shell mean | analogue | yes |
| Patagonia Houdini Jacket | Hard-shell jacket | 0.15 / 0.12 / 0 → **0.75 / 0.6 / 0** | 0.11 → **0.53** | 8 / 6 / 0 (kept) | T21-03 thin-shell mean | analogue | yes |
| Patagonia Snowdrifter Jacket | Hard-shell jacket | 1.35 / 1.15 / 0 → **0.75 / 0.6 / 0** | 0.96 → **0.53** | 30 / 28 / 0 (kept) | T21-03 thin-shell mean; uninsulated 3L H2No shell with knit backer (reviews), seeded as insulated, so moved to hard_shell | analogue | yes |
| Arc'teryx Sabre Pant | Hard-shell pants/bib | 0 / 0 / 0.25 → **0 / 0 / 0.65** | 0.06 → **0.16** | 0 / 0 / 26 (kept) | T21-03 membrane-trouser mean | analogue | no |
| Helly Hansen Sogn Bib Shell Pants | Hard-shell pants/bib | 0.15 / 0 / 0.22 → **0.45 / 0 / 0.65** | 0.14 → **0.39** | 26 / 0 / 28 (kept) | T21-03 membrane-trouser mean | analogue | yes |
| Outdoor Research Carbide Bibs | Hard-shell pants/bib | 0 / 0 / 0.22 → **0 / 0 / 0.65** | 0.06 → **0.16** | 0 / 0 / 25 (kept) | T21-03 membrane-trouser mean | analogue | yes |
| Patagonia PowSlayer Pants | Hard-shell pants/bib | 0 / 0 / 0.22 → **0 / 0 / 0.65** | 0.06 → **0.16** | 0 / 0 / 28 (kept) | T21-03 membrane-trouser mean | analogue | yes |
| Patagonia Snowdrifter Bibs | Hard-shell pants/bib | 0.6 / 0 / 1.2 → **0.35 / 0 / 0.65** | 0.6 → **0.34** | 28 / 0 / 32 (kept) | T21-03 membrane-trouser mean; uninsulated 3L H2No bib (evo, reviews), seeded as insulated, so moved to hard_shell | analogue | yes |
| Spyder Sentinel Gore-Tex Pant | Hard-shell pants/bib | 0 / 0 / 0.2 → **0 / 0 / 0.65** | 0.05 → **0.16** | 0 / 0 / 28 (kept) | T21-03 membrane-trouser mean | analogue | yes |
| Lululemon Pace Breaker Jacket | Soft-shell jacket | 0.2 / 0.18 / 0 → **0.7 / 0.55 / 0** | 0.15 → **0.49** | 12 / 10 / 0 (kept) | T21-03 wind jacket floor | analogue | yes |
| Outdoor Research Ferrosi Hoodie | Soft-shell jacket | 0.55 / 0.48 / 0 → **0.7 / 0.55 / 0** | 0.4 → **0.49** | 12 / 10 / 0 (kept) | T21-03 wind jacket floor | analogue | yes |
| Patagonia R1 TechFace Jacket | Soft-shell jacket | 0.65 / 0.55 / 0 → **1.05 / 0.85 / 0** | 0.46 → **0.74** | 18 / 16 / 0 (kept) | fleece-backed floor 1.05 / 0.85 | analogue | yes |
| Patagonia Upstride Jacket | Soft-shell jacket | 0.65 / 0.55 / 0 → **1.05 / 0.85 / 0** | 0.45 → **0.74** | 14 / 12 / 0 (kept) | fleece-backed floor 1.05 / 0.85 | analogue | yes |
| Columbia Bugaboo IV Interchange Jacket | Insulated jacket | 1.5 / 1.25 / 0 → **1.5 / 1.55 / 0** | 1.06 → **1.14** | 35 / 32 / 0 → 35 / 39.7 / 0 | 3-in-1: shell + 250 g/m² microfleece liner (REI) ≈ T21-03 regression of cold wet weather + fleece jackets | medium | yes |
| Columbia Joy Peak Lite Hooded Jacket | Insulated jacket | 1.15 / 1 / 0 → **2.4 / 1.6 / 0** | 0.83 → **1.6** | 26 / 23 / 0 → 54.3 / 36.8 / 0 | Thermarator, weight unpublished; "Lite" assumed 60/40 | low | yes |
| Columbia Powder Lite Hooded Jacket | Insulated jacket | 1.25 / 1.05 / 0 → **2.4 / 1.6 / 0** | 0.89 → **1.6** | 28 / 25 / 0 → 53.8 / 38.1 / 0 | Thermarator + Omni-Heat, weight unpublished; assumed 60/40 | low | yes |
| FP Movement Care FP On The Ascend Insulated Jacket | Insulated jacket | 1.5 / 1.25 / 0 → **3.25 / 2.4 / 0** | 1.06 → **2.23** | 35 / 32 / 0 → 75.8 / 61.4 / 0 | PrimaLoft, weight unstated; seeded near Firefall/2, assumed 100/80 | low | no |
| FP Movement Downhill Diva Suit | Insulated jacket | 1.25 / 1.05 / 0.75 → **2.4 / 1.6 / 0.75** | 1.08 → **1.79** | 30 / 27 / 18 → 57.6 / 41.1 / 18 | puffer top, weight unstated; assumed 60/40; stretch legs keep 0.75 (T21-03 soft-shell trousers) | low | no |
| FP Movement Lift Love Jacket | Insulated jacket | 1.15 / 0.95 / 0 → **2.4 / 1.6 / 0** | 0.81 → **1.6** | 30 / 27 / 0 → 62.6 / 45.5 / 0 | PrimaLoft, weight unstated; "lightly insulated" assumed 60/40 | low | no |
| Helly Hansen Alpha 4.0 Insulated Jacket | Insulated jacket | 1.5 / 1.25 / 0 → **2.85 / 2.05 / 0** | 1.06 → **1.94** | 36 / 32 / 0 → 68.4 / 52.5 / 0 | 80 g PrimaLoft Black, body-mapped (REI; one retailer lists 100); sleeves assumed 60 | medium | yes |
| Helly Hansen Alpha Infinity Insulated Jacket | Insulated jacket | 1.45 / 1.2 / 0 → **2.85 / 2.05 / 0** | 1.03 → **1.94** | 34 / 30 / 0 → 66.8 / 51.3 / 0 | PrimaLoft Black Eco mapped, weight unpublished; assumed as Alpha 4.0 | low | yes |
| Helly Hansen Alpha LifaLoft Jacket | Insulated jacket | 1.8 / 1.4 / 0 → **2.85 / 2.05 / 0** | 1.25 → **1.94** | 40 / 35 / 0 → 63.3 / 51.3 / 0 | 80 g LifaLoft (evo; another source 100); sleeves assumed 60 | low | no |
| Mountain Hardwear Firefall/2 Insulated Jacket | Insulated jacket | 1.5 / 1.3 / 0 → **3.25 / 2.4 / 0** | 1.08 → **2.23** | 35 / 32 / 0 → 75.8 / 59.1 / 0 | 100 g/m² body, 80 g/m² sleeves (evo) | medium | yes |
| Mountain Hardwear Stretch Ozonic Insulated Jacket | Insulated jacket | 1.2 / 1.05 / 0 → **3.25 / 2.4 / 0** | 0.86 → **2.23** | 30 / 28 / 0 → 81.3 / 64 / 0 | 100 g mapped ThermoCloud (REI); sleeves assumed 80 | medium | yes |
| Norrøna Lofoten Gore-Tex Insulated Jacket | Insulated jacket | 1.8 / 1.3 / 0 → **2.15 / 2.05 / 0** | 1.23 → **1.59** | 42 / 38 / 0 → 50.2 / 59.9 / 0 | PrimaLoft Silver mapped: 60 g/m² front, shoulders, elbows; 40 g/m² collar and back | medium | yes |
| Obermeyer Raze Jacket | Insulated jacket | 1.4 / 1 / 0 → **2.4 / 1.6 / 0** | 0.95 → **1.6** | 36 / 30 / 0 → 61.7 / 48 / 0 | 60 g/m² body, 40 g/m² sleeves and hood (Obermeyer, REI) | medium | no |
| Outdoor Research Snowcrew Jacket | Insulated jacket | 1.6 / 1.2 / 0 → **2.85 / 2.05 / 0** | 1.1 → **1.94** | 38 / 32 / 0 → 67.7 / 54.7 / 0 | 80 g/m² body, 60 g/m² sleeves and hood VerticalX (evo) | medium | yes |
| Patagonia Jackson Glacier Parka | Insulated jacket | 2.2 / 1.8 / 0 → **3.25 / 2.4 / 0** | 1.55 → **2.23** | 45 / 40 / 0 → 66.5 / 53.3 / 0 | 5.9–6.6 oz 700FP down (Switchback, Better Trail); ≈ 100/80 g/m² synthetic-equivalent via Ghost Whisperer/2 in 035 | low | yes |
| Spyder Challenger Insulated Jacket | Insulated jacket | 1.2 / 1.05 / 0 → **2.85 / 2.05 / 0** | 0.86 → **1.94** | 28 / 25 / 0 → 66.5 / 48.8 / 0 | adult fill unpublished (kids 133 g); assumed 80/60 | low | yes |
| Spyder Leader Insulated Jacket | Insulated jacket | 1.55 / 1.3 / 0 → **3.25 / 2.4 / 0** | 1.1 → **2.23** | 35 / 32 / 0 → 73.4 / 59.1 / 0 | 100 g PrimaLoft Silver Eco (Spyder EU); sleeves assumed 80 | medium | yes |
| Columbia Bugaboo II Pants | Insulated pants/bib | 0 / 0 / 1.15 → **0 / 0 / 1.8** | 0.29 → **0.45** | 0 / 0 / 38 → 0 / 0 / 59.5 | 60 g Microtemp XF II (Altitude Sports) | medium | yes |
| FP Movement Lift Love Bib | Insulated pants/bib | 0.3 / 0 / 0.95 → **0.45 / 0 / 1.45** | 0.39 → **0.59** | 18 / 0 / 32 → 27.5 / 0 / 48.8 | weight unstated; "lightly insulated" assumed 40 | low | no |
| Helly Hansen Legendary Insulated Ski Pants | Insulated pants/bib | 0 / 0 / 1 → **0 / 0 / 1.8** | 0.25 → **0.45** | 0 / 0 / 32 → 0 / 0 / 57.6 | 60 g PrimaLoft Black (Cotswold, Barrabes) | medium | yes |
| Norrøna Lofoten Gore-Tex Insulated Pants | Insulated pants/bib | 0 / 0 / 1.4 → **0 / 0 / 1.45** | 0.35 → **0.36** | 0 / 0 / 35 → 0 / 0 / 36.3 | 40 g/m² PrimaLoft Silver (Miya, Ski Essentials) | medium | yes |
| Patagonia Insulated Powder Bowl Pants - Regular | Insulated pants/bib | 0 / 0 / 1.1 → **0 / 0 / 1.8** | 0.28 → **0.45** | 0 / 0 / 40 → 0 / 0 / 65.5 | 60 g Thermogreen (evo, Worn Wear) | medium | yes |
| Rossignol Insulated Ski Pants | Insulated pants/bib | 0 / 0 / 0.9 → **0 / 0 / 1.45** | 0.23 → **0.36** | 0 / 0 / 30 → 0 / 0 / 48.3 | Rossignol Insulated Ski Pant family 40 g PrimaLoft; SKU match unconfirmed | low | no |
| Columbia Powder Lite Vest | Puffy vest (035) | 2 / 0 / 0 → **1.7 / 0 / 0** | 1 → **0.85** | 33.7 / 0 / 0 → 28.6 / 0 / 0 | 035 value × T21-03 Nano-Air Vest / Hoody (2.00 / 2.34) | low | yes |
| FP Movement Happy Trails Poncho | Puffy vest (035) | 2 / 0.38 / 0 → **1.7 / 0.3 / 0** | 1.1 → **0.93** | 37.9 / 8.4 / 0 → 32.2 / 6.7 / 0 | 035 value × T21-03 Nano-Air Vest / Hoody (2.00 / 2.34) | low | no |
| Patagonia Nano-Air Light Vest | Puffy vest (035) | 1.85 / 0 / 0 → **1.6 / 0 / 0** | 0.93 → **0.8** | 30.5 / 0 / 0 → 26.4 / 0 / 0 | 035 value × T21-03 Nano-Air Vest / Hoody (2.00 / 2.34) | medium | yes |

## 3. What else the golden runs show

**Alpine targets are sized for a steady-state chairlift ride.** The minimum blends skiing and chairlift IREQ 60/40, but the neutral is the chairlift's steady-state IREQ. So the whole-body targets are 5.0–5.1 clo at 5°F and 6.2–6.3 at −15°F before the correction, and 8.2–9.3 with it. After re-derivation, the warmest catalog outfit reaches 4.3. The lift ride lasts minutes between runs; ISO 11079 handles bounded exposures with DLE, and ISO 8996 averages metabolic rate over a representative cycle ([ISO 8996 summary](https://www.researchgate.net/profile/Lesley-Anne-Hudie/publication/306013139_Ergonomics_of_the_thermal_environment_Determination_of_metabolic_rate/links/57aa26fc08ae3765c3b4a2b6/Ergonomics-of-the-thermal-environment-Determination-of-metabolic-rate.pdf)). **Option T** computes alpine IREQ at the time-weighted rate (0.6 × skiing + 0.4 × chairlift) and time-weighted relative air speed (wind + 3 m/s). DLE still comes from the lift.

**Alpine legs need 1.2× the whole-body target.** `REGIONAL_IREQ_MULTIPLIERS.alpine_skiing.legs` (1.20, "chairlift + wind = cold legs") has no cited source. T21-03's cold-weather systems do the opposite: their warmest ensembles put 0.45–0.54× the torso's clo on the legs (ECWCS Ensemble 4: torso 7.52, legs 4.06; SOF Ensemble 3: 7.96, 3.61), and matched parka/trouser pairs 0.38–0.68×. **Option L** sets alpine legs to 1.0, matching torso and arms, until regional data justify a bias.

**Running and biking budget protective shells against the clo cap.** `buildBreathableEnsemble` only adds a shell if it fits under `maxClo`. At T21-03 values a shell is about 0.5 whole-body clo. With the catalog change alone, biking has no torso shell in 8 of 12 scenarios, including rain (4 at baseline). **Option B** keeps protective shells outside the budget there; with it, none lack one. The touring climb keeps its budget, because its rule ("prefer hard shells for protection on the climb") overdresses mild climbs at lab values: at 45°F, 1.7 clo against a 0.58–0.82 target. That shell belongs in the pack unless it's wet or windy, a separate builder change.

**#306's requirement filter drops layers once shells carry realistic clo.** `filterUnsuitableEnsemble` drops a garment that is thermally suitable for its region but fails the sport's breathability minimum, unless it is a torso wind shell while a wind layer is required. It also drops an `underlayer` with nothing over it. On the low scale shells were never "thermally suitable", so they survived; the filter changes no baseline scenario. In the full package it drops:
- **running's leg shell at 25°F, for breathability.** The bib's 0.18–0.22 is under running's 0.30, which leaves legs at 0.29 against a 0.72 minimum. Running then has no torso shell either: `retainRunningProtection` had counted the bib as torso wind protection because it covers the torso.
- **XC's insulated jacket at −15°F (wardrobe), for breathability.** Its 0.15 is under XC's 0.25, and `outer_insulated` isn't covered by the wind-shell exemption. That breaks the XC wind-layer invariant.
- **XC's base bottoms at 45°F, because they are an `underlayer` worn alone.** That is the filter working as designed. XC's regional search doesn't read `usage`, and against the higher converted targets it now picks underlayer-only bottoms, so XC is shown with bare legs.

The fix is two pieces:
- in `requirements.ts`, the breathability drop must exempt layers the protection policy requires and outer layers the regional search chose;
- the XC regional search must prefer standalone legwear (part of #248).

Bypassing the filter bounds what they recover: running goes 72.5 → 77.5 and XC 81.2 → 94.7.

## Golden-test impact

Same harness as the audit (60 scenarios: 5 sports × 6 conditions × catalog/wardrobe), on main `af861c4`. Each variant ran the prototype with switches; scripts and per-scenario diffs are in the hand-over folder. K is the catalog above (the earlier CoWEDA-only analogues gave the same picture).

| Variant | Mean comfort score: alpine / biking / running / ski touring / XC | Scenarios changed (of 60) | Golden tests failing (of 83) | Of which assertion failures |
|---|---|---|---|---|
| Baseline (035) | 52.3 / 64.4 / 76.9 / 65.2 / 97.3 | – | 0 | 0 |
| M: model only | 37.2 / 65.5 / 71.6 / 63.8 / 82.7 | 59 | 75 | 5: XC wind layer, running/XC contract ×2, alpine 45°F regional warning and comfort |
| K: catalog only | 57.5 / 57.6 / 69.3 / 61.7 / 91.5 | 54 | 61 | 1: alpine 45°F comfort |
| M + K | 44.3 / 61.8 / 70.5 / 65.0 / 81.2 | 60 | – | – |
| **T + L: alpine targets only (PR A)** | **74.9** / 64.4 / 76.9 / 65.2 / 97.3 | 12 | – | – |
| M + K + T + L | 74.9 / 61.8 / 70.5 / 65.0 / 81.2 | 60 | – | – |
| M + K + T + L + B | 74.9 / 67.2 / 72.5 / 65.0 / 81.2 | 60 | 73 | 3: XC wind layer (filter), running/XC contract ×2 |
| **… + filter bypassed (bound for PR B's filter fix)** | **74.9 / 67.2 / 77.5 / 65.0 / 94.7** | 60 | 73 | 2: running/XC contract (near-zero floor) |

"–" means not run through `golden.test.ts`; those variants differ only in the switches above.

- **Alpine (T + L, full package):** catalog outfits come out comfortable at 45°F, 25°F and 18°F (25°F: 59.7 → 95.7). 5°F (66.4), 36°F rain (74.5) and −15°F (51.7) stay short; −15°F needs 5.6 clo against the catalog's best 4.3. Wardrobe runs are limited by the wardrobe's only insulated pants, Bugaboo II.
- **Biking:** B restores the wind shell in all 12 scenarios, and M raises the cold targets enough that riders get a mid layer, fleece pants and a wind shell at 25°F and below.
- **Running and XC:** with a filter fix, running is above baseline and XC 2.6 below. Every XC scenario still scores 85 or more; the gap is rain-day outfits a little above the range (36°F: 0.77 clo against 0.39–0.70) and small offsets from the range midpoint. Running loses points in the same rain case and at 18°F (lab-scale shells over the range), and in one near-boundary case: easy running at 45°F, 0.27 clo against 0.31, where the base layers lose about 40 % of their insulation while moving.
- **Ski touring:** descent targets rise 1.3–1.5× in wind, and the weight-biased pack choice leaves insulation warnings at 25°F and below (14 against 9 today).

## T21-03 checks

**Regression.** Eqs. 7–14 match `ENSEMBLE_REGRESSION`: torso 0.836, arm 0.809, leg 0.961, whole body 0.990 (R² 0.924 / 0.939 / 0.854 / 0.655), and Ret 0.999 / 0.737 / 0.950 / 1.12.

**Seeded `calibration_reference` rows.** No code reads this table. All eight rows are T21-03 garments:

| Row | Seeded torso / arm clo | T21-03 | Seeded torso / arm Ret | T21-03 | T21-03 whole body clo / Ret |
|---|---|---|---|---|---|
| SOF Lightweight Crew | 0.55 / 0.34 | **0.59 / 0.43** | 12.32 / 12.15 | 12.32 / **12.39** | 0.15 / 2.99 |
| SOF Nano Air Hoody | 2.34 / 2.04 | 2.34 / 2.04 | 35.59 / 38.49 | 35.59 / 38.49 | 0.34 / 6.39 |
| SOF DAS Jacket | 4.70 / 2.94 | 4.70 / 2.94 | 82.43 / 63.90 | 82.43 / 63.90 | 0.44 / 7.64 |
| ECWCS Lightweight Undershirt | 0.55 / 0.36 | 0.55 / **0.41** | 9.86 / 9.41 | 9.86 / **6.52** | 0.15 / 2.89 |
| ECWCS Midweight Shirt | 0.69 / 0.55 | 0.69 / **0.68** | 12.96 / 13.18 | 12.96 / **13.33** | 0.19 / 2.91 |
| ECWCS Fleece Jacket | 1.05 / 0.94 | 1.05 / **1.32** | 14.20 / 14.63 | 14.20 / **21.70** | 0.26 / 3.65 |
| CAF CADPAT IECS Parka | 4.68 / 3.20 | 4.68 / **3.03** | 82.49 / 68.31 | **78.51 / 80.69** | 0.46 / 6.34 |
| ECWCS ECW Parka | 3.69 / 2.38 | 3.69 / **2.94** | 75.60 / 60.53 | **65.91 / 65.41** | 0.39 / 5.72 |

Proposal: correct the six rows in migration 036. T21-03's whole-body values could fill `measured_rcl_whole` and `measured_recl_whole`, but they are a different quantity from the code's whole-body clo (see below). If stored, the column comments should say so.

**The "lab-tested" Capilene Midweight row matches no T21-03 garment.** The catalog's Patagonia Capilene Midweight (`lab_tested`, confidence 0.95) stores 0.69 / 0.55 clo and Ret 12.96 / 10.0. That is the ECWCS Midweight Shirt's torso values with other arm numbers. The closest T21-03 garment is the SOF MW Quarter Zip, Patagonia's military Capilene midweight: 0.66 / 0.36, Ret 12.88 / 10.51. Either move the row to those values, or drop `lab_tested` and lower its confidence. This is a base layer, outside the outerwear scope, so it's listed as a decision.

**Whole-body clo means something different in T21-03.** T21-03 averages zones with the parallel method, and its whole-body value spans all six regions, head, hands and feet included. That's why the Nano-Air Hoody is 0.34 clo whole-body against 2.34 torso. The code's whole-body value is a 0.5 / 0.25 / 0.25 serial mean of torso, arms and legs, and those weights aren't from T21-03. Comparing either with whole-body IREQ is a modeling choice that deserves its own review (audit "Other things found" item 6). Not part of this proposal.

## Decisions (2026-10-18)

The user approved every recommended option:
- **Model:** the requirement-side ISO 11079 Annex A correction, with the permeability classes and per-phase inputs above.
- **Catalog:** the 48-row T21-03 table, including moving Snowdrifter Jacket and Bibs to `hard_shell` and scaling 035's vests.
- **Alpine targets:** the time-weighted cycle IREQ (T) and legs at 1.0 (L).
- **Builders:** protective shells outside the running/biking clo budget (B), and the requirement-filter fix.
- **Original sequencing:** PR A (T + L), then PR B (everything else, migration 036).
- **Review revision:** PR A keeps the conservative baseline and ships L only; T moves to PR B alongside the correction. The experiments above retain their original T + L labels.

Still open: the Capilene Midweight lab row, and the touring climb's hard-shell rule.

**The lower cycle target must ship together with the wind/motion correction.** PR A now retains the conservative baseline, so the original under-dressing regression cannot ship on its own. The original experiment illustrates why this dependency matters. At 5°F with 20 mph wind:
- today's catalog outfit has a down jacket under a Gore-Tex Pro shell (Lyngen Down850);
- PR A alone swaps it for a light synthetic insulator and a featherweight shell, at 2.95 clo against a 2.68–3.37 target;
- PR A + B brings the down jacket back (4.34 against 4.26–5.46).

The time-weighted target removes the steady-state lift ride, about −40 % in cold wind. The correction in PR B adds 30–60 % back in that same wind. PR B must introduce both together when it is updated on PR A.

## Implementation

- **Migration 036**, applied by hand in the SQL editor:
  - the 48 rows above, in 035's style: explicit `(brand, model_name, old values…)` guards on every replaced field, `data_source` pointing here, and `uncertainty_clo` / confidence caps;
  - the two `category` moves;
  - the six `calibration_reference` corrections, plus Capilene Midweight if chosen.
- **Same values in `gear-catalog.json`** (38 fixture rows), reviewed golden snapshot updates, and a PGlite replay test like `catalog-thermal-audit.database.test.ts`.
- **Code:**
  - `requiredBasicInsulation` and exposures in `ireq.ts` / `thermal-targets.ts`, never converting below the resultant value;
  - converted IREQ for builders and display (`ireq.min`/`neutral` stay resultant, with basic `target_range`);
  - the scorer's outfit permeability;
  - alpine T + L;
  - builder B for running/biking;
  - the filter fix;
  - unit tests against hand-computed Annex A values;
  - removal of the prototype switches.
- **`references/thermal-estimation.md`** in the add-wardrobe-item skill moves to the new scale in the same PR. Rows added since 035 (FP Movement, Rossignol) were seeded from low-scale analogues and are in the table.

## Sources

- Rioux T.P., Gonzalez J.A., Karis A.J., Potter A.W., Xu X. *Biophysical properties of five cold weather clothing systems and the predicted regional properties of ensembles.* USARIEM T21-03, November 2020: Tables 2–23 and Eqs. 1–14, read from the user's copy. [DTIC AD1115339](https://apps.dtic.mil/sti/pdfs/AD1115339.pdf) showed its maintenance page on 2026-10-17 and 2026-10-18.
- ISO 11079:2007 Annex A equations as implemented in [pythermalcomfort `ireq.py`](https://github.com/CenterForTheBuiltEnvironment/pythermalcomfort/blob/development/pythermalcomfort/models/ireq.py); outer-fabric air permeability and validity ranges per [IJERPH 2025, PMC12385740](https://pmc.ncbi.nlm.nih.gov/articles/PMC12385740/).
- ISO 9920:2007 (Havenith & Nilsson 2004 meta-analysis of movement and wind corrections).
- Lu Y. et al. *Clothing resultant thermal insulation determined on a movable thermal manikin. Part II: effects of wind and body movement on local insulation.* Int J Biometeorol 59:1487–1498 (2015). [PolyU record](https://research.polyu.edu.hk/en/publications/clothing-resultant-thermal-insulation-determined-on-a-movable-the-2/).
- Xu X. et al. *CoWEDA*, Int J Biometeorol 2021, Table 2. [PMC8346413](https://pmc.ncbi.nlm.nih.gov/articles/PMC8346413/).
- ISO 8996 time-weighted metabolic rate ([summary](https://www.researchgate.net/profile/Lesley-Anne-Hudie/publication/306013139_Ergonomics_of_the_thermal_environment_Determination_of_metabolic_rate/links/57aa26fc08ae3765c3b4a2b6/Ergonomics-of-the-thermal-environment-Determination-of-metabolic-rate.pdf)).
- Fill weights: linked above the per-garment table.
