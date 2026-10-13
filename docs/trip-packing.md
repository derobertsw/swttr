# Packing from accepted trip kits (#177)

Packing now derives a person's requirements from their accepted saved outfits and saved plan days (#170). It never chooses a different garment from the current wardrobe or replaces the outfit when weather, activity or effort changes. General trip guidance for days without accepted kits remains a separately labeled suggestion. Legacy category checklists are labeled for resolution; unsupported, unplanned and rest days remain visible above the list. Saved-kit date/place/activity/effort mismatches link to the day for review. Refreshing Packing does not refresh a kit: re-plan in Gear up and explicitly replace it there.

## Identity contract for #171

- A resolved saved selection uses `[kind, sourceId]`, serialized as JSON. `owned` and `suggestion` are separate namespaces; an unowned suggestion never inherits an owned item's identity or future packing check.
- Garment names are display facts from the accepted snapshot. Renaming/reordering the live wardrobe does not change a requirement. All outfit phases and plan dayparts contribute Wear uses. Carry names are matched only to an unambiguous selection in that same saved kit. Ambiguous/name-only carry entries remain unresolved.
- Name-only selections have unresolved slot identities `[unresolved, bodyPart, layer, normalizedName]`; Carry-only strings use `[unresolved, carry, normalizedName]`. These are generic requirements, not invented physical garment IDs. Normalization trims/collapses whitespace and lowercases in en-US. Older mapped plan names remain unresolved when their snapshots lack IDs.
- Personal manual additions have browser-generated v4 UUIDs, names and quantities. Their requirement identity is `manual:<uuid>` and they persist independently of daily kits. Removing/readding an addition creates a new identity.
- One physical item is listed once across dates/phases, with every `{date,purpose,phase,kit_id}` source retained. Default quantity is one, not a count of uses. Explicit quantity overrides (1–100) are persisted by identity. Overrides remain stored if a garment disappears, so its chosen quantity returns when that same identity reappears. Manual quantities are separate from garment overrides.
- Each apply exposes added/removed requirements and changed quantity/name/source uses. A garment swap is a removal and addition. The confirmed snapshot remains until Apply reviewed changes succeeds. This supplies identities and revision deltas to #171; it neither stores nor displays packed checkboxes. #171 still owns removed/reintroduced checked-state policy.
- Shared gear remains an assignment list with its original assignment IDs. It does not contribute personal clothing requirements or imply acceptance/physical packing.

## Persistence and conflicts

`trip_member_packing` stores one private snapshot per trip member: revision, applied requirements, independent manual additions and quantity overrides. Deleting its member/trip cascades the snapshot. Account deletion work (#139) must delete the account's trip membership records as well as owned trips to erase this data. It is unavailable to anon/authenticated roles; the Clerk-authenticated server accesses it through service_role.

`GET /api/v1/trips/:id/pack` returns the existing general-guidance response plus `packing`, including the applied list, proposed list, delta and opaque source/proposal tokens. It fails closed on incomplete trip/kit reads. Saved kit days skip automatic forecasts and wardrobe remapping. `assignedGroupGear` retains assignment IDs; `groupGear` stays compatible with older callers.

`POST` accepts `action: preview|apply`, `revision`, `manual_items` and `quantities`. Apply additionally requires the reviewed `source_revision` and `proposal_revision`. The server derives every requirement; no client-supplied requirement list is accepted. Preview writes nothing. Apply checks the tokens, then `apply_trip_packing` rechecks current trip dates, day identities/dates and this member's kit content under locks, together with the private packing revision. A stale kit, date or packing review returns 409 and writes nothing. Retry of the immediately preceding identical apply returns that saved revision. Failed saves retain the inputs; a conflict reloads the saved version while keeping pending edits, and the next review shows the resulting merge/removals explicitly.

Dirty personal inputs intercept day links and browser/native Back using the existing trip sheet/history convention, offering Keep editing or Discard changes. Reload/close uses the existing native unsaved-input prompt. Buttons/inputs have visible labels, shared 44px input targets, wrapping names and announced save/error states. Packed checkboxes remain absent.

## Deployment and validation

Apply `supabase/migrations/20261012234903_trip_packing_requirements.sql` before deploying the API/UI. It explicitly grants the table/function only to service_role and enables RLS. No live database was modified by this implementation.

Focused tests cover three-day garment deduplication, swaps/removals, manual items and quantities, both members' kits, all phases/dayparts, unresolved legacy items, stable tokens, forged/stale previews, failed saves, Postgres persistence/replay/conflicts, membership authorization, public-role privileges and member deletion. Component tests cover source-day links, explicit review/apply, reload, retry identity, preserved edits and dirty navigation. A standalone browser fixture was inspected at desktop, 390px and 320px; long names wrapped with no horizontal overflow at 320px, keyboard addition/apply worked, and Back offered Keep editing while retaining the manual item. Repository lint, typecheck, knip and full Vitest are required.

An authenticated deployed walkthrough and actual iPhone/VoiceOver acceptance remain required before closing #177; fixture/component checks cannot establish that evidence. In particular, verify changing a kit in Gear up, returning to Packing, inspecting the delta, applying it and reloading in a second signed-in session.
