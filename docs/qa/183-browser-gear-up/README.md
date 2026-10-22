# #183 browser Gear up acceptance — October 21, 2026

Implementation branch: `codex/183-browser-gear-up`, based on main `f83cb23`. This implements the atomic one-day action (#185) and the four tools (#186); #183/#186 remain open for rollout acceptance.

## Native browser evidence

- macOS, Google Chrome **155.0.8059.85**, isolated fresh guest profile.
- Native `document.modelContext`, no shim/polyfill or mocked registration.
- Flags: `--headless --enable-features=WebMCPTesting --enable-blink-features=WebMCP`.
- Local Next app at `http://localhost:3183`, with `NEXT_PUBLIC_ENABLE_WEBMCP=true` in the development process. Production/preview configuration was not changed.
- `WEBMCP_APP_URL=http://localhost:3183 npm run test:webmcp` passed against live `/api/geocode` and `/api/weather`.
- Native discovery found exactly four application tools. Search found five Stowe candidates and explicitly picked Vermont for the fixed test scenario.
- Hiking at Stowe on October 22 at **09:15 America/New_York** returned general guidance with reason `unsupported`; the API used the **09:00-04:00** forecast hour. Visible place/requested time and all Wear names matched the returned snapshot and subsequent readback.
- Running returned `none` / `auth_required` and the matching visible sign-in notice. No anonymous layers or auth automation.
- Out-of-bounds coordinates were rejected without replacing the result. Clicking Wardrobe navigated to sign-in through the existing route guard and removed all four Gear up tools from native discovery.
- Evidence: [chrome-155-guest.json](chrome-155-guest.json). It contains only public place/forecast data, static guidance and boolean checks; no account/session data.
- The default `npm run test:webmcp` adapter fixture also passed native registration, invocation, flag-off registration, abort cleanup and immediate remount.

Chrome 155 accepts an object as consumer input, matching the October 20 WebMCP draft. The previous Chrome 154 JSON-text workaround in the smoke consumer was removed. The app producer API did not need a compatibility change.

## Automated checks

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run knip`: passed (existing configuration hints for Apple/Mac paths).
- Full suite: **183 files / 2,706 tests passed** with `NODE_OPTIONS=--no-experimental-webstorage npm test -- --run`.
- Focused check covering form/action equivalence and newer-human-submission regressions: **10 files / 278 tests passed**.
- Node on this host is 26.10.0. Without that environment option, Node's native localStorage getter masks jsdom storage and causes unrelated preferences/units tests to fail before cleanup; disabling only Node's experimental Web Storage allows jsdom's storage to be used. No application/test configuration was changed for this environment issue.
- `npm run build`: passed with network access after clearing this isolated worktree's generated `.next` cache. The initial sandboxed build could not fetch Google Fonts or open Turbopack's worker port. No source workaround was added.

Coverage includes strict unknown-field/numeric/date validation, empty/ambiguous/malformed/failed searches, all six activities under guest/signed-in fixtures, targets-only/no-gear and expired-session outcomes, preserved advice on failures, atomic inputs, cancellation in weather and recommendation stages (including ignored abort), busy calls, newer human input, account replacement/unmount, UI Wear readback after layer removal, evaluation status and registration lifecycle/SSR. Existing protected-recommendation and paid-route tests passed in the full suite.

## Remaining rollout checks

- Signed-in native browser workflow with fixture gear and evaluation, including edits and account replacement. This run intentionally used a fresh guest profile.
- Preview deployment with the flag enabled and its supported browser/origin-trial setup verified using the Inspector or another browser agent.
- Safari and Capacitor ordinary-browsing smoke on the target builds.
- Supported production configuration and explicit production enablement after preview acceptance.

The implementation remains off by default. #183/#186 are not complete based only on the localhost browser check. Setup, contracts, privacy and rollback: [webmcp.md](../../webmcp.md).
