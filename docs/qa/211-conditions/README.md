# #211 acceptance record: official conditions links and dated reviews

Audited against `origin/main` at `5f2b8d6` ("Bump next", #398, November 17, 2026), after all three #211 PRs merged:

- #302: sources on a day and personal reviews (migration `031_trip_conditions.sql`)
- #381: reuse across days, Copy day with sources, the date-change review (migration `20261116210000_trip_conditions_reuse.sql`)
- #379: 27 verified official avalanche centers and Avalanche Canada suggestions (no migration)

Both migrations are applied in production. Each acceptance box on #211 was checked against the code and its tests. The PR descriptions were read for orientation only; they aren't evidence. Every box has one status:

- **Implemented:** the behavior is in the code and a test covers it.
- **Manual check:** the code and tests exist, but only a signed-in person, a real device, VoiceOver or participants can confirm it. The check is named.
- **Gap fixed:** a real gap, fixed in this PR, with a test that fails on `main`.
- **Gap left:** a real gap, not fixed here, with the option I recommend.

Line numbers are for this branch. "The day page" is `src/app/trips/[id]/(plan)/days/[date]/page.tsx`. `DayConditions.tsx`, `ConditionsSourceDays.tsx` and `OfficialCenterPicker.tsx` are in `src/components/trips/`.

## Summary

| Box | Status |
|---|---|
| 1. Source fields, organizer-added links, verified directory, reuse with a date preview | Implemented (one assertion added) |
| 2. Suggestions need confirmation; never the nearest center | Implemented (one test added) |
| 3. Links open in the browser on web and iOS; invalid or removed links can be fixed; empty coverage | **Gap fixed** (removed source on a reused day) and **Gap left** (the iPhone app, owned by #146) |
| 4. Explicit per-person review, scoped to the plan; opening a link or coming back never records | **Gap fixed** (coming back to an open form) |
| 5. Review time apart from bulletin times; no metadata SWTTR doesn't have | Implemented |
| 6. Relevant changes mark reviews "Plan changed — review again"; cosmetic ones don't; a copy starts unreviewed | Implemented |
| 7. Expired validity, failed sources and unavailable weather shown apart; a review never claims a bulletin is current | Implemented |
| 8. Review status, comfort and packing stay separate; no "Safe", go/no-go or safety score | Implemented |
| 9. The listed test cases | Implemented (two tests added) |
| Delivery quality: authorization, failed saves, conflicts, keyboard, labels, announced states, phone and desktop | **Gap fixed** (button label and wrapping fixes); VoiceOver and devices are **Manual check** |

Counts: 6 Implemented, 2 Gap fixed, 1 Gap fixed with a Gap left (box 3), and the delivery-quality row Gap fixed with manual checks.

### What this PR changes

1. **A review could be recorded against a plan the person never saw** (box 4). Record my review has an Open forecast link. Reading the forecast in its tab and coming back reloads the trip behind the open form (`TripProvider` revalidates on focus). The form then sent the reloaded plan's `context_key`, so a route or source change made meanwhile was recorded as reviewed, with no "changed since you opened it". Corrections had the same problem with the person's latest entry. Example: Casey opens Record my review for MWAC, reads the bulletin on her phone, and the organizer changes the route to Right Gully. On `main`, Save review recorded it against Right Gully. Now the form keeps the plan and entry it opened with (`DayConditions.tsx:516-523`, sent at `:538-541`), the server says the plan changed (409), and Check the latest (`:553`) records against the plan as it is now, with the note kept.
2. **An edit to a reused source could offer a save that always fails** (box 3). A source listed on Friday and Sunday, removed from Friday in another session while the organizer edits it from Friday: Save source showed "Save on every day it's listed?" for Sunday only, and Save on 1 day was then refused every time. The edit review is now refused too (409), so the editor goes straight to Check the latest, which offers to save the typed source as a new one on Friday (`src/app/api/v1/trips/[id]/days/[date]/conditions/route.ts:62-67`).
3. **Use on other days didn't start with its visible label** (delivery quality). Its accessible name was "Use Mount Washington Avalanche Center on other days", so saying "Use on other days" with Voice Control didn't match (WCAG 2.5.3). It's now "Use on other days: Mount Washington Avalanche Center" (`DayConditions.tsx:240`). Every other Conditions button already started with its label.
4. **Conditions pushed a 320px phone sideways at 200% text** (delivery quality). Record my review, Use on other days, Add a saved source, Choose an official center and Use Parks Canada avalanche forecast kept one line, up to 47px past the screen. They now wrap like the touring equipment buttons from #337 (`DayConditions.tsx:33`, `OfficialCenterPicker.tsx:17`).

Tests that pin behavior that was already right: "Added by the organizer" on each row, coming back from a source records nothing (through `TripProvider`), and no suggestion out of season.

## Acceptance boxes

`trip-conditions.ts` is `src/lib/trip-conditions.ts`; "031" is `supabase/migrations/031_trip_conditions.sql` and "reuse migration" is `supabase/migrations/20261116210000_trip_conditions_reuse.sql`. "Browser" points to [Browser checks](#browser-checks).

| # | Box | Status | Evidence | Tests |
|---|---|---|---|---|
| 1 | Name, category, URL and area for avalanche, weather and access; organizer-added links marked; the built-in directory verified; reuse on selected days with a date preview, carrying source details only | Implemented; assertion added | Tables `trip_conditions_sources` and `trip_day_conditions_sources` (031:22, :40). `parseConditionsSource` (`trip-conditions.ts:24`) takes a category, name, optional area and an http(s) link. Each row says "Added by the organizer" (`DayConditions.tsx:195`). The directory is `src/lib/avalanche-centers.ts:11-58`, dated `VERIFIED_ON = "2026-11-16"`, with how each link was checked in `docs/trip-conditions.md`. Reuse: `previewConditionsAttach` (`trip-conditions.ts:225`), `attach_trip_conditions_source` (reuse migration:36), `AttachSourceSheet` (`ConditionsSourceDays.tsx:50`). | `trip-conditions.database.test.ts` "adds a source to the trip and the day…", "refuses another category, a blank name and a link that isn't http or https"; `avalanche-centers.test.ts` "has unique centers, each one a valid avalanche source with an official https link"; `trip-conditions-reuse.database.test.ts` "brings no review from another day…"; `DayConditions.test.tsx` "lists a source on other days after the server's review, never with reviews", "shows each source's type, area and link…" (**now also** "Added by the organizer"). Browser: organizer, reuse. |
| 2 | Regional suggestions need confirmation; never the nearest center; no fixed boundary without data | Implemented; test added | A suggestion only comes from an area that contains the place today (`avalanche-centers.ts:162`), never the nearest. Choosing one only fills the name and link (`OfficialCenterPicker.tsx:42-46`); nothing is stored until Save source, and the source keeps the area the organizer types. The picker says areas change through the season and to check the map covers the route. | `avalanche-centers.test.ts` "suggests nothing for a place just outside an area or in a hole: never the nearest one", "doesn't suggest a U.S. center…", **new** "suggests nothing out of season, when Avalanche Canada publishes no forecast areas"; `OfficialCenterPicker.test.tsx` "fills in a suggestion only when the organizer uses it, and saves it only with Save source". Browser: centers. |
| 3 | Links open in the browser on web and iOS; invalid or removed links have an editable recovery path; empty coverage says "Add/check an official source" | **Gap fixed** (web); **Gap left** (iPhone app) | Web: each link is `target="_blank" rel="noopener noreferrer"` (`DayConditions.tsx:191`, `:592`). Invalid links are refused with the Link field focused and the source kept; a source removed while being edited goes to Check the latest, which saves it again as a new source (`DayConditions.tsx:415`). **Gap fixed:** for a source on several days, the edit review is now refused too (route.ts:62-67, fix 2). Empty days say "No sources yet. Add or check an official source…" to the organizer and "Check an official source before you go…" to members (`DayConditions.tsx:139-140`). **Gap left:** the iPhone app has no `WKUIDelegate` (none in `ios/App`), so a `target="_blank"` link does nothing there. #146 owns it; #235 found the same for map links. | **new** route test "refuses to review an edit from a day the source was removed from…" (fails on `main`); `DayConditions.test.tsx` "focuses the field the server rejects and keeps the input", "asks the organizer to add an official source, and members to check one". Browser: organizer, recovery. |
| 4 | Explicit "I reviewed this source" per source and date, scoped to the plan and source; optional note; "You reviewed…" and "Alex recorded a review…" with time; one person's review never marks another's; opening a link or coming back never records | **Gap fixed** | The review route compares the plan the person saw with the plan now (`reviews/route.ts:44-46`), and `record_trip_conditions_review` checks it again under the trip lock (031:240-256). Rows say "You reviewed this source Fri Jan 8, 6:12 PM" and "Casey recorded a review · …" (`DayConditions.tsx:214`, `:253`). The summary counts only your own current reviews (`:110`, `:144`). Nothing records except Save review. **Gap fixed:** the form now keeps the plan and entry it opened with (fix 1). | **new** "records against the plan the form opened with when the trip reloads behind it…" and "corrects only the entry the form opened from…" (both fail on `main`); **new** day page "records no review when a member opens a source and comes back to the day (#211)"; "records a member's review only from Record my review, never from opening the link"; "keeps the crew's reviews collapsed, each attributed, without counting them as yours"; `trip-conditions.database.test.ts` "keeps each person's reviews apart, organizer included". Browser: review, crew, recovery. |
| 5 | User review time apart from bulletin issue/validity; only attributed metadata, else "not available in SWTTR" | Implemented | SWTTR reads no bulletin, so every row says "Validity not available in SWTTR — check the source." (`DayConditions.tsx:194`). The review time is when it's saved (031:258); a correction keeps it (:265). Avalanche Canada's ratings and bulletin times are never read into SWTTR (`avalanche-centers.ts:89-115`). | "shows each source's type, area and link without a validity it doesn't have"; `avalanche-centers.test.ts` "never reads ratings into a suggestion"; `trip-conditions.database.test.ts` "corrects the note and withdraws as new entries that keep the review's time and plan". Browser: organizer, centers. |
| 6 | Date, route/access or source changes mark reviews "Plan changed — review again" with the reason, keeping history; note fixes and hotel-only changes don't; a copy says "No review recorded for this day" | Implemented | `conditionsContext` (`trip-conditions.ts:53`) records date, destination, activity, access point, the tour plan's route name and link, and the source's link and area. Stays aren't in it at all, so a hotel change can't make a review stale. `staleReasons` (`:86`) names each change. Copy day lists sources without reviews (`trip-itinerary.ts:607-622`; reuse migration:115-145). | `trip-conditions.test.ts` "names each relevant change", "ignores notes, times, the backup plan, the stop's name and the source's name"; `trip-conditions.database.test.ts` "accepts it after changes that don't make a review stale"; reuse "lists the day's sources on each day it's copied to, with no reviews…"; day page "lets the organizer list the day's conditions sources on the copies too, never their reviews (#211)". Browser: changes, reuse, copy. |
| 7 | Expired validity, failed sources and unavailable weather shown independently; a prior review can't claim a bulletin is current | Implemented | No validity is known, so nothing can expire. "A recorded review notes who looked at a source and when. It doesn't mean the forecast is current or the plan is safe." (`DayConditions.tsx:155`). Weather has its own error and Retry weather; Avalanche Canada failing only removes the suggestion (`avalanche-centers.ts:159`). A failed read of the conditions tables fails the whole trip load rather than hiding a source (#302's decision); see the note under [Bugs found, not fixed](#bugs-found-not-fixed). | `avalanche-centers.test.ts` "says suggestions are unavailable when %s…"; `OfficialCenterPicker.test.tsx` "keeps the typed source when the list can't load…"; route test "loads trips before migration 031 with no sources, but fails rather than hide sources on other errors". Browser: organizer, centers. |
| 8 | Review status, clothing comfort and packing completion stay separate; no "Safe", go/no-go or route-safety score | Implemented | Conditions is its own section between the tour plan and Weather; My kit and My equipment are separate sections with their own wording. Nothing computes a verdict. | day page "leads a backcountry day with its route and your conditions reviews, and puts the tour before clothing"; #329's audit row 6 for #334. Browser: organizer (no verdict anywhere on the day). |
| 9 | Tests for absent/reused sources, unsupported region, out of season, stale/unknown metadata, relevant vs cosmetic changes, two reviewers, external-browser return, correcting/withdrawing your own review, unauthorized edits | Implemented; two tests added | Absent: "asks the organizer to add an official source…". Reused: the reuse tests above. Unsupported region: "doesn't suggest a U.S. center…" and "suggests nothing for a place just outside an area…". Out of season: **new** test (box 2). Unknown metadata: box 5. Relevant vs cosmetic: box 6. Two reviewers: box 4. External-browser return: **new** day page test and fix 1's tests. Correct/withdraw: "corrects the note and withdraws from the latest entry…", "records again after a withdrawal, but corrects or withdraws only a current review". Unauthorized: route tests "lets members read but not change sources", "doesn't disclose the trip to %s users"; database "is organizer only…", "can't attach another trip's source or day", "is for the organizer and current members, on a source on this day". | as listed |
| — | Delivery quality: server-side ownership and cross-trip checks, kept input after failed saves, conflicts, mobile and desktop, keyboard, labels, announced save and error states | **Gap fixed** (fixes 3 and 4); **Manual check** for VoiceOver and devices | Server checks above. Failed saves keep input and the save identity; conflicts are 409 with Check the latest. Status messages are a polite live region (`DayConditions.tsx:135`); errors are `role="alert"` in the sheet (`:453`, `:583`). Radix hides the page behind an open sheet, but the `aria-hidden` package keeps `[aria-live]` regions exposed, so "Review recorded." isn't lost (checked in the browser). | **new** "starts each action's spoken name with the words on its button" and "lets its buttons wrap…" (both fail on `main`); "keeps the note and its save identity after a failure…"; "asks before discarding a note". Browser: failures, keyboard, layout. |

### Boxes that could be ticked now

Boxes 1, 2, 4, 5, 6, 7, 8 and 9. Box 3 waits on #146 for the iPhone app. The delivery-quality items left are VoiceOver and a real phone (below).

## Browser checks

This is web evidence only: headless Chrome driving the real day pages with fictional fixture trips. It isn't device, VoiceOver, signed-in, production or participant evidence. Those are under [Untested surfaces](#untested-surfaces).

| | |
|---|---|
| Revision | `5f2b8d6` plus this PR's fixes. The "before" for each fix was measured on `main`'s code in an earlier run of the same script. |
| Server | `next dev --turbopack` (Next 16.4.6) from this worktree on `localhost:3431`, with [`shim.patch`](shim.patch) applied while testing and reverted before commit |
| API | The app's own `/api/v1/trips/*` route handlers, run by [`api.mjs`](api.mjs) on `127.0.0.1:34312` |
| Database | [`db.mjs`](db.mjs): PGlite (in-memory Postgres) with **every migration in `supabase/migrations` applied**, behind the part of the Supabase client the trip code uses. Unlike #337's fake, saves run the real SQL functions: `mutate_trip_conditions_source`, `record_trip_conditions_review` (with its under-lock plan check), `attach_trip_conditions_source`, `edit_trip_itinerary_reviewed`, `mutate_trip_tour_plan` and `set_trip_day_notes`. |
| Browser | Headless Chrome 157 over the DevTools protocol ([`run.mjs`](run.mjs), with #337's `cdp.mjs`). Host resolution is limited to this machine, so a source opened in a new tab, Clerk's script and any font fail to load and no real site is reached. |
| Providers | Stubbed in `api.mjs`: Open-Meteo answers time zones but its forecast is down (503) the whole run; Avalanche Canada answers one fictional "Glacier" area (with ratings, which must never show); routing fails. |
| Widths | 320 and 390 (phone, touch), 1440 (desktop, mouse); 100% and 200% text (Chrome's default font size 32px; the root font size measured 32px) |

### Fixtures

[`fixtures.mjs`](fixtures.mjs). Everything is fictional; the place names are public mountain areas.

- **Presidential tour weekend** (`00000211-…-0001`), Fri Jan 8 – Sun Jan 10 2027, all Backcountry at Pinkham Notch (with an access point). Friday's tour plan is Tuckerman Ravine with a route link; Saturday's is Gulf of Slides. Alex is the organizer (`user-alex`); Blair and Casey are members. Zoe (`user-zoe`) isn't on the trip.
- **Rogers Pass tour** (`…-0002`), Fri Jan 15 2027, with the day's own access point inside the fictional Glacier area. Alex organizes; Blair is a member.

No source or review is seeded. The script adds them through the pages, as people would, and in a few places through the API as "another session" (the organizer changing the route while a member's form is open, for example).

### Re-running

From the worktree root, with dependencies installed, `.env.local` linked, and nothing else on ports 3431, 34312 or 39431:

```sh
git apply docs/qa/211-conditions/shim.patch
API_PORT=34312 node docs/qa/211-conditions/api.mjs &
./node_modules/.bin/next dev --turbopack --port 3431 &
BASE=http://localhost:3431 API=http://127.0.0.1:34312 CDP_PORT=39431 OUT=/tmp/qa211 node docs/qa/211-conditions/run.mjs
# stop both servers, then:
git apply -R docs/qa/211-conditions/shim.patch && rm -rf .next/dev
```

The groups run in order on one database, each building on the last: `organizer review crew changes reuse copy centers recovery failures access keyboard layout`. Starting with `organizer` resets the database. Results go to `OUT/results.json`, screenshots to `OUT/*.png`. `POST /__qa/reset`, `/__qa/overrides`, `GET /__qa/log` and `POST /__qa/sql` (a read-only query) are the API's test hooks.
