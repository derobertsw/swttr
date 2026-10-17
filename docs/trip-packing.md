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
- **Quantity.** An item counts once however many days use it. The person can choose another number from 1 to 20; it's kept by the item's identity, so it stays when the item leaves the outfits and is back when the item returns. An item can be saved under other keys too (`aliases`): a catalog item under the general key of a plan item with its name, body area and layer, and a worn item under the carry key of its name. A quantity saved under one of them applies to the item until a quantity is chosen under its own key, whether or not an outfit still names it that way, so replacing a plan day with a catalog outfit wearing the same item keeps its quantity.
- **Changes since last time.** The list as the person last acknowledged it is kept (`seen`). An item that's new where an item that left was worn (the same day, body area and layer) **replaces** it. Other new items are **new**. All items that left, including replaced items, are listed as **no longer in your outfits**, with the days they were for. Carried-only items are new or removed, never replacements. Got it acknowledges every change at once. The first list someone sees is recorded without flags, so their first outfits don't all show as new.
- **No silent acknowledgement.** Got it sends back the version of each of the person's kits it was shown for. If any changed since, nothing is recorded and the page reloads the list with the new changes. The database locks those kits while it records the acknowledgement, so a kit saved meanwhile is flagged afterwards rather than absorbed.
- **Saved outfits stay as saved.** A day whose plan changed after its outfit was saved (another place, date or activity) is listed under Days to review with why, the same notes the day page shows. Its outfit stays in the list until the person replaces it from Gear up.
- **Older checklists.** A day kit with category slots (shell, gloves) but no saved outfit is listed under Older day checklists. It names no particular items, so it isn't in the list, and no garment identity or thermal value is invented for it.
- **Days to review.** Days without a saved outfit, days with an older checklist and saved outfits that no longer fit come first, each with a link to the day. A partial list never claims to be complete.
- **Packing checks** (#171) persist privately for the signed-in person and trip; see the decisions below.

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


## Personal packing checks (#171, October 16, 2026)

| Question | Decision |
|---|---|
| Who owns a check? | The signed-in member on this trip. Organizers cannot check another member's items or a managed guest's list. This is separate from the wardrobe and crew equipment assignments. |
| What matches across regeneration? | **Exact `key` only.** Catalog/wardrobe source IDs survive changed labels, order and day/phase use. A general item uses its existing normalized body area/layer/name key; a carry-only item uses its normalized name. Hand-added items use `manual:<UUID>`. Quantities can follow aliases; change flags, acknowledgements and physical packing checks use exact keys, because a name match doesn't establish that the same thing is packed. Upgrading a name-only item to a catalog identity therefore shows an addition/replacement plus the removed old identity, even when the names match. |
| New, replaced or removed items? | New/replaced identities start unchecked. Every removed outfit requirement stays in **No longer in your outfits** until Got it, including items with replacements. Removed checks stay dormant, without a checkbox. Got it acknowledges changes and never changes packing checks. |
| An item returns? | The exact outfit-item key restores its previous check if its quantity still matches. This also holds after Got it. A general item's name change creates a new identity; it starts unchecked. Removing a hand-added item deletes its check; adding another creates a fresh UUID and starts unchecked. |
| Quantity? | Checking confirms **all** of that item's displayed quantity. Changing that item's quantity clears its check and advances its version, even before the first check and even if the old quantity is later restored. A stale check for a different quantity isn't shown as checked. |
| Offline, timeout or lost response? | No offline queue or local-only synced state. The checkbox stays at its last confirmed value while saving. A failed or unconfirmed save says so and offers Retry with the same request UUID and expected version. A reload reads the server, including a save whose response was lost. Unsaved retry intent exists only while the page is open. |
| Two sessions? | Different keys merge under the member row's lock. Each check has a version UUID, including unchecked entries. A stale edit to the same key or quantity gets `409 packing_changed`, reloads, and asks the person to review the saved state before another edit. Retrying the latest committed mutation is idempotent; an older retry cannot overwrite a newer check. Refresh/reload in another signed-in session retrieves the same state. |
| Readiness? | Coverage and links to unresolved days remain above the list. Suggestions and older category checklists have no physical packing check. All checked personal rows do not claim that unresolved days or assigned group equipment are complete. |

### API and database

`GET /api/v1/trips/:id/pack` and successful `POST` responses include `checks`, a map of exact keys to `{packed, quantity, version}`. Removed keys can remain in this private map for reintroduction; they never become active list rows on their own. `editable: false` hides all checkboxes when durable choices cannot be read, including when the new column is not deployed.

`POST {op: "set_packed", key, packed, quantity, expected, mutation, kits}` edits one check. `expected` is the last check's version, or null; `mutation` is a new UUID kept for retries; `kits` is the outfit/checklist version map shown by GET. The API derives and validates keys against this member's current saved outfits. Manual keys must exist in this member's stored additions. The client cannot choose a member/user identity or supply aliases. Outfits changed before the save return `409 kits_changed`; stale checks/quantities return `409 packing_changed`; removed items return `404`. No private database error details are returned.

Migration `20261016231848_trip_personal_packing_checks.sql` adds `trip_member_packing.checks` and replaces `update_trip_packing`. It retains RLS, no public/browser grants, `SECURITY INVOKER`, and service-role-only execution. The RPC locks the trip against outfit/itinerary writers, the current membership against removal, and the packing row against other personal edits; checks the kit versions and effective stored quantity; then merges one key atomically. Quantity changes invalidate only their own exact check. The API supplies aliases solely to resolve the existing quantity rules.

**Deletion coordination with #139:** checks live inside the existing member packing row, so deleting a trip/member cascades through them without another table or cleanup request. An account deletion implementation that anonymizes rather than deletes membership must delete that member's packing row before unlinking their account; checks, additions, quantities and seen history are all private account data. Account deletion itself remains #139.

### Rollout and verification

Apply `20261016231848_trip_personal_packing_checks.sql` after `024_trip_packing.sql`, recording version `20261016231848` with name `trip_personal_packing_checks` in the same transaction. Deploy the migration before this API/UI. No live database was modified while implementing this change.

Focused page/API/Postgres tests cover durable reads, different-item merges, same-item conflicts and ABA updates, lost-response retries, unchanged/replaced/removed/returning identities, quantities, malformed requests, member isolation, service-only grants, RLS and member/trip deletion. Browser fixture evidence and any remaining device/deployed acceptance are recorded in `docs/qa/171-packing-checks/README.md`.
