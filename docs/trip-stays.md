# Crew stays (#207, first slice of #205)

Overview now contains optional Stays. Organizers can save a name-only draft, add dates and shared details later, and edit/remove stays. Members read the same saved information without organizer actions. A property website opens in a new tab. A stay can also have a confirmed place, found with search or typed as coordinates ([trip-locations.md](trip-locations.md), #208); lodging never changes an activity destination or its weather coordinates.

Check-in includes that night; check-out excludes it. Friday–Sunday is two nights. The previous night's assigned stay supplies a day's Starting from; that day's assigned night supplies Staying tonight. A pre-trip night can explicitly supply the first morning's origin. Undated stays, an unplanned night and No stay needed never supply an origin. The night list includes the itinerary's last night and its optional pre-trip night.

Stay dates and night assignments are separate. Explicit replacement transfers only the reviewed nights, retaining each original stay and its booking status. Editing notes or booking status preserves current assignments. Removal makes its remaining assigned nights unplanned; it does not cancel a reservation. Dates outside the itinerary are preserved and flagged for review. Since #331 each night is planned per person; see below.

## Attendance and per-person nights (#331)

Six people can stay in two places on the same night, arrive late, leave early or move mid-trip, and changing one person's night never changes anyone else's. Migration `20261021201500_trip_attendance_lodging.sql` adds the two tables; the server calculates everything below and the API returns it in `lodging`.

**Attendance.** A person with no saved attendance is on the trip from the pre-trip night through the last night, follows the trip's dates and takes part every day. Otherwise `arrival_date` (pre-trip night to last night) and `departure_date` (first day to the morning after the last night) work like a stay's check-in and check-out: the arrival night is on the trip, the departure night isn't, and they're there on both days. `skipped_dates` are days they're there but not taking part, such as an evening arrival: Casey arrives Saturday, skips Saturday and sleeps in the rental Saturday night. Explicit dates are kept when the trip's dates change and listed in `attendance.review_dates`. Attendance never changes membership, and never deletes a saved kit or a conditions review: a preview lists each affected day and whether a kit stays saved there.

**One state per person and night**, for every night from the pre-trip night through the last night:

- Assigned: a stay, whose dates must include the night.
- No accommodation needed.
- Not planned: no saved row.
- Not on trip: outside their attendance, or they left the trip. It wins over any saved row; rows kept by a trip date change are listed in `review_nights`.

Gaps are Not planned nights between trip days. The pre-trip and last nights are planned only by choice, so they're never gaps. Pending invitations and managed guests keep their membership (`membership`: invited, guest); a pending invitation's nights are kept when it's accepted.

**Whose nights a change sets.** Each change below is one transaction:

- `assign` sets only the listed people and nights. Assigning a stay without `dates` means every night of the stay the person is on the trip.
- Saving a stay without `occupants` keeps the people already staying there: nights newly inside its dates go to them, nights it no longer covers become Not planned, and nights it already covered keep everyone's plan, explicit moves included. A stay nobody is in yet gives its nights to the crew. With `occupants`, exactly those people stay there for all its dates.
- The crew-wide night actions (`PUT …/lodging-nights/:date`) set everyone on the trip that night.
- Attendance clears the person's plans for the nights they're no longer there. New nights start Not planned: nobody is assumed to stay anywhere.

"The crew" here is joined accounts, the organizer included, and managed guests. Pending invitations haven't said they're coming, so they're planned only individually and count in a night's crew summary only once they have a plan for it.

A change that would replace someone's existing plan for a night (another stay, or No accommodation needed for an assigned night), or that attendance would clear, is a conflict. The preview flags each person/night pair in `changes[].conflict`, `conflicts` lists their dates, and the save needs `replace_nights: true`. Clearing a night is never a conflict. Overlapping stays are fine for different people.

**The crew's view.** `nights[]` and `days[]` keep their fields for views that show one plan per night. A split night's `label` names each group ("Pine rental (3) · Village hotel (2)"), `occupancy` lists who is where in stay order, and `stay_id`/`starting_stay_id` are the stay most people are in or start from (ties go to the first saved stay). Day origins count only the people taking part that day, so the drive estimate (#209) starts from where most of them slept until #333 shows each departure. `days[].origins` lists every group.

**Migration.** Each crew night is copied to every joined account and managed guest on the trip, with its stay or No stay needed. Pending invitations, and anyone invited later, start Not planned. Stays, their dates, booking status and notes are unchanged. The crew-wide `trip_lodging_nights` is kept, unused, for audit and an API rollback.

**Concurrency.** Every change still needs the reviewed `lodging_revision`, a mutation identity for replay, and the trip lock. Attendance changes bump the revision; membership changes don't touch the trips row (to avoid the lock-order deadlock noted in the shared-gear migration). Instead `lodging.people_key` names who's on the crew: send it back as `expected_people_key`, and the transaction rejects the save with 409 if anyone joined, left or was removed since the review. A retried save always reaches the transaction, which returns its first result.

## Save, access and recovery

The server calculates date coverage, night counts, overlap previews and day origins. Preview precedes Save, with explicit acknowledgement for overlapping nights. The sheet retains entered values after validation/transport failures, focuses the rejected field, announces progress/results and closes after confirmed save. Cancel, Escape and browser Back ask Keep editing / Discard changes when there are edits. A same-URL history entry lets clean Back close the sheet. Reload/closing the tab uses the browser's unsaved-change prompt.

Each mutation includes a client UUID and the lodging revision that was reviewed. `mutate_trip_lodging` locks the trip, rechecks ownership and revision, then commits the stay, assignments, incremented revision and replay receipt together. A stale session receives 409; Review saved plan shows the current snapshot while preserving pending text. Retrying an uncertain response uses the same mutation identity and returns the original result without overwriting newer work. Receipts retain a request hash and result, without a copy of the address or crew notes. The transaction checks for the same property/address/dates before adding a duplicate; later visits with different dates are supported.

All API reads require the existing trip membership/owner checks; writes require the owner. Cross-trip stay IDs are rejected in the transaction and by the composite foreign key. New tables have RLS enabled with no browser policies or grants, and the RPC is executable only by `service_role`, matching migration 014 and the server-only Supabase client.

## API integration

`GET /api/v1/trips/:id` includes `lodging` with its revision, `people_key`, `per_member`, stay summaries (with `occupants`), saved `assignments` and `attendance`, readable crew `nights` and derived day contexts, and `people`: each person's membership, attendance, nights, days (participation, starting point, tonight's stay) and gaps. Existing trips return empty stays and unplanned nights. Before the migration, `per_member` is false and the nights are the crew's.

- `POST /api/v1/trips/:id/stays/preview`: `{action: "save" | "remove" | "night" | "assign" | "attendance", expected_revision, expected_people_key?, stay?, existing?, occupants?, stay_id?, date?, status?, assignments?, member_id?, attendance?}`. No write occurs. Returns the crew's `nights` before and after, each person/night in `changes` (before, after, the next morning and that person's origin then, and whether it's a conflict), `conflicts` by date, attendance's `day_changes`, and dates outside the itinerary.
- `POST /api/v1/trips/:id/stays`: `{stay, occupants?, expected_revision, expected_people_key?, mutation_id, replace_nights?}`. A stay has a stable UUID, required name, paired nullable `check_in`/`check_out`, and optional type/address/property URL/local times/shared notes. Booking status defaults to `not_booked` and requires explicit `booked` selection.
- `PATCH /api/v1/trips/:id/stays/:stayId`: same save contract, with the stay identity supplied by the route.
- `DELETE /api/v1/trips/:id/stays/:stayId`: `{expected_revision, mutation_id}`.
- `PUT /api/v1/trips/:id/lodging-nights/:date`: `{status: "no_stay" | "unplanned", expected_revision, mutation_id, replace_nights?}`, for everyone on the trip that night.
- `PUT /api/v1/trips/:id/lodging-assignments` (#331): `{assignments: [{member_id, status: "assigned" | "no_stay" | "unplanned", stay_id?, dates?}], expected_revision, expected_people_key?, mutation_id, replace_nights?}`. Up to 200 entries; a night listed twice is rejected.
- `PUT /api/v1/trips/:id/members/:memberId/attendance` (#331): `{attendance: {arrival_date, departure_date, skipped_dates}, expected_revision, expected_people_key?, mutation_id, replace_nights?}`. Nulls and an empty list mean the whole trip.

Only the organizer previews or saves any of these; members read the plan, and outsiders and people who left get 404. Before the migration the two per-person routes, `occupants` and per-person previews return 503 without calling the transaction, and crew-wide changes work as before.

A trip date change (#176, [trip-editing.md](trip-editing.md)) is reviewed first: trip `PATCH` with `preview: true` returns `lodging_after` with the day-plan changes. Saving with existing lodging requires the reviewed `lodging_revision`; otherwise 409 returns the current review. A database trigger increments the lodging revision when trip dates change, invalidating old stay previews. Stay dates, assignments and bookings remain intact.

## Deployment and verification

Per-person nights (#331): deploy the API first, then apply `supabase/migrations/20261021201500_trip_attendance_lodging.sql` individually in the SQL editor. The API reads the crew-wide nights until the new tables exist, so the order only matters for saves. After applying, `SELECT count(*) FROM trip_member_lodging_nights` should equal `SELECT count(*) FROM trip_lodging_nights n JOIN trip_members m ON m.trip_id = n.trip_id AND m.status IN ('joined', 'guest')`.

Apply `supabase/migrations/017_trip_stays.sql` after the existing migrations and before deploying this API. The app does not apply migrations automatically. Production's migration history differs from the local numbered files, so apply this migration individually rather than pushing the whole folder. Missing stay tables cause a retryable trip-load error rather than silently hiding saved accommodation.

Focused tests cover Postgres rollback/replay, duplicate checks, two-session revision conflicts, exact Friday–Sunday coverage, hotel changes, pre-trip nights, overlap replacement, No stay needed, removal, shortened trips, privileges, membership/cross-trip access, invalid/safe URLs, failed saves, retained input, focus and browser Back. New browser requests time out after 20 seconds and retain the save identity for retry.

Local browser checks use labeled fixture data at 320px, 390px and desktop sizes. Production acceptance still requires migration rollout and signed-in organizer/member testing, real mobile keyboard/safe-area behavior, 200% browser zoom, and screen-reader/device verification. Drive estimates from each morning's stay to the day's access point, with day-only starting points, No drive planned and the organizer's own estimates, are in [trip-locations.md](trip-locations.md) (#209); touring conditions and preparation (#211–212; tour plans are in [trip-tour-plans.md](trip-tour-plans.md)), comparison and offline briefs remain separate work.
