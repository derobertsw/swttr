# Conditions sources and reviews (#211, part of #205)

A tour day lists the official sources the crew should check: the avalanche forecast, mountain weather and access or closures, each with its link. Everyone records their own review of each source for the day, so the crew can see who looked and when. This page records the decisions for #211 and the rules that follow from them. This is the first of three PRs: reuse across days comes in the second, and a verified list of official forecast centers in the third.

## Decisions (October 16, 2026)

The full record is on [#211](https://github.com/derobertsw/swttr/issues/211#issuecomment-6227449991).

| Question | Decision |
|---|---|
| How is a source stored and reused? | **Saved once on the trip and attached to the days it covers.** Fixing its link fixes every attached day, after a preview of those dates (PR 2). Reviews always stay per day. |
| What does a review record keep? | **One current review per person, source and day, with its history.** Recording again, correcting the note and withdrawing each add an attributed entry. The crew sees each person's current review, with history on demand, and the notes. |
| What counts as a review? | **Only pressing Record my review on a source, for that day.** Opening the link or coming back to SWTTR never records one. The time is when it's saved. |
| What makes a review stale? | **The day's date, destination or activity, its access point, the tour plan's route (name or link), or the source's link or area** changing after it was recorded. |
| Who can edit what? | **The organizer adds, edits and removes sources. Each person records, corrects or withdraws only their own review.** Nobody records for anyone else, guests included. |
| Removing a source from a day | **Keeps its reviews**, stored and attributed. Adding the same source back shows them again. |
| Official forecast centers | **A later PR**, as a verified list with suggestions that need confirming. |

## Rules

- **Sources are the organizer's.** A source has a type (Avalanche forecast, Mountain weather, Access and closures), a name, an optional area or region and an http or https link. Only the organizer adds, edits or removes one, and members see "Sources are managed by the organizer". In this PR a source is added to one day; it can't be attached to another day yet.
- **Each row says what it is and where it goes.** Type and area, the name, then Open forecast, Open weather or Open access information, which opens the source in a new tab. Every source says "Validity not available in SWTTR — check the source.": SWTTR doesn't read bulletins, so it never shows an issue or expiry time.
- **A review is explicit and personal.** Record my review opens a short form with an optional note (up to 1,000 characters, shown to the crew), and saves the review at that moment. Opening the link never records anything. Someone who checked elsewhere can record it without opening the link; the note can say when.
- **The summary counts only your own current reviews.** "Your reviews: 1 of 3 recorded for Saturday" counts the listed sources you've reviewed for this day and whose plan hasn't changed since. The crew's reviews are under Crew reviews, collapsed, as "Sam recorded a review · Fri Oct 9, 6:12 PM". A review is a dated note, not a sign the forecast is current; the section says so.
- **Corrections and withdrawals keep history.** Edit note and Withdraw review add entries; they keep the review's time. Each person's history lists every entry with its time. After withdrawing, the source shows "No review recorded" again.
- **Plan changes make reviews stale, without deleting them.** Each review stores the day's plan as it was: date, destination (its stop and weather location), activity, the access point that applied, the tour plan's route name and link, and the source's link and area. When any of these differ now, the review shows "Plan changed — review again" with what changed, e.g. "Route changed · Date changed from Fri Oct 9", and doesn't count in the summary. Notes, meet and return times, stays, the backup plan, the stop's name and the source's name or type don't make a review stale.
- **Days, not dates.** Reviews belong to the trip day, so moving trip dates moves them, and they then say "Date changed from …". Removing a day removes its reviews with it.
- **Save only on confirmation.** Editors close after the server confirms. A failure keeps the input and the save identity, so a retry can't save twice. A source changed elsewhere, a day that moved, or a plan that changed since the review form opened is a `409`; Check the latest reloads it and keeps the typed note or source. Cancel, Escape and Back ask before discarding edits. Removing a source asks first and says its reviews are kept.
- **Planning, not safety.** Review status stays separate from clothing comfort and packing. There's no overall "Safe", go/no-go or route-safety status.

## Official forecast centers

The third PR adds a verified list of official avalanche forecast centers to the source editor. When the type is Avalanche forecast, the organizer can press **Choose an official center**. That loads the list, and suggestions for the day from Avalanche Canada's published forecast areas. Choosing a center, from the list or with **Use …** on a suggestion, only fills in the source's name and link. The area or region stays as the organizer typed it, and nothing is saved until they press Save source. The result is an ordinary source: it can be edited, it goes stale like any other, and it still says "Validity not available in SWTTR — check the source."

### The list (verified November 16, 2026)

The U.S. centers come from avalanche.org's [U.S. Avalanche Centers](https://avalanche.org/us-avalanche-centers/) page. Coastal Alaska comes from its [National Danger Map](https://avalanche.org/). Haines and Valdez are listed there under the Alaska Avalanche Information Center. "Listed under" is the state the list gives, which is where the center is based. It isn't the center's forecast boundary, so the editor says to check that the center's map covers the route.

| Center | Listed under | Official link |
|---|---|---|
| Chugach National Forest Avalanche Center | Alaska | https://www.cnfaic.org/forecast/ |
| Coastal Alaska Avalanche Center | Alaska | https://www.coastalakavalanche.org/forecast/ |
| Haines Avalanche Center | Alaska | https://alaskasnow.org/haines-forecast/ |
| Hatcher Pass Avalanche Center | Alaska | https://hpavalanche.org/forecast/ |
| Valdez Avalanche Center | Alaska | https://alaskasnow.org/valdez-forecast/ |
| Kachina Peaks Avalanche Center | Arizona | https://kachinapeaks.org/Forecast/ |
| Bridgeport Avalanche Center | California | https://bridgeportavalanchecenter.org/avalanche-forecast/ |
| Eastern Sierra Avalanche Center | California | https://www.esavalanche.org/forecasts/ |
| Mount Shasta Avalanche Center | California | https://www.shastaavalanche.org/forecasts/avalanche/mount-shasta |
| Sierra Avalanche Center | California | https://www.sierraavalanchecenter.org/forecasts/avalanche/central-sierra-nevada |
| Colorado Avalanche Information Center | Colorado | https://avalanche.state.co.us/ |
| Crested Butte Avalanche Center | Colorado | https://cbavalanchecenter.org/forecasts/ |
| Idaho Panhandle Avalanche Center | Idaho | https://www.idahopanhandleavalanche.org/forecasts/ |
| Payette Avalanche Center | Idaho | https://payetteavalanche.org/forecasts/avalanche |
| Sawtooth Avalanche Center | Idaho | https://www.sawtoothavalanche.com/forecasts/avalanche |
| Flathead Avalanche Center | Montana | https://www.flatheadavalanche.org/avalanche-forecast/ |
| Gallatin National Forest Avalanche Center | Montana | https://www.mtavalanche.com/avalanche-forecast |
| West Central Montana Avalanche Center | Montana | https://missoulaavalanche.org/forecasts/ |
| Mount Washington Avalanche Center | New Hampshire | https://www.mountwashingtonavalanchecenter.org/forecasts/ |
| Taos Avalanche Center | New Mexico | https://taosavalanchecenter.org/forecasts/ |
| Central Oregon Avalanche Center | Oregon | https://coavalanche.org/pages/forecasts/ |
| Utah Avalanche Center | Utah | https://utahavalanchecenter.org/ |
| Northwest Avalanche Center | Washington | https://nwac.us/forecasts/avalanche |
| Bridger-Teton Avalanche Center | Wyoming | https://bridgertetonavalanchecenter.org/forecasts/ |
| Avalanche Canada | Forecast areas on avalanche.ca's map | https://avalanche.ca/map |
| Parks Canada avalanche forecast | Banff, Yoho, Kootenay, Jasper, Glacier and Waterton Lakes national parks | https://avalanche.ca/map |
| Avalanche Québec | Chic-Chocs, Québec | https://avalanchequebec.ca/en/avalanche-bulletin/ |

Canada's centers come from the forecasters on [avalanche.ca's map](https://avalanche.ca/map), as its metadata lists them: Avalanche Canada, Parks Canada (the four mountain-park forecasts), Kananaskis and Avalanche Québec. Parks Canada's [avalanche information](https://parks.canada.ca/pn-np/mtn/securiteenmontagne-mountainsafety/avalanche) page links its avalanche bulletin to avalanche.ca's map, so that's its link. Avalanche Québec links to its own bulletin page for the Chic-Chocs. Kananaskis's forecast is on avalanche.ca's map, so a suggestion for it uses the Avalanche Canada entry. Avalanche Canada's forecast pages change address with each bulletin, and its areas are merged and split during the season, so every Canadian forecast on avalanche.ca uses the map's address, which doesn't change.

**How each link was checked (November 16, 2026).**
- `curl -sIL` on every link except Utah's returned HTTP 200 with no redirect. Where the listed link redirected, the list keeps where it ended up: NWAC, Mount Washington, Sierra and Eastern Sierra. Payette's and Sawtooth's `/forecasts/` return 404, so the list uses `/forecasts/avalanche`.
- Each page then loaded in headless Chrome and showed its forecast: issued forecasts or "General avalanche information", the forecast area and the center's name. Utah's site answers `curl` with a Cloudflare 403 but loads normally in a browser. Utah's `/forecasts` is a 404, so its link is the home page and its current danger ratings. avalanche.ca's map needs WebGL, so headless Chrome only shows its WebGL notice. Its HTTP 200 and Parks Canada's link to it confirm it.

**Left out, and why.** Organizers can still add these as their own sources.
- Wallowa Avalanche Center: its site answers every automated request with a bot-verification page, so its link couldn't be checked.
- Cordova and Eastern Alaska Range: their pages show observations and weather, with no forecast.
- Eastern Wyoming and Southern Oregon information exchanges: observations and weather, not forecasts.
- New York DEC's Adirondack page: it's on the national map out of season, but the page has no avalanche forecast, and it's behind a Cloudflare check.
- The National Avalanche Center and the Alaska Avalanche Information Center: they don't issue forecasts themselves.

To change an entry, check every link again the same way, and update `VERIFIED_ON` and this table (`src/lib/avalanche-centers.ts`).

### Suggestions

- **Only from Avalanche Canada's published areas.** Avalanche Canada documents its [public forecast API](https://avalanche.ca/api-docs), and its [data sharing policy](https://avalanche.ca/data-sharing-policy) points public users to it. SWTTR's server reads two endpoints: today's forecast areas (`/forecasts/en/areas`) and their names and forecasters (`/forecasts/en/metadata`). It keeps only the boundaries, area names and forecasters, never ratings or bulletin text. It reads them again after 30 minutes. The whole list is downloaded and matched on SWTTR's server, so the trip's place is never sent to Avalanche Canada.
- **No U.S. suggestions.** avalanche.org's API (`api.avalanche.org`) says to contact avalanche.org and the American Avalanche Association for permission. Without its zone boundaries, SWTTR has no data to suggest a U.S. center, and the editor says so. A U.S. suggestion needs that permission first.
- **Inside an area, or nothing.** The place is the day's access point, or else its destination's weather location, the same as a review records. A suggestion names the area that contains the place today and its forecaster: "Avalanche Canada's forecast areas put this day's access point in “Glacier” today, forecast by Parks Canada." A place outside every area gets no suggestion, however close an area is. SWTTR never picks the nearest center. Merged areas with names longer than 60 characters are called "a combined forecast area."
- **Confirmed by the organizer, never stored.** A suggestion is shown with the time it was checked, and says that forecast areas change through the season. It becomes a source only when the organizer uses it and saves. The source doesn't keep the area, since Avalanche Canada's areas change during the season, so the organizer types the area or region.
- **Validity stays unknown.** Avalanche Canada's bulletins carry issue and expiry times, but a saved source links to the map, not to one bulletin. So the row keeps "Validity not available in SWTTR — check the source."

`GET /api/v1/trips/:id/days/:date/conditions/centers` returns `{verified_on, centers, suggestions: {status, point, checked_at, items}}`. `status` is `found`, `none`, `no_location` (no coordinates) or `unavailable` (Avalanche Canada couldn't be read; the list still loads). The route is organizer only, like adding a source: `403` for members, `404` for anyone not on the trip or a date outside it. It changes nothing. Unit tests cover the list (each entry saves as a valid source), matching inside areas and holes, places just outside an area, combined areas, each forecaster, U.S. places, failures and the 30-minute reuse. Route tests cover the place checked and access. Component tests cover loading on request, using a suggestion without saving it, choosing from the list, each status without a suggestion and a failed load that keeps the typed source.

## API

`GET /api/v1/trips/:id` includes `conditions`: each source on each day, with its `date`, `trip_day_id`, `context_key` (the day's plan and the source as read now) and `reviews`: each person's `current` entry, `history` (newest first) and `stale_reasons`.

| Request | Response |
|---|---|
| `POST /api/v1/trips/:id/days/:date/conditions` with `{action: "add", source, day_id, mutation_id}` | `{source_id, revision}`. Organizer only. |
| … with `{action: "save", source_id, expected_revision, source, day_id, mutation_id}` | `{source_id, revision}`. |
| … with `{action: "remove", source_id, expected_revision, day_id, mutation_id}` | `{source_id, revision: 0}`. Removes it from the day; the source and its reviews stay. |
| `POST /api/v1/trips/:id/days/:date/conditions/reviews` with `{action: "record", source_id, day_id, expected_entry_id, context_key, note, mutation_id}` | `{entry_id}`. Anyone on the trip, for themselves. `expected_entry_id` is the person's latest entry, `null` for none. |
| … with `{action: "correct" \| "withdraw", source_id, day_id, expected_entry_id, note, mutation_id}` | `{entry_id}`. Needs a current review. |

Source changes are `403` for members; both routes are `404` for anyone not on the trip. To record, the route reloads the trip and compares `context_key` with the plan now, and the transaction checks the context again under the trip lock, so a review is never stored against a plan the person didn't see, even when the plan changes while it's being recorded (`409`). Other errors: `409` when the source, the person's review or the day changed, or a save identity was reused with other input; `404` when the day is gone; `400` for invalid input (with `field` for a source field or the note); `503` before migration 031; otherwise `500` with nothing changed. `parseConditionsSource` and `parseReviewNote` validate input, `conditionsContext` builds the plan a review records and `staleReasons` compares it (`src/lib/trip-conditions.ts`).

## Database (`supabase/migrations/031_trip_conditions.sql`)

- `trip_conditions_sources`: the trip's sources, with `revision`, `created_by` and `updated_by`.
- `trip_day_conditions_sources`: which days a source is on, with composite foreign keys so neither the day nor the source can belong to another trip.
- `trip_conditions_reviews`: append-only entries (`reviewed`, `corrected`, `withdrawn`) per person, source and day, ordered by `entry_number`, each with `reviewed_at` and the `context` it was recorded against.
- `mutate_trip_conditions_source(...)` adds, saves or removes a day's source: organizer only, checking the day still holds the date and the source's revision (each `40001`). `record_trip_conditions_review(...)` adds an entry for the organizer or a current member, checking the source is on the day and the person's latest entry (`40001`). To record, it builds the day's plan again in the shape of the app's `conditionsContext`, with the day and its stop locked, and refuses a context that no longer matches (`40001`); a PGlite test builds contexts with the app's function so the two can't drift apart. Both lock the trip and store receipts in `trip_conditions_mutations`, so a retry with the same identity returns the first result. The review's context is left out of that comparison, since the app builds it again for a retry.
- RLS is on with no browser policies; only `service_role` can use the tables and functions.

## Deployment and validation

Apply `031_trip_conditions.sql` before deploying; it needs 012, 026 and 027, and production numbers migrations by hand (029 is #209's, 030 is reserved for #301). Without it, trips load with no sources, and saving a source or a review says it can't be saved yet (`503`) with nothing changed. Any other failure to load sources fails the trip load, so a source or review is never silently hidden.

PGlite tests cover adding, saving and removing sources at their revision, invalid sources, replays, organizer-only access, cross-trip days and sources, kept reviews after removal, members' own reviews, corrections and withdrawals that keep the review's time and context, a stale second window, left members, moving and removing days, a plan that changes between the app reading it and the transaction (route, activity, destination, access point, source link) and changes that don't count, and grants. Unit tests cover validation, the context, each stale reason and what doesn't count, and the summary. Route tests cover access, validation, the plan-changed check and error mapping; component and day page tests cover the empty states, rows, adding, field errors, removal, member access, recording without the link, stale and crew reviews, corrections, withdrawals, failed saves and conflicts. Signed-in checks with real trips, and phone and screen-reader checks, are still to do.
