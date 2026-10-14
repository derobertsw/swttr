# Packing from saved kits (#177)

A trip's **What to pack** page (`/trips/:id/pack`) lists what the signed-in member's saved outfits call for, once per item, with the days each item is for. Outfits are saved to trip days from Gear up ([trip-saved-kits.md](trip-saved-kits.md)). This page records the product decisions for #177 and the rules that follow from them.

## Decisions (October 11, 2026)

| Question | Decision |
|---|---|
| What happens to the list when someone saves a day's kit again? | **It changes right away, and the changes are flagged.** New and replaced items are marked, and items no longer in any saved outfit are listed apart until the person acknowledges them with Got it. Saving a kit already asks Replace or Keep, so the list doesn't ask again. |
| What does a day without a saved outfit get? | **Suggestions, kept apart.** The general guidance from the day's activity and weather is listed under "Suggestions, not in your outfits", with a link to plan the day. It never joins the person's list. |
| Can people add their own items and quantities? | **Yes.** Each person adds trip-wide items by hand (headlamp, chargers), each with a quantity, and can set a quantity on any item from their outfits. Both survive outfit changes. |
| How is it delivered? | One PR, with migration `024_trip_packing.sql`. |

## Rules

- **Personal.** Each member sees only what their own saved outfits call for, and only they change their own additions and quantities. Shared group gear assigned to them is listed separately, as before; accepting and packing shared gear is #179.
- **One item, many days.** The same catalog or wardrobe item on several days is one item, listed with each day and whether it's worn or carried then. A general item (one with no catalog identity, like a multi-day plan's) with the same body area, layer and name is one item too, and joins a catalog item worn under the same name in that body area and layer. A carried item worn in another part of the same outfit, like a ski tour's descent shell on the climb, is that item. A carried item worn on another day under the same name is that item as well. Names are compared with letters and numbers in every script kept, so 手袋 and 帽子 stay two items.
- **Whose item it is.** Items from the wardrobe say Your gear. Suggested items that aren't in the wardrobe say Not in your wardrobe. General items, which name a kind of layer rather than one of the person's, say General item. A multi-day plan's item renamed to one of the person's own item names (their item mappings) counts as theirs. An item is the person's own when any outfit had it from their wardrobe.
- **Quantity.** An item counts once however many days use it. The person can choose another number from 1 to 20; it's kept by the item's identity, so it stays when the item leaves the outfits and is back when the item returns. An item can be saved under other keys too (`aliases`): a catalog item under the general key of a plan item with its name, body area and layer, and a worn item under the carry key of its name. A quantity or acknowledgement saved under one of them applies to the item until a quantity is chosen under its own key, whether or not an outfit still names it that way, so replacing a plan day with a catalog outfit wearing the same item keeps its quantity.
- **Changes since last time.** The list as the person last acknowledged it is kept (`seen`). An item that's new where an item that left was worn (the same day, body area and layer) **replaces** it. Other new items are **new**. Items that left without a replacement are listed as **no longer in your outfits**, with the days they were for. Carried-only items are new or removed, never replacements. Got it acknowledges every change at once. The first list someone sees is recorded without flags, so their first outfits don't all show as new.
- **No silent acknowledgement.** Got it sends back the version of each of the person's kits it was shown for. If any changed since, nothing is recorded and the page reloads the list with the new changes. The database locks those kits while it records the acknowledgement, so a kit saved meanwhile is flagged afterwards rather than absorbed.
- **Saved outfits stay as saved.** A day whose plan changed after its outfit was saved (another place, date or activity) is listed under Days to review with why, the same notes the day page shows. Its outfit stays in the list until the person replaces it from Gear up.
- **Older checklists.** A day kit with category slots (shell, gloves) but no saved outfit is listed under Older day checklists. It names no particular items, so it isn't in the list, and no garment identity or thermal value is invented for it.
- **Days to review.** Days without a saved outfit, days with an older checklist and saved outfits that no longer fit come first, each with a link to the day. A partial list never claims to be complete.
- **Packing checks** (checkboxes) are #171. The items carry stable `key`s and change flags for it.

## How it works

### Page

`src/app/trips/[id]/pack/page.tsx` loads the list and saves each change; `src/components/trips/TripPacking.tsx` holds the sections. Quantities change at once and go back if the save fails, with a toast. Steppers ignore taps while saving instead of disabling, so focus stays on them. The add form keeps a hand-added item's identity until it's saved, so a retry after an uncertain failure adds it once, and keeps the typed name after a failure. A change the server says is out of date (an item removed in another session, outfits changed) reloads the list. After Got it, focus moves to the list heading. When the person's choices can't be read, the list is read-only and says so.

### API: `/api/v1/trips/:id/pack`

`GET` (any member) returns, for the signed-in member:

| Field | Holds |
|---|---|
| `items` | Each item from their saved outfits: `key`, `name`, `brand`, `bodyPart` and `layerType` (null when only carried), `ownership`, `days` (`{date, uses}`), `aliases` (the other keys it can be saved under), `quantity`, and `change` when it's new or replaces items. |
| `removed` | Items that left since the last acknowledgement: `key`, `name`, `dates`. |
| `kitVersions` | Each of their kits with an outfit or checklist, by id, with its `updated_at`: sent back to acknowledge. |
| `checklists` | Older category checklists by date. |
| `manual`, `editable` | Items they added by hand, and whether their choices can be changed. |
| `coverage` | Each trip date: `advice` `saved` (with `notes` when it no longer fits), `manual` (older checklist), `available` (suggested), or the reason there's no guidance. |
| `suggestions`, `suggestedDays` | General guidance for days without a saved outfit, as before. Only those days fetch weather. |
| `groupGear` | Shared gear assigned to them. |

`POST` takes one change and returns `{manual, quantities}`:

| Body | Does |
|---|---|
| `{op: "add_item", id, name, quantity}` | Adds an item by hand (name up to 80 characters, at most 50 items). A repeat with the same `id` adds nothing. |
| `{op: "item_quantity", id, quantity}` | `404` when the item was removed meanwhile. |
| `{op: "remove_item", id}` | Removing an item that's gone changes nothing. |
| `{op: "quantity", key, quantity}` | For an item from the outfits. A chosen 1 is kept, so it overrides a joined item's quantity. |
| `{op: "acknowledge", kits}` | Works out the list again on the server and records it. `409` with `code: "kits_changed"` when `kits` doesn't match their kits now. |

Quantities run from 1 to 20. Without the migration, `GET` still lists the outfits (read-only) and `POST` returns `503`.

`packingFromOutfits`, `packingWithChanges` and `packingSeen` in `src/lib/trip-packing.ts` do the work and are unit-tested with the same jacket on three days, a substituted jacket, ski-tour carry, plan days and general items.

### Database (`supabase/migrations/024_trip_packing.sql`)

`trip_member_packing` has one row per member who changed anything: `items` (added by hand), `quantities` (by item key) and `seen` (the acknowledged list, each item's name, dates and worn slots). Rows go with their member or trip.

`update_trip_packing(trip, user, op)` checks that the user is a current member, then applies one change under the row's lock, merging into the row so two sessions never overwrite each other. Errors: `42501` not on the trip, `P0002` item gone, `40001` kits changed, `22023` invalid. RLS is on with no browser policies, and only `service_role` may read the table or run the function.

## Deployment

Apply `supabase/migrations/024_trip_packing.sql` by hand after 023, with a `('024', 'trip_packing')` history row. Until then the page lists saved outfits read-only and offers no changes.
