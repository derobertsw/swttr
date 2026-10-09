# Trip creation (#169)

A new trip starts with one form: destination, start/end dates, an editable suggested name and an optional default activity. Create trip opens the saved overview; crew and additional stops are optional. A destination is assigned explicitly to every seeded day. Activity can remain unset, with a direct next-step link on the overview.

## Save and recovery contract

The browser keeps an account-bound draft in sessionStorage for the current tab. Before submitting, it stores a UUID and the exact request. The API uses that UUID as the trip identity and calls `create_trip_draft`: trip, first stop, every date and organizer either all commit or all roll back. The authenticated server identity supplies the owner; the RPC is executable only by the service role.

Concurrent/repeated submissions use the primary-key constraint to produce one trip. A replay by the same owner returns the current saved trip without overwriting any later changes. A different owner receives an error with no trip data. Legacy API callers without a UUID receive a generated identity and remain supported; they must provide an identity to gain replay protection. New requests with a draft identity, destination or activity are limited to 366 days. Legacy name-and-date-only requests retain their previous support for longer date ranges.

An uncertain response locks the submitted fields and offers Retry create trip, including after reload. Requests have a 20-second timeout and are cancelled when the form unmounts. Retry uses the exact same request and either opens the earlier save or completes that attempt. A validation failure, which occurs before the transaction, unlocks fields for correction. A rejected draft identity receives a fresh identity while preserving editable input. Other failures also offer Discard and start over, with a warning to check for a previously saved trip first. A confirmed save remains resumable from the creation page; Start another trip deliberately starts a fresh identity. If session storage cannot record an attempt, creation is blocked before any request. Account switch/sign-out clears the stored private draft when the next form initializes, and an unmounted form cannot apply an old response.

## Existing drafts and additional destinations

Saved `/trips/new?trip=…&step=…` links retain the former wizard and its update behavior, including crew and stop details. Existing overview, invite, daily kit and packing URLs stay stable.

The overview exposes Destinations. Adding a later stop changes no day assignments. Edit stop reloads saved assignments on opening and shows those dates as selected. Already assigned dates stay selected; move them by selecting them in another stop. The preview lists the exact additional dates before assignment; other days keep their destination. A first stop added to an older draft remains the base for unassigned days, as labeled by the existing overview. Assignment failures retain the selection and explicitly report any partial save, including when a requested date has no saved day row. Date and activity selections are locked during a stop save, and the legacy basics step blocks Exit/Cancel until its save completes. Renaming and date changes now go through Edit trip ([trip-editing.md](trip-editing.md)); the full itinerary editor and stop removal reconciliation are the rest of #176.

## Deployment and validation

Apply `016_atomic_trip_creation.sql` before deploying the new API. It adds a function and privileges, with no rewrite of existing trips. Without it, creation fails with retry feedback; no partial client-side fallback is used.

Tests execute the transaction against an in-memory Postgres instance (PGlite), including rollback, replay, owner collision and RPC grants. API and page tests cover validation, solo creation, double clicks, lost-response retry/reload, saved-draft return, account switch, storage failure, old wizard URLs, optional crew/gear links and scoped later stops. Production rollout still requires applying the migration and a real signed-in smoke test.
