# #233 — Overview map and synchronized place list

Implemented and checked October 19, 2026. Consumes the #232 authorized TripMap projection/provider decision merged in #319 and completed in #321. Daily road lines and directions stay with #234; integrated device/research validation stays with #235.

## Implementation

- Overview's Places section sits immediately after Next step, shows mapped/total coverage and saved stays/destinations, and links to `/trips/:id/map`. It imports no renderer/SDK.
- The nested view uses the existing page shell. Desktop has a list/details pane and map; phone has labeled Map/List controls and in-flow details. Date, entity selection and phone view live in query parameters; only IDs/dates are used. Explicit row/marker/group choices reveal and focus their details/named choices; background updates and history restoration do not steal focus. Internal list scroll uses a number in the current browser history entry, with no protected data in storage.
- All days is the default. Every API itinerary date stays selectable, even without mapped places. Approximate, invalid, absent and unconfirmed coordinates retain their actual labels. Dated roles come from the API visits. Repeat visits stay one entity; candidates aren't added by this UI.
- Bundled shape icons plus role text distinguish stays, destinations, origins, access/meeting and pickup. Clusters open individually named choices, including coincident entities at maximum zoom. Camera movement never filters rows, and background snapshot/selection changes don't refit the extent. Show all places explicitly restores it. No lines are fabricated.
- Links reuse the existing day plan, destination editor and anchored stay on Overview. Members see view actions; owners additionally get the canonical edit link. There is no map-specific mutation/editor. Existing save/scope/conflict handling remains in those editors.
- Next's installed lazy-loading and search-parameter/history guides were read. A client-only dynamic boundary loads MapLibre 6.15 only in the map view, catches failed imports/rendering, and supplies list recovery. The matching ESM worker is emitted as a local hashed asset; no external worker CDN or browser credential is added.
- Component-owned map snapshots abort obsolete loads, reject mismatched trip IDs, refresh on editor/external return and clear on 401/403/404. The existing trip provider remounts children when the Clerk session changes. No database, policy, geocoding or recommendation changes.
- Skip map, visible focus, native date selection, pressed-state rows, selection announcements, 44px controls/hit areas, nonanimated extent/zoom and cooperative gestures support access without map gestures. Attribution wraps directly below the map and remains in List/recovery states.

## Layout study before implementation

Reviewed [layout-study.html](layout-study.html) in the browser before building the components. It juxtaposes a desktop split and a 320px phone with an unusually long accommodation name, repeat dates, coincident destination/access and an unmapped pickup. The check supported wrapped rows, ordinary-flow selected details and a separate attribution area; no stacked map sheet was introduced. This was an agent layout review of fictional fixtures, not a participant study.

## Reproducible browser fixture

From the repository root, with port 3000 free:

```sh
node docs/qa/233-overview-map/preview.mjs
```

Open `http://127.0.0.1:3000/`. The harness renders the **production map/list components and design tokens** through Vite. Its small Next link/dynamic/history shims permit isolated fixture testing without Clerk or a production trip. `fixture.json` is regenerated from the existing deterministic drive-trip fixture and server map projection. It contains fictional itinerary/provider data only. The harness is outside application routes and isn't deployed; no authentication bypass was added.

Browser observations:

| Check | Result / evidence |
| --- | --- |
| Desktop, long names and real renderer | Local MapLibre worker and OpenFreeMap tiles loaded. Long labels wrapped; selected row and outlined map icon agreed. [Desktop](desktop.png). |
| 320px phone | Map/List switch, bounded map, wrapped attribution and ordinary-flow selected details. Document width stayed 320 CSS px. [Map](phone-320-map.png), [dated list after refresh](phone-320-list.png). |
| 390px member | Named list/details stayed readable; no edit links; document width stayed 390 CSS px. [Member list](phone-390-member-list.png). |
| Coincident cluster | Clicking the real numbered cluster exposed both Stowe and Smugglers' Notch as named buttons while retaining all six itinerary rows. Choosing one updated the entity ID/selected detail; browser Back cleared that selection. [Named choices](desktop-cluster.png). |
| Data/date restoration | Selecting January 10 and the unmapped Village Inn survived a browser reload with the same query and selected date. |
| Style/tiles failure | Forced a missing style in the fixture. Map unavailable → Use list focused Place list and retained the saved itinerary/details. [Failure](phone-390-failure.png). |
| 200% reflow equivalent | Checked a 640 CSS px viewport (half the 1280px desktop width), including controls, long names and attribution ([reflow fixture](reflow-640.png)). Native browser zoom keyboard shortcuts had no effect in this browser; actual 200% page zoom is not claimed. |

No production itinerary was modified, no live routing request was made, and no device-location permission was requested. The map loads ordinary public tiles. A physical iPhone/Capacitor session, assistive-technology reading, actual browser page zoom, signed-in editor round trip and participant logistics journeys remain unverified here and belong in #235's integrated release evidence. Offline maps/brief storage aren't implemented; the UI states that explicitly.

## Automated checks

Focused regression: **9 files / 95 tests passed**, including **25 new tests** for the map hook, canvas, synchronized view and Overview summary. Coverage includes zero/one/many points, explicit fit versus background pan preservation, quantized/coincident feature identity, late cluster/request results, authorization loss, canonical role-based links, date/entity deletion, deep-link/history scroll restore, keyboard Skip map, offline and SDK/style failure.

```sh
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  src/components/trips/TripPlacesSummary.test.tsx \
  src/components/trips/TripMapCanvas.test.tsx \
  src/components/trips/TripMapView.test.tsx src/hooks/useTripMap.test.ts \
  'src/app/trips/[id]/page.test.tsx' src/components/trips/TripStays.test.tsx \
  src/components/trips/TripProvider.test.tsx src/lib/trip-map.test.ts \
  'src/app/api/v1/trips/[id]/map/route.test.ts'
```

`NODE_OPTIONS=--no-experimental-webstorage npm test -- --run` passed the full suite: **174 files / 2,558 tests**. `npm run typecheck`, `npm run lint`, `npm run knip` and `git diff --check` passed in the isolated worktree with locked dependencies. The standalone QA preview is registered with Knip; Vite is a direct development dependency at the existing locked version.

`npm run build` passed with locked Next.js 16.4.0/Turbopack in the isolated main-based worktree, including compilation, TypeScript and prerendering. The bundled MapLibre worker asset was included. This supersedes the earlier environment-restricted Turbopack runs in the shared checkout.

Only #233 files were carried into the isolated main-based PR branch. Existing shared-gear behavior on main was retained; unrelated local trip, drive, map-data and recommendation work was left in the original checkout.

## Review follow-up — October 20, 2026

Addressed all four inline review findings:

- A loaded map tolerates transient tile, glyph and sprite errors. Initialization failures and WebGL context loss still offer list recovery.
- Scroll positions are saved at most once per half-second in an animation frame, with guarded history writes. Navigation first flushes the outgoing position; obsolete timers/frames are canceled on navigation, scope changes and unmount.
- Overview Places is a named section/region through the existing Card slot.
- A matching encoded stay anchor is restored once after its lodging article renders. Saved-plan refreshes do not repeat the scroll.

Eight added regression cases cover resource-error recovery, history write limits/errors/cancellation, delayed encoded anchors and absent/unmatched fragments; the existing Overview test now also checks its named region. Focused review run: **4 files / 42 tests passed**. Full suite: **178 files / 2,614 tests passed**. Typecheck, lint, Knip, the default Next.js 16.4.0/Turbopack production build and `git diff --check` passed.
