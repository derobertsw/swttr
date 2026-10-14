# Tour plans (#210, part of #205)

A Backcountry day can have a **Tour plan**: the route, when to meet, a backup plan and the return arrangements, next to the crew's clothing plan. This page records the decisions for #210 and the rules that follow from them. This is the first of two PRs; Copy day and itinerary reviews come in the second.

## Decisions (October 14, 2026)

| Question | Decision |
|---|---|
| Where do the trailhead and meeting point come from? | **The destination's access point from #208**, not the tour plan. There's one canonical place for Getting there and the Tour plan, so the plan never holds a second copy to merge later. Until #208 adds access points, the plan reads "Meeting point not set". |
| What is the activity called? | **Backcountry**, everywhere, as stored. The ticket's "Touring" label was not adopted. |
| How is #210 delivered? | **Two PRs.** 1) The plan: its record, the day page's summary and editor, times in the destination's time zone, the kept plan with Restore, and date changes that never delete a plan unseen. 2) Copy day carries the plan (with Replace or Keep), and itinerary reviews note plans on changed days. |

## Rules

- **One plan per trip day.** It belongs to the day, so moving trip dates moves it, like a kit. Only the organizer adds, changes or removes it; everyone on the trip reads it, as for stays (#207).
- **A route is enough to save.** Everything else is optional: meet time, route link, distance, ascent and duration, approach notes, parking/access/permit notes and a link, backup plan, return target, check-in plan and exit or pickup notes.
- **Times are the destination's clock.** Meet and return times are wall-clock times at the destination. A meet can be the day before (a hut approach) and a return the day after (an overnight); a return must come after the meet. When the plan has a time, the server looks up the destination's IANA time zone and stores it with the plan, and labels show its abbreviation for that date ("6:30 AM EST · Sat Feb 13"). If the lookup fails or the destination has no coordinates, the plan still saves and says the time zone wasn't confirmed.
- **Figures are the crew's, with units.** Distance (km or mi), ascent (m or ft) and duration are shown as entered, as "Crew estimate" or "Source: …". Nothing is converted, generated from road routing or inferred about difficulty. New figures default to miles and feet, or kilometers and meters with the Celsius preference.
- **Read first.** The day page shows the plan as labeled text after My kit: Route, Meet, Backup plan, Return target, the check-in plan, and access notes, which stay visible. Figures, the approach and pickup notes open under More tour details. When the plan has a meet time, the day's starting point and stay card shows it too ("Crew stay and meet").
- **Another activity keeps the plan.** When a day with a plan changes to another activity, the plan isn't deleted or shown as current: it sits behind "Saved tour plan · <route>", with Restore, which sets the day back to Backcountry and moves focus to the plan.
- **Save only on confirmation.** The editor closes after the server confirms. A failure keeps the input and the save identity, so a retry can't save twice. A plan changed elsewhere since the editor opened is a `409`; Review saved plan shows it while keeping the typed text, and saving then replaces that revision on purpose. Cancel, Escape and Back ask before discarding edits. Removing asks first and says the day keeps its activity.
- **Date changes list plans.** The date-change review lists each day's plan ("Tour plan: Tuckerman Ravine"), and `change_trip_dates` refuses to remove a day whose plan wasn't in the review.
- **Planning, not safety.** Check-in notes are labeled crew notes; SWTTR doesn't send messages or watch for check-ins. The app doesn't assess the backup plan or the route.

## API

`GET /api/v1/trips/:id` includes `tour_plans`: each saved plan with its `date` and the server's labels (`meet_label`, `return_label`, `metrics_label`, `metrics_source_label`, `time_zone_label`, `updated_label`).

| Request | Response |
|---|---|
| `PUT /api/v1/trips/:id/days/:date/tour-plan` with `{plan, expected_revision, mutation_id}` | `{revision}`. `expected_revision` is the plan's revision when the editor opened, `0` for none. `400` with `field` for an invalid field. |
| `DELETE /api/v1/trips/:id/days/:date/tour-plan` with `{expected_revision, mutation_id}` | `{revision: 0}`. |

Both are organizer only (`403` for members, `404` for anyone not on the trip). Errors: `409` when the plan changed or a save identity was reused with other input, `404` when the day is gone, `400` for an invalid plan, otherwise `500` with nothing changed. `parseTourPlan` (`src/lib/trip-tour-plans.ts`) validates the plan; `buildTourPlanSummary` builds the labels.

## Database (`supabase/migrations/026_trip_tour_plans.sql`)

- `trip_day_tour_plans`: one row per day (`trip_day_id` unique), with a composite foreign key to `trip_days(trip_id, id)` so a plan can't point at another trip's day, and checks for lengths, unit pairs, day offsets and a return after the meet. It records `revision`, `created_by`, `updated_by` and timestamps.
- `mutate_trip_tour_plan(p_trip_id, p_user_id, p_date, p_expected_revision, p_request_id, p_action, p_payload)` locks the trip, checks the organizer and the revision (`40001`), then saves or removes the plan and stores a receipt in `trip_tour_plan_mutations`. A retry with the same identity returns the first result; the stored time zone is left out of that comparison, since a retry's lookup may differ.
- `change_trip_dates` is replaced: a removed day with a plan carries `tour_plan_id`, which the review must include. Days without a plan compare exactly as before.
- RLS is on with no browser policies; only `service_role` can use the tables and functions.

## Deployment and validation

Apply `026_trip_tour_plans.sql` before deploying; it needs 012, 017 and 021, and production numbers migrations by hand (025 is reserved for #208). Without it, trips load with no tour plans and saving one fails with nothing changed; any other failure to load plans fails the trip load, so a saved plan is never silently hidden. The migration only adds to `change_trip_dates`, so an older app keeps working against it.

PGlite tests cover a route-only draft, day offsets and time zones, constraint failures, revisions and stale sessions, replays, removal, organizer-only access, cross-trip days, moving with dates, the removal check and grants; every existing date-change test also runs against the replaced function, and its preview contract test now includes a plan. Route, component and day page tests cover validation, the time zone lookup and its failure, member access, saving, failures that keep input, field focus, conflicts, removal, discarding, the kept plan and Restore. Signed-in checks with real trips, and phone and screen-reader checks, are still to do.
