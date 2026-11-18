# Ski touring outfits (#372), 2026-11-16

How the ski-touring route picks the climb outfit and the descent pack, and the decision on the descent's legs. It settles the "touring climb's hard-shell rule" left open in [catalog-thermal-calibration.md](catalog-thermal-calibration.md). Evidence comes from findings 1 and 3 of the #116 algorithm review (PR #377, `docs/algorithm-review.md`). Targets are unchanged: metabolic rates, air speeds and margins are #374, and the regional weights and leg bias are #375.

Code: `src/lib/recommendations/sports/ski-touring-outfit.ts` (climb search, descent pack) and `ski-touring.ts` (phases, response).

## Climb

The climb uses the regional search shared with alpine and XC: torso and arms first, then legs, at most one base, one mid and one outer per covered region. Each candidate outfit is judged with the same regional prediction and bands the evaluation uses (`xcRegionFit`), in this order:

1. Every region has clothing.
2. No hard shell or windbreaker unless the climb needs wind or wet protection.
3. Required protection on torso, arms and legs. Wet prefers waterproof coverage.
4. A layer that can sit next to skin: a base or mid layer, or a reviewed standalone garment. A shell is never worn on bare skin when something else is available.
5. No severe excess (more than 0.15 clo over the neutral target, as in XC).
6. More than thermal underwear alone: a reviewed standalone garment, or a mid or outer over the base.
7. Regional fit (shortfall plus excess), then excess, then fewer garments under 0.20 evaporative potential, fewer layers and more breathability.

No base layer is mandatory, so a reviewed standalone garment can be worn alone. Puffies and insulated outerwear never go on the climb; they stay pack items. For catalog callers, climb garments need an uphill score of 6, as descent pack items already needed a downhill score of 6. Wardrobe garments are not filtered.

**When the climb needs protection.** Wind uses the XC thresholds (`needsXCWindProtection`) at the climb's own effective wind, 0.3 × ambient, the same wind its targets use. Wet uses XC's classification: rain, mixed, near-melting or unknown precipitation is wet; snow below −1°C is dry and doesn't force a waterproof layer. When the climb needs protection and nothing owned provides it, the response warns per region ("Climb: Available clothing lacks required … protection for torso").

**The hard-shell rule.** The old builder took a hard shell whenever one fit under the climb's clo cap, so mild climbs wore one: at 45°F, 1.44 clo against 0.60–0.82. Now a hard shell or windbreaker is worn on the climb only for wind or wet, or when it is the only garment that can cover a region. Otherwise it goes in the pack for the descent. Soft shells stay ordinary climb candidates, chosen by fit.

**Targets still assume a membrane.** The climb's ISO 11079 conversion keeps `OUTER_AIR_PERMEABILITY.membrane`, which the targets were calibrated with. A climb in open or wind-resistant fabric needs more basic clo than that: at 25°F and 12 mph, roughly 1.4 basic clo per resultant clo for open fabric against 1.06 for a membrane. Changing it changes the climb targets, so it is left to #374.

## Descent

The climb clothing stays on. The pack adds, region by region:

- **Shell:** a hard shell over the torso when the climb didn't wear one (unchanged rule, now limited to upper-body shells).
- **Upper body:** a fleece or puffy when torso or arms would fall short of the descent minimum. Insulated outerwear isn't packed, since it would replace the shell.
- **Legs:** an over-pant when the legs would fall short of the descent minimum. Over shell or insulated pants only insulation is added; over soft-shell pants, a hard shell or insulation, not a second soft shell. Base and fleece layers go underneath, so they are never added at the transition.

Each candidate has to bring its region closer to the band, where a shortfall counts double an excess (the descent is the cold phase; the accessory fallback uses the same weighting). Among those, a layer that reaches the minimum wins. Then the score is the share of the gap closed against weight, 70/30 as the pack always was. With `prioritize_light_pack` the split is 40/60 and reaching the minimum no longer comes first, so a lighter layer can leave a small shortfall.

Pack items now include `covers_torso`, `covers_arms`, `covers_legs` and `rcl_legs`, so the client puts packed pants on the legs and the descent's manual check matches `descent_evaluation`. The transition protocol names the leg layer, and guidance suggests full side zips, which let pants go on over ski boots. The catalog doesn't record side zips.

## Decision: descent legs get a packed layer

The issue offered two options: add or pack a leg layer, or justify a different descent leg target. This change packs a leg layer.

- **The shortfall was structural.** The pack only ever added torso pieces, so the descent legs kept their climb clothing. In #116's 100-response matrix, descent legs were under their minimum in 18 of 20 cases.
- **A different target doesn't close it.** At 25°F and 12 mph the descent asks the legs for 2.87–3.89 basic clo, and the climb legs carry about 1.0. Removing the descent's leg bias (1.15 to 1.0, as #317 did for alpine) lowers the minimum only to about 2.6. Matching T21-03's ensembles, which carry roughly half the torso's clo on the legs, would mean a different regional split. That is #375's decision for every sport, and the regional bands must still average back to the whole-body band.
- **The inventory can do it.** The catalog has shell, soft-shell and insulated pants. With one packed layer, the 25°F descent legs come out at 2.93 against 2.87.

Where nothing owned is warm enough (deep cold, or a sparse wardrobe), the descent legs still fall short and the evaluation says so. That is now an inventory limit, not the builder's.

## Results

The 11-condition matrix from #116 on the golden fixture (catalog, signed out), main against this change:

| | Main (`b4e63d7`) | This change |
|---|---|---|
| Climb torso, arms and legs all in their bands | 0 of 11 | 5 of 11 (torso 8, arms 8, legs 10) |
| Climb wears a hard shell | 11 of 11 | 1 of 11 (rain) |
| Descent legs under their minimum | 10 of 11 | 2 of 11 (5°F snow, −15°F) |
| Mean comfort, climb / descent | 31.6 / 44.5 | 47.0 / 53.6 |
| Mean pack weight | 212 g | 1,507 g |

The golden wardrobe gives 0 → 6 of 11 climbs in band and 10 → 4 descents short on legs. The pack is heavier because the hard shell moved into it and leg layers were added; `prioritize_light_pack` brings the mean to 1,385 g.

In the committed golden snapshot's 12 touring scenarios, mean comfort goes from 30.6 to 44.4 on the climb and from 37.7 to 60.2 on the descent. The climb's whole-body clo is inside its target range in 9 of 12 (0 before), and the descent legs are short in 6 of 12 (12 before). The six left short are the 5°F and −15°F cases and two golden-wardrobe cases at 18–25°F, where the one over-pant owned leaves the legs about 0.1 clo short.

Most climbs still read "Warmer than recommended" because of head and hand accessories, which are #370's. The 65°F climb is slightly warm on the torso because the lightest catalog top is 0.29 clo against a 0.19 neutral.

## Open

- Climb targets assume a membrane outer (above), #374.
- Leg bias and regional weights, #375. A lower descent leg target would shrink the packed leg layer.
- The catalog has no side-zip insulated over-pants, the usual touring descent leg layer, so cold descents pack insulated resort ski pants.
- The climb's manual check doesn't carry its protection needs, so removing a shell in rain isn't flagged as incomplete. Touring has no `ireq.policy`, which is where running and XC pass them.
- In deep cold with no wind, the climb doesn't wear an owned hard shell for warmth, even when it falls short.
