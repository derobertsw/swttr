# Touring preparation (#212, part of #205)

On a Backcountry day, each person sees what they're wearing for the climb and the descent (My kit), their touring equipment, and the shared items assigned to them. This page records the decisions for #212 and the rules that follow from them. It's delivered in three PRs:

1. **This PR.** Touring equipment from a template in each person's packing list, and My equipment and Shared items assigned to you on the day page.
2. Day checks (Before leaving and At the trailhead), the Crew preparation summary and Overview exceptions.
3. Shared touring items from a template in the trip's shared gear.

## Decisions (October 17, 2026)

| Question | Decision |
|---|---|
| How does touring equipment join the packing list? | **Template items in each person's own packing list**, each with a fixed identity (`equipment:<template id>`). They're for the trip's Backcountry days, worked out from the itinerary, and use the same packed checkbox as the rest of the list (#171). Adding from the template again shows "Already in your list". Removing one is an explicit choice that's kept, and it never counts as packed. |
| What day preparation checks does a tour day have? | **Two fixed checks (PR 2).** Before leaving: "Tour and backup plan reviewed". It goes stale when the route, backup plan, meet or return times, or meeting point change; notes and figures don't count. At the trailhead: "Transceiver check". It goes stale if the transceiver in your list changes. Each person records their own, with history. The organizer can record for a managed guest, shown as "Recorded by …". |
| Shared touring items before #179 ships? | **The organizer adds them from a template and they show as Assigned (PR 3).** Proposed shared items (first aid, repair kit, group shelter) are added to the trip's shared gear without duplicates. Rows say "Assigned" with no checkbox until #179 adds Awaiting acceptance, Accepted and Packed. #179 stays its own ticket. |
| How is #212 delivered? | **Three PRs**, as above. |

## Rules (this PR)

- **Personal.** Touring equipment belongs to the signed-in member's own packing list, like their own items. Nobody adds or checks equipment for anyone else. Managed guests have no packing list, so they have no equipment in this release.
- **The template.** Suggested additions: Avalanche transceiver, Avalanche probe, Avalanche shovel and Climbing skins. Optional: Avalanche airbag pack, Ski crampons, Helmet and Headlamp. The rescue gear follows the National Avalanche Center's [gear guidance](https://avalanche.org/avalanche-tutorial/get-the-gear.php): always carry a transceiver, probe and shovel, and know how to use them; consider an airbag pack. Each item explains what it's for under "What it's for". The template's copy should be reviewed by a qualified ski-touring practitioner before release.
- **Nothing is added until it's chosen.** Add touring equipment opens a preview grouped as Already in your list, Suggested additions (selected), Optional (not selected) and You removed (not selected). Add selected items adds them. It says these are packing suggestions, not a complete safety assessment.
- **No duplicates.** An item already in the list isn't offered again. Adding the same items twice changes nothing. A template item the person already has under one of its names (an outfit item or one they added by hand, e.g. "Beacon" or "Head torch") shows under Already in your list, "in your list as Beacon", and isn't offered. That name match only hides the suggestion. It never carries a packing check across, because a name doesn't establish the same thing is packed (#171).
- **One checkbox.** Equipment is checked on the packing page under Touring equipment, with a quantity like any item. Checking confirms the whole quantity, and changing the quantity needs a fresh check (#171's rules).
- **Removing is a choice.** Remove takes an item out of the list and deletes its check. The template then lists it under You removed, not selected, instead of suggesting it as new. Adding it back starts at one, unchecked.
- **Which days.** Equipment is for the trip's Backcountry days: each day's own activity, or its stop's first, as the day page shows it. The packing page lists them ("For your Backcountry days: Sat Feb 13, Sun Feb 14"). Equipment the person added stays in their list when the plan has no Backcountry days, and the section says so.
- **The day page reads; the packing page checks.** On a Backcountry day, **My equipment** comes after My kit. It lists the person's equipment with Packed or Not packed yet, from their packing list, and links to it (Open my packing list). There's no second checkbox to keep in step. Add touring equipment works from the day too. Packed is for the whole trip. It isn't a functional check for the day; those are PR 2's At the trailhead checks.
- **Shared items assigned to you.** Under My equipment, the trip's shared gear assigned to the person, each labeled Assigned, with Open shared gear. There's no checkbox until #179, so assignment never reads as agreed or packed.
- **Save only on confirmation.** The preview stays open with the selection if a save fails, and says why. Equipment shows as added, removed or checked only after the server confirms it. Each response changes only the items its change was for, so saves to two rows that answer out of order can't undo each other.

## API

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

## Database (`supabase/migrations/032_trip_touring_equipment.sql`)

- `trip_member_packing.equipment` (jsonb object): `{<template id>: {status: "added" | "removed", quantity}}`. It goes with the member's packing row, so deleting the member or the trip deletes it, as for #171's checks.
- `update_trip_packing` is replaced. A diff against `20261016231848_trip_personal_packing_checks.sql` shows only the three new ops, the equipment branch in `set_packed` and the column in the final update. The API checks ids against the template; the function checks their form (`^[a-z][a-z0-9_]{0,39}$`) and caps a list at 50 kinds of equipment. Errors: `P0002` not in the list, `22023` invalid. RLS stays on, with no browser grants, and only `service_role` may run it.

## Deployment and validation

Apply `032_trip_touring_equipment.sql` after `20261016231848_trip_personal_packing_checks.sql` (in production, history version `20261017004748`), with a `('032', 'trip_touring_equipment')` history row. It doesn't need 030 or 031. Before it, the packing page and the day page read everything else and offer no equipment changes.

PGlite tests run every existing packing test against the replaced function, and cover adding once across repeats, other members' lists, checks by exact key, a stale quantity, quantity changes that clear a check, removal that deletes the check, removing twice or an item never added, adding back unchecked, checks for items never added, invalid changes and the cap. Unit tests cover the template, reading the column, the template's states (with names already in the list) and showing a saved change, including a late response to another item. Route tests cover the equipment read and the Backcountry days, reading before 032, template-only ids, equipment checks and the `503` before 032. Packing page tests cover the section, checking, the preview's groups and defaults, adding with a failed save, asking for a selection, removal and You removed, two removals that answer out of order, and read-only equipment. Day page tests cover My equipment's packed states, shared items assigned to you, adding from the day, a failed load with Retry, and non-Backcountry days. Signed-in checks with real trips, and phone and screen-reader checks, are still to do.
