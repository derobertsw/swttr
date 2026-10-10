# Saved trip kits

Save to trip keeps an outing's outfit, or each day of a multi-day plan, on a trip day as **My kit** (#170). This page records the product decision and the rules that follow from it, then describes how they're implemented.

## Decision (October 6, 2026)

| Question | Decision |
|---|---|
| What is saved? | A **snapshot**: the outing as submitted (activity, effort, place, date and time), the outfit as shown with the person's edits, the advice kind, and the conditions with their forecast source. It isn't a live reference. Newer weather, wardrobe changes or model changes never change a saved kit. |
| How is it refreshed? | **Re-plan in Gear up.** Get layers again and save them to the same day. Saving shows what changes and asks Replace or Keep. Nothing refreshes by itself. |
| Does changing it change anything else? | No. A saved kit belongs to one member and one trip day. Gear up results aren't stored (see [outing-contract.md](outing-contract.md)), so nothing links back to an originating quick plan. |
| What does the first release support? | A **new trip** made from the outing, or an **existing trip** the person picks that includes the outing's date. One-day results and multi-day plans both save; a plan saves each day it has layers for. |
| What if the day already has a kit? | **Ask: Replace or Cancel.** A saved outfit or a category checklist counts as a kit. The save stops, shows the kit there now and what replacing it changes, and only an explicit Replace overwrites it. Keep saved kit changes nothing. |

## Rules

- **No re-entry.** The server takes the date, destination, activity and effort from the outing. The person picks only the trip, or a name for a new one.
- **Multi-day plans.** A plan saves a kit for each day it has layers for, on that day's date. A new trip spans the whole outing, days without layers included. An existing trip is offered only when it includes every day being saved. Days left out, with no forecast or no layers, are named before saving.
- **Destination-local dates.** A later outing is saved to its date on the destination's calendar. An outing for now is saved to the date there when the conditions were read (their observed time). If that date can't be told, the save is refused rather than guessed. It's never taken from the server's clock, so a retry after midnight asks for the same date. A new trip is classified (planning, live, past) against today on the same calendar, not the server's.
- **Honest advice.** A personalized outfit is labeled Personalized. General guidance is labeled General guide, with the reason it isn't personalized, everywhere it shows. A plan's days are always General guide, since multi-day plans aren't personalized. Results with no layers can't be saved. Suggested items that aren't in the wardrobe keep their "Not in your wardrobe" label, and a plan's items keep the wardrobe names they were shown with.
- **Edits are kept as made.** The saved outfit is what was on screen, including picked, removed and moved items. A comfort check is saved only when it was current for those layers, so a running or failed check is never kept as the verdict.
- **No silent replacement.** Saving to a day with a kit reports a conflict and writes nothing. For a plan, every day with a kit is listed in one question, each with what replacing it changes, and Keep saves none of the plan's days. A replacement names each day and the `updated_at` of the kit that was shown. If the kit changed since, the save asks again about that day, and keeps the days already confirmed.
- **Refresh by re-planning.** Update in Gear up on My kit keeps the kit's outing as the account's last one, forgets a save of that outing kept in the tab (so the new layers don't show as already saved), and opens `/?resume=update&trip=<id>`. Gear up asks for layers again, shows them, and Save to trip picks that trip, so saving goes through the conflict question above. If the trip's dates changed after the kit was saved, the outing moves with its day: a later outing to the day's date, a plan by as many days, and an outing for now, on a later day, to the time of day it was read at. A plan that has already started is asked for from today on. Once the day has passed at the destination, or when the destination's time zone isn't known, Update isn't offered.
- **One durable result.** The browser makes a save identity (and, for a new trip, the trip's identity) before sending, and keeps the request in `sessionStorage` (`swttr-trip-kit-save`, per account and outing). A retry after a failure, a lost response or a reload sends the same request, and the server returns the first answer. A duplicate click waits on the first. Once saved, the same outing shows as saved instead of saving again. If the trip was deleted after it was saved to, a retry reports it as gone instead of making it again.
- **Per-member authorization.** A save writes only the signed-in member's kit, on a trip they own or have joined. The checklist API lets a member change only their own kit, and lets the organizer change the kits of guests they manage. The trip day shows edit controls only where the API allows them.
- **Personal and shared stay separate.** My kit holds what one person wears and carries. Shared group equipment stays in Gear (`trip_group_gear`). Packing derivation from saved kits is #177; packing checks are #171.

## How it works

### Gear up

`LayerDisplay` builds a `SavedOutfit` (`src/types/savedKit.ts`) from what it shows and renders `SaveToTrip` (`src/components/trips/SaveToTrip.tsx`) under Wear. `MultiDayPlanDisplay` builds a `SavedPlan` from the days with layers, named as `PlanDayCard` shows them, and renders `SaveToTrip` above the daily plan.

| Who | Save to trip |
|---|---|
| Guest | Explains that the layers are recalculated for their gear, and links to `/sign-in?redirect_url=/?resume=save`. |
| Signed in | Shows the outing, advice kind and edits, and for a plan, the days saved and left out. Lists their trips that include the dates, each with its day numbers, plus New trip with a suggested name. Trips that don't include every date are counted, not offered. Back from Update in Gear up, the kit's trip is picked. |

`/?resume=save` works like `/?resume=outing` (#168): it asks again for the tab's last outing, now personalized for the account, and then opens Save to trip once on those results. `/?resume=update&trip=<id>` asks again the same way; Save to trip stays closed so the new layers show first, and picks that trip when it's opened on those results.

### API

| Route | Does |
|---|---|
| `POST /api/v1/trips/kits/options` | Takes `outfit` or `plan`. The trip dates it saves, a new trip's first and last dates, and the user's trips, each with the day number of the first date, or null when it doesn't include every date. |
| `POST /api/v1/trips/kits` | Takes `outfit` or `plan`, not both. Saves. `200`/`201` when saved (`replayed: true` for a repeat), `409` with `status: "conflict"`, the kits there now and server-computed `changes` against each day's new layers, or `409` with `code: "identity"` when the save identity can't be reused. |
| `PUT /api/v1/trips/:id/days/:date/kits/:memberId` | The category checklist, now limited to the member or the organizer for a guest, with validated fields. It leaves a saved outfit alone. |

### Database (`supabase/migrations/018_trip_saved_kits.sql`, `019_trip_kit_save_tombstones.sql`, `020_trip_kit_save_stable_hash.sql`)

- `trip_member_day_kits.outfit` (jsonb) and `outfit_saved_at` hold the snapshot: a `SavedOutfit`, or a `SavedPlanDay` (`kind: "plan_day"`) with the plan's outing, its forecast source, the day's hours and the day as shown, without its changes from the day before. Saving replaces checklist items and keeps the note. A plan's days go to the same function in one call, so they're saved together or not at all.
- `trip_kit_saves` records each completed save: the identity, the input hash and the answer. A receipt outlives its trip as a tombstone. Deleting the trip clears the receipt's `trip_id` and `result`, so no copy of the kits stays behind.
- `save_trip_kits(...)` runs in one transaction. It takes a lock on the save identity and looks up the receipt first: a repeat returns its first answer, or not found if the trip was deleted since. A repeat must send the same input. The new trip's status is the one exception, because the server derives it from its clock. Otherwise it creates the trip with `create_trip_draft` when asked, locks the trip, and checks membership. It reports conflicts without writing, restores a missing trip day, and fills an empty day activity with the outing's. Only `service_role` may run it.
- The `409` conflict's `changes` lists each phase of the outfit (a ski tour's climb and descent). For a plan day, the day's outfit comes first, then any daypart whose layers change differently from it, so a change only in the evening isn't reported as the same layers.

### Trip day

`/trips/:id/days/:date` leads with **My kit**:

- A saved outfit shows as Gear up showed it: the outing, the forecast and its source, the advice kind, the comfort check when saved, then Wear (and Carry for a ski tour). A saved plan day shows the plan's outing, which day of it this is and its hours, then the day's card from the plan: conditions, Wear, what changes through the day, and Carry. Each says when it was saved, notes if it was saved for a different place than the day's stop, or for another date before the trip's dates changed, and offers Update in Gear up.
- Without one, it links to Gear up and keeps the category checklist.
- Crew kits come below. Others' kits are read-only summaries.

## Not in this release

- Packing from saved kits (#177) and durable packing checks (#171).
- Saving some of a plan's days while keeping the kits on others. Keep saves none of them.
- Editing a saved outfit on the trip day. Change it in Gear up and replace it.
