# Map data/provider foundation: acceptance evidence (#232)

Implemented and checked October 19, 2026. See [API and provider contract](../../trip-map-data.md).

## Automated evidence

| Behavior | Evidence |
| --- | --- |
| Checkout/moving day, first origin, override, saved stay identity, tonight and actual nights | `trip-map.test.ts` uses the real #207/#209 lodging/drive resolution; the map's drive results equal the existing drive-estimate service for cached estimates. |
| Crew stay with an own starting point | Scoped moving-day regressions keep the previous-night crew stay as a dated place, resolve every emitted place reference, and revise the day when that stay's coordinates change while preserving unchanged drive geometry. Both regressions failed before the fix and passed afterward on October 20, 2026. |
| Repeated places, multi-role references, coincident entities, named and zero coordinates | Same suite: each day remains a separate visit; saved stay origins share stay identity; co-located destinations remain distinct, and genuine zero latitude/longitude stays mapped. Missing, partial, NaN and out-of-range pairs are distinguished and withheld from markers/navigation. |
| Approximate/missing endpoints, no drive, no stay, manual/fresh/stale/no route | Projection plus API/cache tests preserve typed states and suppress inappropriate provider calls. Geometry can be unavailable while estimates/list data remain usable. |
| #210 meeting/pickup | Meeting references the canonical access entity. Pickup notes produce `notes_only` with no invented coordinate or pin. |
| Current member/owner allowed; non-member/left member denied | Map API tests run the **real** `requireTripAccess`/membership queries against a fixture transport; no protected load/routing occurs on denial. |
| Cross-trip and private data | Foreign stop/stay/day/tour/night references are rejected. Unknown dates return 404. Fixture invite, booking and kit secrets never appear in the allowlisted response. Estimate reads assert trip filtering. |
| Geometry format, options, failure and request bounds | `locations/geometry.test.ts` checks two endpoints, drive/typical traffic/avoid options, eight-second signal, missing key, explicit no-road errors, quota/network errors, malformed and oversized responses; no provider properties returned. `trip-map-geometry.test.ts` verifies coalescing, TTL, trip/revision isolation and concurrency/rate limits. |
| Changed endpoints/access revocation while awaiting routing | API tests delay the provider response, edit the endpoint or revoke membership, then assert 409/404 without a line. Old revision/cache requests cannot restore it. |
| Client request ordering | `useTripMapGeometry.test.ts` checks no mount/pan-equivalent-render/selection request, immediate hiding on changed revision, cancellation, late-response rejection (switch away/back included), mismatched response identities, date moves and errors. |
| Private HTTP caching and availability | API fixtures verify no-store/Vary on data and denials, all-trip data without a provider call, cached geometry, missing configuration and provider failures. |

Final verification, including the October 20 review fixes, on an isolated branch based on current `origin/main`, with its own `npm ci`: **174 files, 2,581 tests passed**, including **48 new tests beyond the merged #319 foundation**. The focused map/drive/access suites also passed on that branch. The command below reproduces the relevant map, authorization/loading, drive API, routing and PGlite drive-storage/origin coverage:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  src/lib/trip-map.test.ts src/lib/trip-map-geometry.test.ts \
  src/lib/locations/geometry.test.ts src/hooks/useTripMapGeometry.test.ts \
  'src/app/api/v1/trips/[id]/map/route.test.ts' \
  'src/app/api/v1/trips/[id]/map/geometry.integration.test.ts' \
  src/lib/trip-drive.test.ts src/lib/locations/routing.test.ts src/lib/trips.test.ts \
  src/lib/trip-drive-estimates.database.test.ts src/lib/trip-drive-starting-points.database.test.ts \
  'src/app/api/v1/trips/[id]/drive-estimates/route.test.ts'
```

## Live evidence and limits

- Read-only Supabase catalog queries verified current RLS/grants and delivered origin/access/pickup schema. No production itinerary or schema writes.
- Official provider sources, current quotas, attribution, storage/export terms, account/region limits and web/Capacitor expectations are recorded in the contract, checked at implementation time.
- Tests use deterministic fixtures and provider responses; this change did not spend live routing credits or claim a new regional coverage pilot.
- No map canvas/UI is introduced in #232. Signed-in browser, screen-reader and physical iPhone journeys remain with #233–#235. No screenshot or participant/device result is claimed here.

Repository checks on the isolated PR branch: `npm run lint`, `npm run knip`, `npm run typecheck` and `git diff --check` passed. Full test command: `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run`. Existing edits in the original checkout were preserved; none are included in this branch.

Build evidence: the final `npm run build` passed with the locked **Next.js 16.4.0/Turbopack**, including compilation, TypeScript and prerendering. The original shared checkout had installed 16.3.6 and encountered a worker-port permission failure on reruns; fresh locked dependencies and a permissioned build in the isolated worktree resolved that verification limitation. No dependency or lockfile changes are included.
