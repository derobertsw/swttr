# Tour plans (#210, part of #205)

A Backcountry day can have a **Tour plan**: the route, when to meet, a backup plan and the return arrangements, next to the crew's clothing plan. This page records the decisions for #210 and the rules that follow from them. It was delivered in two PRs: the plan itself, then Copy day, itinerary reviews and the meeting point.

## Decisions (October 14, 2026)

| Question | Decision |
|---|---|
| Where do the trailhead and meeting point come from? | **The destination's access point from #208**, not the tour plan. There's one canonical place for Getting there and the Tour plan, so the plan never holds a second copy to merge later. A day without one reads "Meeting point not set". |
| What is the activity called? | **Backcountry**, everywhere, as stored. The ticket's "Touring" label was not adopted. |
| How is #210 delivered? | **Two PRs.** 1) The plan: its record, the day page's summary and editor, times in the destination's time zone, the kept plan with Restore, and date changes that never delete a plan unseen. 2) Copy day carries the plan (with Replace or Keep), and itinerary reviews note plans on changed days. |

## Rules

- **One plan per trip day.** It belongs to the day, so moving trip dates moves it, like a kit. Only the organizer adds, changes or removes it; everyone on the trip reads it, as for stays (#207).
- **A route is enough to save.** Everything else is optional: meet time, route link, distance, ascent and duration, approach notes, parking/access/permit notes and a link, backup plan, return target, check-in plan and exit or pickup notes.
- **Times are the destination's clock.** Meet and return times are wall-clock times at the destination. A meet can be the day before (a hut approach) and a return the day after (an overnight); a return must come after the meet. When the plan has a time, the server looks up the destination's IANA time zone and stores it with the plan, and labels show its abbreviation for that date ("6:30 AM EST · Sat Feb 13"). If the lookup fails or the destination has no coordinates, the plan still saves and says the time zone wasn't confirmed.
- **Figures are the crew's, with units.** Distance (km or mi), ascent (m or ft) and duration are shown as entered, as "Crew estimate" or "Source: …". Nothing is converted, generated from road routing or inferred about difficulty. New figures default to miles and feet, or kilometers and meters with the Celsius preference.
- **Read first.** The day page shows the plan as labeled text after My kit: Route, Meet, Backup plan, Return target, the check-in plan, and access notes, which stay visible. Figures, the approach and pickup notes open under More tour details. When the plan has a meet time, the day's starting point and stay card shows it too ("Crew stay and meet").
- **Another activity keeps the plan.** When a day with a plan changes to another activity, the plan isn't deleted or shown as current: it sits behind "Saved tour plan · <route>", with Restore, which sets the day back to Backcountry and moves focus to the plan.
- **Save only on confirmation.** The editor closes after the server confirms. A failure keeps the input and the save identity, so a retry can't save twice. A plan changed elsewhere since the editor opened, or a date change that put another day on this date, is a `409`; Review saved plan shows what's saved for the date now while keeping the typed text, and saving then replaces that on purpose. Cancel, Escape and Back ask before discarding edits. Removing asks first and says the day keeps its activity.
- **Returning to the app keeps the draft.** A background trip refresh cannot replace the editor's text or its original plan/day revision, including when a plan is removed or the activity changes. A newer saved plan still requires conflict review before replacement. The editor shows the current canonical meeting point or **Meeting point not set**; change it through Getting there.
- **Date changes list plans.** The date-change review lists each day's plan ("Tour plan: Tuckerman Ravine"), and `change_trip_dates` refuses to remove a day whose plan wasn't in the review, or changed since.
- **The meeting point is the access point.** The plan's Meet row and the day's "Crew stay and meet" card show the day's access point from Getting there, its own or its destination's ("6:30 AM EST · Sat Feb 13 · Pinkham Notch lot"). Changing it there changes it in the plan; the plan has no place of its own.
- **Copy day can bring the plan.** On a day whose plan is in use, the organizer's **Copy this day** offers "Also copy the tour plan". The plan comes with all its fields, its time zone too, since the days get this day's destination. When some of the days already have a plan, the review asks **Replace or Keep** with no default, as it does for your kit; with both, one choice covers both, and the option names the days of each ("Replace your kit on Sun Oct 11 and the tour plan on Mon Oct 12"). Each day says what it gets: "Gets the tour plan from Sat Oct 10: Tuckerman Ravine." or "Its tour plan, Jay Cloud, is replaced with Tuckerman Ravine from Sat Oct 10." A replaced plan keeps its row at the next revision, so an editor open on it gets a `409`. Members can still copy a day's destination and activity, but not its plan.
- **Itinerary reviews say what happens to plans.** Every review that changes a day's destination or activity (removing a stop, a day's new location, the Days section, Copy day, Edit stop) notes a day's plan: "Tour plan kept, not in use: Tuckerman Ravine. Restore it on the day page." when the day stops being Backcountry, "Saved tour plan in use again: Jay Cloud." when it becomes Backcountry again, and "Check it's right for Jay Peak" when a plan in use moves to another place. A day without its own activity is judged by its stop's first, as the day page shows it. A reviewed save is refused when any tour plan on the trip was added, changed, removed or moved to another date since the review, as for access points.
- **Planning, not safety.** Check-in notes are labeled crew notes; SWTTR doesn't send messages or watch for check-ins. The app doesn't assess the backup plan or the route.

## API

`GET /api/v1/trips/:id` includes `tour_plans`: each saved plan with its `date` and the server's labels (`meet_label`, `return_label`, `metrics_label`, `metrics_source_label`, `time_zone_label`, `updated_label`).

| Request | Response |
|---|---|
| `PUT /api/v1/trips/:id/days/:date/tour-plan` with `{plan, day_id, expected_revision, mutation_id}` | `{revision}`. `day_id` is the day the editor opened for, and `expected_revision` the plan's revision then, `0` for none. `400` with `field` for an invalid field. |
| `DELETE /api/v1/trips/:id/days/:date/tour-plan` with `{day_id, expected_revision, mutation_id}` | `{revision: 0}`. |
| `POST /api/v1/trips/:id/itinerary` with `preview: true`, `action: "copy_day"` and `plan: true` | The copy's review with the plan, as above. `403` for anyone but the organizer, `400` when the day has no plan. |
| `POST /api/v1/trips/:id/itinerary`, a reviewed save | Every option's payload carries `tour_plans`, `{<plan id>: {date, revision}}` as the review saw them, and a copy says `plan`: `none`, `replace` or `keep`. A `409` with the current review when the plans changed. |

The plan routes are organizer only (`403` for members, `404` for anyone not on the trip). Errors: `409` when the plan changed, another day holds the date now (the trip's dates moved while the editor was open), or a save identity was reused with other input, `404` when the day is gone, `400` for an invalid plan, otherwise `500` with nothing changed. `parseTourPlan` (`src/lib/trip-tour-plans.ts`) validates the plan; `buildTourPlanSummary` builds the labels.

## Database (`supabase/migrations/026_trip_tour_plans.sql`)

- `trip_day_tour_plans`: one row per day (`trip_day_id` unique), with a composite foreign key to `trip_days(trip_id, id)` so a plan can't point at another trip's day, and checks for lengths, unit pairs, day offsets and a return after the meet. It records `revision`, `created_by`, `updated_by` and timestamps.
- `mutate_trip_tour_plan(p_trip_id, p_user_id, p_date, p_day_id, p_expected_revision, p_request_id, p_action, p_payload)` locks the trip, checks the organizer, that `p_day_id` still holds the date and the revision (each `40001`), then saves or removes the plan and stores a receipt in `trip_tour_plan_mutations`. A retry with the same identity returns the first result; the stored time zone is left out of that comparison, since a retry's lookup may differ.
- `change_trip_dates` is replaced: a removed day with a plan carries `tour_plan_id` and `tour_plan_revision`, which the review must match. Days without a plan compare exactly as before.
- RLS is on with no browser policies; only `service_role` can use the tables and functions.

### Copy day and itinerary reviews (`supabase/migrations/030_trip_copy_tour_plans.sql`)

- `copy_trip_day` is replaced. Its payload's `plan` (`none` when absent, as from an older app) copies the `from` day's plan too: `replace` writes it on every date, `keep` only where there's none. Only the organizer can copy a plan, and the day must have one (`22023` otherwise). A diff against 023 shows only the plan lines.
- `trip_tour_plan_snapshot(trip)` returns `{<plan id>: {date, revision}}` for the trip's plans. The date is there because moving the trip's dates keeps each plan's id and revision but puts it on another date.
- `edit_trip_itinerary_reviewed` gets an overload with `p_tour_plans`. It locks the trip, refuses (`40001`) when the plans differ from the review (including a plan now on another date), then runs 027's version, which checks access points and runs the edit or copy. PostgREST picks the overload by the extra argument.

## Deployment and validation

Apply `026_trip_tour_plans.sql` before deploying; it needs 012, 017 and 021, and production numbers migrations by hand (025 is reserved for #208). Without it, trips load with no tour plans and saving one fails with nothing changed; any other failure to load plans fails the trip load, so a saved plan is never silently hidden. The migration only adds to `change_trip_dates`, so an older app keeps working against it.

Apply `030_trip_copy_tour_plans.sql` (it needs 023, 026 and 027) with the second PR. Before it, reviewed saves fall back to 027's check of access points, and copying a plan is refused with `503` and nothing changed, so a plan is never dropped from a copy. An older app keeps working against it: it sends no `plan` and calls 027's overload.

PGlite tests cover a route-only draft, day offsets and time zones, constraint failures, revisions and stale sessions, a day that no longer holds its date, replays, removal, organizer-only access, cross-trip days, moving with dates, the removal check and grants; every existing date-change test also runs against the replaced function, and its preview contract test now includes a plan. Route, component and day page tests cover validation, the time zone lookup and its failure, member access, saving, failures that keep input, field focus, conflicts, removal, discarding, the kept plan and Restore.

For the second PR, PGlite tests copy a plan with Keep and Replace (every field, the replaced row's revision, nobody's kit), refuse a member's copy, a day without a plan and an unknown mode, copy none for a payload without `plan`, and refuse reviewed saves after a plan was added, changed or removed, or the trip's dates moved under an open review. The review contract test now runs through the reviewed function and checks every plan after each option: only the days whose review says they get the plan change. Unit tests cover the review notes, including a day judged by its stop's first activity and a new stop without activities, and the copy options and labels; route tests cover the `tour_plans` check, its fallback and the `503` before 030; day page tests cover copying a plan, the member view and the meeting point. Signed-in checks with real trips, and phone and screen-reader checks, are still to do.

The [October 18 acceptance review](qa/210-tour-plans/README.md) maps the contract to implementation, records background-refresh regressions and browser fixture checks, and lists the remaining signed-in/device acceptance work.
