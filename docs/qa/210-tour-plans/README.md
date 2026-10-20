# Tour-day planning acceptance review (#210)

**Current status, October 19, 2026:** [#320](https://github.com/derobertsw/swttr/pull/320) is merged and deployed, its conflict-code migration is applied, and production save/copy recovery and the hotel-to-trailhead journey have passed. This record includes historical evidence below; the [remaining acceptance checks](#remaining-acceptance-checks) are still open. All user-facing dates in this record use America/New_York unless stated otherwise.

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

## October 18 acceptance state (historical)

At the end of the October 18 review, signed-in production journeys, 200% desktop zoom, physical iPhone keyboard/safe-area/VoiceOver checks and #205's six-person pilot were unverified. The production checks below supersede that status where explicitly recorded; fixture checks remain distinct from production and physical-device evidence.

## October 19 follow-up: production organizer acceptance and conflict recovery

Reviewed current `origin/main` at `8b2bb55` in an isolated worktree. Created one separate, synthetic production trip, **Tour plan acceptance #210**, for February 13–14, 2027. The [saved QA day](https://swttr.vercel.app/trips/a1b3d843-1b40-4a4b-8e02-45f0494ea9b7/days/2027-02-14) remains available for the post-deployment check. Its coordinates and notes are test inputs, not a real tour or parking recommendation. No invitations or check-in messages were sent.

### Signed-in organizer checks

- Saved a name-only plan with **Meeting point not set**, reloaded and opened the persisted plan.
- Saved a previous-day 18:30 meet and next-day 15:00 return. Both summaries retained the destination's `America/New_York` timezone, EST, actual dates and explicit day offsets.
- Saved distance, ascent, duration, a hut approach, critical access notes, a backup, check-in crew notes and point-to-point pickup notes. The backup/access/return notes were readable without editing; More tour details exposed the metrics as **Crew estimate** and pickup arrangements. The approach appeared separately from the road drive even without a starting stay.
- Copied the full plan to the explicitly selected next date after the server review. The copied wall-clock times were relabeled relative to that date. Changed its activity to Alpine, expanded the saved plan, and restored Backcountry without losing its fields.
- Set a manual access point for the copied day only after reviewing day-only/shared scope. Getting there and both Meet summaries all showed **Entered coordinates**; the other day retained its unset access point. The map URL used the entered access coordinates.
- Checked the saved summary at 390px and the editor at 320px; document width equaled viewport width in both cases. [390px summary](production-summary-390.jpg), [320px retained draft after timeout](production-timeout-320.jpg). Viewport overrides were reset afterward. These browser checks do not establish physical-device keyboard, safe-area or VoiceOver behavior.

### Defect found and deployed fix

Concurrent edits exposed a production-only failure missed by PGlite and mocked API tests: stale saves timed out instead of returning the review action. The draft survived and the newer saved plan stayed intact. The result reproduced in a single browser tab after advancing only the synthetic QA plan through its existing mutation function. Before the fix, a direct SQL probe confirmed that the function raised `40001` for the stale revision, without changing the plan.

Production reports **PostgREST 14.5**. Supabase documents [infinite transaction retries for application-raised `40001`](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b), and recommends a non-retryable code such as `PT409`. The migration shipped in #320, [20261020000407_trip_conflicts_no_retry.sql](../../../supabase/migrations/20261020000407_trip_conflicts_no_retry.sql), changes only that literal in an explicit list of existing trip functions. This includes the tour plan, copy/itinerary/date reviews, access points, stays, drive overrides, conditions and packing, which share the defect. It preserves function OIDs, signatures, ownership, security settings and grants; no records, checks, locking or receipt semantics change. The API accepts both codes as the same recoverable 409 during rollout. Unrelated genuine serialization errors are untouched.

The follow-up also makes the inactive plan's Restore control organizer-only, consistent with its Add/Change controls. Members can expand and read the plan, with **Managed by the organizer**. This does not change the existing permission to edit a day's activity through the shared itinerary controls.

Production read-only checks verified RLS and revoked browser-role table/function access. Migration 026 is recorded numerically; the copy and conditions migrations are already deployed under timestamp versions `20261017191146` and `20261017191151`, respectively. Their absent numeric 030/031 history rows do not mean the migrations are missing. The security advisor's existing [RLS-without-policy informational notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) reflect the server-only access model; this change adds no browser grants.

### Production rollout completed

Local verification after this follow-up: **168 test files / 2,493 tests passed**, including the migrated Postgres conflict cases, dual-code API recovery, read-only member UI, and migration security/idempotence check. `npm run build` (Next.js 16.4.0), `npm run lint`, `npm run knip` and `git diff --check` passed. Knip retains the existing `apple/**` and `macos/**` configuration hints; the full suite retains its non-failing jsdom navigation notices.

- Merged #320 as `f766f581d17c19f005435948b84967094bad028d`; Vercel reported the [main-branch production deployment](https://vercel.com/derobertsws-projects/swttr/Hmn9Nu63UT4oeR3T1MLQR8UZrssF) successful before the migration was applied.
- Applied the committed conflict-code migration to production. Supabase's migration tool records it as version **20261020001231**, name **trip_conflicts_no_retry**; the repository filename records its earlier creation timestamp. This difference is expected.
- Compared all **13 affected functions** before and after: function identities, signatures, ownership, security settings and grants matched. Source hashes matched the intended literal-only substitution. A subsequent catalog check found zero public function bodies still containing the deliberately raised `'40001'` literal.
- With explicit user authorization, revalidated the four identified retry sessions. PIDs **2329863, 2329924 and 2329948** were terminated; **2329830** also exited. A subsequent lookup of all four returned no rows. No other sessions were targeted.
- Rollout order for another environment remains API dual-code support first, then the migration. Do not rerun earlier function-creating migrations afterward: they would restore `40001`.

### Production conflict-recovery checks

1. Opened the QA day's editor and typed a replacement objective, then advanced only its saved plan through the existing mutation function.
2. Saving the stale editor exposed **Review saved plan** in approximately **1.2–1.3 seconds** and retained the typed objective. This is the client's HTTP 409 recovery path; before deployment it reached the 20-second timeout. [Recovered conflict at 320px](production-conflict-recovered-320.jpg).
3. Review saved plan showed the newer saved route while keeping the draft. Explicitly saved the replacement as **QA recovered plan**, reloaded, and confirmed persistence.
4. Opened a copy from February 14 to February 13 with **Also copy the tour plan**, selecting **Keep** for the existing target plan. Changed the target plan through its normal signed-in editor in another tab.
5. Submitting the stale copy review showed **The trip changed since you reviewed it. Review the changes again.** within about **four seconds**, refreshed the options and retained Keep.
6. Saved the refreshed review and observed **Copied to 1 day.** Reloaded both dates: the target retained **QA target plan changed after copy review**, and the source retained **QA recovered plan**.

These timings are browser-observed checks on one synthetic trip, not performance guarantees. Extra test tabs were closed and temporary viewport overrides reset afterward.

## Remaining acceptance pass on October 19

Ran against `origin/main` at `8e4b389`, which includes #320, using the signed-in organizer and the same separate QA trip. No application or database implementation changed in this docs-only follow-up.

### Hotel-to-trailhead integration: passed

Checked that the QA trip had no existing stays, then added **QA hotel — acceptance only**, check-in February 13 and check-out February 14, at manually entered test coordinates `44.4654, -72.6874`. Booking status stayed **Not booked**. The night preview explicitly assigned February 13 and made the hotel February 14's starting point before saving.

After saving and reloading the day:

- **Starting from** showed the QA hotel on checkout morning; **Staying tonight** remained **Not planned yet**.
- **Getting there** retained the separate day access point at `44.53, -72.78`, and both Meet summaries used that point. Stowe remained the activity destination and **QA recovered plan** remained the tour objective.
- The real road provider returned **About 17 min drive · 7.5 mi · one way**, with calculation age and Geoapify/OpenStreetMap attribution. This is a road estimate between synthetic test endpoints, not an estimate of the ski/walk approach.
- The Directions URL used `saddr=44.4654,-72.6874` and `daddr=44.53,-72.78`, with driving mode. It targets the access point, not the route objective or a hut. URL targeting was verified; a physical Maps-app handoff was not part of this check.
- **Approach (ski or walk)** stayed separately labeled. The hotel assignment did not alter the saved backup, pickup, return/check-in notes or destination-local overnight labels. This fixture combines independent test cases and is not a real itinerary.
- More tour details still showed **6.2 mi · 2,400 ft ascent · 5 h 45 min**, labeled **Crew estimate**, and the separate exit/pickup note. Those crew-entered figures remained distinct from the 17-minute / 7.5-mile road estimate.
- At 390px, document width and scroll width were both 390px. [Phone evidence](production-hotel-390.jpg), [desktop evidence](production-hotel-desktop.jpg).

### Keyboard and automated role checks: passed within their stated scope

At a 1280px desktop viewport in the production browser, Enter on **Change tour plan** opened the editor and focused the `objective` input. Escape from the clean editor closed it and restored focus to **Change tour plan**. This is keyboard/focus evidence, not a VoiceOver check or a 200% zoom check.

Re-ran the existing TourPlan, TripStays, DriveEstimate, day-page, tour-plan API and tour-plan Postgres suites: **6 files / 165 tests passed** with `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run` and those six file paths. Member cases cover readable meeting/backup details, no organizer Add/Change/Restore controls, an accessible inactive plan, actionable personal kit controls, and refused member writes/cross-trip references. Those use synthetic identities and are **automated role coverage**, not a signed-in second-account journey. No new tests or code were added.

The docs-only follow-up also passed `npm run build` with Next.js 16.4.0, relative documentation-link validation and `git diff --check`.

### Remaining acceptance checks

| Check | Current status | Needed to complete |
|---|---|---|
| Signed-in member journey | Pending: no independent member test session was supplied during this pass. | A signed-in existing test member with access to the QA trip; verify the shared plan and stay read-only controls, and that personal kit/check changes affect only that member. |
| Actual 200% desktop zoom | Pending, as explicitly requested by the user after native computer-use permissions were unavailable. | A browser session with native control, set to actual 200% zoom. A narrow viewport is not a substitute. |
| Physical iPhone keyboard, safe areas and VoiceOver | Pending: no physical-device access was supplied during this pass. | A real iPhone with organizer/member sessions and a human/device operator. Browser viewport evidence does not establish these behaviors. |
| Six-person pilot in #205 | Pending: no participants or pilot results were supplied. | Six actual participants exercising the shared day, with recorded outcomes and any defects. Six automated or synthetic users do not constitute a pilot. |

## Handoff for the open checks

1. **Member:** open the QA day as an existing member. Find the meeting point and backup without opening edit mode; confirm no tour-plan/stay/access-point edit controls. Change a personal kit/check, reload, and compare with the organizer's personal state. On an Alpine day, expand the saved plan without a Restore control. Existing shared itinerary activity permissions remain as documented in [trip-editing.md](../../trip-editing.md).
2. **200% zoom:** record browser, zoom percentage and window size. Read logistics and the saved plan, open/close the editor by keyboard, and verify labels, Save/Cancel and focus remain usable without clipped controls or horizontal page scrolling. Restore the original zoom afterward.
3. **iPhone:** record device, iOS version and browser/native shell. Open the editor with the software keyboard visible; reach the optional sections and Save/Cancel, rotate once, and check safe-area clearance. With VoiceOver, find Meet/Backup in summary mode, open the editor, inspect field labels/focus, and verify a deliberate failed save announces its error while retaining input. Use only the QA trip.
4. **Pilot:** record participant count, roles and dates. Each participant finds the meeting point/backup, reads the hotel-to-access-point context, and completes their personal preparation flow. Record observed completion, confusion and recovery; do not infer success from backend records alone.

Keep **#210 open** until the pending checks pass or the user explicitly changes the acceptance scope. This PR records completed rollout, organizer, hotel and keyboard work without treating the remaining checks as passed.
