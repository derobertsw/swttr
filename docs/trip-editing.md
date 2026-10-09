# Editing a saved trip (#176)

A saved trip can be renamed and its dates changed from **Edit trip** on the overview (`/trips/:id/settings`). This page records the product decisions for #176 and the rules that follow from them. It covers the first of three PRs; the itinerary editor and Copy day follow.

## Decisions (October 7, 2026)

| Question | Decision |
|---|---|
| What happens to day plans when the dates change? | **Ask when the length stays the same.** "Move the plan to the new dates" takes each day's destination, activity and kits along. "Keep plans on their calendar dates" leaves them where they are. When the length changes, plans stay on their calendar dates. |
| What do days added at either end get? | The destination of the nearest existing day, and no activity. |
| What happens to days outside the new dates? | They're **deleted after a confirmation** that lists each one with its destination, activity and whose kits are on it. Nothing is deleted until that exact change is confirmed. |
| Who can change the shared itinerary? | **Any member on the trip**: name, dates, stops, and each day's destination and activity. Deleting the trip and managing stays (#207) stay with the organizer. |
| How is #176 delivered? | **Three PRs.** 1) Trip settings: rename and change dates. 2) Itinerary editor: add, edit, remove (with reassignment) and reorder stops without changing destinations, assign several days at once, and choose "Only this day" or "All days at this stop" on the day page. 3) Copy day and bulk-edit conflicts. |

## Rules

- **Review before saving.** A date change opens a review built by the server: the old and new ranges, then what moves, what's removed (with whose kits) and what's added, and how many days keep their plans. Saving needs that review: a stale one is refused and replaced by the current one.
- **One choice when moving is possible.** The review has no default between Move and Keep. The save button stays off until one is picked, and names what it removes ("Remove 2 days and change dates").
- **Stays keep their dates.** Stays and bookings are real reservations, so a date change never moves them. The review lists each stay and any nights now outside the trip, and the starting point and stay for each day after the change (the #207 rule).
- **Saved kits move with their day.** A kit belongs to its trip day, so moving the plan moves the kit. A kit saved from Gear up (#170) stays a snapshot of the outing it was planned for; it isn't recalculated for the new date.
- **One atomic save.** The name and dates, every moved, added and removed day and the trip's status change together or not at all. A retry of a change that already happened returns the saved trip.
- **No silent loss.** The server refuses the save when the trip's dates, the days it would remove (their destination, activity or kits) or the stays changed since the review. The settings page keeps the typed name and dates after any failure.
- **Old links still help.** A day page for a date the trip no longer has says so, shows the trip's dates now and links back to its days.

## How it works

### Pages

- The overview's **Edit trip** button opens `/trips/:id/settings`: trip name, start and end dates, then **Save** (name only) or **Review date change**.
- `DateChangeSheet` (`src/components/trips/DateChangeSheet.tsx`) loads the review, offers Move or Keep when both apply, and saves. The legacy wizard (`/trips/new?trip=…&step=1`) uses the same sheet for a date change.

### API: `PATCH /api/v1/trips/:id`

Open to any member on the trip. The body has `name`, `start_date` and `end_date`, each optional and defaulting to the saved value. A field error returns `400` with `field`.

| Request | Response |
|---|---|
| Name only | Updates the name and returns `{ trip }`. |
| New dates with `preview: true` | The review, without writing: `from` and `to` (dates and labels), `plans.keep`, `plans.move` when the length stays the same, `lodging_after` and `lodging_revision`. Each plan lists `moved`, `added` and `removed` days, the `kept` count, and `expected_removed`. |
| New dates with `mode`, `from`, `lodging_revision` and `expected_removed` from the review | Saves through `change_trip_dates` and returns `{ trip }`. Without a `mode` when both apply, or when anything changed since the review, it returns `409` with the error and the current review. |

`previewDateChange` (`src/lib/trip-dates.ts`) builds the review. A test runs its plans through the real database function, so the two can't drift apart.

### Database (`supabase/migrations/021_trip_date_changes.sql`)

`change_trip_dates(...)` runs in one transaction. It locks the trip and checks that the user owns it or is a member who hasn't left. It returns the saved trip unchanged if the dates already match, then checks the reviewed dates, the lodging revision (when the trip has stays) and the removed days against the review. Moving shifts each day one at a time, from the end that moves first, so no two days share a date. New dates take the nearest existing day's destination. Only `service_role` may run it.

## Deployment and validation

Apply `021_trip_date_changes.sql` before deploying this API; production numbers migrations by hand, and 018–020 are #170's. Without it, a date change fails with "Nothing was changed" and renaming still works.

Tests run the function in an in-memory Postgres (PGlite): moving both ways, keeping with added and removed days, stale reviews, the length rule, retries, member access, stays and grants. Route and page tests cover the review, the Move/Keep choice, the 409 refresh, failures that keep the input, field focus and the legacy wizard. Signed-in checks with real trips, and phone and screen-reader checks, are still to do.
