# Touring preparation (#212, part of #205)

On a Backcountry day, each person sees what they're wearing for the climb and the descent (My kit), their touring equipment, and the shared items assigned to them. This page records the decisions for #212 and the rules that follow from them. It's delivered in three PRs:

1. Touring equipment from a template in each person's packing list, and My equipment and Shared items assigned to you on the day page (#305).
2. Day checks (Before leaving and At the trailhead), the Crew preparation summary and Overview exceptions (this page's [Day checks](#day-checks) sections).
3. Shared touring items from a template in the trip's shared gear.

## Decisions (October 17, 2026)

| Question | Decision |
|---|---|
| How does touring equipment join the packing list? | **Template items in each person's own packing list**, each with a fixed identity (`equipment:<template id>`). They're for the trip's Backcountry days, worked out from the itinerary, and use the same packed checkbox as the rest of the list (#171). Adding from the template again shows "Already in your list". Removing one is an explicit choice that's kept, and it never counts as packed. |
| What day preparation checks does a tour day have? | **Two fixed checks (PR 2).** Before leaving: "Tour and backup plan reviewed". It goes stale when the route, backup plan, meet or return times, or meeting point change; notes and figures don't count. At the trailhead: "Transceiver check". It goes stale if the transceiver in your list changes. Each person records their own, with history. The organizer can record for a managed guest, shown as "Recorded by …". |
| Shared touring items before #179 ships? | **The organizer adds them from a template and they show as Assigned (PR 3).** Proposed shared items (first aid, repair kit, group shelter) are added to the trip's shared gear without duplicates. Rows say "Assigned" with no checkbox until #179 adds Awaiting acceptance, Accepted and Packed. #179 stays its own ticket. |
| How is #212 delivered? | **Three PRs**, as above. |

## Rules (equipment, PR 1)

- **Personal.** Touring equipment belongs to the signed-in member's own packing list, like their own items. Nobody adds or checks equipment for anyone else. Managed guests have no packing list, so they have no equipment in this release.
- **The template.** Suggested additions: Avalanche transceiver, Avalanche probe, Avalanche shovel and Climbing skins. Optional: Avalanche airbag pack, Ski crampons, Helmet and Headlamp. The rescue gear follows the National Avalanche Center's [gear guidance](https://avalanche.org/avalanche-tutorial/get-the-gear.php): always carry a transceiver, probe and shovel, and know how to use them; consider an airbag pack. Each item explains what it's for under "What it's for". The template's copy should be reviewed by a qualified ski-touring practitioner before release.
- **Nothing is added until it's chosen.** Add touring equipment opens a preview grouped as Already in your list, Suggested additions (selected), Optional (not selected) and You removed (not selected). Add selected items adds them. It says these are packing suggestions, not a complete safety assessment.
- **No duplicates.** An item already in the list isn't offered again. Adding the same items twice changes nothing. A template item the person already has under one of its names (an outfit item or one they added by hand, e.g. "Beacon" or "Head torch") shows under Already in your list, "in your list as Beacon", and isn't offered. That name match only hides the suggestion. It never carries a packing check across, because a name doesn't establish the same thing is packed (#171).
- **One checkbox.** Equipment is checked on the packing page under Touring equipment, with a quantity like any item. Checking confirms the whole quantity, and changing the quantity needs a fresh check (#171's rules).
- **Removing is a choice.** Remove takes an item out of the list and deletes its check. The template then lists it under You removed, not selected, instead of suggesting it as new. Adding it back starts at one, unchecked.
- **Which days.** Equipment is for the trip's Backcountry days: each day's own activity, or its stop's first, as the day page shows it. The packing page lists them ("For your Backcountry days: Sat Feb 13, Sun Feb 14"). Equipment the person added stays in their list when the plan has no Backcountry days, and the section says so.
- **The day page reads; the packing page checks.** On a Backcountry day, **My equipment** comes after My kit. It lists the person's equipment with Packed or Not packed yet, from their packing list, and links to it (Open my packing list). There's no second checkbox to keep in step. Add touring equipment works from the day too. Packed is for the whole trip. It isn't a functional check for the day; those are PR 2's At the trailhead checks.
- **Shared items assigned to you.** Under My equipment, the trip's shared gear assigned to the person, with Open shared gear. Each row says where it stands as the shared gear list does (#179): Awaiting acceptance, Accepted · not packed or Packed, so assignment never reads as agreed. A response from before acceptance tracking says only Assigned. There's no checkbox here; those are on the shared gear page.
- **Save only on confirmation.** The preview stays open with the selection if a save fails, and says why. Equipment shows as added, removed or checked only after the server confirms it. Each response changes only the items its change was for, so saves to two rows that answer out of order can't undo each other.

## Day checks

### Rules

- **Two checks per Backcountry day, for each person taking part.** Before leaving: **Tour and backup plan reviewed**. At the trailhead: **Transceiver check**. A Backcountry day is one whose own activity, or its stop's first, is Backcountry, as the day page shows it. Members and managed guests have checks; pending invitations don't, and nor does anyone not taking part that day (#331). Each day's checks start unrecorded; nothing carries over from another day.
- **The day page, after My equipment.** Day checks lists the person's own two checks under Before leaving and At the trailhead, each a native checkbox named for the check, the person and the day ("Transceiver check, you, Sat, Oct 10"), described by its state. The plan review links to the tour plan. Without a tour plan there's nothing to review yet, so it says so instead of showing a checkbox.
- **Your own, or a managed guest's.** Each person records and undoes only their own checks. The organizer also records a managed guest's, under "Gus · managed guest", and the entry says it was recorded by them. Nobody records for another signed-in member, so an organizer can't attest for one.
- **Only on confirmation.** Checking records the check and unchecking undoes it, but the checkbox changes only after the server confirms and the trip reloads. A failed save leaves it as it was and says why; a retry reuses the save identity, so it can't record twice. If the check or the day changed since the page loaded, Check the latest reloads it.
- **What each check covers, and when it goes stale.** A plan review covers the day's date, the tour plan's route (name and link), backup plan, and return time and day, the day's meet time and day (on the day since #333, not the plan), and the meeting point (the day's access point). Changing any of these makes it out of date ("Plan changed — review it again", with what changed), without deleting it. Notes and figures (approach, access, check-in and pickup notes, distance, ascent, duration) don't. A transceiver check covers the date and the Avalanche transceiver in the person's packing list: taking it off the list, or taking it off and adding one again (a replacement), makes it out of date. A check recorded with no transceiver in the list isn't about one listed later, so listing one doesn't. A transceiver listed by hand under another name, like "Beacon", isn't tracked.
- **History.** Recording and undoing each add an entry. Each one shows when it was saved on the destination's clock (the tour plan's zone, else the access point's, else one looked up for the stop, else UTC), who saved it when it wasn't the person, and for a plan review the tour plan revision it was recorded against.
- **Crew preparation, after Day checks.** A compact summary of everyone else taking part that day: "Plan reviewed: 1 of 2 · Transceiver checks: 0 of 2 · 1 shared item awaiting acceptance". Show each person expands to each person's two checks and their assigned shared items with #179's states. A day with nobody else taking part has none. "Not recorded yet doesn't mean anything is missing or failed."
- **Tour preparation on Plan's own page.** Facts the person can act on, each with a link, never a readiness score, from today at the destination onward:
  - Their own checks that are out of date, on any day ahead ("Your tour and backup plan review for Sat Feb 13 is out of date: Route changed", Review the plan again).
  - Their own checks not recorded yet, only on the day itself, so planning days ahead never shows them as overdue.
  - For the organizer, under Crew: a Backcountry day without a tour plan, a managed guest's check on the same terms as their own, and how many members reviewed a plan before it changed.
- **The Day checklist** (Crew, #336) states each person's two checks on Backcountry days, linked to the day.
- **Planning, not safety.** A check is a dated note of who did it. It isn't a safety assessment, and Not recorded yet never means equipment failed. Packing a transceiver (the packing list's checkbox, for the trip) and checking it at the trailhead (for the day) stay separate.

### API

`GET /api/v1/trips/:id` includes `day_checks`: each Backcountry day with its `date`, `trip_day_id`, `plan_available` and `checks`, one per person and kind (`plan_review`, `transceiver`), each with `status` (`not_recorded`, `recorded`, `out_of_date`), `current` (the latest entry, maybe a withdrawal), `history` (newest first), `stale_reasons`, `can_record` and `context_key` (what it covers as read now; only for checks the viewer can record). Each entry has `action`, `recorded_by`, `created_at`, `time_label` and `plan_revision`. It also includes `preparation`, the viewer's Tour preparation items (`kind`, `scope`, `date`, `label`, `action`). `summarizeDayChecks`, `dayChecksFor` and `preparationFor` in `src/lib/trip-day-checks.ts` work them out; `tripFullFor` applies the viewer's part.

`POST /api/v1/trips/:id/days/:date/checks` with `{action: "record" | "withdraw", kind, day_id, member_id, expected_entry_id, mutation_id}`, and to record, `context_key`, returns `{entry_id}`. `expected_entry_id` is the latest entry the page showed, `null` for none. To record, the route reloads the trip and compares `context_key` with what the check covers now (`409` when it differs), and the transaction checks it again under the trip lock. Errors: `403` for someone else's check; `404` when the day or person is gone; `409` when the check or the day changed, the day isn't Backcountry now, there's no tour plan to review, or a save identity was reused; `400` for an invalid request or undoing a check that isn't recorded; `503` before the migration; otherwise `500` with nothing changed.

### Database (`supabase/migrations/20261026120000_trip_day_checks.sql`)

- `trip_day_checks`: append-only entries (`recorded`, `withdrawn`) per day, member and kind, ordered by `entry_number`, each with `recorded_by`, the `context` it was recorded against (a withdrawal keeps the check's), `plan_revision` and the destination's `time_zone`. Removing the day or the member removes them.
- `record_trip_day_check(...)` records or withdraws one check: for the person's own member row, or the organizer for a managed guest (`42501` otherwise). It checks the day still holds the date and is Backcountry, and the person's latest entry for the check (`PT409`). To record, it builds the context again in the shape of the app's `dayCheckContext`, with the day, its stop, the tour plan and the packing row locked, and refuses one that changed (`PT409`); a PGlite test builds contexts with the app's function so the two can't drift apart. It locks the trip and stores receipts in `trip_day_check_mutations`, so a retry with the same identity returns the first result.
- A trigger on `trip_member_packing` stamps each touring equipment item with `added_at` when it becomes added and keeps it while it stays added, so a replaced transceiver can be told apart. `update_trip_packing` isn't changed, and its responses leave `added_at` out. Items added before the migration have none until they're removed and added again.
- RLS is on with no browser policies; only `service_role` can use the tables and the function.

The meet time a plan review covers is the day's (`trip_days.meet_time` and `meet_day_offset`, from #333's `20261024230000`), in `planReviewContext` and the function alike. The tour plan's own meet columns, which only an older API still reads, don't count, and nor does the meet's saved time zone on its own.

## API (equipment)

`GET /api/v1/trips/:id/pack` includes `equipment`:

| Field | Holds |
|---|---|
| `dates` | The trip's Backcountry days. |
| `items` | The template items in the person's list, in the template's order: `id`, `key` (`equipment:<id>`), `name`, `tier`, `purpose`, `quantity`. |
| `template` | Every template item with its `state` (`added`, `listed` with `listedAs`, `removed` or `available`). |
| `editable` | False when the person's equipment can't be read or changed, including before migration 032. |

`GET /api/v1/trips/:id/pack/equipment` returns `{equipment, checks}`: the same `equipment`, and the person's packing checks for their equipment only. It's the day page's read, without the packing page's forecasts.

`POST /api/v1/trips/:id/pack` takes three more changes, and every response includes `equipment` (`{<id>: {status, quantity}}`):

| Body | Does |
|---|---|
| `{op: "add_equipment", ids}` | Adds each template item that isn't in the list, at a quantity of 1 and unchecked. 1 to 20 ids; repeats change nothing. |
| `{op: "equipment_quantity", id, quantity}` | `404` when it isn't in the list. A new quantity clears its check. |
| `{op: "remove_equipment", id}` | Marks it removed and deletes its check. Removing one that isn't in the list changes nothing. |

`set_packed` accepts `equipment:<template id>` keys. An id that isn't the template's is a `400` (`404` for a check). Before migration 032, equipment changes return `503` and nothing changes; everything else on the packing page works as before.

## Database (equipment, `supabase/migrations/032_trip_touring_equipment.sql`)

- `trip_member_packing.equipment` (jsonb object): `{<template id>: {status: "added" | "removed", quantity}}`. It goes with the member's packing row, so deleting the member or the trip deletes it, as for #171's checks.
- `update_trip_packing` is replaced. A diff against `20261016231848_trip_personal_packing_checks.sql` shows only the three new ops, the equipment branch in `set_packed` and the column in the final update. The API checks ids against the template; the function checks their form (`^[a-z][a-z0-9_]{0,39}$`) and caps a list at 50 kinds of equipment. Errors: `P0002` not in the list, `22023` invalid. RLS stays on, with no browser grants, and only `service_role` may run it.

## Deployment and validation

**Day checks.** Deploy the API first, then apply `20261026120000_trip_day_checks.sql` after 026, 027, 032, `20261020000407` and `20261024230000` (#333's meet time on the day, which it reads). It doesn't need #331's migrations. Before it, trips load without `day_checks`, so the day page, Crew preparation, Tour preparation and the Day checklist show no day checks; a request to record one says it can't be recorded yet (`503`) with nothing changed. Any other failure to load checks or members' equipment fails the trip load, so a check is never shown as current when it might be out of date.

PGlite tests cover recording your own checks, the organizer recording a managed guest's, refusing another member's, an invitation's, someone who left and another trip's, separate days, non-Backcountry days, moved and removed days, a plan review without a plan, withdrawal and re-recording with history, stale windows, replays and reused identities, each plan change that counts and the notes and figures that don't, the transceiver's stamp through quantity changes and packing checks, removal and replacement, items stamped before the migration, guests and grants. Unit tests cover the contexts, every stale reason, time labels, the summary (people, days, history, attendance), who may record, Tour preparation on and before the day and in the destination's zone, and loading before the migrations. Route tests cover access, guests, validation, the changed-since check, the zone lookup and error mapping. Component and page tests cover the checkboxes' names and states, recording only on confirmation, a failed save and its retry, conflicts, undoing with history, out-of-date checks, no tour plan, a guest's checks, not taking part, Crew preparation, Tour preparation and the Day checklist. Signed-in checks with real trips, and phone and screen-reader checks, are still to do.

**Equipment.** Apply `032_trip_touring_equipment.sql` after `20261016231848_trip_personal_packing_checks.sql` (in production, history version `20261017004748`), with a `('032', 'trip_touring_equipment')` history row. It doesn't need 030 or 031. Before it, the packing page and the day page read everything else and offer no equipment changes.

PGlite tests run every existing packing test against the replaced function, and cover adding once across repeats, other members' lists, checks by exact key, a stale quantity, quantity changes that clear a check, removal that deletes the check, removing twice or an item never added, adding back unchecked, checks for items never added, invalid changes and the cap. Unit tests cover the template, reading the column, the template's states (with names already in the list) and showing a saved change, including a late response to another item. Route tests cover the equipment read and the Backcountry days, reading before 032, template-only ids, equipment checks and the `503` before 032. Packing page tests cover the section, checking, the preview's groups and defaults, adding with a failed save, asking for a selection, removal and You removed, two removals that answer out of order, and read-only equipment. Day page tests cover My equipment's packed states, shared items assigned to you, adding from the day, a failed load with Retry, and non-Backcountry days. Signed-in checks with real trips, and phone and screen-reader checks, are still to do.
