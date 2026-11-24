# Wardrobe coverage

Wardrobe shows how far a person's gear goes: the share of a fixed set of activities and weather it dresses them for, how much of the gear does that work, and the largest gaps (#93, first version). `GET /api/wardrobe/coverage` works it out for the signed-in user; the code is in `src/lib/wardrobe-coverage/`.

## The grid

34 scenarios, version 1 (`GRID_VERSION`):

| Activity | Temperatures (°F) |
|---|---|
| Running, biking | 70, 50, 30, 10 |
| XC, alpine, backcountry skiing | 35, 15, −5 |

Each temperature is run twice: calm and dry (5 mph, 50% humidity), and windy and wet (15 mph, 90% humidity, rain above 32°F and snow at or below it). Every scenario uses moderate effort, the standard body metrics and neutral targets (no Run Warm or Run Cold), so the score depends only on the gear. Saved preferences and body metrics aren't read.

## How a scenario is judged

Each scenario is what the sport's recommendation route would answer for the wardrobe with `use_wardrobe_only`: the same gear pool, the same activity filter and the same `recommend` call, run in-process rather than over HTTP. A test checks every scenario against the real routes. Nothing in the recommendation pipeline changes.

The scenario is **covered** when the engine's own verdict for every phase (both the climb and the descent for backcountry skiing) is "Likely comfortable", or "Warmer than recommended" by no more than one target band's width (the engine's moderate severity), which venting or leaving a layer off handles. Otherwise it's a **gap**, for the first of these reasons:

1. No modeled gear for the activity.
2. A required item reported missing: a helmet, or a clothing requirement nothing in the wardrobe matches.
3. An incomplete outfit: no clothing for the torso or legs, or without the wind or rain protection the conditions need.
4. Too cold: a body part, or the whole body, under its minimum.
5. Too warm: over the upper target by more than the band's width.

Being a little cold is a gap, being a little warm isn't: a layer can come off but can't be added from nothing.

## Scores

- **Coverage**: covered scenarios ÷ 34.
- **Efficiency**: the share of the wardrobe's modeled items worn or packed in at least one covered scenario. Modeled items are included catalog garments with usable thermal data, handwear and headwear; custom items aren't modeled by the engine, so they don't count. The issue's ratio, covered scenarios per item, is returned as `covered_per_item`, but it isn't shown: it isn't bounded, so it doesn't read as a score.
- **Doing the most work**: the items in the most covered scenarios.

Gaps are grouped by activity, reason, phase, weather and the first missing item, then put in plain language, for example "No outfit for alpine skiing at 15°F and below: arms and legs too cold". The section shows the three largest.

## Speed

The scenarios run in-process on one load of the wardrobe. On the live catalog (2026-11-23), a 29-item wardrobe took 10–40 ms to evaluate and the whole 191-item catalog about 0.9 s; loading the wardrobe is a few database reads. Results are cached in memory for 10 minutes per user and wardrobe contents (the included items), so reopening Wardrobe doesn't run the grid again, and any add, removal or exclusion runs it fresh.

## Not in this version

- Comparing with a friend's wardrobe. It needs sharing and consent.
- Personal settings in the grid (Run Warm or Run Cold, body metrics, other efforts).
- Footwear and custom items, which the engine doesn't model.
