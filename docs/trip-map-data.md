# Authorized trip map data (#232)

Implemented October 19, 2026. This is the shared server contract for the map and dated place list in #233/#234. The canvas, navigation entry points and physical iPhone validation belong to those subsequent issues. No new tables, geocoder, weather location, kit calculation or itinerary editor is introduced.

## Delivered foundations

| Source | Map use |
| --- | --- |
| #207: `trip_stays`, `trip_lodging_nights`, `buildLodging` | Saved stays, actual assigned nights, declared check-in/out range, previous-night origin, tonight, unplanned and No stay needed |
| #208: `TripLocation`, `accessPointFor` | Named coordinates, precision, source/provider IDs and attribution; day access override only while it belongs to the current stop |
| #209: `drivePlans`, `driveDay`, stored/manual estimates | First origin, day override or selected saved stay, checkout morning, No drive planned, pair/options/closure invalidation, age/source labels, external directions |
| #210: `trip_day_tour_plans` | Server-formatted meet time and canonical access/meeting point; pickup is currently **notes only**, without a structured place |
| #176: canonical stop/day identities | Stable source references and distinct day visits, including repeated destinations |

Legacy destination coordinates identify the activity/weather location. They remain separate from confirmed road access, with `precision: "unknown"` and `source: "legacy_destination"`; the map does not relabel them as precise parking or route a drive to them.

## API

`GET /api/v1/trips/:id/map?date=YYYY-MM-DD` returns `TripMapData` (`src/types/trip-map.ts`). Omit `date` for all days; an unknown/foreign date returns 404. Every current trip member and the owner can read it through `requireTripAccess`; this is not organizer-only.

- `places`: stable `kind:id:field` identities and explicit source references, label/address, **named** latitude/longitude, precision/provenance/attribution, mapping status, applicable dates, actual assigned nights and declared night range. Multiple dated role associations preserve visits. Coordinates never determine entity identity: coincident entities stay separate; a saved stay used as an explicit origin retains the stay's identity.
- Only assigned nightly stays and stays explicitly selected as a day's origin are included. Unassigned candidate stays remain outside the canonical map.
- `days`: stable day ID/date, server labels, `destination`, `origin`, `crew_stay`, `access`, `meeting`, `tonight` and `pickup` place references. `tonight_state` distinguishes assigned, no_stay and unplanned. Each reference resolves into `places`. An absent role is null.
- `pickup` is null, with `pickup_state: "notes_only"` when #210 has pickup notes, otherwise `"not_set"`. No geocoding of prose or invented pickup marker. View the existing Tour plan for the notes.
- `drive` is #209's typed `TripDriveDay`, including current/manual/previous estimates, age, stale flag, current pair, closure assumptions and directions. Map reads use stored estimates only and never spend routing credits or write estimates. Refresh calculations through the existing drive-estimates API, then refresh map data. A missing key, SDK or geometry cannot prevent reading the saved list.
- `revision` is an opaque SHA-256 content revision. Each day also has a revision covering its roles/places, date, No drive choice, endpoint coordinates, driving mode, traffic model and current closure points. Clock-dependent age labels and private kit/booking fields do not change it. Revisions are equality tokens, not sequence numbers; estimate refreshes do not invalidate unchanged road geometry.
- `provider` declares the renderer, public style URL and required credits. No SDK or provider key is loaded by this endpoint.

`mapping` distinguishes `missing_coordinates` (either coordinate absent/null) and `invalid_coordinates` (non-number, non-finite or out of range). Both have null coordinates. Valid zeros, including a genuine 0,0 destination, remain mapped. This read contract does not change #208's existing save validation, which rejects typed 0,0 as a suspected placeholder. Approximate places remain mapped and labeled; they cannot become routing endpoints. Invalid saved logistics coordinates also block geometry.

`GET /api/v1/trips/:id/days/:date/geometry?revision=<day.revision>` fetches **one selected day's** road line on demand. A missing/malformed revision returns 400; a changed revision returns 409 with `code: "revision_changed"`; a removed/foreign day returns 404. The server resolves both endpoints itself; callers cannot submit coordinates, arbitrary place IDs or a mode.

`TripMapGeometry` binds every result to trip ID, day ID/date, revision, mode, origin and access references:

| Geometry state | Meaning |
| --- | --- |
| `available` | Valid provider-returned GeoJSON MultiLineString, calculation timestamp and provider credits |
| `no_route` | A fresh #209 no-route result or an explicit no-road Routing answer; no line |
| `not_applicable` | No drive, missing/approximate/invalid endpoints, or no destination; no request |
| `unavailable` | Configuration, quota, network, timeout, malformed/oversized response or server request cap; no line |

Geometry never replaces the manual/calculated estimate choice or its stale/missing/no-drive distinctions. A valid estimate with unavailable geometry is supported. There is no straight-line fallback, touring track or computed drive to tonight's stay.

The geometry route rechecks membership and reloads current references **after** awaiting the provider/cache. An edit during the request returns 409; access revocation returns the access denial. `useTripMapGeometry(tripId, selectedDay)` supplies a matching client guard: load is explicit, changed identity/revision hides the old result immediately, obsolete requests abort, and even a late response that ignores abort cannot restore an old line. It returns `TripRequestError` on denial/conflict so consumers can clear protected map/list data or reload the canonical snapshot. It makes no requests on pan, zoom or selection alone. UI consumers should pass null when access is lost and clear their map/list state on 401/403/404.

## Provider/renderer decision and current policy check

**Keep #208's Geoapify data/routing; use MapLibre GL JS with OpenFreeMap's Positron style for rendering.** Geoapify publishes permission to combine its APIs with third-party renderers, and its Routing page explicitly permits storing and redistributing routing results. MapLibre/OpenFreeMap's own guide demonstrates this renderer/style integration. This is the implementation interpretation of the current public policies; no account-specific amendment or new written response from Geoapify was obtained.

Official sources checked **October 19, 2026**:

| Source | Verified outcome and implementation consequence |
| --- | --- |
| [Geoapify terms](https://www.geoapify.com/terms-and-conditions/) and [pricing/commercial FAQ](https://www.geoapify.com/pricing/) | Registration required. Free commercial production is publicly allowed within quota, feature and attribution limits; the terms still refer to production limitations/contact. Current Free quota: 3,000 credits/day, 5 requests/second. No billing/account change is made here. |
| [Geoapify platform FAQ](https://www.geoapify.com/#faq) and [Routing API](https://www.geoapify.com/routing-api/) | Third-party renderers supported; routing results may be stored/redistributed. Preserve data credits and the Free plan's follow-link to Geoapify. Five-minute private server geometry reuse is within the published reuse permission; no persistent geometry or export endpoint is added. |
| [Routing reference](https://apidocs.geoapify.com/docs/routing/) | Routing supplies MultiLineString geometry separately from Matrix. Request exactly two waypoints, `mode=drive`, `traffic=approximated` and #209's current avoid points. Base cost is per waypoint pair; avoids and long routes add credits. Avoid points are a preference and do not guarantee a closed road is excluded. No live traffic, departure-time routing or winter-road guarantee is claimed. |
| [OpenFreeMap](https://openfreemap.org/), [terms, updated Oct 14](https://openfreemap.org/tos/) and [quick start](https://openfreemap.org/quick_start/) | Commercial use, no account/key for public tiles, no published fixed quota for ordinary interactive maps, no SLA. Retain OpenMapTiles/OSM attribution; also show OpenFreeMap. No automated collection/offline download here. Current offline allowance is bounded (3,000 tiles or 50 MB, four parallel requests, identifying User-Agent); this feature does not implement it. |
| [MapLibre documentation](https://maplibre.org/maplibre-gl-js/docs/) | Browser WebGL renderer; load only when the map opens. WebGL/worker/style failure must leave the saved list available. Install/package the renderer in #233, with the installed Next lazy-loading guidance. |

The account remains the existing Geoapify Free project via `GEOAPIFY_API_KEY`. The supported routing pilot region remains the Northeast US (VT/NY/MA); a map displaying elsewhere does not expand verified route quality. No region-specific billing or negotiated data-residency terms were verified. The default Geoapify endpoint and OpenFreeMap's public tile host remain in use; their providers/CDNs receive ordinary service requests. Saved coordinates go to Geoapify only for requested routing; tile requests reveal the viewport, not the saved place names or notes.

## Limits, credentials, privacy and platforms

- Map API: 30 requests/person/minute. Geometry: 20 requests/person/minute, at most four new provider calls/second and eight distinct in-flight calls **per server instance**, with concurrent identical requests coalesced. These are best-effort local limits, not a distributed account-wide quota guarantee; search/matrix also consume the same account's credits. Provider quota failures remain an unavailable geometry state.
- Geometry timeout: eight seconds. Response limit: 2 MB decoded bytes and 20,000 vertices. Only validated geometry is returned; provider properties/errors (which may echo credentials or submitted text) are discarded.
- Geometry reuse: five minutes, at most 128 entries per instance, keyed by trip/day/revision; no failure cache. No shared Next/CDN cache, browser storage or offline trip/map cache. Every request, including a cache hit, authenticates again. A revised endpoint/mode/closure cannot read the old entry.
- All map/geometry responses, including denials/errors, set `Cache-Control: private, no-store` and `Vary: Cookie, Authorization`. Do not persist protected responses in a service worker or a shared client cache. Clear map/list/geometry data on access loss.
- `GEOAPIFY_API_KEY` remains server-only. OpenFreeMap needs **no browser credential**. A future paid tile token would necessarily be public: scope it to read-only map tiles, restrict approved HTTPS origins/app contexts using that provider's supported controls, set quota limits and never reuse a secret/service key.
- Keep linked Geoapify, OpenMapTiles and OSM credits visible in map/list/detail contexts where their data is shown, including small screens. Keep attribution supplied with saved locations. Exports would need the same attribution and separate privacy review; no export is implemented.
- Web and Capacitor use the same authenticated HTTPS API and eventual lazily loaded browser renderer. The current shell uses `CAP_SERVER_URL`; preserve its cookie/auth origin and the existing external directions handoff. No device-location permission is needed. WKWebView WebGL, worker loading, memory recovery, native handoff and attribution layout require physical-device verification in #235; they have not been tested by this API change. No native map SDK is required by this decision.
- No map-specific telemetry is emitted. Never log provider URLs, place names, coordinates, addresses, notes or tour free text to analytics. Future coarse map-open/failure counts must follow #172.

## Access-control evidence

Read-only production catalog checks on the connected **Swttr** project, October 19, 2026, verified RLS enabled and no SELECT/INSERT/UPDATE/DELETE grants to `anon` or `authenticated` on all nine source tables: `trips`, `trip_members`, `trip_days`, `trip_stops`, `trip_stays`, `trip_lodging_nights`, `trip_day_tour_plans`, `trip_drive_estimates`, `trip_drive_manual_estimates`. Each had service-role SELECT and zero public-schema policies. Live columns include the delivered day access/origin/no-drive fields and `pickup_notes` only. This corroborates migrations 014, 017 and 025–029, rather than assuming migration filenames imply deployment.

The service role bypasses RLS: `requireTripAccess` checks ownership/current membership before protected loading. `assertMapReferences` rejects foreign trip rows and foreign stop/stay/day references before reading estimates. Estimate queries are explicitly scoped by trip ID. Responses use an allowlist, omitting invite tokens, membership/owner identities, booking details, private kits and raw tour notes. No production itinerary or schema was changed.

An inactive day access override can retain the ID of a removed stop under #176's delivered edit contract. `accessPointFor` ignores that override, and neither the inactive ID nor its place is projected; the current stop's access point applies instead.

Verification details: [#232 acceptance evidence](qa/232-map-data/README.md).
