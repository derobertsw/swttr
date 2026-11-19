# #213 acceptance record: compare saved stays by access to the planned days

Audited against `origin/main` at `5f2b8d6` ("Bump next", #398) on November 17–18, 2026, after both implementation PRs merged:

- #380: options and the comparison (migration `20261116200000_trip_stay_candidates.sql`)
- #384: Use for these nights (migration `20261117090000_trip_use_stay_candidate.sql`)

Both migrations are applied in prod. Each acceptance box on #213 was checked against the code and its tests. The PR descriptions were read for orientation, but they aren't evidence. Every box has one status:

- **Implemented:** the behavior is in the code and a test covers it.
- **Manual check:** the code and tests exist, but only a signed-in person, a real device, VoiceOver or participants can confirm it. The check is named.
- **Gap fixed:** a real gap, fixed in this PR, with a test that fails on `main`.
- **Gap left:** a real gap, not fixed here, with the option I'd recommend.

Line numbers are for this branch. "Comparison" below is `src/lib/trip-stay-comparison.ts`, "the page" is `src/components/trips/StayComparison.tsx`, "the sheet" is `src/components/trips/UseStayOption.tsx` and "use" is `src/lib/trip-stay-use.ts`.

The browser part of this record ran in headless Chrome against fictional fixture trips, signed out, with no real database ([Browser evidence](#browser-evidence-web)). What still needs a person or a device is under [Untested surfaces](#untested-surfaces).

## Summary

| Acceptance boxes | Implemented | Manual check | Gap fixed | Gap left |
|---|---|---|---|---|
| 8 | 6 | 1 (participants predict the nights) | 1 (overflow at 200% text) | 0 |

The issue's Delivery quality section isn't a box, but it's audited too ([below](#delivery-quality)). Two keyboard gaps were fixed there.

**What this PR changes**

1. **Compare stays no longer scrolls sideways with large text** (box 7). At 200% text on a 320 or 390 px phone, **Add a stay to compare** and each option's **Change · Remove** pair kept their labels on one line, so the page was 427 px wide. Both now wrap, as #337 did for the touring buttons. After: 320 px and 390 px, both 200% text, no overflow. (The page, `WRAPPING` at `:19`, `:157`, `:189`, `:252`.)
2. **Focus reaches What changes in Use for these nights** (Delivery quality). The sheet focused its **What changes** heading on a zero-delay timer, which Chrome ran before React rendered the preview. So focus never got there. Worse, after **Review nights** or **Review again**, the focused button turned into a disabled **Use for these nights** and focus fell to the page, outside the sheet. Focus now moves in a layout effect once each preview has rendered (the sheet, `:45-52`, `:116`). Measured before: focus on the sheet's frame when it opened, `<body>` after Review again. After: **What changes** both times, at 390 and 1440 px.
3. **The heading that takes focus after a save is scrolled into view** (Delivery quality). Once an option is used for the nights, its button is replaced by the stay's, so focus falls back to the **Comparison** heading. That heading was focused without scrolling, far above the Use row where the person was. It's now scrolled to the middle of the screen (the page, `:198-206`). Measured before: focused but out of view at 390 and 1440 px. After: in view.

Each fix has a test in `src/components/trips/StayComparison.test.tsx` that fails on `main`: "wraps its buttons' labels, so large text never widens the page", "moves focus to What changes as each preview renders, so it isn't lost when the sheet's buttons change", and the last assertions of "previews who and which nights change, then saves only after the replacement is confirmed".

## Acceptance boxes

| # | Criterion | Status | Evidence | Tests |
|---|---|---|---|---|
| 1 | Candidates are separate from chosen nightly stays and may overlap. Adding one never changes the itinerary or implies a reservation. | Implemented | Options live in their own table, `trip_stay_candidates`, written only by `mutate_trip_stay_candidate` (migration `20261116200000`). It never touches stays, nights, bookings or the lodging revision. The only duplicate rule is the same name, address and nights, so an option may overlap any stay, booked or not. An option says "No booking recorded" (comparison `:284`) and "Option you're considering · Not chosen for any nights" (`:283`). Options never reach departures, the map or the day brief: only the comparison reads them. | `trip-stay-candidates.database.test.ts` "adds an option without touching stays, nights or the lodging revision", "refuses the same place for the same nights twice, but not for other nights"; `trip-stay-comparison.test.ts` "labels a booked stay chosen for these nights beside an option that overlaps it…"; browser: adding Maple farmhouse left the revision, nights and bookings as they were, and choosing stays and nights sent no write ([Results](#results)) |
| 2 | Compare 2–3 selected candidates over the same dates and destinations, with per-day one-way drives, coverage count and the longest known drive. | Implemented | `parseComparisonRequest` (comparison `:49`) takes two or three distinct places and one window. The mornings are the ones after the chosen nights, check-out included (`:175`). Each place is tried as everyone's stay for those nights (`withEveryoneAt`, `:91`), and the trip's own origin rules choose who leaves from it. Each morning shows each place's one-way drive (`driveOf`, `:133`). Each place shows "All 3 drives known" or "2 of 3 drives known" and its longest known drive with day and destination (`:288-289`). The page allows no fourth (`disabled={disabled && !on}`, `:246`). | `trip-stay-comparison.test.ts` "compares two options over the mornings after the same nights…", "shows a long drive as the option's longest…", "Comparison requests › needs two or three distinct stays"; `stay-candidates/route.test.ts` "asks for two or three stays before routing anything"; `StayComparison.test.tsx` "compares chosen stays in the order chosen…" (a fourth is disabled) |
| 3 | Any total is "Sum of planned outbound drives"; repeat visits count on each day; no claim of total trip travel or symmetric returns. | Implemented | The only total is the row **Sum of planned outbound drives**, "One way, each morning compared, repeat visits counted. Not total trip travel." (the page `:306`). Under the comparison: "Drives are one way… Return drives aren't included." (`:342`). A repeated access point is noted, "Same access point as Sat Oct 10. Each day's drive counts." (comparison `:221`), and counted again in the sum. | `trip-stay-comparison.test.ts` "compares two options…" (Ridge chalet: 10 + 10 = "20 min", with the repeat note); `StayComparison.test.tsx` "compares chosen stays…" (the sum row, named per stay); browser: the wording and no "best", "score" or "round trip" at 390 and 1440 px |
| 4 | A missing, stale or approximate route is visibly incomplete; gaps never count as zero to rank a place fastest; aggregates are compared only on identical, fully covered day sets. | Implemented | Each drive keeps its state: "Drive estimate unavailable · Try again later", "No road route", "Not updated: calculated 8 days ago, and checking again failed", "Location needed", "Approximate location" (comparison `:133-148`). Only available drives and the organizer's estimates are known. A place's sum shows only when every drive is known ("Not totaled: 3 drives aren't known", `:290-292`). Sums are compared only when every place's are complete (`comparable`, `:298`); otherwise the summary names what's missing and says "A missing drive never counts as zero." (`:305`). "Shortest that morning" needs every drive known (`:255`). The day sets are the same for every place by construction: each is tried over the same mornings, and a morning that's the same whichever stay is chosen (No drive planned, the day's own starting point, no exact access point) is left out for all of them. There's no separate check that the day sets match. | `trip-stay-comparison.test.ts` "shows unknown drives beside known ones and compares no sums until every drive is known", "says a failed or approximate drive isn't known, never zero minutes", "marks a week-old drive not updated when checking again fails…", "follows the day's own plans…"; `StayComparison.test.tsx` "shows unknown drives beside known ones and compares no sums"; browser: the unknown and stale states |
| 5 | An optional user-entered total cost shows its currency and nights and is labeled an estimate; currencies never mix; no invented availability, fees or live prices. | Implemented | A cost needs the option's nights and one of ten currencies (`parseCandidate`, `src/lib/trip-stay-candidates.ts:50-64`; the same constraints in the migration). It reads "About CA$900.50 total for Fri Oct 9 → Sun Oct 11 · 2 nights" (`:89`), in the row **Estimated lodging cost**, "Entered by the organizer. Not a live price; fees and availability aren't checked." (the page `:312`). One for other nights says so (comparison `:277`). Costs are never summed, converted or ranked; different currencies add "Costs are in different currencies, so they aren't compared." (`:330`). Saved stays have no cost ("Not entered"). | `trip-stay-comparison.test.ts` "shows each option's cost with its nights and currency, and never compares across currencies"; `trip-stay-candidates.test.ts` "keeps an option's fields, trimmed, with its estimated cost", "says which field to fix"; `trip-stay-candidates.database.test.ts` "keeps a cost to one currency and the option's nights" |
| 6 | Use for these nights previews old → new per affected night; applying changes the stay and the mornings after it, keeps other candidates and booked statuses, and says reservations stay booked; selecting alone never applies. | Implemented (keyboard fix 2 above is in this flow) | Only **Use for these nights**, the last row under each place, opens the sheet (the page `:322`); choosing stays and nights only reads. The sheet opens on the server's preview: "Nothing changes until you confirm.", a sentence per group ("Move Alex, Blair and Dana from Pine rental to Ridge chalet for the nights of Fri Oct 9 and Sat Oct 10."), **Each night and person** ("Alex: Pine rental → Ridge chalet") and **The mornings after** ("Sat Oct 10: Alex starts from Ridge chalet") (the sheet `:116-127`). Saving goes through the lodging transaction, so the mornings after follow the new nights. Booked stays people leave are named: "Pine rental and Mountain lodge stay booked: nothing is canceled. Change the booking on Stays once you've changed the reservation." (`:130`; use `:117-123`). An option becomes a stay, booking not confirmed, and every option is kept (`:129`; use `:98-102`). Replacing anyone's plan needs a tick (`:101`, `:133`). | `use/route.test.ts` "previews an option as a new stay for everyone on the trip those nights, saying which booked stays they leave", "saves the option as a stay with the chosen people only…", "moves people into a saved stay for nights within its dates", "refuses nights a saved stay doesn't cover…"; `trip-use-stay-candidate.database.test.ts`; `StayComparison.test.tsx` "previews who and which nights change, then saves only after the replacement is confirmed"; browser: the mid-trip preview, a conflict, a failure and the save |
| 7 | Phones group each day or figure with the stays' named values beneath it, with no swiping between property cards; desktop may use aligned columns with repeated headings; no horizontal page overflow or map dependence. | **Gap fixed** (overflow at 200% text) | Under 48rem of workspace, each morning and figure is a heading with every stay's name and value beneath it (`Layout`, the page `:376-396`); the stays' statuses and nights are listed above (`OptionsList`, `:359`). Wider, two tables share columns, each with the stays' names in its heading (`:398-424`). No map. **Gap:** at 200% text the options list widened the page to 427 px on 320 and 390 px phones. **Fix:** fix 1 above. | `StayComparison.test.tsx` "compares chosen stays in the order chosen, each value named beneath its day…"; **new** "wraps its buttons' labels, so large text never widens the page" (fails on `main`); browser: 20 layout states at 100% text, and 6 at 200% text after the fix |
| 8 | Fixtures cover the one-candidate empty state, repeated stops, differing candidate dates, unknown routes, booked-versus-candidate overlap, longest-drive outliers, a mid-trip move, long names and external-link return. Users must correctly predict which nights change before applying. | Manual check (participants) | Every fixture case is covered by the tests named above and by this record's browser pass ([Fixtures](#fixtures)): the empty state (`qa213-one`), the repeat at Spruce Peak lot, Brook inn's and Pine rental's differing nights, Hilltop barn (provider down), Notch cabin (no place), Town apartment (approximate), Gondola condo (not updated), booked Pine rental beside Ridge chalet, Ridge chalet's 1 hr 10 min Sunday, the move to the Mountain lodge on Sunday, a 161-character name, and a property link with return. **Only participants can show that people predict which nights change.** | `StayComparison.test.tsx` "explains what a comparison needs with fewer than two stays…", "starts from the address, so returning to the page or reloading keeps the choice and nights"; the comparison tests above; the participant task is under [Untested surfaces](#untested-surfaces) |

## Delivery quality

| Requirement | Status | Evidence | Tests |
|---|---|---|---|
| Server enforces trip ownership and membership, including cross-trip references | Implemented | Reads need the trip (`requireTripAccess`); option writes and Use for these nights are organizer only (use `:30`). A stay, option or person from another trip is 404 (comparison `:167`; use `:63`, `:81`). The tables are service-role only, with the trip in every key. | `stay-candidates/route.test.ts` "saves an option for the organizer only…", "refuses an option from another trip"; `use/route.test.ts` "refuses nights a saved stay doesn't cover, and people or stays from elsewhere"; `trip-stay-candidates.database.test.ts` "is the organizer's, and keeps options to their own trip" |
| Entered values survive failed saves; conflicting edits are detected | Implemented | The option editor keeps its fields after a failure and shows the saved option after a 409. Use for these nights checks the lodging revision, the crew and the option's revision in one transaction; a 409 offers **Review again**, keeping who was chosen. | `StayComparison.test.tsx` "keeps entered values after a failed save, and shows the saved option before saving over a change", "asks again for the people chosen, and reviews again after the plan changed"; `use/route.test.ts` "refuses an option edited or removed since its preview…", "refuses a save the plan changed under"; browser: a conflict and a server error each left the plan as it was |
| Keyboard access, labels, announced save and error states | **Gap fixed** (fixes 2 and 3) | Every control is named; checkboxes carry the stay's facts and its place in the order ("Ridge chalet · First in the comparison"). Saves are announced in a polite live region (the page `:133`), errors in alerts, progress in status lines. **Gaps:** focus never reached What changes, and fell to the page after Review nights or Review again; after a save, focus went to an off-screen heading. | **New** `StayComparison.test.tsx` "moves focus to What changes as each preview renders…" and the scroll assertions in "previews who and which nights change…" (both fail on `main`); browser: Tab order and names at 390 and 1440 px, organizer and member, and in the sheet at 100% and 200% text |
| Mobile and desktop verified | Gap fixed (fix 1) | See box 7. | Browser layout and text checks |
| Measurement | Not built, by #380's choice | No events are logged; #172's collection decision is still open. Nothing logs names, places or prices. | — |

## Browser evidence (web)

Recorded November 18, 2026. This is **web browser evidence only**: headless Chrome driving the real Compare stays page with fictional fixture data, signed out. It isn't device, VoiceOver, signed-in production or participant evidence, and it doesn't stand in for any of them.

### Revision and environment

| | |
|---|---|
| Revision | `origin/main` at `5f2b8d6` (Bump next, #398), plus this PR's three fixes. The "before" figures for each fix were measured on `main`'s code, the "after" ones on this branch. The final run ([`checks.json`](checks.json)) used all three. |
| Server | `next dev --turbopack` 16.4.6 from an isolated worktree on `localhost:3432`, with [`shim.patch`](shim.patch) applied (reverted before commit) |
| API | The app's own `/api/v1/trips/*` route handlers, run by [`api.mjs`](api.mjs) on `127.0.0.1:3492` against an in-memory fixture database ([How it works](#how-it-works)) |
| Browser | Headless Chrome 157.0.8103.79 (new headless), over the DevTools protocol, by [`run.mjs`](run.mjs) with #337's client ([`cdp.mjs`](../337-group-planning/cdp.mjs)) |
| OS | macOS 27.0.1, Node 26.10.0. Four other agents shared the machine. |
| Widths | 320, 390 (mobile viewport, touch), 768, 1024 (touch), 1440 (mouse); light appearance |
| Text | 200% text at 320, 390 and 1440 px (Chrome's default font size set to 32px with `Page.setFontSizes`; the root font size measured 32px) |
| Clock | The trips' "now" is Mon Oct 5 2026, 15:00 UTC, the week before the trip, in the API |

### Fixtures

[`fixtures.ts`](fixtures.ts) builds the rows the API reads. It reuses the downhill reference journey (`src/test/splitStays.ts`) and the places in `src/test/driveTrip.ts`. Everything is fictional: people, places, links (`example.com`) and prices.

**`qa213-weekend`, Fri Oct 9 – Mon Oct 12 2026.** Six people: Alex (organizer), Blair, Casey and Eli (members), Dana (managed guest), Fran (pending invitation).

- Stays: Fri and Sat nights, Alex, Blair and Dana in the **Pine rental** (booked), Eli and Fran in the **Village hotel** (booking not confirmed); Casey arrives Saturday evening and joins the rental. Sun and Mon nights, everyone in the **Mountain lodge** (booked). That's the **mid-trip move**.
- Days: Friday is a travel day with No drive planned. Saturday and Monday are at Stowe's Spruce Peak lot (a **repeated stop**), Sunday at Smugglers' Notch's Smuggs lot.
- Options:

| Option | What it's for |
|---|---|
| Ridge chalet, Fri–Mon nights, about $1,260 | Known drives: 10 min to Spruce Peak lot, but 1 hr 10 min to Smuggs on Sunday (the **longest-drive outlier**). Overlaps the booked Pine rental (**booked versus candidate**). |
| Brook inn, Fri–Sat nights only, about CA$900.50 | Known drives; nights that don't cover Sunday and a cost in another currency (**differing candidate dates**) |
| A 161-character name, Sat–Mon nights | Known drives, a **long name** ending in a 44-character run with no spaces |
| Hilltop barn | Exact place, nothing stored, and the routing provider is down: **unavailable** |
| Notch cabin | No place: **Location needed** |
| Town apartment | Approximate place, no nights: **Approximate location** |
| Gondola condo | A drive stored 8 days ago whose refresh fails: **not updated** |

Known drives are stored in `trip_stay_candidate_routes`, worked out when the fixtures are built by `compareStays` itself with a fake matrix, so route keys and labels are the server's own.

**`qa213-one`**: one saved stay and no options, for the **one-candidate empty state**.

Viewers: `user-alex` (organizer) and `user-blair` (member).

### How it works

- [`api.mjs`](api.mjs), adapted from #337's, loads every `src/app/api/v1/trips/**/route.ts` with Vite's SSR loader and answers with them, unchanged. It swaps the same three modules as #337, reusing its stand-ins ([`../337-group-planning/server/`](../337-group-planning/server)): sign-in reads the viewer from a cookie, the database is `src/test/fakeSupabase.ts` over the fixture rows, and the rate limiter always allows. The routing provider is down for the whole run, and any other outbound request is refused.
- Unlike #337's, saves work in memory: `mutate_trip_stay_candidate` adds, changes and removes options, and `mutate_trip_lodging` / `use_trip_stay_candidate` apply "save" and "assign" with the server's own `applyLodgingChange`, checking the revision, crew key, option revision and replacement as the transactions do. `/__qa/overrides` forces a status or a Postgres error (such as `PT409`) instead, and `/__qa/tables` returns a trip's rows so a check can confirm nothing changed.
- [`shim.patch`](shim.patch) (applied only while testing, never committed as code) makes `/trips/qa213-*` skip Clerk, rewrites `/api/v1/trips/qa213-*` to the fixture API, enables `TripProvider` for those ids and has `useUserId` read the `qa213_viewer` cookie. It is #337's shim with the prefix changed.
- [`run.mjs`](run.mjs) drives the checks; [`summarize.mjs`](summarize.mjs) condenses its output into [`checks.json`](checks.json).

### Re-running

From the worktree root, with dependencies installed and nothing else on ports 3432, 3492 or 9432:

```sh
git apply docs/qa/213-compare-stays/shim.patch
API_PORT=3492 node docs/qa/213-compare-stays/api.mjs &
QA213_API=http://127.0.0.1:3492 ./node_modules/.bin/next dev --turbopack -p 3432 &
BASE=http://localhost:3432 API=http://127.0.0.1:3492 CDP_PORT=9432 OUT=/tmp/qa213 node docs/qa/213-compare-stays/run.mjs
#   or name groups: content layout text a11y journeys use sheet recovery shots
node docs/qa/213-compare-stays/summarize.mjs /tmp/qa213/results.json
# stop both servers, then:
git apply -R docs/qa/213-compare-stays/shim.patch && rm -rf .next/dev
```

Use `localhost`, not `127.0.0.1`, for the Next server: Next blocks dev resources for an origin it doesn't recognise, and the page never hydrates.

### Results

"Pass" means the check passed against fixture data in headless Chrome. It isn't device, assistive-technology, signed-in or participant evidence. 63 of 63 checks passed in the final run ([`checks.json`](checks.json)), with this PR's fixes.

| Check | Result | Evidence |
|---|---|---|
| Wording, states and figures | Pass | The three comparison states, each at 390 and 1440 px, show every expected line and none of "best", "score", "round trip" or a claim of total trip travel. **Known** (Ridge chalet, Pine rental, Brook inn; Fri → Mon): "Mornings compared: Sat Oct 10, Sun Oct 11 and Mon Oct 12 (check-out)", the plan now with its booked stays, "Same access point as Sat Oct 10. Each day's drive counts.", Ridge chalet's longest "1 hr 10 min · Sun Oct 11 to Smuggs lot", "Pine rental has the lowest sum of planned outbound drives, 1 hr 9 min. Ridge chalet: 21 min more. Brook inn: 1 min more.", "Its nights don't include the night of Sun Oct 11." and both costs with "Costs are in different currencies, so they aren't compared." **Unknown** (the long name, Hilltop barn, Notch cabin): "Drive estimate unavailable", "Location needed", "Not totaled: 3 drives aren't known", "Sums aren't compared until every drive is known. Not known yet: Hilltop barn (3 drives) and Notch cabin (no location). A missing drive never counts as zero.", and no "Shortest that morning" or "0 min". **Stale** (Gondola condo, Town apartment, Mountain lodge; Thu → Mon): "No drive planned · the same for every stay" on Friday, "Not updated: calculated 8 days ago, and checking again failed", "Approximate location", "Chosen for 1 of these 4 nights · 6 people". |
| One-candidate empty state | Pass | `qa213-one`, organizer: "Choose two or three stays to compare.", what a comparison needs, and **Add another stay**. Member: "The organizer can add stays to compare." and no Add button. No comparison request was sent. |
| Phone grouping and desktop columns | Pass | 20 states (4 × 320, 390, 768, 1024, 1440 px). Up to 1024 px (the workspace is under 48rem beside the sidebar) every day and figure is a group whose values are each named by stay, three per row, or one "the same for every stay" line. At 1440 px two tables, each headed by the three stays' names, with every cell lined up under its heading (to 1 px). No map, canvas or map dependence. |
| No horizontal page overflow | Pass at 100% text; **fixed** at 200% | 0 of 20 states at 100% text. At 200% text, `main` was 427 px wide at 320 and 390 px (the options' buttons); after fix 1, 320 and 390 px are 320 and 390 px wide, and 1440 px fits. |
| Keyboard order, focus and names | Pass | Tab through the known state at 390 and 1440 px: 41 and 46 stops for the organizer, 23 and 28 for the member, every one with a visible focus indicator and in view. Order, after the trip header and section tabs: the Stays back link, First night, Check-out morning, Add a stay to compare, the stays' checkboxes (with Change and Remove for options), the property links, the Use buttons, the routing credit. With three chosen, the other checkboxes are disabled and skipped, and the page says "Three are chosen: clear one to choose another." No unnamed control in the accessibility tree; headings run Compare stays → Stays to compare / Comparison → the groups. |
| External link return | Pass | A real click on "Open Ridge chalet's website (new tab)" (`target="_blank"`, `rel="noopener noreferrer"`) opened a new tab. After closing it and returning (focus and visibility events), the selection, nights, address and scroll were unchanged (scrollY 3692 → 3692 at 390 px; 2231 → 2231 at 1440 px) and no comparison was requested again. |
| Return from Add a stay to compare | Pass | The sheet opened on the page; Maple farmhouse was saved and announced ("Maple farmhouse 390 saved and added to the comparison."), joined the comparison third, the first two and the nights stayed, and scroll stayed (315 → 315; 175 → 175). Focus went back to Add a stay to compare. The lodging revision, nights and bookings didn't change. |
| Reload | Pass | The address kept both stays and the nights. |
| Choosing never saves | Pass | Ticking a third stay and changing the check-out morning, then undoing both, sent no write and left the plan as it was. |
| Member view | Pass | A member compares but gets no Add, Change, Remove or Use; "Options are managed by the organizer". |
| Use for these nights: preview | Pass | Ridge chalet across the mid-trip move, at 390 and 1440 px: "Nothing changes until you confirm.", four sentences (Pine rental, Village hotel, Casey's one night, and "Move Alex, Blair, Casey, Dana, Eli and Fran (invitation pending) from Mountain lodge to Ridge chalet for the night of Sun Oct 11."), each night's people old → new ("Alex: Mountain lodge → Ridge chalet"), the mornings after, "Pine rental and Mountain lodge stay booked: nothing is canceled…" (the Village hotel, not booked, isn't named), and that Ridge chalet becomes a stay, booking not confirmed. **Use for these nights** stays disabled until "Replace their existing plans for Fri Oct 9, Sat Oct 10, Sun Oct 11" is ticked. Opening the preview saved nothing. Focus lands on What changes (fixed). |
| Use for these nights: conflict | Pass | With the transaction answering `PT409`: "The lodging plan changed. Review the saved plan before retrying." and **Review again**; the revision (4), nights and bookings unchanged. Review again previewed the same six people again, with focus on What changes (fixed: it was on the page). |
| Use for these nights: failed save | Pass | With the route answering 500: "Couldn't save lodging. Your changes are still here; try again."; the preview, the people and the replacement tick stayed, and nothing was saved. |
| Use for these nights: save | Pass | Revision 4 → 5. Ridge chalet is a stay, "Chosen for these nights · 6 people", booking not confirmed; Pine rental and the Mountain lodge are still booked; all seven options are kept; the address now names `stay:<Ridge chalet's id>`; "Ridge chalet is now the stay for these nights. Bookings weren't changed." is announced; focus is on the Comparison heading, in view (fixed: it was off-screen). |
| A saved stay outside its dates | Pass | Use Pine rental for Fri → Mon: "Pine rental's dates don't include the night of Sun Oct 11. Change its dates on Stays first, or choose nights within them." Escape returns focus to the button. |
| The Use sheet at 200% text | Pass | At 390 and 1440 px (100%) and 320 and 390 px (200%): no unnamed control, the people's checkboxes are named with their notes ("Casey · Arrives Sat Oct 10 · Skips Sat Oct 10", "Fran · Invitation pending"), 14 Tab stops stay inside the sheet with visible focus, and nothing is wider than the sheet. |
| Comparison fails | Pass | With the comparison answering 500: an alert, "Couldn't compare these stays. Try again." with **Try again**, the three stays still chosen; Try again brought the comparison back. |

## Bugs found, not fixed

| Severity | Where | What happens | Recommended fix |
|---|---|---|---|
| Low | Compare stays, unknown drives | A drive the provider couldn't calculate says "Drive estimate unavailable · Try again later", with nothing to press. Reloading or changing the selection asks again (failed drives aren't stored), but nothing says so. The day page has Retry for the same state. | Show **Check drives again** under the summary when any drive is unavailable or not updated, wired to the comparison's existing retry. |
| Low | Every trip page on a phone, 200% text | The fixed bottom tab bar cuts off "Wardrobe" at 320 and 390 px. Already recorded by #337; not specific to this page. | As #337 recommends: let the tab bar labels shrink or wrap. |

Not bugs, for the record:

- On phones the Add sheet opens with focus on the sheet itself rather than the Stay name field (Vaul doesn't move focus into a field). The sheet is a dialog and the next Tab reaches the field. Desktop focuses the field.
- After a save the comparison is fetched again and briefly shows "Comparing the drives…" in place of the figures. The answer is kept per request on purpose, so an older answer never shows against a newer choice.
- The preview's per-person lists are collapsed under **Each night and person** and **The mornings after**. The visible sentences already name who and which nights. Whether people open them is part of the participant task below.

## Choices made without asking

Mine, in this PR:

1. **Large text wraps the buttons** rather than shrinking or hiding them, as #337 did elsewhere.
2. **After a save, the Comparison heading is scrolled to the middle of the screen** when it takes focus. That shows the updated plan for these nights. Focus still returns to the Use button itself when it's still there (Escape, Cancel).
3. **Box 4 is Implemented** although no code checks that the day sets match: they can't differ, because every place is tried over the same mornings. A guard would need a case that can't be built to test it.
4. **Box 8 is a Manual check**: the fixtures are covered, but "users must correctly predict which nights change" needs participants.

From #380 and #384, still worth the user's review (each PR lists them in full):

1. Options are a separate table, not a flag on stays; saved stays can be compared beside options.
2. Each place is tried as everyone's stay for the nights; people's own starting points are noted, not modelled per person.
3. The default nights are the trip's own, not the first option's.
4. Members see and compare options; only the organizer adds, changes, removes or uses them.
5. Only current figures count: a not-updated drive (over a week old, refresh failed) is shown but not counted.
6. Sums are compared only when every place's drives are all known; no overall winner, score or cost ranking.
7. Cost: one estimated total per option, in one of ten currencies, never converted or compared across currencies.
8. Comparison drives are stored for 7 days in their own table.
9. Up to 30 options per trip; a new option joins the comparison while fewer than three are chosen.
10. No event logging until #172 decides.
11. Use for these nights reuses the Stays editors' changes: a saved stay is an `assign`, an option a `save` with occupants.
12. An option becomes a stay with the option's own id; the option row is kept (and still counts toward the 30).
13. Default who is everyone on the trip those nights, editable before saving.
14. A saved stay's dates aren't extended from here; nights outside them are refused.
15. The new stay is for exactly the compared nights, booking not confirmed, without the option's cost.
16. Use for these nights needs per-person nights (#331, applied in prod).
17. A retry after the option was edited is refused rather than replayed.

## Untested surfaces

Nothing below was checked here. Each item is a concrete step for the iPhone tracker #144 or the #205 pilot.

**iPhone app (Capacitor shell, #144):**

1. **Property link handoff and return.** On an iPhone with the current build, open a trip with two options that have property links → Stays → Compare stays → tick both → scroll to Property → tap **Open website (new tab)**. Record what opens (Safari, an in-app browser, or nothing: `target="_blank"` does nothing in the iOS shell until #146 adds a `WKUIDelegate`). Come back to the app: check that both stays are still ticked, the nights are the same, and the page is still scrolled to the Property row.
2. **Add a stay to compare with the keyboard up.** Tap **Add a stay to compare**, type a name: the field stays above the keyboard and **Save option** can be reached without closing it. After saving: back at the same scroll, the new stay ticked third, and "… saved and added to the comparison." shown.
3. **Phone layout and Dynamic Type.** At the largest text size, with three stays chosen: no sideways scrolling; each morning lists the three stays by name with their drives; the Use sheet scrolls and its buttons stay reachable above the home indicator.

**VoiceOver (iPhone and macOS Safari):**

4. Swipe through **Drive each morning** on a phone: each morning is read, then each stay's name and drive ("Ridge chalet, 10 min · 5.6 mi, Shortest that morning"). With three chosen, the other checkboxes are read as dimmed and the hint about clearing one is reachable.
5. On a Mac at full width, use table navigation in the comparison: moving across a row reads each stay's name (the column heading) with its value.
6. In Use for these nights: VoiceOver moves to **What changes** when the preview loads, again after **Review nights**, and after **Review again**. "Saving nights…", the success message and an error are each announced once.

**Signed-in organizer and member on prod data, with real routing:**

7. **Organizer, real routing.** On a real trip with two saved stays, add two options with exact places. Compare them: drives show "Calculated just now"; reload and compare again: the same drives come back without new provider calls (check Geoapify usage before and after). Change an option's place: only its drives are new. Remove the test options afterwards.
8. **Organizer, Use for these nights on real data.** On a test trip with a booked stay: use an option for two nights. The preview names the booked stay as staying booked. After saving: Stays shows the new stay "Booking not confirmed" and the booked stay still "Booked"; the day page for the next morning shows the new stay as Starting from, with its drive. Then undo it on Stays.
9. **Member.** Signed in as a member of the same trip: options and the comparison show; no Add, Change, Remove or Use; changing the stays and nights works.
10. **Two sessions.** Open Use for these nights in one tab; change that trip's nights on Stays in another; save in the first: "The lodging plan changed…" with **Review again**, which shows the new plan. Repeat, editing the option in the second tab: "This option changed since you reviewed it. Review it again."

**Participants (#205 pilot):**

11. **Predict which nights change.** Give 3–5 participants a trip with a mid-trip move (like `qa213-weekend`) and ask them to use an option for the trip's nights. Before they press save, ask: which people and which nights change, and what happens to the existing bookings? Pass: each names the nights (for example Fri, Sat and Sun), says the booked stays stay booked, and says nothing else changes. Note whether they opened **Each night and person**.
12. **Explain the tradeoff.** On the same trip, ask them to choose between Ridge chalet and Pine rental and say why, without leaving the page. Pass: they mention the per-morning drives or the longest drive (Ridge chalet's 1 hr 10 min Sunday), not a single total, and don't read the sum as total trip travel.
