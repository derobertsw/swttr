# #235 — Trip maps: accessibility, recovery and logistics (web)

Checked November 16, 2026. This is the **web part** of #235's release evidence for the trip maps from #232 (data and geometry), #233 (overview map and list), #234 (day logistics) and the #348 fix. It also covers the per-person departures and meet times that #333 added since then.

Every result here comes from a local production build with **fictional fixture trips**. It is not evidence from a device, VoiceOver, a signed-in account, production data or participants. Those are listed under [Untested surfaces](#untested-surfaces).

## Revision and environment

| | |
| --- | --- |
| Implementation checked | `main` at `b4e63d77ba36929174219816246add9628b47731` ("Bump zod (#369)"). Fixes in this PR were then checked again on a second build of this branch. |
| Build | `next build --turbopack` (Next.js 16.4.2), served with `next start` on `127.0.0.1:3435` |
| Browser | Headless Chrome 157.0.8103.51 over the DevTools Protocol, 2× device scale factor. Phone widths emulate a touch device. |
| Machine | macOS 27.0.1, Apple silicon, Node 26.10.0. Other agents shared the machine, with load averages of 5 to 165, so timings are rough. |
| Data | Every `/api/v1/trips/*` request is answered in the browser from `fixtures.ts`, after 150 ms. No database, Supabase project, Clerk session or Geoapify request was involved. Clerk's script is blocked. |
| Map | Real MapLibre 6.15 and OpenFreeMap Positron. Each style, tile, glyph and sprite was fetched from OpenFreeMap once and then served from a local cache. The performance runs used the network every time (8 page loads). |
| QA-only edits | `preview-auth.mjs` applies three marked edits for the build only, then reverts them: the proxy skips Clerk for the three fixture trip ids, and `useUserId`/`TripProvider` read the viewer from `localStorage.qa235User`. None of them is committed. |

## Fixtures

`fixtures.ts` builds every response with the production server code (`tripFullFor`, `tripDriveEstimates`, `projectTripMap`). It uses the existing test trips, saved estimates or the fake matrix from `DayDepartures.test.tsx`, and no provider calls. Road lines are **hand-drawn fictional geometry**, keyed by each drive's real geometry revision.

| Trip | Covers |
| --- | --- |
| `trip-drive` (Vermont, Jan 8–11 2027), organizer `user-1` and member `user-sam` | First day with no starting point; Saturday's tour with a meet time, pickup notes, approach and access notes; Sunday's checkout morning and hotel change; Monday from a stay with no location; a very long stay name; two destinations at the same coordinates |
| `trip-edge` (Jan 15–18 2027), organizer | A day-only starting point (a café) to an unroutable hut (saved no-route answer); an approximate access point; No stay needed; No drive planned; an access point at latitude 0, longitude 0 |
| `trip-split` (Oct 9–12 2026, #333), as Alex (organizer), Eli and Casey | Two departures on Saturday (Pine rental, and Village hotel with a pending invitation); Casey arriving that evening and not taking part; checkout Sunday; everyone from one lodge on Monday |

## Results

**Pass** means the check passed on `main`. **Fixed** means it failed on `main` and passes on this branch's build. **Fail** means it still fails and is listed under [Bugs found, not fixed](#bugs-found-not-fixed). Raw results are in `results.json` when you re-run the checks.

### Journeys

| Check | Result | Evidence |
| --- | --- | --- |
| Overview → View trip map (organizer) | Pass | Places shows "5 of 6 places shown", the two stays and two destinations, then View trip map. The map opens with Back to Plan, the trip dates and 6 list rows. |
| Day → View day map → Back to day (organizer) | Pass | The link is `/trips/trip-drive/map?date=2027-01-09&from=day`. The summary reads "Sat Jan 9 · Backcountry skiing · Stowe, Vermont": Starting from Stowe Motel, Getting there Spruce Peak lot with the drive, its age, the closure it avoids and "Check road conditions", Meet 8:00 AM EST, Pickup (notes only), Approach (from the tour plan) and Access notes. Back to day returns to the day. |
| Directions and place links | Pass (web) | Directions goes to `maps.apple.com/?saddr=44.4875,-72.7262&daddr=44.53,-72.7816&dirflg=d`: the day's origin and access place coordinates. It, Open tour route and Open place in maps open a new tab with `noopener noreferrer`. **Untested in the iPhone app:** `target="_blank"` does nothing there until #146 adds a `WKUIDelegate`; this PR deliberately leaves that alone. |
| Return from the external app | Pass (emulated) | A focus event refetched the map once and requested no route line. The date, selected place, drive focus and line all stayed. |
| Member view (`user-sam`) | Pass | Directions, Open tour route, View day, View stay and Open place in maps; no map edit links. (The trip header's Edit trip is for any member, #176.) |
| Selected person's origin and grouped departures (#333) | **Fixed** | Eli's map follows the Village hotel: his Directions start at `44.4654,-72.6874`, and Show drive asks for that departure's revision. Show Pine rental departure switches the start, the Directions and the next line request to the rental, and requests nothing by itself. Casey sees "Not taking part · the crew starts from Pine rental". **On main**, the other group's stay read "Stay · Starting from" for Alex and Casey but only "Stay" for Eli. Organizers saw two starting points with nothing to say whose. It now reads **Other departure**, with a ring marker. |
| Edge states | Pass | The café day reads "Trailhead café · only this day" and "No road route to Bolton backcountry hut". Show drive says "No road route found, so no line is drawn" and requests nothing. The approximate access point offers no Directions, only "Choose the exact entrance or parking". No stay needed and No drive planned keep their own wording. The access point at 0, 0 is mapped, confirmed and handed to Directions as `daddr=0,0`. |
| Removed date and place | Pass | A deep link to a date the trip no longer has says "This day is no longer in the itinerary. Show all days"; a removed place says "This place is no longer available in this date scope. Clear selection". |

### Requests and lazy loading

| Check | Result | Evidence |
| --- | --- | --- |
| Overview loads no map code | Pass | No MapLibre JS chunk, CSS chunk, worker or tile. It reads `/trips/:id` and `/map` once each. |
| Day page loads no map code | Pass | No MapLibre chunk, CSS or tile, and no `/map` read. Its requests are the trip, drive estimates, weather, outing and touring equipment, as before. |
| Opening the map loads it once | Pass | The map chunk, worker and 22–27 OpenFreeMap requests load only on the map page. |
| List-first phone link | Pass | `?view=list` at 390px loads no map code or tiles until Map is pressed. |
| No eager or incidental routing | Pass | Changing through every date, selecting a place, zooming and dragging the map twice made **0** trip API requests. Show drive made exactly one geometry request; Show whole day then Show drive again made none. |
| Rapid day switching | Pass | Pressing Show drive on Sat, Sun, Sat, Sun, Mon, Sat in quick succession sent 5 requests. The first 4 were cancelled and the last answered; the line drawn was Saturday's. |

### Stale and out-of-order responses

| Check | Result | Evidence |
| --- | --- | --- |
| Saturday's line answers after moving to Sunday | Pass | Saturday's request was cancelled. Sunday kept its own line after Saturday's late answer. Back on Saturday, nothing was drawn until Show drive. |
| Older map snapshot answers last | Pass | The newer snapshot (a renamed stay) stayed after the held older one was released. |
| Endpoints change while the line loads or shows | Pass | Both times the line disappeared at once, with "The road route line isn't loaded" and Load route line, and the late answer was ignored. |
| Access lost | Pass for the map | After a 403, the list, summary and canvas cleared and the page said "You don't have access to this trip." with Retry places. The workspace header kept the trip's name until the trip's own read, which is skipped for a minute after a successful one (trip workspace, not maps). |

### Failure and recovery

| Injected failure | Result | Evidence |
| --- | --- | --- |
| Style blocked | Pass | Map unavailable in 0.8 s, with Retry map and Use list. Show drive is disabled; the list, summary and attribution stay. Use list focused Place list; Retry map loaded the map once unblocked. |
| All vector tiles blocked | Pass | Map unavailable in 0.8 s, list kept |
| TileJSON blocked | Pass | Map unavailable in 0.8 s |
| Glyphs blocked | Pass (degraded) | The map loads without any text, basemap or marker labels; markers keep their shapes and the list has every name |
| Sprite blocked | Pass, but see [bug 3](#bugs-found-not-fixed) | Map unavailable, though only basemap icons were missing |
| MapLibre worker blocked | Pass | Map unavailable in 0.8 s |
| Map JS chunk blocked | **Fixed** | Map unavailable on main too, but Show drive stayed enabled. Its status could then say "Road route line: … by car" with no map on the page. It's disabled now, like every other map failure. |
| WebGL disabled | Pass | Map unavailable in 1 s |
| Offline after load | Pass | "Map needs a connection … Offline maps and a saved offline brief are not available here." Show drive disabled, list still selectable, map back once online. #214's brief doesn't exist, and nothing claims it does. |
| Map API 500 | Pass | "Couldn't load trip places. Try again." with Retry places, which loaded the map |
| Route line 500 / 429 / unavailable | Pass | "Route line unavailable. The day's drive details still apply." with the server's reason and Retry route line, which drew the line. The drive estimate stays in Getting there. |
| Route line no route | Pass | "No road route found, so no line is drawn." |
| Route line never answers | **Fixed** | On main it said "Loading the road route line…" for good, with no Retry. It now gives up after 20 seconds, like the trip API's other client timeouts, with "The route line took too long. Try again." and Retry route line. |

### Keyboard, focus and screen-reader names

| Check | Result | Evidence |
| --- | --- | --- |
| Tab order, desktop | Pass | Back to Plan → Trip dates → Show drive → Show whole day → Skip map → summary links → place rows → Zoom in/out → attribution links. Every stop had a visible focus outline. The canvas is not focusable (`tabindex=-1`); the list and buttons do everything. |
| Skip map and Use list, desktop | Pass | Focus moves to the Place list heading |
| Skip map and Use list, phone | **Fixed** | On main, focus stayed on Skip map: the list was still hidden when it tried to focus, because Next commits `?view=list` more than a frame later. It now focuses Place list once the list is showing. |
| Select a place with Enter or Space | Pass | Focus moves to its details heading; the row is `aria-pressed=true`; the live region says "Selected Stowe Motel. Dates: 2027-01-08, …" (see [bug 2](#bugs-found-not-fixed)) |
| Show drive and zoom by keyboard | Pass | Focus stays on the control; Show drive becomes `aria-pressed=true` |
| Tab order, phone | **Fail**, low | See [bug 1](#bugs-found-not-fixed) |
| Accessible names (`Accessibility.getFullAXTree`) | **Fixed** | No unnamed buttons, links or comboboxes. Regions: Map view, the day summary, the selected place, and MapLibre's canvas region "Trip places map. Use the place list for keyboard navigation." The date picker is "Trip dates". On main, "Map controls" was a `div` with an `aria-label`, which isn't exposed; it's now a named group. |
| Back to day | Pass, low | Lands at the top of the day with focus on the page (Next's normal navigation), not on Getting there where View day map was. See [bug 5](#bugs-found-not-fixed). |

### Layout, appearance, zoom and motion

Checked at 320, 390, 768, 1024 and 1440px, in light and dark, on Saturday's day map; plus 390px member List, 320px all days and a 320px List with a longer access point name.

| Check | Result | Evidence |
| --- | --- | --- |
| No sideways page scroll | **Fixed** | Main overflowed at 320px with "Directions to Zero-coordinate test point" (page 324px wide) and at 200% text on 390px. The Directions button couldn't wrap. It wraps now; nothing in the map view overflows at any width. |
| A place counted as shown is drawn | **Fixed** | At 320px on main, Saturday said "3 of 3 places shown" but the Stowe, Vermont triangle was missing. Its label collided with Stowe Motel's, and MapLibre hides a whole symbol when its required label doesn't fit. Labels are now optional: a colliding label is dropped and the marker stays. |
| 44px targets | **Fixed** | Zoom in/out were 42 × 44 on main and are 44 × 44 now. Everything else in the map view is at least 44px on phones. At 768px and up with a mouse, Directions and the header's Edit trip are 36px tall: the design system's `sm` size, which is 44px on phones and coarse pointers. |
| Light and dark contrast | Pass | Rendered text in the map view: lowest 5.47:1 in light, 8.47:1 in dark (55–64 text elements each; canvas text not included). The basemap stays light in dark mode. |
| Attribution | Pass | OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors and Powered by Geoapify are visible links in every view, list and failure state, 14px, each 44px tall, below the map controls. |
| 200% page zoom (640 CSS px at 2×) | Pass | No overflow; no targets under 44px |
| 400% page zoom (320 × 256 CSS px at 4×) | Pass | No sideways scroll and no targets under 44px. The map is taller than the 256px viewport; cooperative gestures are on, so a plain wheel or one-finger drag should scroll the page past it (not exercised by gesture here). |
| 200% text (Chrome font size 32px) | Map view passes; app shell **Fail** | At 1280px nothing overflows. At 390px the map view fits, but the app header's Open menu button and bottom tab bar widen the page to 454px. See [bug 6](#bugs-found-not-fixed). |
| Long names | Pass | The 80-character stay name wraps in list rows, details and the summary |
| Reduced motion | Pass | With `prefers-reduced-motion: reduce`, every transition in the map view is 0.01 ms. Fitting, zooming and Show drive always use `duration: 0`, and scrolling to a selection is instant. |

### Performance

Main build. Fixture API answers after 150 ms; Clerk is blocked, so its script isn't counted; tiles come from the real network. Medians of three runs at 1440px. "List" is when the place list or day summary renders; "canvas" is MapLibre's `load` (the controls enable), about 1–3 s before tiles finish painting.

| Profile | List | Canvas ready | Overview Places |
| --- | --- | --- | --- |
| Unthrottled | 0.96 s | 1.88 s | 1.04 s |
| CPU 4×, 150 ms RTT, 1.6 Mbps down, 750 kbps up | 5.06 s | 13.95 s | 3.76 s |

| Asset | Size |
| --- | --- |
| MapLibre JS chunk, map page only | 1,043,902 B raw, 284,200 B gzip (278 KB transferred) |
| MapLibre worker, map page only | 518,806 B raw, 147,471 B gzip |
| MapLibre CSS chunk, map page only | 71,339 B raw, 10,188 B gzip |
| JS transferred: Overview / map page | 324 KB / 613 KB |
| OpenFreeMap style, TileJSON, sprites, glyphs and tiles for Saturday | 27 requests, about 1.2 MB |

The list renders well before the canvas, and throttling widens the gap from about 1 s to about 9 s. On the map page `/map` is only requested after the trip itself has loaded, so on slow connections the list waits for two round trips in a row. A before-maps comparison of the core trip load wasn't built. The Overview's map cost is its one `/map` read, with no map code.

## Bugs fixed in this PR

All in map code, each with a test that fails without the fix.

| # | Severity | Bug | Fix |
| --- | --- | --- | --- |
| A | Medium | With two departures, the other group's stay read "Starting from" for the organizer and crew, and only "Stay" for the other group: two starts on one map with nothing to say whose (#333) | `dayRoles` gives it **Other departure**, listed after tonight's stay, with a ring marker. `trip-map-presentation.test.ts` |
| B | Medium | On phones, Skip map and Use list left focus on the button: the list was still hidden when focus was attempted | Focus once `?view=list` has committed; if List is already showing, focus it at once. `TripMapView.test.tsx` |
| C | Medium | A mapped place could vanish from the canvas when its label collided with a nearby place's label (320px: 2 of "3 shown") | `text-optional: true` on the marker layer. `TripMapCanvas.test.tsx` |
| D | Medium | The day summary's Directions button couldn't wrap: sideways scroll at 320px with longer access point names, and at 200% text | Lets that button wrap and grow from 44px. `TripMapDay.test.tsx` |
| E | Low | A route line request that never answered loaded forever, with no Retry | 20-second client timeout with a retryable message. `useTripMapGeometry.test.ts` |
| F | Low | When the map JS chunk failed, Show drive stayed enabled and its status could report a line on a missing map | The chunk's error boundary reports a map failure. `TripMapView.test.tsx` |
| G | Low | Zoom in/out were 42px wide | 44 × 44 icon buttons. `TripMapCanvas.test.tsx` |
| H | Low | "Map controls" wasn't exposed to assistive technology | `role="group"`. `TripMapCanvas.test.tsx` |

## Bugs found, not fixed

| # | Severity | Bug | Recommended fix |
| --- | --- | --- | --- |
| 1 | Low | On phones, Tab reaches the day summary and selected place, which sit below the map, before the map's zoom controls and attribution above them (WCAG 2.4.3) | Render the map section before the list pane in the DOM below `lg`, using the `desktop` state `TripMapView` already has, and keep today's order on desktop |
| 2 | Low | Place rows, details, "View day · 2027-01-09" and the selection announcement use ISO dates, while the date picker and summary say "Sat Jan 9" | Label visits through `data.dates`, which the API already sends |
| 3 | Low | Before the first load, any tile or sprite error replaces the whole map with Map unavailable. A missing sprite only loses basemap icons, and one flaky tile loses the map | Before `load`, fail only on style, source and WebGL errors; ignore resource errors that carry a `tile` or sprite URL, as after load |
| 4 | Low | "Loading map… The list is ready." clears on MapLibre's `load`, about 1–3 s before tiles paint, so the map shows a blank panel without a status | Clear it on the first `idle` |
| 5 | Low | Back to day lands at the top of the day page with focus on the page, not on Getting there where View day map was | Link back to `#getting-there-<date>` (the day page already scrolls to it) and focus that heading in the day page's hash effect. The second half is day page code. |
| 6 | Medium, app shell | At 200% text on a 390px phone, the app header's Open menu button and bottom tab bar widen the page to 454px. The map view itself fits. | Let the header and tab bar wrap or shrink at large text sizes (`PageLayout`/`AppSidebar`, outside maps) |
| 7 | Low | On the map page, `/map` waits for the trip read, which slows the list on slow connections | Start `useTripMap(id)` alongside `useTrip`, keeping the trip as the refresh trigger |
| 8 | Info | Turbopack emits about 4.8 MB of unused MapLibre files into `.next/static/media` (the dev builds, a second CSS and the `.mjs` entry). Browsers never request them; it's deployment size only. | Point the worker URL at a copy of just `maplibre-gl-worker.mjs`, or accept |
| 9 | Low, #209 | An unroutable hut's drive still says "Avoids VT 108 through Smugglers' Notch …" | Leave out closures for no-route drives in #209's labels |

## Untested surfaces

- **iPhone app (Capacitor/WKWebView):** WebGL, worker and memory recovery; safe areas around the map, controls and attribution; touch scrolling past the map; and the external handoffs, which do nothing in the app until #146.
- **VoiceOver or any screen reader** on a device or desktop. Names and roles come from Chrome's accessibility tree only; announcements weren't heard.
- **Signed-in accounts and production data:** real Clerk sessions, the authorized API and geometry endpoint, cross-trip and revoked access on the server, and Geoapify's real route lines.
- **Editor round trips** from map links to the day, stay and destination editors and back, including failed edits and focus return.
- **Real external return**, leaving for Apple or Google Maps and coming back; it was emulated with a focus event. **Offline entry**: the app has no service worker, so an offline cold start never reaches the map.
- **Real browser zoom and text settings**: emulated with device metrics and Chrome's default font size.
- **Participant study** (six travelers, the five-of-six target), and #172's analytics events, which don't exist yet.
- Safari and Firefox; Android; tablets with a coarse pointer.

## Re-running

From the repository root, with the dependencies installed and `.env.local` present:

```sh
node docs/qa/235-trip-maps/preview-auth.mjs apply
npx next build --turbopack; node docs/qa/235-trip-maps/preview-auth.mjs revert
npx next start -p 3435 -H 127.0.0.1 &
node docs/qa/235-trip-maps/run.mjs --out /tmp/qa235 [group ...]
```

Groups: `lazy journeys departures edge keyboard ax recovery stale layout perf shots`. Run `revert` even if the build fails; it checks that the three files match `HEAD` again. `fixtures.mjs <out.json>` writes the fixture responses on their own. The first run fetches OpenFreeMap resources once into `<out>/tile-cache`; later runs reuse them, except `perf`.

Files: `fixtures.ts` (trips), `fixtures.mjs` (loads them through Vite), `clerk-server-stub.mjs` (lets the trip modules load without Clerk), `preview-auth.mjs`, `cdp.mjs` (a small DevTools Protocol client) and `run.mjs` (the checks).
