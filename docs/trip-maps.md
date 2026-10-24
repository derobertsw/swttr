# Trip map data and provider contract (#232)

Implementation step 1 of [#222](https://github.com/derobertsw/swttr/issues/222). This supplies the server foundation for the shared overview map/list (#233) and daily logistics (#234). It does not add the canvas or change trip navigation. No migration or new itinerary persistence is required.

## Saved data API

`GET /api/v1/trips/:id/map` returns the whole trip. `?date=YYYY-MM-DD` returns that day's places and logistics, with every itinerary date still available in `dates`. Invalid dates return 400; dates outside the current trip return 404. A day with no saved plan row or no mappable places remains selectable.

The typed response is `src/types/trip-map.ts`. It includes:

- Stable IDs formed from the source entity and location slot; source references identify the existing stay, stop or day editor. Coordinates do not determine identity. Co-located stops remain distinct. Multiple visits to a shared stop/access point use one place with separate dated associations. A stay can have both stay and morning-origin roles.
- Named latitude/longitude, mapping status, precision, timezone and saved provenance/attribution. `(0, 0)`, zero latitude and zero longitude are valid. Missing coordinate pairs and invalid/partial pairs are distinct. Neither produces a marker.
- Only chosen nightly stays and stays explicitly selected as an origin. Candidate/unassigned stays are excluded. Stay night ranges and actual assigned nights remain separate.
- Server-resolved origin, destination, access and tonight references, using `drivePlans`, `accessPointFor` and the existing lodging summary. Since #333 each day also has `departures` (each group's label, people, origin place, drive and route revision, the crew's first and identical to the day's own) and `people` (each person's departure, starting point and tonight's stay). The map follows the signed-in person's departure and night by default (`followDeparture`); someone with no departure that day sees the crew's drive, labeled "Not taking part · the crew starts from Pine rental", and the day summary lists every departure with Show … departure to follow another; another departure's road line is requested with its own revision, only when someone asks for it. Checkout mornings start at the previous night's stay. A day-only origin or access override keeps its canonical meaning. A deleted origin stay may leave a saved location snapshot; the map never follows its old ID into another trip.
- Existing calculated, manual, stale, unavailable, no-route, no-drive and missing/approximate-location drive states, age/source details and exact-endpoint Apple/Google directions. Old estimates stay attached to the old labelled pair in `previous`. No failed or missing estimate becomes zero minutes.
- Tour objective, meet/timezone labels, route link and access notes. The delivered #210 schema has **pickup notes only**, without a pickup location. `pickup.state = notes_only` exposes those notes and a null place reference; it never invents a pickup coordinate or parses a location from free text.

Legacy `trip_stops.latitude/longitude` are destination/weather coordinates, without recorded precision, address or provider provenance. Their map precision is explicitly `unknown`. They are never substituted for a confirmed road access point. The existing `TripLocation` contract supplies exact/approximate precision for stays, origins and access points; there is no separate confirmation field to synthesize.

## Estimates, geometry and revisions

Map reads use the existing estimate store with `refresh: false`: no provider calls or writes. Fresh stored results are displayed; expired results are labelled stale, expired no-route results become unavailable, and missing results remain unavailable. The existing drive-estimates endpoint remains responsible for refreshing estimates. Thus opening the map, selecting dates and panning spend **zero routing credits** and work without `GEOAPIFY_API_KEY`.

Selected-day on-demand road geometry is available through a separate authenticated endpoint, described in [the geometry/provider contract](trip-map-data.md). Eligible days expose `geometry.state = unavailable`, `reason = not_requested` until explicitly requested; blocked days expose `not_applicable`. The response contains a real provider MultiLineString or an explicit unavailable/no-route/not-applicable result. A matrix supplies time/distance only: there is no straight-line road fallback.

The trip and day revisions are opaque SHA-256 equality tokens derived from saved projected context and estimate state. Response-time age labels are excluded, so reading again a minute later does not change a revision. Scope changes retain the same trip revision. A route revision includes trip/day identity, origin/access references, coordinates, driving mode, approximated traffic and seasonal closure options from #209. Changed endpoints cannot reuse the previous revision or current estimate.

Tokens are **not sequence numbers**. #233/#234 consumers must use an abort signal/request sequence and match the requested trip/date before applying a response; an older response must never replace a later selection or refreshed context. Clear private state on 401/403/404. The implemented selected-day geometry request binds its response to the current route revision, validates it again after an asynchronous provider call and discards stale results, with bounded requests/timeouts and permitted private caching. See the current contract for provider reuse evidence and limits.

## Provider decision rechecked October 19, 2026

The [approved #208 decision](https://github.com/derobertsw/swttr/issues/208#issuecomment-6134840726) chooses **MapLibre GL JS + OpenFreeMap** for display and **Geoapify** for search/routing. This foundation records the renderer, Positron style URL and required attribution in the response; #233 installs/lazily loads the renderer only inside the map view. No map dependency is loaded by the itinerary or My kit.

| Concern | Verified result / implementation boundary |
| --- | --- |
| Basemap compatibility | [OpenFreeMap quick start](https://openfreemap.org/quick_start/) documents MapLibre integration. Its [public service](https://openfreemap.org/) permits commercial apps without keys or a map-view/request quota and has no SLA. Geoapify locations remain separate saved data; no Google/Mapbox data is introduced. |
| Display credit | Keep OpenMapTiles and OpenStreetMap credit visible, including on phones; retain OpenFreeMap credit. Add linked Powered by Geoapify near reused Geoapify information and preserve each location's saved attribution. OpenFreeMap style attribution alone does not supply Geoapify credit. |
| Geoapify account limits | [Pricing](https://www.geoapify.com/pricing/) currently allows commercial production on Free within 3,000 credits/day and 5 requests/second with attribution. The older [terms](https://www.geoapify.com/terms-and-conditions/) still refer to production limitations and contacting support. No paid plan, account upgrade or new region-specific entitlement was verified. |
| Geometry/storage/export | [Routing docs](https://apidocs.geoapify.com/docs/routing/) describe geometry, while saved geocoding output has a separate [storage allowance](https://www.geoapify.com/geocoding-api/). The later implementation-time check found explicit storage/redistribution permission on the official Routing product page and third-party renderer support in the platform FAQ. See [current sources and implementation limits](trip-map-data.md); five-minute private geometry reuse is implemented, without persistent geometry or an export endpoint. |
| Basemap cache/export | [OpenFreeMap terms](https://openfreemap.org/tos/) were updated October 14. Area downloads have explicit tile/size/concurrency/User-Agent bounds; those allowances do not implement offline maps here. No tile bundling, export or offline download is added. A saved trip brief must not claim to contain the map. |
| Regions | The earlier #208 pilot covers VT/NY/MA, with Utah used only for timezone verification. No broader routing coverage or winter-road accuracy is claimed. Existing closure handling and check-road-conditions language remain necessary. |
| Browser credentials | OpenFreeMap needs no browser token. Keep private Geoapify and Supabase credentials server-only. A later paid tile provider must use its public credential with restricted web origins/app contexts; never substitute a service credential. |
| Web/iOS | [MapLibre](https://maplibre.org/maplibre-gl-js/docs/) is a WebGL browser renderer. WebGL/WKWebView support and memory/recovery on a real iPhone still require #235 validation. The current iOS navigation delegate opens external main-frame URLs through the system; reuse #209's exact-endpoint HTTPS directions URLs. Do not introduce another external-link SDK or request device location. |

No route-provider pilot or phone/device acceptance test was performed for this foundation. The map/list must remain usable when the SDK, tiles, WebGL or connection fails; those UI behaviors are owned by #233–#235.

## Authorization, deployed checks and privacy

Every API request calls `requireTripAccess`, including selected-date reads. Queries are scoped by `trip_id`; references are checked against the loaded trip before role resolution. No foreign entity is fetched by an unvalidated reference. The loader avoids member kits, shared gear, conditions and invitation-token reads, and returns an explicit allowlist rather than spreading stay/tour records. Booking URLs/status/notes, raw tour records, crew identities and private kits are absent.

A read-only catalog query on the connected Swttr Supabase project on October 19 verified RLS enabled, no SELECT grants to `anon`/`authenticated`, and zero policies on all nine consumed/access-control tables: trips, stops, days, members, stays, lodging nights, tour plans, drive estimates and manual drive estimates. This matches migration 014 and later service-only migrations 017/026/028/029. The server service role bypasses RLS, so application authorization remains mandatory. No production rows or schema were changed.

Success and error responses use `Cache-Control: private, no-store` and `Vary: Cookie, Authorization`; do not add a shared map-response cache. Requests use the existing per-user limiter (60/minute, best effort per server instance). No map telemetry is added; names, coordinates and notes must stay out of future analytics. The provider sees normal public tile requests only when #233 opens its canvas.

## Verification and remaining delivery

Local verification on October 19: 89 tests passed across the map projection/API, drive logic/API and trip access/loading suites; `npm run lint`, `npm run typecheck` and `npm run build` passed. No signed-in browser or real-device map validation is claimed for this API-only slice.

Fixtures exercise checkout/moving days, repeated/co-located entities, first-day and day-only origins, saved/deleted stay snapshots, day/shared access, zero/missing/invalid/approximate coordinates, candidate exclusions, No drive planned, No stay needed, empty-date selection, manual/stale/no-route/unavailable estimates, endpoint revisions and notes-only pickup. Route integration tests use the real access helper and PostgREST query builder with a deterministic transport to cover organizer/member reads, non-member/left-member/cross-trip denial, scoped queries, fail-closed source loading, estimate-table failure and private headers.

#233 supplies the shared accessible canvas/list and request-order handling; #234 adds daily entry and drive context; #235 records authenticated accessibility, recovery, participant and real-iPhone evidence. These remain separate delivery work. Selected-day geometry and asynchronous response guards are now implemented in the follow-up [geometry/provider contract](trip-map-data.md); the estimate-without-line state remains supported when routing fails.
