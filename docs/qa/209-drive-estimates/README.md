# Drive estimates: acceptance review (#209)

Reviewed October 17, 2026. The main implementation already shipped in [#297](https://github.com/derobertsw/swttr/pull/297) (server drive estimates and stay departures) and [#299](https://github.com/derobertsw/swttr/pull/299) (day origins, No drive planned and manual estimates). This completion adds visible freshness/attribution, explicit one-way Overview summaries, route-change loading copy, a separate approach row and provider-response recovery fixes.

## Acceptance evidence

| Contract | Evidence |
|---|---|
| Confirmed endpoints; driving on the server | `trip-drive.test.ts` and `locations/routing.test.ts`: previous-night stay or explicit origin to the resolved access point, exact coordinates only, drive mode and approximated traffic; weather coordinates remain separate. |
| Missing values, no route and provider failure | Same suites and drive-estimates API tests: missing/approximate origin or access point prevents routing; explicit null pairs mean no route; timeout, quota and malformed answers mean unavailable or a stale same-pair estimate. Missing values never become zero. Expired no-route results that fail refresh offer recovery. |
| Pair, age, source, directions and one-way labels | `DriveEstimate.test.tsx`: day origin → access point, duration/distance, visible calculated age/time and provider/OSM credits; Apple/Google directions use precise endpoints and a new tab. Details disclose typical traffic, no departure time and closure assumptions. Overview labels both provider and manual drive times one way. |
| Shared estimates and morning attribution | `trip-drive.test.ts`, `DriveEstimate.test.tsx` and `TripStays.test.tsx`: shared API response, next departure, repeated days labeled separately, checkout morning at the old stay, arrival day excluded, hotel changes, timezone-sensitive next departure and stays used only as day origins. |
| Invalidation and response ordering | Same suites: changed endpoints/options/closure points produce new keys; an earlier pair is only shown in details; abort/plan-key checks discard late responses; changed plans announce updating and hide old durations. |
| Day origins and No drive planned | Starting-point library, API and Postgres tests: first-day origin, arbitrary place or saved stay, day-only overrides, reset, retained overrides through lodging changes and explicit no drive. Tonight's stay remains separate. |
| Manual estimate, dates and preference | Manual-estimate API, Postgres and component tests: duration/note/entered time, selected dates, pair binding, review after a changed pair, Edit/Remove, conflict recovery with drafts preserved, and a separately offered calculated estimate that never silently replaces the manual choice. Stale alternatives retain their label. |
| Hut/ski approach separation | Null-route adapter/component coverage plus day-page integration: no invented road time; saved ski/walk approach remains a separately labeled row in Getting there, even while the drive estimate is loading. |
| Authorization and storage | Migrations 028/029 have RLS enabled and revoke browser-role access. Postgres tests verify service-role grants, organizer-only writes, trip/day/stay scoping, conflicts and cascading cleanup; API tests verify trip-access denial. Existing permitted storage and 7-day freshness rules remain in place; no migration is required. |

## Verification

- Focused run: **10 files, 198 tests passed**. The command below includes API handlers, component/page integration, routing rules and real Postgres migration tests using PGlite.
- Final PR verification repeated on a clean worktree based on `origin/main`, with its own `npm ci`: the same **198 tests passed**.
- `npm run build`: passed on that worktree with Next.js 16.4.0 (Turbopack compilation, TypeScript and prerendering).
- `npm run lint`: passed on the clean PR worktree. The earlier run in the shared checkout used `--ignore-pattern '.claude/**'` to exclude its untracked workspace tree; no exclusion was needed for final verification.
- `git diff --check`: passed.

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  src/lib/trip-drive.test.ts src/lib/locations/routing.test.ts \
  src/lib/trip-drive-estimates.database.test.ts src/lib/trip-drive-starting-points.database.test.ts \
  src/components/trips/DriveEstimate.test.tsx src/components/trips/TripStays.test.tsx \
  'src/app/trips/[id]/days/[date]/page.test.tsx' \
  'src/app/api/v1/trips/[id]/drive-estimates/route.test.ts' \
  'src/app/api/v1/trips/[id]/days/[date]/origin/route.test.ts' \
  'src/app/api/v1/trips/[id]/days/[date]/drive-estimate/route.test.ts'
```

## Review follow-up

- Corrected the expired no-route regression assertion to require Apple and Google Directions URLs after a failed refresh; fresh no-route results still have no Directions action.
- Added a component regression that builds a cached no-route answer, expires it and fails the refresh, then checks Directions, Retry and Add your estimate together.
- Routing attribution now appears only for a displayed calculated/previous result or a current no-route result. Component coverage checks manual-only and empty unavailable states, and keeps credit visible for earlier-pair figures.
- Both changed suites passed: **60 tests**. The complete suite then passed: **162 files, 2,389 tests**. Production build, lint, knip and `git diff --check` also passed after the fixes.

## Browser checks

A temporary local Vite fixture imported the actual `DayDrive`, `StayDepartures`, Card and application CSS, using synthetic estimates generated by the real server library. Next Link was replaced with a plain anchor in the fixture. No provider call or production trip write was made. These checks establish rendering and keyboard behavior, not production authentication or physical-device Maps handoff. The viewport override was reset after inspection.

- **320px, light:** visible age, attribution and one-way labels wrap; document width is 320px. Enter opens View access times and keeps focus on its summary. Directions and Change starting point are 44px tall. [Screenshot](available-320.png).
- **390px, dark:** manual duration and source remain primary; the calculated alternative is separately labeled 8 days old and not updated. Enter opens Edit your estimate with focus on Hours; Cancel returns focus to Edit your estimate. No horizontal overflow. [Screenshot](manual-dark-390.png).
- **1280px, light:** stale duration, Retry, Add your estimate and keyboard-opened Estimate details remain readable, including traffic/departure and winter-road assumptions. [Screenshot](stale-desktop.png).
- **320px, changed route:** only the drive row waits; the updating message is visible and the saved approach stays readable, with no old duration shown. No horizontal overflow. [Screenshot](updating-320.png).
- **No route:** the rendered card shows No road route found, Add your estimate and the separate approach; no duration or Directions is offered.

Relative age is a response-time label, paired with the absolute calculation timestamp on the day; it does not tick while the page is left open. Live Geoapify coverage and seasonal access remain subject to the documented provider limitations and the existing curated closure policy.
