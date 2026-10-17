# Precise trip locations: completion review (#208)

Reviewed October 17, 2026. The stay implementation is in commit `b3008d8`; destination access points and reviewed edit scope shipped in [#296](https://github.com/derobertsw/swttr/pull/296). Drive estimates subsequently shipped in [#297](https://github.com/derobertsw/swttr/pull/297) and [#299](https://github.com/derobertsw/swttr/pull/299). This completion changes documentation and two code comments only.

## Provider and reuse decision

Retain Geoapify for precise search and road routing. The [October 12 comparison](https://github.com/derobertsw/swttr/issues/208#issuecomment-6134840726) records Google, Mapbox, Apple, Stadia, LocationIQ and openrouteservice, including their storage, map-display and pricing tradeoffs. MapLibre/OpenFreeMap display and the unchanged Open-Meteo weather search remain separate decisions. No paid service is purchased.

Official pages checked October 17, 2026:

| Concern | Published evidence and implementation rule |
|---|---|
| Commercial production | [Pricing FAQ](https://www.geoapify.com/pricing/): free commercial production is allowed within credits, rate/feature limits and attribution requirements. Free: 3,000 credits/day, up to 5 requests/second across the account, no credit card. API 10 is currently $59/month for 10,000 credits/day; prices are assumptions to recheck in #283. |
| Cache, storage and export | [Platform services statement](https://www.geoapify.com/products-and-services/), under Open data and permissive conditions, permits caching, storing and redistributing service results. This is the published basis for keeping Route Matrix distances/times, alongside saved search results. [Routing](https://www.geoapify.com/routing-api/) says its results can be stored and redistributed; it doesn't mention geometry by name, so keeping route geometry rests on the platform statement. Offline reuse/export must retain attribution. |
| Attribution | [Terms](https://www.geoapify.com/terms-and-conditions/), Attribution: OpenStreetMap credit always; Geoapify credit on free; additional source credits where required. Keep returned source credit with saved places and show Powered by Geoapify with a follow link. Carry credits into offline/exported views. |
| Production wording | The terms still refer to production limitations and contacting Geoapify. The more specific current pricing FAQ identifies quota, rate, feature and attribution conditions. On October 17 the user chose to use the official published documentation to resolve the issue's written-confirmation requirement. No private vendor response is asserted. |
| Routing limits | [Matrix API](https://apidocs.geoapify.com/docs/route-matrix/): a regular (synchronous) request supports at most 1,000 cells (sources × targets), a hard cap rather than a default; each pair returns distance/time, with nulls when no route exists. The adapter and batch splitter enforce that bound. Typical traffic is estimated, not live. Seasonally closed roads need the curated avoids and the check-road-conditions warning described in [trip-locations.md](../../trip-locations.md). |

The 30-searches/minute per-person API limit is separate from the provider's account-wide 5 requests/second limit. It is per server instance, not a distributed quota guarantee. Provider rejections become sanitized unavailable states. Counts-only usage logs support the #283 capacity review, but an `http_429` can mean either the daily credits or the 5 requests/second limit, so check its timing before treating it as quota. A drive estimate's 7-day refresh is for freshness, not a storage restriction.

## Pilot evidence

The [original live pilot](https://github.com/derobertsw/swttr/issues/208#issuecomment-6135105504) ran October 12, with [confirmed endpoint corrections](https://github.com/derobertsw/swttr/issues/208#issuecomment-6180676222) on October 14. Supported pilot region: Vermont, New York and Massachusetts. Alta was a timezone check only. The final score is 10/10 usable search cases, not a guarantee of business coverage or winter road access.

| Case | Evidence |
|---|---|
| Hotel by name | The INN, 241 Main St, Montgomery Center, first for The Inn near Jay Peak; about 3 m from the user's confirmed pin. |
| Rental/street address | 4000 Mountain Rd resolves to Topnotch Resort's building. A private rental address was not tested. |
| Resort entrance | K-1 Base Lodge resolves as a bus stop; the user confirmed the pin. |
| Parking | Jiminy Peak has 13 unnamed Corey Road lots; Open map is needed to distinguish them. |
| Summer road | Mount Greylock summit is found, but a road route is season dependent. |
| Winter trailhead | Adirondak Loj and its lots are found; the pilot drive is 13.5 km, 18 min with approximated traffic. |
| Ambiguous name | Stowe VT and Stowe Township PA have region labels. |
| Off-road hut | Johns Brook Lodge is a hut, not proof of a road endpoint; Routing returned 400 and Matrix returned null. |
| Closure | Smugglers' Notch routes through the winter closure without an avoid; the avoid produces the detour. |
| Broad locality | Lake Placid NY/FL are town matches; the picker labels them approximate and automatic estimates require precise endpoints. |

Exact precision means a specific mapped place, not road accessibility. Only a successful routing pair establishes a calculated road estimate. No new live-provider calls or production trip edits were needed for this documentation completion. `src/test/fixtures/geoapify-pilot.json` keeps trimmed Address Autocomplete answers for five of the pilot's searches: the street address (Topnotch), "Hotel Jay", Johns Brook Lodge, Lake Placid and Jay Peak Nordic Center. The INN, K-1, Jiminy Peak, Mount Greylock, Adirondak Loj, Stowe and Smugglers' Notch evidence is only in the two linked issue comments. `src/lib/locations/routing.test.ts` has the October 15 Route Matrix answers (Spruce Peak and Lake Placid to Smugglers' Notch Resort and Johns Brook Lodge).

## Acceptance coverage

| Contract | Evidence |
|---|---|
| Search, keyboard selection and explicit confirmation | `LocationPicker.test.tsx`: labelled combobox/listbox, arrow keys/Enter, focused confirmation, Use this location, Open map, attribution and approximate-area warning. Choosing a candidate does not save an entity. |
| Recovery and response order | Same suite: back preserves query/results; slow old answers cannot replace newer results or the candidate; no matches differs from unavailable/quota/network failure; typed coordinates remain available; the saved location remains until a replacement is chosen. |
| Manual stay save | `TripStays.test.tsx` and lodging suites: name/address survives Save location later; missing key/search failure does not prevent a stay save; failed saves retain input. |
| Shared location contract | Provider fixtures, `trip-lodging-api.test.ts` and Postgres lodging tests: label/address, precision, coordinates, IANA zone, provenance, permitted ID and attribution; invalid/zero pairs rejected; omitted location preserves the saved value and null removes it. |
| Separate weather/access coordinates | `trip-access-points.database.test.ts`: changing a day/shared point leaves destination weather coordinates alone; the previewed dates exactly match the saved changes. Itinerary tests cover changed destinations and stale access-point reviews. |
| Authorization and conflicts | Location/access-point route tests enforce organizer scope and cross-trip privacy. Postgres tests execute migrations 025/027, reject stale reviews/cross-trip references and verify browser-role table/RPC denial. RLS remains enabled with no public policies; Clerk authorization is enforced by the server using the service role. |
| Server-only bounded routing | Provider and routing suites cover key absence, timeouts, quota failures, malformed responses and per-pair no-route results. Drive-estimate tests cover the 1,000-cell splitter, stale estimates and changed endpoints. |

## Verification

- Focused acceptance run, repeated October 17 on this branch: **21 files, 352 tests passed**. The Node flag avoids experimental global storage shadowing jsdom storage. The first run on the isolated branch reported 15 files and 246 tests but didn't record which files, so this list replaces it:

  ```bash
  NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
    src/components/trips/LocationPicker.test.tsx src/components/trips/TripStays.test.tsx \
    src/components/trips/DayAccessPoint.test.tsx src/components/trips/DriveEstimate.test.tsx \
    src/lib/trip-lodging-api.test.ts 'src/app/api/v1/trips/[id]/locations/route.test.ts' \
    'src/app/api/v1/trips/[id]/access-points/route.test.ts' 'src/app/api/v1/trips/[id]/itinerary/route.test.ts' \
    'src/app/api/v1/trips/[id]/drive-estimates/route.test.ts' 'src/app/api/v1/trips/[id]/days/[date]/drive-estimate/route.test.ts' \
    src/lib/locations/provider.test.ts src/lib/locations/routing.test.ts \
    src/lib/trip-lodging.database.test.ts src/lib/trip-access-points.database.test.ts \
    src/lib/trip-itinerary.database.test.ts src/lib/trip-drive-estimates.database.test.ts \
    src/lib/trip-drive-starting-points.database.test.ts \
    src/lib/trip-lodging.test.ts src/lib/trip-itinerary.test.ts src/lib/trip-drive.test.ts src/lib/trips.test.ts
  ```
- `npm run build` attempted normally and with sandbox escalation in the original checkout: Turbopack's PostCSS worker cannot bind its port (`Operation not permitted`). In the isolated worktree, Turbopack instead rejects the reused `node_modules` symlink outside its filesystem root.
- `node node_modules/next/dist/bin/next build --webpack`: passed compilation, TypeScript, static generation (37 pages) and tracing. Existing optional `mppx` MCP SDK resolution warning remains.
- `npm run lint` and `git diff --check`: passed on the isolated branch.

Responsive browser fixture evidence is recorded below. These fixtures use the actual picker and application CSS with synthetic responses, not a production Clerk session. They do not establish live device VoiceOver behavior or map-provider availability.

- **320px viewport:** keyboard ArrowDown/Enter opens the preview and focuses Check this location. Back to results retains the query. Use this location focuses Change location. A failed replacement still offers Keep current location and restores the selected place. Long name/address and attribution wrap; document width is 320px. Open map and confirmation buttons are 44px tall. [Preview screenshot](preview-320.png).
- **390px viewport:** No matches is distinct from unavailable. Save location later passes the entered text back to the fixture parent. Enter coordinates retains that text; 0,0 produces the linked validation error and focuses Latitude. Document width is 390px. [Coordinate recovery screenshot](coordinates-390.png).
- **1280px desktop viewport, 1024px editor:** an approximate result's confirmation shows the entrance/parking warning, Open map, provider/source credits and both confirmation actions. [Desktop screenshot](approximate-desktop.png).

The temporary local fixture imported `LocationPicker` and `globals.css` directly. Its synthetic fetch returned either two named results, no matches (`none cabin`), or HTTP 503 (`fail search`). It wrote no database data and used no provider key. Browser viewport overrides were reset after inspection.
