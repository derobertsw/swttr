# Editing a saved trip (#176)

A saved trip can be renamed and its dates changed from **Edit trip** on the overview (`/trips/:id/settings`). Destinations (`/trips/:id/stops`) reorders and removes stops and sets several days at once, a day page's location change asks which days it's for, and a day page can copy its plan to other days. This page records the product decisions for #176, delivered in three PRs, and the rules that follow from them.

## Decisions (October 7, 2026)

| Question | Decision |
|---|---|
| What happens to day plans when the dates change? | **Ask when the length stays the same.** "Move the plan to the new dates" takes each day's destination, activity and kits along. "Keep plans on their calendar dates" leaves them where they are. When the length changes, plans stay on their calendar dates. |
| What do days added at either end get? | The destination of the nearest existing day, and no activity. |
| What happens to days outside the new dates? | They're **deleted after a confirmation** that lists each one with its destination, activity and whose kits are on it. Nothing is deleted until that exact change is confirmed. |
| Who can change the shared itinerary? | **Any member on the trip**: name, dates, stops, and each day's destination and activity. Deleting the trip and managing stays (#207) stay with the organizer. |
| How is #176 delivered? | **Three PRs.** 1) Trip settings: rename and change dates. 2) Itinerary editor: add, edit, remove (with reassignment) and reorder stops without changing destinations, assign several days at once, and choose "Only this day" or "All days at this stop" on the day page. 3) Copy day and bulk-edit conflicts. |

### Copy day and conflicts (October 10, 2026)

| Question | Decision |
|---|---|
| What does Copy day copy? | The day's **destination and activity**, plus **your own kit** (its outfit and checklist) when you tick "Also copy my kit". Crew kits are never copied: each member changes only their own. |
| What if a copied kit lands on a day where you already have one? | **Ask: Replace or Keep.** The review lists those days, and nothing is chosen until you pick. |
| What happens to crew kits when a day's destination or activity changes? | **They're kept as saved, and flagged.** The review lists each changed day's kits, and the day page says when a saved outfit was planned for another place, date or activity. |
| Edit stop's day picker? | **It goes through the review** like every other change of a day's destination. `PATCH /days/:date` no longer takes `stop_id`, and `PATCH /stops/:id` no longer takes `day_dates`. |

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

## Itinerary editor (PR 2)

### Rules

- **A day without a stop goes to the base.** `trip_days.stop_id` NULL means the trip's first stop by position, as the overview, the day page and the forecast routes resolve it. Every edit keeps that meaning and changes only the days it was reviewed for.
- **Review before saving.** Removing a stop, assigning days and a day's new location open a review built by the server: each day that changes, before and after, as "Stowe, Vermont (base) · Hike → Jay Peak · Hike", and how many days keep their destination and activity. When a change can go more than one way, nothing is chosen until the person picks an option. A stale review is refused and replaced by the current one, keeping the choice when it's still offered.
- **Removing a stop needs a home for its days.** The review lists the days using it, its own and, for the base, the inherited ones, and asks which stop they move to. Only when it's the last stop do its days become "No destination". There's no silent fallback to the first stop.
- **Reordering never moves a day.** Move earlier and Move later save at once, without a review, and say "Order saved. Every day keeps its destination." When another stop becomes first, days without a stop are pinned to the old base. If the stops changed elsewhere, the order reloads.
- **Several days at once.** The Days section on Destinations selects days, then a destination, an activity (including "No activity") or both. Fields left on "Keep" don't change.
- **A day's new location.** After picking a place, the day page offers "Only Sat Oct 10" (the day gets a stop at the place) or "Every day at Stowe, Vermont (3 days)" (the stop moves to the place), with the exact dates. When the stop serves only this day, it offers just one choice; when the trip has no stops, the place becomes the base for every day. When another stop is already at the place, the days move to it rather than a second stop being added at the same place.
- **Who.** Any member on the trip, as for name and dates. Deleting the trip and managing stays stay with the organizer.

### Pages

- `ItineraryChangeSheet` (`src/components/trips/ItineraryChangeSheet.tsx`) loads the review, shows the options and the changes, and saves the chosen option. It keeps its input after any failure.
- `TripStopsEditor` (in `LegacyTripWizard.tsx`, so the legacy wizard gets it too) removes stops through the sheet and reorders them. `TripDaysEditor` is the Days section on Destinations. The day page's WeatherCard opens the sheet after a place is picked.
- Edit stop saves the stop's activities, then reviews the days picked for it (`assign_days`) in the same sheet. Closing that review changes no day.

### API: `POST /api/v1/trips/:id/itinerary`

Open to any member on the trip.

| Request | Response |
|---|---|
| `preview: true` with `action` and its fields: `remove_stop {stop_id}`, `reorder_stops {order}`, `assign_days {dates, stop_id?, activity?}` or `set_day_place {date, place: {name, latitude, longitude}}` | `{ options: [{ key, label, detail, changes: [{date, date_label, before, after}], unchanged, payload }] }`. `400` for a change that doesn't fit the trip, `404` for a stop or day that's gone. |
| `action` plus the chosen option's `payload` | Saves through `edit_trip_itinerary` and returns `{ ok: true }`. `409` with the error and the current review when the trip changed since the review; `404` when the user isn't on the trip or the stop or day is gone; `400` for an invalid change; otherwise `500` "Nothing was changed". |

`previewItinerary` (`src/lib/trip-itinerary.ts`) builds the review. The save is rebuilt from validated fields only. A test runs every previewed option through the real database function and checks each day's saved label against the review, so the two can't drift apart. The old `PUT /stops` (reorder) and `DELETE /stops/:stopId` (which left the stop's days on the first stop) are gone.

### Database (`supabase/migrations/022_trip_itinerary_edits.sql`)

`edit_trip_itinerary(p_trip_id, p_user_id, p_action, p_payload)` locks the trip and checks that the user owns it or is a member who hasn't left. Each payload carries `expected`, what the review showed, and a mismatch raises `40001`:

| Action | `expected` | Other checks |
|---|---|---|
| `remove_stop {stop_id, reassign_to}` | The dates using the stop | `reassign_to` is required while other stops remain, must be on the trip and differ from the stop (`22023`). An unknown stop is `P0002`. |
| `reorder_stops {order}` | The stop ids in saved order | `order` lists every stop once (`22023`). Positions go through negative values, so the unique position holds row by row. |
| `assign_days {dates, stop_id?, activity?}` | Each date's `{date, stop_id, activity}` | A present key sets that field; `activity: null` clears it. Every requested date must have a day. |
| `set_day_place {date, place, scope}` | The day's effective stop with its name and coordinates, and the dates that change | `scope` is `day` or `stop`. A stop already at the place takes the days. A missing day is `P0002`. |

Only `service_role` may run it.

## Copy day and conflicts (PR 3)

### Rules

- **Copy a day's plan.** **Copy this day** on a day page gives the days you pick its destination and activity. A day without a stop of its own copies as "goes to the base", like the source.
- **Your kit, if you ask.** "Also copy my outfit" (or checklist) copies your kit's outfit, checklist, effort and state. Each day keeps its own note. Nobody else's kit is copied or changed.
- **Replace or Keep.** When you already have a kit on some of the days, the review asks whether to replace it there or keep it, with no default. "Keep" still gives those days the destination and activity.
- **Old weather isn't current advice.** A copied outfit is the snapshot it was, with the forecast it was planned for. The review says so, and the day page says "Planned for the forecast on Sat Oct 10, not this day's" for any outfit whose outing date isn't the day's, whether it was copied or moved with a date change.
- **Kits that no longer fit are flagged, not changed.** Every review that changes a day's destination or activity (removing a stop, a day's new location, the Days section, Copy day, Edit stop) lists the kits kept as saved on that day: "Kept as saved for the old plan: your checklist and Sam's outfit." On the day page, my kit and crew outfits say when they were planned for another place (or the day has no destination), date or activity. A day without its own activity is compared with its stop's first, as the day page shows it. An activity a trip can't match to Gear up's (Rest, Surf, a custom one) isn't compared.
- **A change is a change of place, not of wording.** A review lists a day when its stop, that stop's name or coordinates, or its activity changes, or when it now reads differently (a day pinned to the base). Two places that read the same are told apart: another stop with the same name by its stop number, "Stowe, Vermont (stop 3)", and a stop that moved by its coordinates.
- **No direct day moves.** A day's destination changes only through a review. The old direct paths are refused with a `400` that asks for a reload.

### Pages

- `CopyDayCard` (`src/components/trips/CopyDayCard.tsx`) is the day page's **Copy this day**: pick other days (with Select all), optionally your kit, then **Review copy** opens `ItineraryChangeSheet`. It isn't shown on a one-day trip.
- `ItineraryChangeSheet` lists each change's kit notes under the day, and shows a day whose destination and activity stay the same (it only gets your kit) as "(unchanged)".
- `outfitMismatches` (`src/lib/trip-kit-fit.ts`) builds the day page's notes for a saved outfit: another place, another date's forecast, another activity.

### API and database

`POST /api/v1/trips/:id/itinerary` takes a fourth action:

| Request | Response |
|---|---|
| `preview: true`, `action: "copy_day"`, `from`, `dates` and `kit` (boolean) | One option, `copy`; or, when you copy your kit and already have one on some of the dates, `replace` and `keep`. Each change carries `notes`. `400` for copying a day onto itself or a kit you don't have, `404` for a day that's gone. |
| `action: "copy_day"` plus the option's payload: `from`, `dates`, `kit` (`none`, `replace` or `keep`) and `expected` | Saves through `copy_trip_day`. Errors map as for the other actions. |

`copy_trip_day(p_trip_id, p_user_id, p_payload)` (`supabase/migrations/023_trip_copy_day.sql`) locks the trip and checks that the user owns it or is a member who hasn't left. It locks the source and target days before checking them, because `PATCH /days/:date` changes an activity without the trip lock. `expected` holds the source day's stop, activity, effective stop (its own or the base, with its name and coordinates, or null for no destination) and your kit's `updated_at`, and the same for each date. A stop renamed or moved since the review, or a new base for a day without a stop, is caught that way. Your kits are checked only when one is copied. A mismatch, or a date with no day, raises `40001`. A kit is an outfit or checklist items, as `save_trip_kits` counts it. Only `service_role` may run it.

The contract test runs every copy option through the real function, as for the other actions, and also checks each member's kit on every day: only the days whose review says they get your kit change, and each keeps its note.

## Deployment and validation

Apply `021_trip_date_changes.sql` before deploying this API; production numbers migrations by hand, and 018–020 are #170's. Without it, a date change fails with "Nothing was changed" and renaming still works. Apply `022_trip_itinerary_edits.sql` before deploying the itinerary editor; without it, removing or reordering stops, assigning days and a day's location change fail with "Nothing was changed". Apply `023_trip_copy_day.sql` before deploying Copy day; without it, saving a copy fails the same way.

Tests run the function in an in-memory Postgres (PGlite): moving both ways, keeping with added and removed days, stale reviews, the length rule, retries, member access, stays and grants. Route and page tests cover the review, the Move/Keep choice, the 409 refresh, failures that keep the input, field focus and the legacy wizard. For the itinerary editor, PGlite tests cover every action, stale reviews (including a requested date with no day), member access and grants, and run each previewed option through the function; route and page tests cover removing with a choice, the 409 refresh, reordering and its focus, the Days section and the day page's choices. For Copy day, PGlite tests cover the plan and the base, your kit and nobody else's, notes kept, Replace and Keep, every stale review, invalid copies and access; route and page tests cover the copy review with your kit, a failed save that keeps the picks, Edit stop's review, the refused direct paths, and the day page's planned-for notes. Signed-in checks with real trips, and phone and screen-reader checks, are still to do.
