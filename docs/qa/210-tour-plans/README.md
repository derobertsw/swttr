# Tour-day planning acceptance review (#210)

Reviewed October 18, 2026, against `origin/main` at `41da6b9`, including #314's drive estimates. The initial review used `af861c4`; final integration checks use `41da6b9`. The persisted plan shipped in [#295](https://github.com/derobertsw/swttr/pull/295); plan copying and itinerary reviews shipped in [#301](https://github.com/derobertsw/swttr/pull/301). The recorded product decisions are in [trip-tour-plans.md](../../trip-tour-plans.md), including retaining **Backcountry** as the activity label.

This follow-up fixes draft loss during background trip refreshes. Returning to the browser can reload the trip through `TripProvider`. Previously, a newer plan revision remounted the editor, resetting typed text; changing to another activity removed the editor entirely. The editor now retains the plan and day it opened against until it closes. The existing server conflict check still requires reviewing a newer saved plan before replacing it. The editor also shows the canonical meeting point, including a day-specific override, or explicitly says **Meeting point not set**. Focus can return to the saved-plan disclosure after an activity change.

## Contract and evidence

| Requirement | Implementation and automated evidence |
|---|---|
| One persisted plan per day, organizer writes, member reads, revision/author metadata | Migration 026, `trip-tour-plans.database.test.ts`, tour-plan route tests and `TourPlan.test.tsx`. Name-only saves, retries, reload summaries, stale revisions, unauthorized writes, cross-trip days and date changes are covered. RLS is enabled; browser roles cannot access the plan/receipt tables or mutation function. |
| Canonical trailhead, destination and stay remain separate | `accessPointFor` supplies the day override or destination access point to both Getting there and the Tour plan. `TourPlan.test.tsx` checks both and the editor's meeting point; day-page tests cover the shared summary. No routing request is required to save manual logistics. |
| Destination-local times and overnight offsets | `trip-tour-plans.test.ts`, database and route tests cover previous-day meets, next-day returns, destination IANA zones, DST abbreviations, unavailable zone lookup and return ordering. |
| Crew-entered metrics and optional point-to-point arrangements | Parser, summary, database and component tests cover units, duration, source labels, approach notes, pickup and return/check-in notes. Road routing does not supply ski times or difficulty. |
| Activity/destination/date edits preserve plans and preview impacts | `trip-itinerary.test.ts`, `trip-itinerary.database.test.ts`, itinerary route tests and `TourPlan.test.tsx` cover kept/in-use plans, Restore, destination review notes and stale previews. The conditions context in `trip-conditions.ts` records route, date, destination, access point and activity changes separately. |
| Copy day previews conflicts without copying completion | Itinerary tests cover Keep/Replace, target dates, every plan field and replaced revisions. Plan copies do not copy conditions reviews or preparation checks. |
| Recoverable saves and concurrent changes | Component tests cover field focus, failed saves retaining text/save identity, conflict inspection, explicit replacement and discard confirmation. Six refresh regressions cover a newer revision, removed plan, activity change, removed inactive plan, different day at the same date and another plan appearing while creating a draft. Saves retain the original revision/day until conflict review. |

## Verification

- Full suite: **163 files, 2,399 tests passed** with `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run` after integrating `main` at `41da6b9` (#314 drive estimates). The earlier run against `af861c4` passed 2,380 tests. Existing jsdom external-navigation notices do not fail tests.
- Focused plan/itinerary/API/day-page suite: **8 files, 217 tests passed**.
- Review follow-up: **3 files, 102 tests passed** across TourPlan, the day page and the tour-plan API. Six added cases cover removal of the inspected plan (including a different day at the same date and an initially empty draft), absence after save/delete conflicts, and focus return to the saved disclosure or day heading. Removal confirmation uses the inspected plan's objective and requires a fresh confirmation after review; it does not use the pending draft or original plan's name. Build, lint and diff checks were repeated successfully.
- `npm run build`: passed, including TypeScript and prerendering, with Next.js 16.4.0.
- `npm run lint`, `npm run knip` and `git diff --check`: passed. Knip reports its existing two configuration hints for `apple/**` and `macos/**`.

## Browser fixture checks

A temporary local Vite page imported the actual `DayTourPlan`, `TripSheet` and application CSS. Synthetic plan summaries came from `buildTourPlanSummary`; saves and conflict responses were simulated locally. No production trip data or provider requests were used. These checks verify component rendering and interaction; they do not establish production authentication or physical-device behavior.

- **320px, light:** meeting-point text wraps without horizontal overflow; the mobile drawer exposes the canonical point and keeps Save/Cancel accessible. A synthetic background update changes the saved route while the typed route stays intact. Save shows an alert; Review saved plan exposes the newer saved route and retains the draft. [Conflict screenshot](conflict-320.png).
- **390px, dark:** the member view shows Meet, Backup plan, Return target and access notes without entering an editor, with no organizer edit button. [Member screenshot](member-dark-390.png).
- **1280px, light:** Enter on Change tour plan opens the dialog and focuses Route or objective; Escape from a clean editor closes it and returns focus to Change tour plan. [Editor screenshot](editor-desktop.png).
- Temporary viewport overrides were reset after inspection.

## Remaining release acceptance

The implementation and local regression checks above are complete. Keep #210 open until signed-in organizer/member journeys against deployed migrations and physical iPhone keyboard/safe-area/VoiceOver checks are recorded. A 200% desktop zoom check and the six-person pilot in #205 have not been performed in this review. The fixture is not a substitute for those checks, and it makes no route-suitability or safety claim.
