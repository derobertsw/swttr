# Saved trip kits

Save to trip keeps an outing's outfit on a trip day as **My kit** (#170). This page records the product decision and the rules that follow from it, then describes how the first release implements them.

## Decision (October 6, 2026)

| Question | Decision |
|---|---|
| What is saved? | A **snapshot**: the outing as submitted (activity, effort, place, date and time), the outfit as shown with the person's edits, the advice kind, and the conditions with their forecast source. It isn't a live reference. Newer weather, wardrobe changes or model changes never change a saved kit. |
| How is it refreshed? | **Re-plan in Gear up.** Get layers again and save them to the same day. Saving shows what changes and asks Replace or Keep. Nothing refreshes by itself. |
| Does changing it change anything else? | No. A saved kit belongs to one member and one trip day. Gear up results aren't stored (see [outing-contract.md](outing-contract.md)), so nothing links back to an originating quick plan. |
| What does the first release support? | A **new trip** made from the outing, or an **existing trip** the person picks that includes the outing's date. One-day results first; multi-day plans follow in a second PR. |
| What if the day already has a kit? | **Ask: Replace or Cancel.** A saved outfit or a category checklist counts as a kit. The save stops, shows the kit there now and what replacing it changes, and only an explicit Replace overwrites it. Keep saved kit changes nothing. |

## Rules

- **No re-entry.** The server takes the date, destination, activity and effort from the outing. The person picks only the trip, or a name for a new one.
- **Destination-local dates.** A later outing is saved to its date on the destination's calendar. An outing for now is saved to the date there when the conditions were read: the observed time, or else today in the place's time zone. If that date can't be told, the save is refused rather than guessed. A new trip is classified (planning, live, past) against today on the same calendar, not the server's.
- **Honest advice.** A personalized outfit is labeled Personalized. General guidance is labeled General guide, with the reason it isn't personalized, everywhere it shows. Results with no layers can't be saved. Suggested items that aren't in the wardrobe keep their "Not in your wardrobe" label.
- **Edits are kept as made.** The saved outfit is what was on screen, including picked, removed and moved items. A comfort check is saved only when it was current for those layers, so a running or failed check is never kept as the verdict.
- **No silent replacement.** Saving to a day with a kit reports a conflict and writes nothing. A replacement names each day and the `updated_at` of the kit that was shown. If the kit changed since, the save asks again.
- **One durable result.** The browser makes a save identity (and, for a new trip, the trip's identity) before sending, and keeps the request in `sessionStorage` (`swttr-trip-kit-save`, per account and outing). A retry after a failure, a lost response or a reload sends the same request, and the server returns the first answer. A duplicate click waits on the first. Once saved, the same outing shows as saved instead of saving again. If the trip was deleted after it was saved to, a retry reports it as gone instead of making it again.
- **Per-member authorization.** A save writes only the signed-in member's kit, on a trip they own or have joined. The checklist API lets a member change only their own kit, and lets the organizer change the kits of guests they manage. The trip day shows edit controls only where the API allows them.
- **Personal and shared stay separate.** My kit holds what one person wears and carries. Shared group equipment stays in Gear (`trip_group_gear`). Packing derivation from saved kits is #177; packing checks are #171.

## How it works

### Gear up

`LayerDisplay` builds a `SavedOutfit` (`src/types/savedKit.ts`) from what it shows and renders `SaveToTrip` (`src/components/trips/SaveToTrip.tsx`) under Wear.

| Who | Save to trip |
|---|---|
| Guest | Explains that the layers are recalculated for their gear, and links to `/sign-in?redirect_url=/?resume=save`. |
| Signed in | Shows the outing, advice kind and edits. Lists their trips that include the date, each with its day number, plus New trip with a suggested name. Trips that don't include the date are counted, not offered. |

`/?resume=save` works like `/?resume=outing` (#168): it asks again for the tab's last outing, now personalized for the account, and then opens Save to trip once on those results.

### API

| Route | Does |
|---|---|
| `POST /api/v1/trips/kits/options` | The outing's trip date and the user's trips, with each trip's day number or null. |
| `POST /api/v1/trips/kits` | Saves. `200`/`201` when saved (`replayed: true` for a repeat), `409` with `status: "conflict"`, the kits there now and server-computed `changes`, or `409` with `code: "identity"` when the save identity can't be reused. |
| `PUT /api/v1/trips/:id/days/:date/kits/:memberId` | The category checklist, now limited to the member or the organizer for a guest, with validated fields. It leaves a saved outfit alone. |

### Database (`supabase/migrations/018_trip_saved_kits.sql`, `019_trip_kit_save_tombstones.sql`)

- `trip_member_day_kits.outfit` (jsonb) and `outfit_saved_at` hold the snapshot. Saving replaces checklist items and keeps the note.
- `trip_kit_saves` records each completed save: the identity, the input hash and the answer. A receipt outlives its trip as a tombstone. Deleting the trip clears the receipt's `trip_id` and `result`, so no copy of the kits stays behind.
- `save_trip_kits(...)` runs in one transaction. It takes a lock on the save identity and looks up the receipt first: a repeat returns its first answer, or not found if the trip was deleted since. Otherwise it creates the trip with `create_trip_draft` when asked, locks the trip, and checks membership. It reports conflicts without writing, restores a missing trip day, and fills an empty day activity with the outing's. Only `service_role` may run it.
- The `409` conflict's `changes` lists each phase of the outfit (a ski tour's climb and descent).

### Trip day

`/trips/:id/days/:date` leads with **My kit**:

- A saved outfit shows as Gear up showed it: the outing, the forecast and its source, the advice kind, the comfort check when saved, then Wear (and Carry for a ski tour). It says when it was saved, notes if it was saved for a different place than the day's stop, and links to Gear up to update it.
- Without one, it links to Gear up and keeps the category checklist.
- Crew kits come below. Others' kits are read-only summaries.

## Not in this release

- Saving multi-day plans, and a refresh shortcut that opens a saved kit's outing in Gear up (second PR).
- Packing from saved kits (#177) and durable packing checks (#171).
- Editing a saved outfit on the trip day. Change it in Gear up and replace it.
