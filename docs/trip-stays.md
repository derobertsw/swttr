# Crew stays (#207, first slice of #205)

Overview now contains optional Stays. Organizers can save a name-only draft, add dates and shared details later, and edit/remove stays. Members read the same saved information without organizer actions. A property website opens in a new tab. Addresses remain unresolved until the precise-location work in #208; lodging never changes an activity destination or its weather coordinates.

Check-in includes that night; check-out excludes it. Friday–Sunday is two nights. The previous night's assigned stay supplies a day's Starting from; that day's assigned night supplies Staying tonight. A pre-trip night can explicitly supply the first morning's origin. Undated stays, an unplanned night and No stay needed never supply an origin. The night list includes the itinerary's last night and its optional pre-trip night.

Stay dates and night assignments are separate. Explicit replacement transfers only the reviewed nights, retaining each original stay and its booking status. Editing notes or booking status preserves current assignments. Changing a stay's date range assigns its new range and clears its previous assignments. Removal makes its remaining assigned nights unplanned; it does not cancel a reservation. Dates outside the itinerary are preserved and flagged for review.

## Save, access and recovery

The server calculates date coverage, night counts, overlap previews and day origins. Preview precedes Save, with explicit acknowledgement for overlapping nights. The sheet retains entered values after validation/transport failures, focuses the rejected field, announces progress/results and closes after confirmed save. Cancel, Escape and browser Back ask Keep editing / Discard changes when there are edits. A same-URL history entry lets clean Back close the sheet. Reload/closing the tab uses the browser's unsaved-change prompt.

Each mutation includes a client UUID and the lodging revision that was reviewed. `mutate_trip_lodging` locks the trip, rechecks ownership and revision, then commits the stay, assignments, incremented revision and replay receipt together. A stale session receives 409; Review saved plan shows the current snapshot while preserving pending text. Retrying an uncertain response uses the same mutation identity and returns the original result without overwriting newer work. Receipts retain a request hash and result, without a copy of the address or crew notes. The transaction checks for the same property/address/dates before adding a duplicate; later visits with different dates are supported.

All API reads require the existing trip membership/owner checks; writes require the owner. Cross-trip stay IDs are rejected in the transaction and by the composite foreign key. New tables have RLS enabled with no browser policies or grants, and the RPC is executable only by `service_role`, matching migration 014 and the server-only Supabase client.

## API integration

`GET /api/v1/trips/:id` includes `lodging` with its revision, stay summaries, assignments, readable crew nights and derived day contexts. Existing trips return empty stays and unplanned nights.

- `POST /api/v1/trips/:id/stays/preview`: `{action: "save" | "remove" | "night", expected_revision, stay?, existing?, stay_id?, date?, status?}`. No write occurs. Returns exact nights, conflicts, affected morning origins and dates outside the itinerary.
- `POST /api/v1/trips/:id/stays`: `{stay, expected_revision, mutation_id, replace_nights?}`. A stay has a stable UUID, required name, paired nullable `check_in`/`check_out`, and optional type/address/property URL/local times/shared notes. Booking status defaults to `not_booked` and requires explicit `booked` selection.
- `PATCH /api/v1/trips/:id/stays/:stayId`: same save contract, with the stay identity supplied by the route.
- `DELETE /api/v1/trips/:id/stays/:stayId`: `{expected_revision, mutation_id}`.
- `PUT /api/v1/trips/:id/lodging-nights/:date`: `{status: "no_stay" | "unplanned", expected_revision, mutation_id, replace_nights?}`.

For #176 and the existing legacy date editor, trip `PATCH` accepts `preview_lodging: true` alongside proposed dates and returns `lodging_after` without writing. A date change with existing lodging requires the reviewed `lodging_revision`; otherwise 409 returns the impact preview. The legacy editor shows it before confirmation. A database trigger increments the lodging revision when trip dates change, invalidating old stay previews. Stay dates, assignments and bookings remain intact.

## Deployment and verification

Apply `supabase/migrations/017_trip_stays.sql` after the existing migrations and before deploying this API. The app does not apply migrations automatically. Production's migration history differs from the local numbered files, so apply this migration individually rather than pushing the whole folder. Missing stay tables cause a retryable trip-load error rather than silently hiding saved accommodation.

Focused tests cover Postgres rollback/replay, duplicate checks, two-session revision conflicts, exact Friday–Sunday coverage, hotel changes, pre-trip nights, overlap replacement, No stay needed, removal, shortened trips, privileges, membership/cross-trip access, invalid/safe URLs, failed saves, retained input, focus and browser Back. New browser requests time out after 20 seconds and retain the save identity for retry.

Local browser checks use labeled fixture data at 320px, 390px and desktop sizes. Production acceptance still requires migration rollout and signed-in organizer/member testing, real mobile keyboard/safe-area behavior, 200% browser zoom, and screen-reader/device verification. Precise location/provider selection (#208), day-only origin overrides and drive estimates (#209), touring plans/conditions/preparation (#210–212), comparison and offline briefs remain separate work.
