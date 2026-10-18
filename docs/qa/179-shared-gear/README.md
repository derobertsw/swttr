# Shared gear acceptance and packing — #179

Verified October 18, 2026 using the actual Shared Gear controls, a temporary Next.js `/design` fixture, and headless Chrome through Playwright. The temporary page was restored after verification. The browser fixture intercepted API requests and kept state across two isolated browser contexts; it did not write live trip/account records or exercise Clerk authorization. Database and API authorization were verified separately by tests.

## Browser walkthrough

- Organizer assigns Crew tent to Ana; it awaits acceptance. Organizer cannot confirm for Ana's account.
- Ana uses Enter to accept the stove, then marks it packed. Focus moves to a useful control when acceptance replaces its button. Personal view contains only her current responsibilities.
- A second browser context reads the same saved fixture state. Organizer reassigns the packed stove to a managed guest; acceptance and packing clear. The former recipient's stale confirmation gets 409 and an explicit reload path; after reload it leaves her personal list.
- Organizer accepts/packs for the managed guest. The row explicitly identifies the override and displays the organizer as accepting/packing actor.
- Declining the guest's first-aid item returns it to unassigned with explanatory text and an attention link.
- Removing Ana in the fixture returns her tent to unassigned with a member-removal explanation. The real transactional removal trigger is covered in Postgres tests.
- A failed save preserves Packed, blocks further mutations, and offers Reload shared gear. Reload reads the confirmed state and restores controls.
- No page errors, no horizontal overflow at **1280px, 390px or 320px**, long item names wrap, and all shared-gear buttons/selects measure at least **44 × 44px**. Status/error announcements and accessible action names were inspected and keyboard-operated.

Evidence: [desktop](1280.png), [390px](390.png), [320px](320.png), [failed save at 320px](failed-save-320.png).

## Automated verification

- Production `npm run build` with Turbopack passed, including TypeScript and all 37 static pages.
- `npm run lint` passed.
- Full suite with bundled Node 24: **166 files / 2,432 tests pass**. The suite emits existing jsdom navigation warnings; no tests failed.
- Postgres tests execute the actual migration/RPC: separate acceptance and packing, actor/timestamps/events, self-assignment, guest-only organizer override, decline, reset on reassignment, stale/ABA revisions, simultaneous edits, removal/left membership, response-loss creation retry, outsider/cross-trip/left-member denial, deletion conflicts, legacy API invalidation, and anon/authenticated denial with service-role execution.
- API tests cover authenticated actor and URL identity, invalid/missing revisions, malformed requests, failure/conflict status codes and current personal assignment filtering with stable IDs. Failed gear reads are not shown as an empty confirmed list.
- UI/page tests cover pending, confirmed and failed saves, reload recovery, permission visibility, second mounts, personal/shared separation and attention links.

## Acceptance limits

This establishes local implementation, keyboard/browser layout, accessible markup and simulated cross-context recovery. It does **not** establish authenticated production persistence, committed cross-account behavior, an iPhone VoiceOver walkthrough, or an organizer usability study. Those require the migration/deployment and real accounts/devices. Screen-reader announcements were implemented with status/alert regions; a native screen-reader/device result is not claimed. Validate the coordination step with an organizer before expanding into reminders or scoring, as the issue requests.

## PR review follow-up

The original migration's lock inversion was reproduced against a disposable local PostgreSQL cluster using independent connections: confirmation versus member deletion failed with `40P01` (deadlock). The corrected migration passes all six scenarios in [lock-order.mjs](lock-order.mjs): acceptance versus deletion, reassignment versus deletion of either current or target recipient, acceptance/reassignment versus a non-key departure update, and confirmation first followed by deletion. Expected stale/permission/recipient errors remain explicit; no test deadlocks or restores a removed recipient's confirmation. PGlite remains the regular migration/state/ACL suite; the separate PostgreSQL runner verifies actual inter-session locks.

To repeat, supply a disposable **local** PostgreSQL cluster and a `pg` client available to Node. The runner creates and drops a temporary database, and initializes missing Supabase role names on that cluster. It refuses non-local hosts. `SWTTR_PG_CLIENT_MODULE` may point to an externally installed `pg/lib/index.js` so no application dependency is needed:

```sh
SWTTR_TEST_POSTGRES_URL=postgresql://postgres@127.0.0.1:55479/postgres \
SWTTR_PG_CLIENT_MODULE=file:///absolute/path/to/pg/lib/index.js \
node docs/qa/179-shared-gear/lock-order.mjs
```

Set `SWTTR_SHARED_GEAR_MIGRATION` to a saved original migration to reproduce the pre-fix failure. The verification used PostgreSQL binaries and `pg` installed under `/tmp`, with no production connection.

Packing-page regressions now cover shared acceptance while a personal quantity save is pending. Controls remain busy until the personal save settles and a fresh read confirms shared state; a real failure in that final read still offers recovery. A creation-page regression covers confirmed creation followed by repeated failed reads: it retains the form, blocks duplicate additions, and clears only after a successful recovery read. Attention links are informational (View request/View item) for crew members who cannot change another person's request.

The in-repository iOS/macOS source audit found web-view shells using this web UI and no separate gear API callers to migrate. Production/native-device acceptance limits above remain unchanged.
