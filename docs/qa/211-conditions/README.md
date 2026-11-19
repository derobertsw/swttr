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
