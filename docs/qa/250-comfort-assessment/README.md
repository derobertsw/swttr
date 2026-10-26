# Consistent comfort assessment (#250)

Recommendations and manual outfit evaluation both call `evaluatePhase`. Its server-owned decision provides the status, summary, reasons and warnings used by the UI and ensemble scorer. The aggregate ensemble score is a weighted suitability heuristic; it cannot establish comfort. Every sport uses the phase's existing calibrated or compatibility targets; this change does not recalibrate metabolism or sport defaults.

The 0.353 clo / 0.18–0.31 clo running reproduction is warmer than recommended, with no significant-mismatch warning from that small excess alone. Near-target outfits say “Likely comfortable.” Local cold and excess warmth produce “Uneven warmth”; extra torso insulation never fills an uncovered required area. Required standalone clothing and functional protection can make an outfit incomplete even when numerical insulation is near target. Unknown thermal properties produce no comfort verdict or score.

The old +0.3 clo allowance is retained only as part of the separate significant-excess warning heuristic, together with the phase band width. It no longer extends the comfortable band. Whole-body warmth uses 0.01 clo numerical tolerance; local excess and cold retain 0.05 clo. The existing #152 shortfall score is preserved. Small excess retains the previous linear score; a smooth positive tail distinguishes severe excesses instead of flattening them all to zero. These are engineering fit heuristics, not physiological risk thresholds or confidence probabilities.

Catalog references are resolved on the server, including current arm and hood insulation and singleton-array relation shapes. Source-free/custom torso clo does not establish arm insulation and therefore cannot establish whole-outfit comfort. The existing evaporative-potential heuristic (#67) adds moisture reasoning without changing fabric clo or claiming a validated heat-balance model. Public catalog caching and owner-scoped custom queries remain in place.

Touring climb and descent are assessed independently. Carried layers contribute only after they are worn in a phase. Alpine retains its chairlift targets, helmet selection and capacity-aware regional warnings. Original weather/transition advice remains labeled separately after edits; current thermal/moisture warnings and explanations come from the current assessment. Pending, failed and malformed responses retain recoverable outfit state and hide the current numerical score, body-area statuses and reasons until a valid result arrives. A previous verdict is explicitly labeled as previous.

## Behavioral checks

- `comfort.test.ts`: the exact running reproduction, local cold and excess together, optional bare regions, meaningful shortfall scoring, severe excess ranking and moisture reasoning independent of clo.
- `assessment.test.ts`: automatic and manual scores, decisions, warnings, reasons and body-area statuses agree for all five sports at 56°F, 25°F, -15°F and 36°F rain, plus separate touring descent checks. A spoofed original arm value cannot override the actual worn catalog outfit.
- `ensembles/evaluate/route.test.ts`: catalog authority, singleton-array relations, optional accessory limits, hood contributions, missing/deleted properties, owner-scoped custom items and outages.
- `ScoreDisplay.test.tsx`, `LayerDisplay.test.tsx`, `LayerDisplay.phases.test.tsx`, and `useLayerEvaluation.test.ts`: score-only confidence is absent, warm/cold/uneven labels match the server, edits and phases stay separate, stale/failed checks recover, and malformed responses can be retried.
- Golden response changes expose the canonical assessment and replace inconsistent thermal component scores/warnings. Compared all 76 shared golden responses with the #247 branch baseline: selected garments, accessories and pack items are unchanged.

## Validation limits

Clothing and local targets remain estimates requiring field feedback. No new physiological model, injury prediction or sport calibration is claimed. The #250 branch now integrates `main`, including the merged #247 running selector and its reviewed performance, protection and clothing-gap fixes. It preserves upstream wind/motion and basic-clo calibration. It excludes concurrent XC and trip work from the original checkout. Full tests on the host's newer Node runtime use `NODE_OPTIONS=--no-experimental-webstorage` so jsdom supplies browser storage; CI uses the repository's documented Node 22 runtime.

## Recorded results

- Focused model/API/UI checks: 182 tests passed on the isolated branch.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed with the branch's locked Next.js 16.4.2 dependencies, including TypeScript and prerendering.
- Snapshot selection review: 76 compared responses retain the same selected garments, handwear, headwear and pack items.
- Repository lint: `npm run lint` passed with zero warnings.
- Full-suite coverage: 198 test files / 2,998 tests verified. The full run passed 197 files; the remaining file passed all 90 tests after replacing an obsolete assertion that treated whole-body fit as sufficient despite excess head insulation. The replacement explicitly checks the server's local-excess reason and warmer status.
- `git diff --check` passed.

## Main integration

After #247 was squash-merged, retargeting #352 to main exposed overlapping changes. The integration retains main's running selector, protection and clothing-gap behavior, restores #250's assessment contract and diagrams, and regenerates the response snapshots. Activity guidance remains first in the single-phase API response, followed by canonical assessment reasons. All 76 shared snapshots preserve main's selected garments, accessories and pack items.

The production build, typecheck, lint and Knip pass after integration; all 92 golden tests pass.

Full integration verification: `NODE_OPTIONS=--no-experimental-webstorage npx vitest run --maxWorkers=2` passed all 197 files / 3,028 tests. `npm run build`, `npm run typecheck`, `npm run lint`, `npm run knip`, and both staged and unstaged whitespace checks passed.
