# Selected-day road geometry and provider support (#232)

Implemented October 19, 2026 on top of the map foundation delivered in #319. The existing [map/list contract](trip-maps.md) remains in place: `TripMap`, stable source identities, scoped places/days, all selectable dates, counts, timezone/provenance, candidate exclusions, and the fail-closed source loader. No new persistence model or schema migration is introduced.

## API and revision binding

`GET /api/v1/trips/:id/map?date=YYYY-MM-DD` keeps its delivered response shape. Days now also expose `crew_stay_place_id` and `meeting_place_id`; meeting uses #210's canonical access point. Pickup remains notes-only because the delivered schema has no structured pickup coordinates. A date without a saved day row stays selectable, with no invented destination or access reference.

Each day's `geometry` metadata retains mode, endpoint references and its opaque **route revision**, with `reason: "not_requested"` for eligible drives. `provider.geometry` is `"on_demand"`. The map/day snapshot revisions may change as estimates change; `day.geometry.revision` remains stable while the endpoint identities, coordinates, mode, traffic model and closure options remain unchanged. Tokens are equality checks, not sequence numbers.

`GET /api/v1/trips/:id/days/:date/geometry?revision=<day.geometry.revision>` resolves both endpoints on the server and fetches one selected day's road line. Another departure's line (#333) uses that departure's `geometry.revision` in the same parameter; a revision that no longer names a departure gets 409. For a blocked day with null geometry revision, use its day revision. A missing/malformed revision returns 400; a changed revision returns 409 with `code: "revision_changed"`; an absent date returns 404. Callers cannot submit coordinates, arbitrary place IDs or a routing mode.

The `TripMapRoadGeometry` response binds trip ID, day ID/date, revision, mode, `origin_place_id` and `access_place_id` to one result:

| State | Meaning |
| --- | --- |
| `available` | Valid provider-returned GeoJSON MultiLineString, timestamp and attribution |
| `no_route` | A current saved no-route answer or explicit no-road Routing response; no line |
| `not_applicable` | No drive, no saved day/destination, missing/approximate/invalid endpoints; no provider request |
| `unavailable` | Configuration, quota, timeout, network, malformed/oversized answer or local request cap; no line |

Geometry never replaces the manual/calculated estimate choice, stale labels or #209's missing/no-drive distinctions. A valid estimate without geometry is supported. There is no straight-line fallback, touring track or calculated drive to tonight's stay.

Both endpoints authenticate through `requireTripAccess` and reuse the existing trip-scoped source loader. Geometry rechecks membership and reloads current references after the provider/cache resolves. Changed endpoints return 409; access revocation returns the access denial. No kit, invite or crew data is loaded by the map source loader.

`useTripMapGeometry(tripId, selectedDay)` fetches only on explicit `load()`. Pan, zoom and selection alone never trigger routing. Changed identity/revision hides the old line immediately; obsolete requests abort, and a late response that ignores abort cannot restore it. Matching uses the geometry revision so a refreshed estimate does not discard unchanged road geometry. Clear protected map/list state on 401/403/404 and pass null after access loss. Clearing and reopening the same trip cannot resurrect the prior line.

## Current provider policy decision

Keep Geoapify routing and MapLibre GL JS with OpenFreeMap Positron display. Official pages checked **October 19, 2026**:

| Official source | Verified outcome |
| --- | --- |
| [Geoapify terms](https://www.geoapify.com/terms-and-conditions/) and [pricing](https://www.geoapify.com/pricing/) | Registration required. Current Free FAQ permits commercial production within 3,000 credits/day, 5 requests/second and required attribution. The terms still mention production limitations/contact; no account-specific amendment or new written support response was obtained. |
| [Routing API](https://www.geoapify.com/routing-api/) and [platform FAQ](https://www.geoapify.com/) | Routing results may be stored and redistributed; APIs support third-party renderers. This resolves the public-policy uncertainty recorded by #319. Keep linked Geoapify and data-source attribution with reused information. Five-minute private geometry reuse is within the published permission; no persistent geometry/export endpoint is added. |
| [Routing reference](https://apidocs.geoapify.com/docs/routing/) | A separate Routing call supplies MultiLineString geometry; Matrix supplies time/distance only. Use two waypoints, driving, approximated traffic and #209's current avoids. Costs depend on waypoint pairs, avoids and long routes. Avoid preferences do not guarantee closed roads are excluded. |
| [OpenFreeMap](https://openfreemap.org/), [terms updated Oct 14](https://openfreemap.org/tos/) and [quick start](https://openfreemap.org/quick_start/) | Commercial use; no public tile key/account or published ordinary interactive-map quota; no SLA. Retain OpenMapTiles/OSM credit and OpenFreeMap credit. The current offline allowance is bounded to 3,000 tiles or 50 MB, four parallel requests and an identifying User-Agent; no downloads, automated collection or map export are implemented here. |
| [MapLibre documentation](https://maplibre.org/maplibre-gl-js/docs/) | Browser WebGL renderer. Install/lazily load it in #233 only when opening the canvas; SDK, WebGL, worker or tile failures must leave the list usable. |

The existing Geoapify Free project remains configured through `GEOAPIFY_API_KEY`; no paid-plan/account change occurs. The verified routing pilot region remains VT/NY/MA, not global routing quality. No negotiated region-specific billing/data-residency entitlement was verified. Default Geoapify and public OpenFreeMap endpoints remain in use. Routing necessarily sends endpoint coordinates to Geoapify; tile requests reveal the viewed area, not saved names or notes.

## Bounds, privacy and platforms

- Map reads retain the existing 60 requests/person/minute limit and spend no routing credits. Geometry permits 20 requests/person/minute, four new provider starts/second and eight distinct in-flight calls per server instance. Identical requests coalesce. These best-effort instance limits do not guarantee the account-wide quota across search/matrix and multiple instances.
- Provider timeout: eight seconds. Maximum decoded response: 2 MB and 20,000 vertices. Return only validated geometry, never raw provider properties/errors that can echo credentials or request data.
- Private server reuse: five minutes, at most 128 entries, keyed by trip/day/route revision. No failure cache. Every hit authenticates again. Changed endpoints/options cannot reuse the prior entry.
- All geometry responses/errors set `Cache-Control: private, no-store` and `Vary: Cookie, Authorization`, matching the map API. No Next/CDN/browser/service-worker/offline cache of protected responses is added. No telemetry is emitted; never send names, coordinates, addresses, notes, provider URLs or free text to analytics.
- Geoapify and Supabase secret credentials remain server-side. OpenFreeMap needs no browser credential. A future paid tile token must be a read-only public token restricted to approved origins/app contexts with quotas, never a secret/service credential.
- Preserve linked Geoapify, OpenMapTiles and OSM attribution and saved source credits in map/list/detail contexts, including phones. Exports would require attribution and separate privacy handling; none is implemented.
- Web and Capacitor use the same authenticated HTTPS API and eventual browser renderer. Preserve the shell's `CAP_SERVER_URL` cookie/auth origin and existing exact-endpoint external directions handoff. No device-location permission or native map SDK is required. WKWebView WebGL/worker/memory recovery, attribution layout and physical handoff remain device-validation work in #235.

Read-only Supabase catalog checks on October 19 verified RLS enabled, no browser-role DML grants, service-role SELECT and zero policies across the nine source/access tables. The live origin/access/no-drive fields and pickup-notes-only schema were checked. Service-role authorization remains application-enforced. No production itinerary or schema was changed.

Verification and remaining UI/device scope: [#232 acceptance evidence](qa/232-map-data/README.md). Overview/list/daily UI and real-device validation remain #233–#235.
