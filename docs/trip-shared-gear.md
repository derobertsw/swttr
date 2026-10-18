# Shared gear responsibility — #179

Assignment asks someone to bring an item. Acceptance records their agreement; Packed records physical preparation. Neither assignment nor acceptance implies packing, and shared gear never produces an overall Ready verdict. Personal packing checks (#171) remain separate.

## Permissions and states

| Action | Who can do it | Result |
| --- | --- | --- |
| Add an unassigned item, request another person, reassign or remove an item | Trip organizer | A request to another person starts Awaiting acceptance. |
| Add an item for yourself, or volunteer for an unassigned item | A joined member, including the organizer | Self-assignment implies acceptance; the item remains not packed. |
| Accept, decline, mark packed or mark not packed | The current joined recipient | Acceptance and physical packing have independent actor/timestamp fields. Decline clears the assignee and both confirmations. |
| Confirm for a managed guest | Organizer, only when the recipient has no account and both role and status are `guest` | The organizer's account is recorded as actor. UI explicitly says the organizer is acting on the guest's behalf. An invitation placeholder has no override. |
| Remove a member, or mark them left | Existing membership controls | Their gear becomes unassigned in the same database transaction, clears confirmations, and records the organizer as actor. |

Ordinary members cannot request other people or take over another person's assignment. An organizer cannot accept or pack for another account. Only the organizer removes shared items. Choosing the existing assignee again preserves confirmations. Changing the assignee clears old acceptance and packing, even when an item later returns to a previous person.

Existing assignments start awaiting acceptance after migration; they have no invented confirmation or actor. Decline and member removal leave visible explanatory text in Shared Gear. Overview and Crew list unassigned and unaccepted items with links directly to their shared gear row. Personal Packing returns only the requesting member's current assignments as structured objects, distinguishing pending requests, accepted items and packed items. Declining the last personal assignment leaves an empty-state message and a focus destination.

## Persistence and recovery

The existing shared-item UUID is the stable identity, including when two items have the same description. `assigned_at/by`, `accepted_at/by` and `packed_at/by` are separate fields. `events` records each new mutation's action, actor, timestamp and recipient; it keeps the previous recipient for declines and member removals. Events belong to the item and are removed when the item or trip is deleted. Account deletion/anonymization must include these actor IDs when #139 defines that workflow.

Every mutation sends the last observed `revision`. `update_trip_shared_gear` locks the trip, then involved members in UUID order, then the item; it checks current membership/recipient permissions, compares the revision and writes atomically. Member locks use `FOR SHARE` so a non-key status change also waits. The member-removal trigger already holds its member row and never takes a trip lock; it updates gear in the same member-before-gear order. The RPC re-reads the item and rechecks authorization after waiting, so a completed removal cannot be undone by a stale confirmation. A stale assignment, acceptance, packing or deletion receives `409`, with no write. The API supplies the authenticated Clerk user ID; payload actor claims do not control attribution. A missing/departed recipient cannot confirm. Concurrent edits to different items serialize without overwriting one another.

The UI keeps confirmed state during saves, announces successful saves, and disables conflicting actions until the saved list loads. Failure, timeout/network loss, conflict or a failed read offers **Reload shared gear** before another deliberate action. It does not silently replay a stale confirmation. Reload/Refresh retrieves server state, including a write whose response was lost. New-item retries retain one creation UUID, avoiding duplicate items after a lost creation response. If creation is confirmed but the following reload fails, the form retains its input, blocks further additions, and offers Reload added item; recovery only reads, without creating again. A shared-gear refresh that overlaps personal packing saves waits for those saves and reads again, rather than treating a deferred read as a failure. Reloading the page abandons unsaved intent. There is no offline queue, notification delivery, reminder or crew score.

`POST /api/v1/trips/:id/gear` accepts `{id, description, assignee_member_id}`. `PATCH /gear/:gearId` accepts `{action, expected_revision, assignee_member_id?}` where action is `assign`, `accept`, `decline`, `pack` or `unpack`. `DELETE` requires `{expected_revision}`. `GET /pack` now returns `groupGear: TripGroupGear[]`, replacing description strings. Actor/timestamp/revision fields are written by the database. Failed shared-gear reads fail the trip/packing load instead of appearing as an empty confirmed list.

## Rollout and verification

Apply `20261018131917_trip_shared_gear_responsibility.sql` before deploying the API/UI. It extends the existing table without adding gear rows, uses `SECURITY INVOKER`, keeps RLS enabled, denies anon/authenticated table/RPC access, and grants RPC execution only to `service_role`. It follows the API-only Clerk/service-role model from migration 014. The RPC performs authorization again inside the transaction. A compatibility trigger also clears confirmations if an older deployed API directly changes assignment/name without a new revision during rollout; those legacy writes have no known actor and are recorded accordingly.

The migration and actual RPC are tested in embedded Postgres, including ACL/RLS checks. No production database was modified. Apply and deploy remain rollout steps. Browser evidence, automated results and the remaining device/authenticated acceptance limits are in [the QA record](qa/179-shared-gear/README.md).

Native caller audit: the in-repository iOS Capacitor shell and macOS WKWebView load the shared web UI. Searching their sources found no independent gear create/delete API calls using the older payloads. This is a source audit, not an authenticated native-device acceptance claim.
