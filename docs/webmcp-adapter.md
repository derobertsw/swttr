# WebMCP adapter

Issue [#184](https://github.com/derobertsw/swttr/issues/184) supplies the browser adapter and page lifecycle. The atomic outing action and real SWTTR tools remain in #185/#186, after #166. The Gear up client boundary mounts an empty tool set today; it exposes no fixture or personal information.

## Enablement and API revision

Set `NEXT_PUBLIC_ENABLE_WEBMCP=true` at build time to opt in. It defaults off. The adapter checks `document.modelContext` for `registerTool`, `getTools`, and `executeTool`; missing, incompatible, or denied APIs leave normal browsing intact. Nothing reads a browser global at module evaluation or during server rendering.

The selected producer contract is the [September 30, 2026 WebMCP draft](https://webmachinelearning.github.io/webmcp/): asynchronous `document.modelContext.registerTool(tool, { signal })`, with `execute(inputObject, { signal })` callbacks. Aborting the registration signal removes discovery; an invocation has its own cancellation signal. No legacy `provideContext`, `unregisterTool`, server transport, bridge, or protocol dependency is used.

[Chrome's setup instructions](https://developer.chrome.com/docs/ai/webmcp) describe the experimental testing flag at `chrome://flags/#enable-webmcp-testing` and an origin trial beginning with Chrome 149. This feature does not promise support in other browsers or native WebViews. Registration omits `exposedTo`, preserving same-origin exposure and the default `tools` permissions policy. The smoke fixture explicitly serves `Permissions-Policy: tools=(self)`.

## Page and account ownership

`useWebMCPTools(tools, scopeKey)` belongs in the Gear up client boundary, rather than the application layout. Pass the current account identity as `scopeKey`; change it on sign-out or account replacement. A scope change disposes the old registrations and aborts their outstanding actions before installing new callbacks. Old retained callbacks reject without reading the next account's handlers.

Equal serialized tool metadata keeps a registration stable across input changes; callbacks read the latest committed handlers. Changes to names, schemas, descriptions, annotations, enablement, or scope replace the registration. A local ownership map prevents two mounted owners from claiming the same name. Cleanup is synchronous and idempotent, including while registration promises are pending. Any registration failure removes the entire partial set and is handled without an unhandled rejection.

The adapter forwards a separate combined invocation signal to the action, cancelled by either the browser caller or page/account cleanup. Cancelling one invocation leaves discovery intact. Late results from cancelled actions are rejected. Future actions must pass that signal to fetches and check it before committing UI updates or private snapshots after an `await`; an adapter cannot undo side effects inside a handler that ignores cancellation. Keep cached private results inside the account/outing contract, not a global tool registry.

## Native Chrome smoke test

Run with Node 22 or newer and an installed Chrome:

```sh
npm run test:webmcp
# If Chrome is elsewhere:
CHROME_BIN=/path/to/chrome npm run test:webmcp
```

The script starts an isolated temporary Chrome profile and localhost HTTP fixture, compiles the actual adapter using the existing TypeScript dependency, and calls native discovery/execution through DevTools. It closes that browser and removes the temporary profile. It does not use a polyfill, an account, production services, or real SWTTR actions. The isolated browser uses `--headless --enable-features=WebMCPTesting --enable-blink-features=WebMCP`; the user's Chrome settings are unaffected.

Verified September 30, 2026, on macOS with **Google Chrome 154.0.8037.92**. Flag-off registration, native registration/discovery/invocation, removal on abort, pending-registration disposal, and immediate remount all passed. The fixture returned `{ "message": "native Chrome" }` and left discovery empty after cleanup. This verifies the browser API and adapter; it does not verify an agent extension or the eventual Gear up tools.

**Implementation/spec mismatch:** this Chrome build's consumer `executeTool` accepts JSON text as the input arguments, while the selected draft specifies a JavaScript object. Passing an object failed with `UnknownError: Failed to parse input arguments`; stringifying the fixture input succeeded. Only the smoke consumer uses this browser-specific argument shape. SWTTR's producer adapter does not invoke `executeTool` or add a compatibility bridge. Recheck the consumer signature when upgrading Chrome or integrating a test agent.

Unit tests separately cover missing/incompatible APIs, flag-off behavior, denied access, synchronous and asynchronous registration failures, ownership conflicts, React Strict Mode, pending unmount/remount, current handlers, metadata changes, per-invocation cancellation, account changes/sign-out, late results, and server rendering. Real tool schemas, input validation, action semantics, and snapshots belong to #185/#186; follow [Google's imperative guide](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/webmcp/agentic-javascript-tools/guide.md) while retaining the recorded revision boundary.
