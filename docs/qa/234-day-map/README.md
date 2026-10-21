# #234 — Daily origins, access points and directions in map context

Implemented and checked October 20, 2026, on top of #232's map/geometry contract and #233's shared map/list. Integrated device, assistive-technology and participant validation stays with #235.

## Implementation

- **Entry.** The Day page's Getting there card ends with **View day map** (`/trips/:id/map?date=…&from=day`). Nothing map-related loads on the Day page, and My kit keeps its position. The map page's back link returns to the selected day when it was opened from one.
- **Day summary.** Selecting a date in the shared map view adds a summary in words: Starting from, Getting there (access point, precision and #209's exact drive state), Meet, Pickup (notes only), Approach (ski or walk), Access notes and Staying tonight. Every line comes from the server projection. The approach is labelled *From the tour plan · not a calculated route or time*. No stay needed and No drive planned keep their own wording. A calculated estimate keeps its age, the closures it avoids and *Check road conditions before you drive*. On phones the summary follows the bounded map, like a selected place; on desktop it heads the list pane beside the map.
- **Roles.** On a selected day, markers and list rows use the day's own server references: Starting from, Access/Meeting point, Destination, Staying tonight, and Stay for last night's crew stay when the day starts somewhere else. One place can hold two roles ("Starting from · Staying tonight"). The list follows the day's order. The whole-trip view keeps #233's labels.
- **Show drive / Show whole day.** Show drive fits the origin/access pair and requests that day's road line once, through #232's revision-bound geometry endpoint. Selecting dates, places or panning never calls the router. The line is drawn only from returned provider geometry whose origin/access IDs match the day's. A known estimate without a line says *Route line unavailable* and offers a retry. A no-route day says no line is drawn. A changed pair removes the old line at once and ignores late answers. No straight line, touring track or line to tonight's stay is ever drawn. The road layer is added beneath the markers only when geometry arrives.
- **Handoffs.** **Directions to [access point]** reuses #209's `Directions` handoff with the saved origin and access coordinates. **Open tour route** and **Open place in maps** are separate links. Without a valid pair there's no Directions link. The summary instead links to the canonical fix: Set starting point, the stay's exact location, Set access point, Choose the exact entrance or parking, or Check access point. For a stale or failed estimate it links to the day plan, which checks the time again.
- **Editors.** The summary links organizers to Getting there, the tour plan and tonight's stay. Members get only reading and navigation links. Edits happen in the existing editors, with their scope previews and conflict handling. The Day page now scrolls a cold `#getting-there-<date>` or `#tour-plan-heading` link to its section once the day renders. A refreshed map snapshot with a new route revision hides the old line.
- **API.** The map projection adds the tour plan's `approach_notes` to `day.tour`. That is text only; no place, line or estimate is derived from it.

## Acceptance checklist

| Criterion | Status |
| --- | --- |
| Origin, access/meeting point, tonight's stay and pickup with role labels; checkout, moving day, first-day origin, day-only override; No stay needed vs No drive planned | Done; projection from #232, labels/tests here |
| #209's estimate states and recovery; route line only from permitted, current geometry | Done |
| Known estimate without geometry; separately labelled approach; no straight line, invented ski ETA, doubling or winter-access assurance | Done |
| Directions with saved endpoints; separate place/tour-route links; refinement action for missing/approximate access | Done (web). See native limits below |
| Date, place, map/list view and list scroll preserved after external-app return | Done in the web view (query parameters plus #233 history state). Not checked on an installed app |
| Corrections through canonical editors; edits invalidate geometry | Done through links; editors unchanged |
| Logistics readable without the canvas or edit mode; map stays behind View day map | Done |
| Offline/SDK/provider failure keeps text and links | Done. #214's saved brief doesn't exist yet, so the offline card still says none is available |
| Fixture coverage | See automated checks |
| Destination handed to the external app verified | Unit tests assert the Directions URL's origin/destination against the day's origin/access place coordinates. Browser check below. Real iPhone return not verified |

## Native app limitation (#146)

The iOS shell opens external main-frame navigations in the system, but `target="_blank"` links currently do nothing there (#146: no `WKUIDelegate`). Directions, Open tour route and Open place in maps reuse the app's existing `target="_blank"` handoff, like the Day page's Directions. In the installed iPhone app they won't open until #146 lands. This PR doesn't change the native shell; #146 owns the helper and #235 owns the device check.

## Browser fixture

From the repository root:

```sh
PORT=3234 node docs/qa/234-day-map/preview.mjs
```

Open `http://127.0.0.1:3234/?date=2027-01-09`. The harness renders the production `TripMapView` with #233's Next shims. `fixture.json` is projected from the deterministic drive-trip fixture, with fictional saved estimates and a fictional tour plan. The geometry endpoint is stubbed in the page. Its Saturday line is **hand-drawn fictional geometry**, not a provider answer. No auth bypass, database call or routing request is involved.

| Check | Result |
| --- | --- |
| Desktop Show drive | Fitted the motel/lot pair. Drew the stubbed line beneath "Meeting point" and "Starting from · Staying tonight" markers. Status line names the pair. [Capture](desktop-show-drive.jpg) |
| Directions handoff | In the pane (Apple UA) the link was `maps.apple.com/?saddr=44.4875,-72.7262&daddr=44.53,-72.7816&dirflg=d`: Stowe Motel to Spruce Peak lot, the day's origin and access places. Opens in a new tab |
| Moving day (Sun) | Starting from Stowe Motel; Staying tonight Village Inn, Location not set; known estimate with "Route line unavailable" and Retry route line |
| 390px phone | Map/List switch, bounded map first, summary after it, no horizontal overflow. [Capture](phone-390-show-drive.jpg) |
| 320px member, List | No overflow; only Directions, Open tour route and View day; every link/button at least 44px tall. [Capture](phone-320-member-summary.jpg) |
| Style failure, light theme | Map unavailable with Retry/Use list; Show drive disabled; full day text kept. [Capture](desktop-light-map-failure.jpg) |

Not covered here: signed-in editor round trips, a real iPhone/Capacitor session, screen reader output, actual 200% browser zoom and participant journeys. These belong to #235.

## Automated checks

18 new tests: the day summary (9), day-scoped map view (5), canvas road layer and drive focus (2), and Day page entry and anchor (2). The map projection test also covers `approach_notes`. They cover hotel change with checkout morning, repeated access points, date switching, no-drive day, missing first origin, unlocated stay origin, unmapped hut, notes-only pickup, approximate access point, manual, stale and unknown estimates, geometry failure and retry, a changed pair with a late answer, return/refresh, offline, and member versus organizer links.

```sh
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  src/components/trips/TripMapDay.test.tsx src/components/trips/TripMapView.test.tsx \
  src/components/trips/TripMapCanvas.test.tsx src/lib/trip-map.test.ts \
  'src/app/trips/[id]/days/[date]/page.test.tsx' src/components/trips/DriveEstimate.test.tsx
```

The full suite, `npm run typecheck`, `npm run lint`, `npm run knip` and `npm run build` passed in the isolated worktree.
