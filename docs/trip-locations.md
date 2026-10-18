# Precise trip locations (#208)

Stays, destinations' access points (where the crew parks or meets) and a day's own starting point have confirmed places, separate from any activity's weather location. All use the same picker and location shape. Drive times (#209), the tour plan's trailhead and meeting point (#210) and maps (#222) read these places.

## Provider

Search uses Geoapify Address Autocomplete on the free plan: 3,000 credits a day, up to 5 requests a second across the account, commercial production use allowed with attribution, and results we may store. Each search costs 1 credit. Maps will use MapLibre with OpenFreeMap tiles, and weather search stays on Open-Meteo. The comparison with Google, Mapbox, Apple, Stadia, LocationIQ and openrouteservice is in the [provider decision](https://github.com/derobertsw/swttr/issues/208#issuecomment-6134840726). The [pilot](https://github.com/derobertsw/swttr/issues/208#issuecomment-6135105504) covered ten endpoint types in Vermont, New York and Massachusetts. The [follow-up](https://github.com/derobertsw/swttr/issues/208#issuecomment-6180676222) confirmed The INN in Montgomery Center and the K-1 pin, making **10 of 10 usable**. Pricing and published usage rules were rechecked on October 17, 2026; see the [completion review](qa/208-trip-locations/README.md). Recheck them before relying on any change, and reassess after launch in #283.

Geoapify's [pricing FAQ](https://www.geoapify.com/pricing/) explicitly permits commercial production use while staying within the free plan's credits, rate and feature limits and displaying attribution. The [terms](https://www.geoapify.com/terms-and-conditions/) still allow free production use only "with some limitations" and ask you to contact Geoapify for details; the completion review's Production wording row records that gap. Geoapify's [platform usage statement](https://www.geoapify.com/products-and-services/) permits caching, storage and redistribution of service results. The [Routing page](https://www.geoapify.com/routing-api/) says Routing API results can be stored and redistributed, but it doesn't name route geometry, so geometry rests on the platform statement. We use the platform statement for saved search locations, Route Matrix distance/time estimates and future route geometry, including reuse in offline trip summaries. Keep Geoapify and data-source attribution with reused/exported results. The user accepted the official published documentation for #208's remaining written-confirmation requirement on October 17, 2026; this is not a claim of a private vendor reply. Drive estimates are stored by the user's decision of October 15, 2026 ([#209](https://github.com/derobertsw/swttr/issues/209#issuecomment-6205805246)); their 7-day refresh is a freshness policy, not a provider retention limit.

Free service has no SLA, and Geoapify's limits are soft. The pricing FAQ says it generally doesn't throttle accounts that go over, contacts one whose usage keeps passing the quota to ask it to upgrade, and may block an account that ignores those emails. The [Pricing Details page](https://www.geoapify.com/pricing-details/) adds that keys aren't blocked straight away but that requests may be blocked or limited temporarily for exceeding the rate. So going over 3,000 credits a day may not fail at all, and nothing in the app caps credits; watch the usage logs instead (#283). When Geoapify does refuse or fail a request, search falls back to manual entry and drive estimates keep their earlier estimate or say they're unavailable.

Only `src/lib/locations/provider.ts` knows the provider. It keeps the key server-side (`GEOAPIFY_API_KEY`, never `NEXT_PUBLIC_`), times out after 6 seconds, and logs counts only, never the query or a place:

```json
{"event":"location_search","provider":"geoapify","outcome":"ok","results":2}
```

`outcome` is `ok`, `http_<status>` (429 means Geoapify limited the account; its published pages don't say which limit answers 429, and going over the daily credits may not be refused at all), `network_error` or `bad_response`. Each `ok` line is one request, so one credit. Search results are ranked as the pilot recommended:

- Results are biased towards the trip's destinations. Anything more than 1,000 km from all of them is dropped, such as Osaka for "Hotel Jay".
- Results are sorted by Geoapify's confidence, then exact places before areas, then distance.
- Duplicate pins are removed, and at most six results are shown.
- A result is **approximate** when it is a town, area, postcode or bare street. Geoapify's result type alone isn't trusted: a named place in a non-area category is exact even when it's typed as a postcode.
- Results with no name or with unusable coordinates (out of range, or 0, 0) are dropped.

## Location shape

`TripLocation` in `src/types/trips.ts` is stored as jsonb in `trip_stays.location`, `trip_stops.access_point`, `trip_days.access_point` and `trip_days.origin`. `public.is_trip_location` checks the same rules in the database as `parseTripLocation` does in `src/lib/trip-location.ts`.

| Field | Meaning |
|---|---|
| `label`, `address` | Name and address as shown, so the place reads without a map |
| `latitude`, `longitude` | Rounded to 6 decimals; 0, 0 and out-of-range values are refused |
| `precision` | `exact`, or `approximate` for a town or area: shown as "Approximate area — choose the exact property for drive times" |
| `time_zone` | IANA zone when Geoapify resolved one, otherwise null |
| `source` | `search` or `manual` (typed coordinates, which carry no provider data) |
| `provider`, `provider_id` | `geoapify` and its place ID, kept as permitted |
| `attribution` | The data source's credit, kept with the place as Geoapify asks |

A stay save that omits `location` keeps the saved place, so an editor opened before this change can't clear it. `null` removes it. A rejected save leaves the saved place unchanged.

## Picker

`LocationPicker` (`src/components/trips/LocationPicker.tsx`) has a role-specific heading, "Where is the stay?" or "Where will you park or meet?", and starts from Search name or address. Choosing a result shows Check this location with its name, address, precision, Open map (OpenStreetMap, new tab) and the credit. Only Use this location hands the place to the editor, and the editor saves it with the stay. Back to results keeps the query and results without searching again.

- Searches start 350 ms after typing stops, from 3 characters. Each new query aborts the last request, so an older answer never replaces newer results or the place being checked.
- The search field is a combobox with an inline list: arrow keys move, Enter checks a place and never submits the form. Status is announced: Searching…, places found, No matches, or search unavailable.
- No matches and Search unavailable are separate messages. Both offer Save location later, which keeps the typed text in the stay's address. Enter coordinates is always available, and a pasted "44.4939, -72.7392" fills both fields.
- Set location on a stay with an address and no place searches that address straight away.
- "Powered by Geoapify" and "© OpenStreetMap contributors" appear wherever results or a saved Geoapify place appear, including for members.

## Access points

An access point is where the crew parks or meets for a day at a destination: a trailhead lot, a resort entrance, a meeting spot. It's never the destination's weather location, which stays in the stop's own coordinates.

- **It belongs to the destination (trip stop).** Every day at the stop shares it, including days without a stop of their own that go to the base (the first stop).
- **A day can have its own instead.** It's saved with the stop it was set for (`trip_days.access_point_stop_id`) and applies only while the day is still at that stop. When an itinerary edit moves the day to another destination, the day uses that destination's point; if it moves back, its own point applies again. Moving the trip's dates keeps it with its day. `accessPointFor` in `src/lib/trip-location.ts` resolves a day's point.
- **Changing one asks which days.** As in #176's edit contract, picking a place opens a review built by the server: **Only Sat Oct 10** or **All days at Stowe, Vermont (2 days)**, with the dates, and each day that changes, before and after. Nothing is chosen until the organizer picks. When the day is the only one at its stop, the point is saved with the stop, so days added there later get it. "All days" also replaces those days' own points.
- **Removing.** A day's own point can be removed from just that day, which then uses its stop's again, or from every day at the stop. A day can't go without its stop's point on its own; set a different one for it instead.
- **Itinerary reviews say what happens to it.** When a day's destination changes, the review notes "Access point: Spruce Peak lot → Tram lot." When a stop moves to a new place it keeps its point, and the review says "Access point stays Mountain Road lot. Check it's right for Burlington, Vermont." A change of activity alone says nothing about it. Each reviewed option carries every access point on the trip as the review saw it, and `edit_trip_itinerary_reviewed` (027) refuses the save with `40001` when any of them changed since, so the notes can't go stale. A reviewed save that doesn't carry them, from a review opened before this change, gets the current review back (409) instead of saving. Reordering stops saves without a review and never changes a day's point.
- **Who.** The organizer, like every logistics edit. Members see the point, its precision, Open map and the credit, with "Managed by the organizer".

The day page's **Getting there** card (`src/components/trips/DayAccessPoint.tsx`) shows the point and whether it's for every day at the stop or only this day, with Set, Change and Remove access point. The review reuses `ItineraryChangeSheet`.

## Drive times (#209)

A day's drive goes from its morning origin to its access point. The origin is the crew stay of the night before (checkout morning counts; arrival day doesn't), unless the organizer gave the day its own starting point. The server calculates every day's drive with Geoapify's Route Matrix (`src/lib/locations/routing.ts`): by car, with `traffic=approximated` (typical traffic, not live; free-flow was optimistic in the pilot). `src/lib/trip-drive.ts` decides each day's origin, state and labels, and `src/lib/trip-drive-estimates.ts` calculates, stores and reuses them.

| State | Shown as |
|---|---|
| `available` | Stowe Motel → Spruce Peak lot · About 12 min drive · 5.6 mi · one way, calculated age/time, Directions, Estimate details |
| `stale` | The same with "Not updated: calculated … and checking again failed" and Retry |
| `unavailable` | Drive estimate unavailable, or "Route changed — couldn't update the estimate" when the day had an estimate for another pair, with Retry, Directions and Add your estimate |
| `no_route` | No road route found (a hut or a summit; the matrix returns null), with no time and no Directions, and Add your estimate |
| `manual` | About 40 min drive · one way, with "Your estimate · entered … · <note>" ("Organizer's estimate" for members), Directions, Edit your estimate and Remove your estimate |
| `no_drive` | Starting from Stowe Motel · No drive planned, with no time and no Directions |
| `missing_origin` | Choose where you're starting: no crew stay is set for the night before and the day has no starting point of its own (Set starting point, or Go to Stays) |
| `origin_not_located`, `approximate_origin` | The starting stay has no location, or the stay or place is only a town or area (Go to Stays, or Change starting point) |
| `missing_access_point` | Choose the entrance or parking |
| `approximate_access_point`, `no_destination` | Nothing extra: the Getting there card already says what's missing |

- **Stored per trip day.** `trip_drive_estimates` (028) keeps one row per day with its `route_key`: the origin and access point coordinates, the routing options and the winter closures avoided, with their exact points. A changed stay, night, starting point, access point, closure season or closure point makes a new key, so the day is recalculated and an estimate is never shown against another pair. The row's labels let Estimate details show the earlier estimate with its own pair. Estimates older than 7 days are recalculated; if that fails, a same-pair estimate is shown as stale. A failure is a state on the day, never zero minutes. Rows go with the trip.
- **Freshness and provider failure.** The server returns `age_label` and `stale` with each calculated estimate; age is measured when the response is built. The day and Overview show the age without opening details, and a stale calculated alternative stays labeled "not updated" beside the chosen manual estimate. An expired no-route result whose refresh fails becomes `unavailable` with Directions, Retry and Add your estimate, rather than claiming the old no-route answer is current. A fresh no-route result still has no Directions action. Only a pair with explicit null time and distance establishes no road route; malformed/missing figures or duplicate/invalid indices are provider failures and are never stored as no-route results.
- **Visible credit and assumptions.** Powered by Geoapify and OpenStreetMap attribution remain visible outside Estimate details, on the day and on stays with calculated results. A manual-only or unavailable day without any provider result to show carries no routing credit; an earlier pair shown in details retains its credit. Details state typical traffic, no live traffic and no departure time, alongside the closure assumptions and the reminder to check road conditions.
- **One call per closure set.** Days that need an estimate are grouped by the closures they avoid, and each group is one matrix call over its distinct origins and access points. A group that would pass the provider's 1,000 cells (origins × access points) is split into calls that each ask only for their own days' starting points and access points. Identical calls at the same time share one request; a trip's separate calls go out together, and nothing limits the account's request rate across calls or visitors. Credits per call ([Matrix API pricing](https://apidocs.geoapify.com/docs/route-matrix/#pricing)): max(sources, targets) × min(sources, targets, 10), plus 1 per 20 avoided points (rounded up), plus 1 for each full 500 km of every returned distance. Logs are counts only: `{"event":"drive_matrix","provider":"geoapify","outcome":"ok","cells":4,"no_route":1}`. `cells` is origins × access points, not credits: a 31 × 31 call logs 961 cells and costs at least 310 credits, more with avoided points or any drive of 500 km or longer.
- **Winter closures** (`src/lib/locations/closures.ts`). Geoapify routes through roads closed for the winter: Spruce Peak to Smugglers' Notch Resort comes back as 9 minutes through the closed Notch instead of the 75 minute detour. A day in a closure's usual season avoids its points when they're near the drive (inside an ellipse around the two ends, so a Vermont drive doesn't mention Mount Greylock). Today: VT 108 at Smugglers' Notch (November to mid-May) and Mount Greylock's Summit, Rockwell and Notch roads (late October to mid-May). Estimate details name each closure and always say to check road conditions. Check a new road against the state's notices, and reverse-geocode each point onto the closed stretch.
- **Approximate places get no estimate.** A town or area for the starting point or the access point asks for the exact property, place, entrance or parking instead.
- **Directions** open Apple Maps on iPhone, iPad and Mac (the Maps app in the iOS shell) and Google Maps elsewhere, between the exact points, in a new tab, so the day stays put.
- **Where it shows.** The day page's Getting there card ends with the Drive row (`DayDrive` in `src/components/trips/DriveEstimate.tsx`); only that row waits for the estimate. Overview's stays show the next departure and **View access times**, each morning linking to its day (`StayDepartures`). A stay's departures are the mornings that start there, as the crew stay or as a day's own starting point, so a stay with no crew nights still lists the days that start from it. Both read the same response. The page fetches again only when a stay, night, destination, access point or starting point changes, and keeps each answer with the plan it was fetched for, so a late answer can't show against a newer plan. Retry and changes to your estimate keep the last answer for the same plan on screen while it checks again.
- **Updating and approaches.** A changed plan says "Route changed — updating estimate" while the new answer loads, with the old duration hidden. Overview summaries explicitly label drives as one way. A Backcountry day's saved **Approach (ski or walk)** also appears as a separate row in Getting there, including while the estimate loads or no road route exists. Its entered notes never become an automatic drive or ski duration.
- **Units:** miles, like the app's mph and °F, until #172.

### Starting points

- **Change starting point** gives one day its own starting point: another saved stay that has a place (quick picks), or any place from the location picker (search or typed coordinates). It's shown as "Starting from Ridge cabin · only this day". The crew stay and the other days don't change. It's `trip_days.origin`, with `origin_stay_id` when it was picked from a stay: the day follows that stay's name and place while the stay exists, and `origin` is kept in step with them (a trigger in 029), so if the stay is removed the day keeps the place it was using. It stays the day's starting point, through lodging changes too, until the organizer resets it; when the picked stay later becomes the crew stay as well, the editor keeps it as the day's own ("kept if the crew stay changes").
- **Use crew stay again** clears it. On a day with no crew stay the night before, the button is **Remove starting point**.
- **Set starting point** is the same choice on the first day, or any day without a crew stay the night before. "Choose where you're starting" offers it beside Go to Stays.
- **No drive planned** is a checkbox in the same editor, for a day that starts on foot or skis or where the crew meets at the access point. It keeps the named starting point ("Starting from Stowe Motel · No drive planned") and gets no estimate or Directions. It's not an unknown route or no road route.
- **Moving the trip's dates keeps them with their day**, as it keeps the day's access point: they're columns on the day, and 021 moves days in place. Copy day and itinerary edits leave them alone.
- **Who.** The organizer, inline on the Getting there card: Save starting point and Cancel, focus back on Change starting point, and "Starting point saved." announced. A save the day no longer matches is refused (409); the choice stays in the form, and Review saved starting point shows what's saved now before saving again. Members see the starting point without controls.

### Your estimate

When routing has no estimate (unavailable, stale or no road route), the organizer can **Add your estimate**: a one-way drive time, an optional source or note (up to 200 characters), and the time it was entered, stored in `trip_drive_manual_estimates` (029).

- **It's for one drive.** It's bound to the origin and access point coordinates and the mode (`pair_key`, by car), and to the days it was saved for. "Use it for" offers the other days with the same drive. When a day's drive becomes another pair, the estimate is never shown as current: the card says "Your estimate, about 40 min, was for Stowe Motel → Spruce Peak lot. Edit it to use it for this drive, or remove it." Saving it again binds it to the new drive.
- **Edit and Remove.** Edit keeps the days it was saved for ticked; unticking a day removes it there. Remove asks first and lists the days. Every change checks each day it touches against what the editor showed, and a mismatch is refused (409) with the entry kept and Review saved estimate, which shows what's saved now and saves or removes against it. The editor keeps the drive it opened with, so the entry stays even when the review finds the day has no drive to estimate now, the day's last destination included; saving is then off until there is one.
- **A calculated estimate later.** If routing later has an estimate for the same drive, it's offered separately ("Calculated estimate: about 12 min · 5.6 mi" with Use calculated estimate), and your estimate stays in use until the organizer chooses. Choosing it keeps yours ("Your estimate: about 40 min" with Use your estimate). Neither replaces the other. If the chosen calculated estimate becomes unavailable, yours is shown with a note.
- **Rows go with their day.** Moving the trip's dates keeps them with the day; removing a day or the trip removes them.

## API

`GET /api/v1/trips/:id/locations?q=` returns `{results: TripLocation[]}`; an empty list means no matches. Only the organizer can search, because only the organizer edits logistics. Members get 403, and other trips get 404. A query must be 3–200 characters. Each person can search 30 times a minute (per server instance; 429, `code: "rate_limited"`). A missing key, provider failure or provider refusal (such as a 429) returns 503 with `code: "unavailable"` and no provider details.

Stay saves (`POST`/`PATCH /api/v1/trips/:id/stays…`, [trip-stays.md](trip-stays.md)) accept `stay.location`. An invalid place returns 400 with `field: "location"`.

`POST /api/v1/trips/:id/access-points` is organizer only (403 otherwise).

`GET /api/v1/trips/:id/drive-estimates` returns `TripDriveEstimates`: `days` (each with `state`, `origin` with `own` for a day's own starting point, `crew_stay`, `destination`, `estimate`, `manual`, `previous`, `pair_key`, `same_drive_dates`, `closures` and `directions`) and `stays` (each stay's departure dates and the next one from today in its time zone). Every member can read it, 30 times a minute per person (429, `code: "rate_limited"`). A provider failure is a day's state, not an error.

`PUT /api/v1/trips/:id/days/:date/origin` sets the day's starting point: `{origin, no_drive, expected}`, where `origin` is `{stay_id}`, `{location}` or `null` (the crew stay again), and `expected` is the day as the editor showed it (`origin`, `origin_stay_id`, `no_drive`). It saves through `set_trip_day_origin` (029), which locks the trip, checks the organizer, and refuses (409) a day or picked stay that no longer matches. 400 with `field: "origin"` for a place the trip can't store, 404 for a date the trip doesn't have, 503 before migration 029.

`/api/v1/trips/:id/days/:date/drive-estimate` changes your estimate through `set_trip_drive_estimate` (029). Every body has `expected`: each day it touches as `{date, entered_at, use_calculated}`, with nulls for a day without one.

| Request | Does |
|---|---|
| `PUT {pair_key, duration_seconds, note, dates, clear, expected}` | Saves it for `dates` (this day included), entered now, and removes it from `clear`. The server checks that every one of `dates` still has the drive `pair_key` names (409 otherwise) and labels it with that drive. 400 with `field: "duration"` (1 minute to 24 hours, whole minutes) or `field: "note"` (200 characters). |
| `PATCH {use_calculated, expected}` | Uses the calculated estimate for the same drive on this day, or yours again. |
| `DELETE {dates, expected}` | Removes it from this day and the days that shared it. |

All are organizer only (403), refuse a stale review with 409, and return 503 before migration 029.

| Request | Response |
|---|---|
| `preview: true`, `date` and `location` (a place, or `null` to remove) | `{ options: [{ key, label, detail, changes: [{date, date_label, before, after}], unchanged, payload }] }`: `day` and `stop`, or one option. `400` for an invalid place (`field: "location"`), a day with no destination or no point to remove; `404` for a date the trip doesn't have. |
| The chosen option's `payload`: `date`, `scope` (`day` or `stop`), `location` and `expected` | Saves through `set_trip_access_point` and returns `{ ok: true }`. `409` with the error and the current review when the trip changed since the review; `503` with `field: "location"` before migration 027. |

`previewAccessPoint` (`src/lib/trip-access-points.ts`) builds the review, and the save is rebuilt from validated fields only. `set_trip_access_point` (`supabase/migrations/027_trip_access_points.sql`) locks the trip, checks the organizer, and compares `expected` (the day's stop, that stop's point, and each day at the stop with the own point that applies) with the trip; a mismatch raises `40001` and changes nothing. A PGlite test runs each previewed option through the function and checks that exactly the days its review lists changed.

## Deployment

1. Apply `supabase/migrations/025_trip_stay_locations.sql` by hand, after 017. It adds the column and replaces `mutate_trip_lodging` with a version that saves the location. As with the other trip migrations, apply this file on its own rather than pushing the folder. Until it's applied, a stay save with a location returns 503 (`field: "location"`) rather than saving the stay without its place; saves without one work as before.
2. Apply `supabase/migrations/027_trip_access_points.sql` by hand, after 025 (it uses `is_trip_location`) and on its own; 026 is #210's tour plans. It adds the access point columns, `set_trip_access_point`, and `trip_access_points` with `edit_trip_itinerary_reviewed`, which checks a reviewed itinerary change's access points before running 022's or 023's function. Until it's applied, saving an access point returns 503, day pages show none, and itinerary changes save through 022/023 directly.
3. Apply `supabase/migrations/028_trip_drive_estimates.sql` by hand, on its own. It adds `trip_drive_estimates`, readable only by the service role. Until it's applied, estimates are still calculated, just not kept, so every visit uses credits.
4. Apply `supabase/migrations/029_trip_drive_starting_points.sql` by hand, after 025 (it uses `is_trip_location`) and on its own. It adds `trip_days.origin`, `origin_stay_id` and `no_drive`, a trigger on `trip_stays` that keeps stay-picked starting points in step with their stay, `trip_drive_manual_estimates` (service role only), `set_trip_day_origin` and `set_trip_drive_estimate`. Until it's applied, drive times work as before, and saving a starting point or your estimate returns 503.
5. Set `GEOAPIFY_API_KEY` in Vercel. Without it, search says it's unavailable and stays still save with an address or typed coordinates, and drive estimates say they're unavailable.
