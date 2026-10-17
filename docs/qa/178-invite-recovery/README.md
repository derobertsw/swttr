# Invitation recovery (#178)

## Contract

Pending invitations create shareable links; SWTR does not deliver messages. Copy and Share are separate actions. Cancelling native sharing does not copy the link or report delivery. Account-free guests are managed by the organizer and have no account access.

Accepted invitations keep their token as a recovery handle. GET reveals a used invitation only when Clerk's current account matches the joined member. POST is idempotent for that account. Unknown, revoked, removed and other-account used links return the same generic unavailable response, without trip details. Links accepted before this change had their tokens cleared and cannot be reconstructed; My trips is their recovery action.

Claims condition the update on member id, token and `status = invited`. Revoke/replace condition on the reviewed token and the same pending status. A stale operation cannot overwrite a successful claim or reactivate an old link. Revocation keeps the pending member and their prepared kits; replacement also keeps them, generating a new link. Deleting the member removes access and cascades deletion of trip kits and packing checks, while group gear is unassigned.

The existing unique `(trip_id, user_id)` index prevents one account from joining twice, including concurrent claims on different invitations. An existing member following another person's invitation goes to their own pack list without consuming or deleting that invitation. Accepted tokens are removed from trip/member response payloads; only the accepting account can use the original link to recover. Pending tokens appear only in the organizer's trip response.

RLS remains enabled with no public policies and anon/authenticated table privileges revoked by migration 014. Routes use the server-only service role and enforce Clerk identity and organizer scope in code. No schema migration or production data edit is required.

## Automated evidence

All accounts and invitations in these tests are synthetic, with mocked Clerk identity and an in-memory Supabase query builder; no real participants receive messages.

- `src/app/api/v1/trips/invite/[token]/route.test.ts`: signed-out preview and claim rejection; repeated acceptance/lost success response; used-link privacy after sign-out and wrong-account switching; two accounts racing for one invitation; same-account simultaneous retries; existing members preserving another person's invitation; revoke/replace/reissue and stale-token rejection; a claim paused before its update while revocation wins; claimed-link protection; removed/left members; organizer authorization; direct membership edit rejection; load failures.
- `src/app/trips/invite/[token]/page.test.tsx`: recognizable identity, switch-account return path, sign-in/sign-up return links, joined destination, safe acceptance retry, unavailable versus failed-to-load actions, and clearing a joined preview when the account changes or signs out.
- `src/components/trips/trip-primitives.test.tsx`: explicit clipboard copy and quiet native-share cancellation.
- `src/app/trips/[id]/manage/page.test.tsx`: count labels, revoke without removal, guest explanation, accurate deletion confirmation, failed mutations and dialog focus behavior.
- `src/lib/trips.test.ts`: server-provided crew counts and access protections.

## Live verification boundary

The automated checks do not establish live Clerk OAuth/provider behavior, native operating-system share sheets, or multi-connection PostgreSQL transaction timing. A live acceptance pass should use two disposable accounts: sign in/up from a pending link, switch from the wrong account, retry a claim after hiding its response, race two claimants, revoke/replace a pending link, and remove a joined participant. Check both their original link and My trips afterward. Do not send test messages to real participants.

## Local validation (2026-10-17)

- `NODE_OPTIONS=--no-experimental-webstorage npx vitest run`: 154 files, 2,168 tests passed. The flag prevents Node 26's experimental global storage from shadowing jsdom storage.
- Two additional token-redaction cases were added after that suite run; `npx vitest run src/lib/trips.test.ts` passed all 12 cases.
- `npm run lint -- --ignore-pattern '.claude/**'`: excludes unrelated, untracked nested worktrees in this checkout.
- `npx tsc --noEmit`: passed.
- `npm run build`: attempted, but Turbopack's PostCSS worker cannot bind a port in this execution sandbox, including on an elevated retry.
- `node node_modules/next/dist/bin/next build --webpack`: passed compilation, TypeScript, static-page generation and build tracing. It reports an existing optional `mppx` dependency warning for `@modelcontextprotocol/sdk/types.js`.
