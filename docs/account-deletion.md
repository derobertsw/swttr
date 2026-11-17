# Deleting an account's data — #139

People delete their account from the account menu: **Manage account** → **Delete account** (Clerk's `delete_self`). Clerk then sends a signed `user.deleted` webhook to `POST /api/webhooks/clerk`, and the route deletes the account's SWTTR data in one database transaction, `public.delete_user_data` (migration `20261116150000_delete_user_data.sql`).

Nothing happens until the webhook is set up in Clerk and Vercel ([setup](#setup)).

## What happens to each table

The account's own data is deleted. So are trips it owns, for their whole crew, as the privacy policy says. On someone else's trip, the account's place on the crew is deleted, as when the organizer removes someone, and records of what it did there that the crew still needs keep the record but replace its ID with `deleted-account`. The app shows an ID that matches no member as "a former crew member".

| Table | What happens |
| --- | --- |
| `user_preferences` (including height and weight), `user_wardrobe`, `user_item_mappings`, `user_custom_items` | Deleted. |
| `trips` they own (`owner_user_id`) | Deleted, with everything on them through `ON DELETE CASCADE`: stops, days (and their notes, meets and starting points), crew, invitations, kits, packing lists, attendance, nights, stays, shared gear, tour plans, conditions sources and reviews, day checks, drive estimates, nudges and the mutation receipts. |
| `trip_members` on other people's trips (`user_id`) | Deleted. Their kits, packing list, attendance, nights, starting points, own day checks and nudges cascade. Shared gear they were bringing goes back to the organizer to reassign (`release_member_shared_gear`), with a `member_removed` event. |
| `trip_conditions_reviews` on other people's trips (`user_id`) | Deleted. The review and its note were theirs, not the crew's. |
| `trip_kit_saves` (`user_id`) | Deleted: their Save to trip receipts, which outlive the trip (019). Other people's receipts for saves to a deleted trip lose their result, as when its organizer deletes it. |
| `trip_group_gear` (`assigned_by`, `accepted_by`, `packed_by`, and `actor` in `events`) | Anonymized. The gear stays with the crew, and its revision doesn't change, so nobody's open edit becomes a conflict. |
| `trip_day_checks.recorded_by` | Anonymized where they recorded a check for someone else. |
| `trip_day_tour_plans.created_by`/`updated_by`, `trip_conditions_sources.created_by`/`updated_by`, `trip_day_conditions_sources.added_by`, `trip_drive_manual_estimates.entered_by`, `trip_member_day_origins.updated_by` | Anonymized. Only a trip's organizer writes these, so on surviving trips they can't name the deleted account, but an older or hand-written row is covered anyway. `trip_member_day_origins` is updated only once its migration (20261023233000) is in. |
| `trip_nudges` (prod only, from a migration not in this repo) | No user ID; rows cascade with either member. |

Not covered:

- Mutation receipts (`trip_*_mutations.input_hash`) on other people's trips. Some, such as conditions reviews and day checks, hash the request with the user ID (SHA-256). They hold no ID in plain text and can't be tied to an account without already knowing its ID, so they stay with their trip.
- Clerk's own copy of the account, provider logs and backups, and data on the person's devices (local preferences, the outing draft). The privacy policy describes these.
- A write that lands after the deletion, from a session Clerk hadn't revoked yet. The [orphan check](#orphan-check) finds those.

A new table or column that holds a user ID must be added to `delete_user_data` (with `CREATE OR REPLACE FUNCTION` in a new migration). Add its migration to `MIGRATIONS` in `src/test/accountDeletionDb.ts` too: the test that checks no value anywhere still contains the deleted ID then covers it.

## The webhook

`POST /api/webhooks/clerk` has no Clerk session. `src/proxy.ts` lists `/api/webhooks(.*)` as public, and the route trusts a request only once `verifyWebhook` from `@clerk/nextjs/webhooks` has checked its Svix signature against `CLERK_WEBHOOK_SIGNING_SECRET`.

| Request | Answer |
| --- | --- |
| Signature missing, wrong, or more than 5 minutes old | `400`, nothing deleted |
| `user.deleted` without a Clerk user ID (`user_…`) | `400` |
| Any other event type | `200 {received: true, ignored: <type>}` |
| `user.deleted` | `200 {received: true, deleted: {<table>: <rows>}}`. A repeat, or an account with no data, answers `200` with zero counts and changes nothing. |
| `CLERK_WEBHOOK_SIGNING_SECRET` or the database isn't configured | `503` |
| `delete_user_data` doesn't exist yet | `503`, and the log names the migration to apply |
| The delete fails | `500`; the transaction rolls back |

Clerk retries a delivery that doesn't answer 2xx, with growing gaps between attempts, and the dashboard can replay a failed one. Only the 400s are final. Logs carry the counts, error codes and event types, never a user ID or payload.

## Deploy order

1. Apply `supabase/migrations/20261116150000_delete_user_data.sql` on its own in the SQL editor. Nothing calls it until the webhook is set up, so applying it before the deploy changes nothing. It works on prod's schema as it is (without 20261021201500, 20261023233000 or 20261028130000).
2. Deploy the API.
3. Set up the webhook below.

If the order slips, the webhook answers 503 until the migration is in, and Clerk retries.

## Setup

Prod runs on Clerk's **development** instance (its key is `pk_test_…`), so the endpoint goes on that instance now, and on the production instance as well when #16 moves to it. Each instance has its own endpoints and signing secrets, and its own user IDs.

1. In the Clerk dashboard for the instance, open the **Webhooks** page and choose **Add Endpoint**.
   - Endpoint URL: `https://swttr.vercel.app/api/webhooks/clerk`.
   - Subscribe to `user.deleted` only.
2. Copy the endpoint's **Signing Secret** (`whsec_…`).
3. In Vercel → Project → Settings → Environment Variables, add `CLERK_WEBHOOK_SIGNING_SECRET` with that value for **Production** and **Preview**, then redeploy so it takes effect. Add it to `.env.local` as well to run the route locally.
   - Clerk only calls the URL you give it, so Preview needs the secret only if you add an endpoint for a preview deployment, which also has to be reachable without Vercel's deployment protection.
4. On the endpoint's **Testing** tab, send the `user.deleted` example event. It names a made-up user, so the answer is `200` with zero counts. **Message Attempts** shows the status and body. A `400` there means the secret in Vercel doesn't match the endpoint's.

### End-to-end check (dev instance)

Create a throwaway account. Give it preferences (including height and weight), Wardrobe items and a custom item, a trip of its own with someone else on the crew, and a place on someone else's trip. Delete the account from the account menu, then check in the SQL editor that nothing names it:

```sql
SELECT 'user_preferences' AS t, count(*) FROM user_preferences WHERE user_id = 'user_…'
UNION ALL SELECT 'user_wardrobe', count(*) FROM user_wardrobe WHERE user_id = 'user_…'
UNION ALL SELECT 'trips', count(*) FROM trips WHERE owner_user_id = 'user_…'
UNION ALL SELECT 'trip_members', count(*) FROM trip_members WHERE user_id = 'user_…';
```

### Orphan check

Accounts deleted before the webhook was set up still have data. This read-only query lists every Clerk user ID the database holds:

```sql
SELECT DISTINCT id FROM (
  SELECT user_id AS id FROM user_preferences UNION SELECT user_id FROM user_wardrobe
  UNION SELECT user_id FROM user_item_mappings UNION SELECT user_id FROM user_custom_items
  UNION SELECT owner_user_id FROM trips UNION SELECT user_id FROM trip_members
  UNION SELECT user_id FROM trip_kit_saves UNION SELECT user_id FROM trip_conditions_reviews
  UNION SELECT unnest(ARRAY[assigned_by, accepted_by, packed_by]) FROM trip_group_gear
  UNION SELECT event->>'actor' FROM trip_group_gear, jsonb_array_elements(events) AS event
  UNION SELECT recorded_by FROM trip_day_checks UNION SELECT added_by FROM trip_day_conditions_sources
  UNION SELECT unnest(ARRAY[created_by, updated_by]) FROM trip_day_tour_plans
  UNION SELECT unnest(ARRAY[created_by, updated_by]) FROM trip_conditions_sources
  UNION SELECT entered_by FROM trip_drive_manual_estimates
) ids WHERE id ~ '^user_[A-Za-z0-9]+$' ORDER BY id;
```

Look up each ID in the Clerk dashboard (**Users**, search by ID) or with the Backend API (`GET https://api.clerk.com/v1/users/<id>` with the instance's secret key: `404` means deleted). For each deleted one, run `SELECT public.delete_user_data('<id>');` and record the counts on #139.

Only check IDs against the instance that issued them. Every development-instance ID looks deleted to the production instance, so running this against the wrong instance deletes everyone's data. IDs that don't start with `user_` are pre-Clerk device IDs that `/api/migrate-user` still moves to an account on sign-in; leave them.

## Privacy policy

`/privacy` still says deleting the account doesn't remove SWTTR records, which stays true until the webhook is set up. Once the end-to-end check passes, change that paragraph to say deletion removes preferences, wardrobe, trip memberships and owned trips automatically (owned trips for the whole crew), that records on other people's trips no longer name the account, and that logs and backups follow their retention periods.

## Tests

- `src/lib/account-deletion.database.test.ts` runs the migration in embedded Postgres (PGlite), on the schema as it is in this repo and as it is in prod: nothing anywhere still contains the deleted ID, the other account's data and trip stay, repeats change nothing, and non-Clerk IDs are refused.
- `src/app/api/webhooks/clerk/route.test.ts` signs requests the way Svix does, with its own secret, so `verifyWebhook` runs for real, and answers `rpc()` from the same embedded Postgres: bad signatures, replays, other events, and missing configuration or migration.
