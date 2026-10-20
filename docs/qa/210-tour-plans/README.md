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

## October 19 follow-up: production organizer acceptance and conflict recovery

Reviewed current `origin/main` at `8b2bb55` in an isolated worktree. Created one separate, synthetic production trip, **Tour plan acceptance #210**, for February 13–14, 2027. The [saved QA day](https://swttr.vercel.app/trips/a1b3d843-1b40-4a4b-8e02-45f0494ea9b7/days/2027-02-14) remains available for the post-deployment check. Its coordinates and notes are test inputs, not a real tour or parking recommendation. No invitations or check-in messages were sent.

### Signed-in organizer checks

- Saved a name-only plan with **Meeting point not set**, reloaded and opened the persisted plan.
- Saved a previous-day 18:30 meet and next-day 15:00 return. Both summaries retained the destination's `America/New_York` timezone, EST, actual dates and explicit day offsets.
- Saved distance, ascent, duration, a hut approach, critical access notes, a backup, check-in crew notes and point-to-point pickup notes. The backup/access/return notes were readable without editing; More tour details exposed the metrics as **Crew estimate** and pickup arrangements. The approach appeared separately from the road drive even without a starting stay.
- Copied the full plan to the explicitly selected next date after the server review. The copied wall-clock times were relabeled relative to that date. Changed its activity to Alpine, expanded the saved plan, and restored Backcountry without losing its fields.
- Set a manual access point for the copied day only after reviewing day-only/shared scope. Getting there and both Meet summaries all showed **Entered coordinates**; the other day retained its unset access point. The map URL used the entered access coordinates.
- Checked the saved summary at 390px and the editor at 320px; document width equaled viewport width in both cases. [390px summary](production-summary-390.jpg), [320px retained draft after timeout](production-timeout-320.jpg). Viewport overrides were reset afterward. These browser checks do not establish physical-device keyboard, safe-area or VoiceOver behavior.

### Defect found and prepared fix

Concurrent edits exposed a production-only failure missed by PGlite and mocked API tests: stale saves timed out instead of returning the review action. The draft survived and the newer saved plan stayed intact. The result reproduced in a single browser tab after advancing only the synthetic QA plan through its existing mutation function. A direct SQL probe confirmed that the function raises `40001` for the stale revision, without changing the plan.

Production reports **PostgREST 14.5**. Supabase documents [infinite transaction retries for application-raised `40001`](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b), and recommends a non-retryable code such as `PT409`. The prepared migration, [20261020000407_trip_conflicts_no_retry.sql](../../../supabase/migrations/20261020000407_trip_conflicts_no_retry.sql), changes only that literal in an explicit list of existing trip functions. This includes the tour plan, copy/itinerary/date reviews, access points, stays, drive overrides, conditions and packing, which share the defect. It preserves function OIDs, signatures, ownership, security settings and grants; no records, checks, locking or receipt semantics change. The API accepts both codes as the same recoverable 409 during rollout. Unrelated genuine serialization errors are untouched.

The follow-up also makes the inactive plan's Restore control organizer-only, consistent with its Add/Change controls. Members can expand and read the plan, with **Managed by the organizer**. This does not change the existing permission to edit a day's activity through the shared itinerary controls.

Production read-only checks verified RLS and revoked browser-role table/function access. Migration 026 is recorded numerically; the copy and conditions migrations are already deployed under timestamp versions `20261017191146` and `20261017191151`, respectively. Their absent numeric 030/031 history rows do not mean the migrations are missing. The security advisor's existing [RLS-without-policy informational notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) reflect the server-only access model; this change adds no browser grants.

### Required rollout and remaining acceptance

Local verification after this follow-up: **168 test files / 2,493 tests passed**, including the migrated Postgres conflict cases, dual-code API recovery, read-only member UI, and migration security/idempotence check. `npm run build` (Next.js 16.4.0), `npm run lint`, `npm run knip` and `git diff --check` passed. Knip retains the existing `apple/**` and `macos/**` configuration hints; the full suite retains its non-failing jsdom navigation notices.

1. Deploy the API's dual-code handling before applying the migration. An older deployment otherwise treats `PT409` as a generic error rather than offering the review.
2. Apply the new migration and record its timestamp version using the normal migration workflow. It is idempotent and can run with any subset of the explicitly named trip functions present. Do not rerun older function-creating migrations afterward: they would restore `40001`.
3. Identify and stop the existing retrying requests after approval. Inspection during this test found four `authenticator` / `PostgREST 14.5` sessions executing `mutate_trip_tour_plan`: PIDs **2329830, 2329948, 2329924, 2329863**. Revalidate each PID, role, application and query before any termination; do not stop other sessions. Supabase notes that replacing the function does not stop already-running retry loops. Automatic approval review rejected session termination because production service could be disrupted and explicit authorization was absent. No sessions were terminated and no production function definitions were changed in this review.
4. Reopen the synthetic QA day's editor, advance its saved revision, then save the stale draft. Confirm a prompt 409, **Review saved plan**, retained text, and an explicit reviewed replacement. Repeat a stale copy/itinerary review. Do not perform more pre-migration stale-write probes; they can start more retry loops.

Signed-in organizer persistence, read-mode discovery, copy, activity/Restore and manual meeting-point checks are now recorded above. Production conflict recovery remains blocked on rollout, and a signed-in member journey, hotel-to-trailhead integration, 200% desktop zoom, physical iPhone/VoiceOver checks and #205's six-person pilot remain unverified. Keep #210 open.
