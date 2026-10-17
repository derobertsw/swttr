# Conditions sources and reviews (#211, part of #205)

A tour day lists the official sources the crew should check: the avalanche forecast, mountain weather and access or closures, each with its link. Everyone records their own review of each source for the day, so the crew can see who looked and when. This page records the decisions for #211 and the rules that follow from them. This is the first of three PRs: reuse across days comes in the second, and a verified list of official forecast centers in the third.

## Decisions (October 16, 2026)

The full record is on [#211](https://github.com/derobertsw/swttr/issues/211#issuecomment-6227449991).

| Question | Decision |
|---|---|
| How is a source stored and reused? | **Saved once on the trip and attached to the days it covers.** Fixing its link fixes every attached day, after a preview of those dates (PR 2). Reviews always stay per day. |
| What does a review record keep? | **One current review per person, source and day, with its history.** Recording again, correcting the note and withdrawing each add an attributed entry. The crew sees each person's current review, with history on demand, and the notes. |
| What counts as a review? | **Only pressing Record my review on a source, for that day.** Opening the link or coming back to SWTTR never records one. The time is when it's saved. |
| What makes a review stale? | **The day's date, destination or activity, its access point, the tour plan's route (name or link), or the source's link or area** changing after it was recorded. |
| Who can edit what? | **The organizer adds, edits and removes sources. Each person records, corrects or withdraws only their own review.** Nobody records for anyone else, guests included. |
| Removing a source from a day | **Keeps its reviews**, stored and attributed. Adding the same source back shows them again. |
| Official forecast centers | **A later PR**, as a verified list with suggestions that need confirming. |

## Rules

- **Sources are the organizer's.** A source has a type (Avalanche forecast, Mountain weather, Access and closures), a name, an optional area or region and an http or https link. Only the organizer adds, edits or removes one, and members see "Sources are managed by the organizer". In this PR a source is added to one day; it can't be attached to another day yet.
- **Each row says what it is and where it goes.** Type and area, the name, then Open forecast, Open weather or Open access information, which opens the source in a new tab. Every source says "Validity not available in SWTTR — check the source.": SWTTR doesn't read bulletins, so it never shows an issue or expiry time.
- **A review is explicit and personal.** Record my review opens a short form with an optional note (up to 1,000 characters, shown to the crew), and saves the review at that moment. Opening the link never records anything. Someone who checked elsewhere can record it without opening the link; the note can say when.
- **The summary counts only your own current reviews.** "Your reviews: 1 of 3 recorded for Saturday" counts the listed sources you've reviewed for this day and whose plan hasn't changed since. The crew's reviews are under Crew reviews, collapsed, as "Sam recorded a review · Fri Oct 9, 6:12 PM". A review is a dated note, not a sign the forecast is current; the section says so.
- **Corrections and withdrawals keep history.** Edit note and Withdraw review add entries; they keep the review's time. Each person's history lists every entry with its time. After withdrawing, the source shows "No review recorded" again.
- **Plan changes make reviews stale, without deleting them.** Each review stores the day's plan as it was: date, destination (its stop and weather location), activity, the access point that applied, the tour plan's route name and link, and the source's link and area. When any of these differ now, the review shows "Plan changed — review again" with what changed, e.g. "Route changed · Date changed from Fri Oct 9", and doesn't count in the summary. Notes, meet and return times, stays, the backup plan, the stop's name and the source's name or type don't make a review stale.
- **Days, not dates.** Reviews belong to the trip day, so moving trip dates moves them, and they then say "Date changed from …". Removing a day removes its reviews with it.
- **Save only on confirmation.** Editors close after the server confirms. A failure keeps the input and the save identity, so a retry can't save twice. A source changed elsewhere, a day that moved, or a plan that changed since the review form opened is a `409`; Check the latest reloads it and keeps the typed note or source. Cancel, Escape and Back ask before discarding edits. Removing a source asks first and says its reviews are kept.
- **Planning, not safety.** Review status stays separate from clothing comfort and packing. There's no overall "Safe", go/no-go or route-safety status.

## API

`GET /api/v1/trips/:id` includes `conditions`: each source on each day, with its `date`, `trip_day_id`, `context_key` (the day's plan and the source as read now) and `reviews`: each person's `current` entry, `history` (newest first) and `stale_reasons`.

| Request | Response |
|---|---|
| `POST /api/v1/trips/:id/days/:date/conditions` with `{action: "add", source, day_id, mutation_id}` | `{source_id, revision}`. Organizer only. |
| … with `{action: "save", source_id, expected_revision, source, day_id, mutation_id}` | `{source_id, revision}`. |
| … with `{action: "remove", source_id, expected_revision, day_id, mutation_id}` | `{source_id, revision: 0}`. Removes it from the day; the source and its reviews stay. |
| `POST /api/v1/trips/:id/days/:date/conditions/reviews` with `{action: "record", source_id, day_id, expected_entry_id, context_key, note, mutation_id}` | `{entry_id}`. Anyone on the trip, for themselves. `expected_entry_id` is the person's latest entry, `null` for none. |
| … with `{action: "correct" \| "withdraw", source_id, day_id, expected_entry_id, note, mutation_id}` | `{entry_id}`. Needs a current review. |

Source changes are `403` for members; both routes are `404` for anyone not on the trip. To record, the route reloads the trip and compares `context_key` with the plan now, and the transaction checks the context again under the trip lock, so a review is never stored against a plan the person didn't see, even when the plan changes while it's being recorded (`409`). Other errors: `409` when the source, the person's review or the day changed, or a save identity was reused with other input; `404` when the day is gone; `400` for invalid input (with `field` for a source field or the note); `503` before migration 031; otherwise `500` with nothing changed. `parseConditionsSource` and `parseReviewNote` validate input, `conditionsContext` builds the plan a review records and `staleReasons` compares it (`src/lib/trip-conditions.ts`).

## Database (`supabase/migrations/031_trip_conditions.sql`)

- `trip_conditions_sources`: the trip's sources, with `revision`, `created_by` and `updated_by`.
- `trip_day_conditions_sources`: which days a source is on, with composite foreign keys so neither the day nor the source can belong to another trip.
- `trip_conditions_reviews`: append-only entries (`reviewed`, `corrected`, `withdrawn`) per person, source and day, ordered by `entry_number`, each with `reviewed_at` and the `context` it was recorded against.
- `mutate_trip_conditions_source(...)` adds, saves or removes a day's source: organizer only, checking the day still holds the date and the source's revision (each `40001`). `record_trip_conditions_review(...)` adds an entry for the organizer or a current member, checking the source is on the day and the person's latest entry (`40001`). To record, it builds the day's plan again in the shape of the app's `conditionsContext`, with the day and its stop locked, and refuses a context that no longer matches (`40001`); a PGlite test builds contexts with the app's function so the two can't drift apart. Both lock the trip and store receipts in `trip_conditions_mutations`, so a retry with the same identity returns the first result. The review's context is left out of that comparison, since the app builds it again for a retry.
- RLS is on with no browser policies; only `service_role` can use the tables and functions.

## Deployment and validation

Apply `031_trip_conditions.sql` before deploying; it needs 012, 026 and 027, and production numbers migrations by hand (029 is #209's, 030 is reserved for #301). Without it, trips load with no sources, and saving a source or a review says it can't be saved yet (`503`) with nothing changed. Any other failure to load sources fails the trip load, so a source or review is never silently hidden.

PGlite tests cover adding, saving and removing sources at their revision, invalid sources, replays, organizer-only access, cross-trip days and sources, kept reviews after removal, members' own reviews, corrections and withdrawals that keep the review's time and context, a stale second window, left members, moving and removing days, a plan that changes between the app reading it and the transaction (route, activity, destination, access point, source link) and changes that don't count, and grants. Unit tests cover validation, the context, each stale reason and what doesn't count, and the summary. Route tests cover access, validation, the plan-changed check and error mapping; component and day page tests cover the empty states, rows, adding, field errors, removal, member access, recording without the link, stale and crew reviews, corrections, withdrawals, failed saves and conflicts. Signed-in checks with real trips, and phone and screen-reader checks, are still to do.
