# Feet: a first heuristic sock suggestion (#405, 2026-11-24)

**Status: a labelled heuristic, not a validated model.** SWTTR modeled torso, arms, legs and heuristic hand and head bands, but nothing for the feet. This adds a foot band, the footwear each sport assumes, a coverage check and a generic sock suggestion. It doesn't add catalog or wardrobe items, change any garment or accessory choice, or touch the comfort score. Follow-ups are listed at the end.

## What it does

For every sport and phase, `phaseTargets` returns `feet: { min, neutral }`. Each recommendation then reports `recommendation.footwear` (`assessFootwear` in `src/lib/recommendations/footwear.ts`):

1. **Footwear is assumed, not chosen.** Each sport dictates its footwear: running shoes, cycling shoes, XC ski boots, alpine boots or touring boots. SWTTR doesn't know which pair anyone owns, so the response names the footwear it assumed and its estimated clo.
2. **The sock is the lightest generic weight** (thin, light, midweight, heavy) whose footwear-plus-sock clo reaches the band's minimum, at a 0.03 clo tolerance. Alpine and touring boots take up to midweight only: a fitted ski-boot shell leaves no room for a heavyweight sock, and squeezing one in isn't warmer.
3. **When even the warmest allowed sock falls short,** the assessment is `short`, and a warning names the sport's usual remedy: winter running shoes or shoe covers, toe covers or overshoes, insulated XC boots or overboots, boot heaters or insulated boot covers. The remedy's insulation isn't counted, because there is no data for it here.
4. **Touring uses one pair of socks,** sized on the descent, the colder phase.
5. **Mild weather:** when the thinnest sock is already above the band, the message says it is enough. There is no warning for warm feet.

The message is a guidance line, or a warning when short. It always says that it is an estimate and that feet aren't in the comfort score.

### What it doesn't do

- **No toe temperature, frostbite risk or exposure time.** The solver assumes a skin temperature and calculates the insulation required. Its clothing-surface temperature is not a predicted toe temperature and isn't used. The whole-body exposure limit (ISO 11079 DLE) is a whole-body heat-debt time and says nothing about feet.
- **No comfort input.** Feet don't enter the comfort score, the verdict, body-area statuses or manual edits.
- **No CoWEDA margin.** The hand and head bands add a CoWEDA-inspired extremity buffer derived from finger-temperature errors (Potter et al. 2020). Toe and foot predictions need their own reference data, so the foot band leaves it out.
- **No wetness or snow contact.** Wet feet and standing in snow lose more heat; neither is modeled beyond the cold-margin taper the hand band also uses.

## Insulation values

Clo is on USARIEM T18-01's foot part-manikin scale: total insulation with the item on, minus the bare manikin's air layer, the same scale #376 uses for hands and head. Footwear and sock clo are added, as T18-01 added layers (its summed layers predicted six measured ensembles within 1–28 %). A sock compressed in a tight boot is likely worth less than that.

| Item | Clo | Basis |
|---|---|---|
| Midweight sock | 0.39 | **Measured**: T18-01 Table 2, its sock on the foot manikin. Calling it midweight is SWTTR's assumption |
| Thin liner sock | 0.20 | Estimate, about half the measured sock |
| Lightweight sock | 0.30 | Estimate |
| Heavyweight sock | 0.50 | Estimate |
| Running shoes | 0.15 | Estimate: mesh upper, less than one sock |
| Cycling shoes | 0.15 | Estimate: vented upper |
| XC ski boots | 0.35 | Estimate: about one sock's worth |
| Touring boots | 0.60 | Estimate: shell and thin liner |
| Alpine boots | 0.70 | Estimate: shell and foam liner |
| Extreme-cold bootie | 1.42 | **Measured**: T18-01; the warm end of the bracket, not used as an item |

Every estimate sits between the measured sock and the measured bootie. None has a source of its own. Because each sport's multiplier is calibrated against its own footwear (below), the absolute footwear values mostly set how many sock steps a sport has before it runs short, not where the band sits.

## The foot band

The band follows the hand band's form (`calculateFootIreq` in `src/lib/biophysics/ireq.ts`): the whole-body IREQ of the phase the hands follow, times a per-sport foot multiplier (`FOOT_IREQ_MULTIPLIERS`), the shared temperature factor (0.8 at 0°C and above, rising to 1 at −10°C) and wind factor (3 % per m/s). Running, XC, cycling and the touring climb taper it in mild air as they taper the hand band. Run Warm and Run Cold narrow it like the other bands.

**The multipliers are calibrated to a judgment, not data.** Each one is set so that the sport's assumed footwear plus the measured midweight sock just reaches the band's minimum at a reference condition, at moderate effort in an 8 mph wind and the default body:

| Sport | Reference | Multiplier |
|---|---|---|
| Running | −10°C (14°F) | 0.96 |
| Cycling | 0°C (32°F) | 1.20 |
| XC | −15°C (5°F) | 1.08 |
| Alpine | −15°C (5°F) | 0.44 |
| Touring descent | −15°C (5°F) | 0.35 |
| Touring climb | −15°C (5°F) | 1.49 (unused: the sock is sized on the descent) |

The reference temperatures are SWTTR's reading of common practice: wool socks in running shoes into the low teens °F, overshoes around freezing on a bike, overboots or boot heaters below about 5°F on skis. They are cold enough that no mild-weather taper applies. They aren't from a study, and they are the first thing field feedback (#8) should test. `footwear.test.ts` checks the calibration and that colder, windier or easier conditions never suggest a lighter sock.

The multipliers look unlike the hand multipliers (alpine 0.44 here, 1.45 for hands) because the alpine and descent IREQ the extremities follow is high (the hand bands for those phases already run above any rated mitten, as #376 found), and because footwear here is fixed rather than chosen.

### What it suggests (default body, dry, moderate effort)

From a sweep of the five sports at 4, 12 and 20 mph:

- **Running:** thin socks to about 32°F at 12 mph; light to midweight from 25 to 20°F; heavyweight around 15°F; short (winter shoes or covers) from about 10°F at 12 mph.
- **Cycling:** thin socks at 40°F and above; light at 36°F and midweight at freezing; short (toe covers or overshoes) from about 25°F at 12 mph.
- **XC:** thin socks to about 20°F; midweight from 15 to 10°F, heavyweight at 5°F; short (overboots) from about 0°F at 12 mph.
- **Alpine and the touring descent:** thin socks to about 20°F; light at 15°F and midweight at 10°F; short (boot heaters or covers) from about 5°F at 12 mph.

An easier effort or a stronger wind asks for a warmer sock at the same temperature; a harder effort for a lighter one.

## Follow-ups

- **Real sock and footwear items.** A footwear table (or types in an existing one), seeds with sourced or bracketed clo, wardrobe support, and the selector choosing owned socks and boots instead of generic weights. The live catalog had no socks, boots or other footwear on 2026-11-24, and no custom items for feet.
- **Footwear data.** Foot-manikin values for running shoes, cycling shoes, XC, alpine and touring boots, and for overboots, toe covers and boot heaters, so remedies can count. Kuklane's foot-manikin work on footwear insulation is the place to start; it wasn't read for this change.
- **Wet feet and snow contact.** Rain and slush for cycling and running, damp socks after a touring climb.
- **Validation before any toe temperature, frostbite or exposure claim**, as #405's checklist says, with reference data for toes rather than CoWEDA's finger errors.
- **Field feedback** (#8) on the reference temperatures.

## References

- Rioux TP et al. *Biophysical evaluation of the USMC cold-weather clothing ensemble.* USARIEM Technical Report T18-01 (2018). Table 2: sock 0.39 clo, extreme-cold bootie 1.42 clo, as total minus the bare manikin's air layer.
- Potter AW et al. (2020). Validation of new method for predicting human skin temperatures during cold exposure: the Cold Weather Ensemble Decision Aid (CoWEDA). *Informatics in Medicine Unlocked* 18, 100301.
- ISO 11079:2007. No local method; hand cooling is judged by finger temperature.
- [Algorithm review](algorithm-review.md), findings 6 and 7, and [catalog-accessory-clo.md](catalog-accessory-clo.md) for the part-manikin scale.
