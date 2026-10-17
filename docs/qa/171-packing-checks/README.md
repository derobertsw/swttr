# Personal packing checks — #171

Verified October 16, 2026 with the real packing page, Next.js dev server and Chrome via Playwright. A temporary `/design` wrapper mounted the page; browser request interception supplied deterministic packing responses. The wrapper was restored after verification. No live packing/account records were written.

## Browser evidence

- [Desktop, 1280px](desktop.png)
- [Phone, 390px](mobile-390.png)
- [Narrow phone, 320px](mobile-320.png)
- [Failed save and Retry, 320px](failed-save-320.png)

Assertions passed for Space-key checking, focus retained on the checkbox, 44×44px minimum checkbox label targets, wrapping long names, and no horizontal page overflow at 320px or 390px (including the failure state). Quantity controls use a separate line on phones to keep names readable.

The checkbox retains its last confirmed state on a save failure; Retry sends the identical mutation UUID and expected version. Reload and a second isolated browser context read the same fixture-server checks. A replaced identity starts unchecked; the original identity returns checked after renaming/reordering. Assigned group equipment has no checkboxes. No browser page errors occurred.

This fixture exercises the real UI with intercepted network data. It does **not** establish authenticated production persistence or a VoiceOver/device result.

## Automated evidence

- Full suite with bundled Node 24: **148 files / 2,055 tests pass**.
- Page integration tests: keyboard behavior, pending/failed/confirmed states, retry identity, second mount, out-of-order responses, conflict refresh, read-only fallback, identity regeneration and separate crew gear.
- API tests: caller identity rather than payload identity, server-derived aliases, rejecting other members' or missing items, malformed edits, stale outfits/checks, scoped reads and private responses.
- Embedded Postgres runs the actual migrations/RPC: durable reads, merging different keys, same-key compare-and-set/ABA conflicts, idempotent response-loss retry, quantities and aliases, personal additions/removal, outfit revision checks, member isolation, deletion cascades, RLS and service-only grants.
- Lint passes with `npm run lint -- --ignore-pattern '.claude/**'` to exclude the pre-existing untracked nested worktrees; typecheck passes. Final production-build and focused rerun results are recorded in the PR.

The initial full-suite run on host Node 26 suffered long timeouts and worker failures across unrelated pages. The Node 24 rerun passed the complete suite.

PR review follow-up: four additional Postgres cases cover quantity changes before an item's first check, for both outfit items and personal additions. A 1 → 2 → 1 cycle advances the unchecked version and rejects an older session's `expected: null`; saving an unchanged quantity preserves the existing version. The two cycle regressions fail before the fix. All 172 focused packing tests pass after it.

## Deployment/device acceptance still required

1. Apply `supabase/migrations/20261016231848_trip_personal_packing_checks.sql` after migration 024, registering the migration in the same transaction; deploy API/UI after the migration.
2. With real signed-in members in two independent sessions, check an item, reload the other session, regenerate saved outfits and verify exact-key retention/replacement. Verify that one member cannot read or change another member's checks.
3. Repeat on an actual iPhone with VoiceOver and 200% text/zoom. Native checkbox names and live saving/error messages have component/browser coverage; an actual screen-reader walkthrough has not been performed.

Keep #171 open until deployment and authenticated/device acceptance are verified. Product decisions and account-deletion coordination with #139 are in [trip-packing.md](../../trip-packing.md).
