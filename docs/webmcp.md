# Browser-assisted Gear up

Issue [#183](https://github.com/derobertsw/swttr/issues/183) tracks the pilot. The implementation adds the shared action from #185 and the four tools from #186. **The feature is off by default. Preview/production rollout remains pending.** The paid, stateless `/api/agent/*` API is a separate interface.

## Enablement and browser setup

Set `NEXT_PUBLIC_ENABLE_WEBMCP=true` **at build time**, then visit Gear up (`/`). Only that page owns the tools. Removing the variable or setting it to `false` and rebuilding is the rollback; navigation off Gear up also removes the registrations and cancels active invocations.

The adapter capability-detects `document.modelContext.registerTool`, `getTools`, and `executeTool`. Unsupported/missing/denied APIs are a no-op. No WebMCP code runs on the server, no SDK or transport is added, and ordinary browsing remains available without it. Safari and native WebViews are not promised WebMCP support.

The producer contract remains asynchronous `registerTool(tool, { signal })` and `execute(inputObject, { signal })` from the [WebMCP draft](https://webmachinelearning.github.io/webmcp/), rechecked against the October 20, 2026 revision. The actual browser used on October 21 was **Chrome 155.0.8059.85** on macOS, with an isolated profile and `--enable-features=WebMCPTesting --enable-blink-features=WebMCP`. Its consumer `executeTool(tool, inputObject)` now matches the draft. The previous Chrome 154 JSON-text consumer workaround has been removed from the smoke test. No compatibility bridge is added to the app.

Follow [Chrome's WebMCP setup guidance](https://developer.chrome.com/docs/ai/webmcp) for the chosen preview/production origin. Local flagged Chrome evidence does not establish origin-trial eligibility or supported production configuration. Use the Model Context Tool Inspector or another compatible browser agent for the preview acceptance walkthrough.

```sh
# Native adapter fixture, no accounts or application APIs:
npm run test:webmcp

# Real application walkthrough, guest session in a fresh Chrome profile:
NEXT_PUBLIC_ENABLE_WEBMCP=true npm run dev -- --port 3183
# In another terminal:
WEBMCP_APP_URL=http://localhost:3183 npm run test:webmcp
# Optional: CHROME_BIN=/path/to/chrome
```

The application smoke uses live geocoding and weather, selects the known Stowe, Vermont candidate for its test, requests hiking tomorrow at 09:15 on the destination's clock, checks visible layers against tool output/readback, checks Running's guest auth-required state and invalid coordinates, then follows the visible Wardrobe link and verifies discovery removal. It does not sign in or mutate account data. The default fixture still tests flag-off registration, native invocation, disposal and remount.

## Tools

All inputs are bounded JSON objects with `additionalProperties: false`; runtime validation also runs before any mutation/request. Only read/search tools carry `readOnlyHint`. Descriptions explain side effects and label external/user-entered text as untrusted data.

| Tool | Input | Result / effect |
|---|---|---|
| `swttr_get_capabilities` | `{}` | Six canonical activity IDs, current session's engine support, one-day modes, efforts, canonical units, required fields and restrictions. No account ID. |
| `swttr_search_locations` | `{ "query": "Stowe" }`, trimmed minimum 2 characters, maximum 200 before trimming | Up to five candidates from `/api/geocode`. Returns `selectionRequired: true`, even for an empty list. Never selects or changes the form. |
| `swttr_recommend_outing` | A complete one-day `Outing`, below | Applies the explicit outing to the visible form and runs the same one-day request/result path as the person. Resolves after React commits the result/error and displayed-layer report. |
| `swttr_get_current_outing` | `{}` | Pending form inputs, request state, and the actual displayed advice under its own outing context. |

### Outing input

Use activity IDs from capabilities and `exertion: "easy" | "moderate" | "hard"`. `place` has the exact search-result shape: integer `id` from 0 to `Number.MAX_SAFE_INTEGER`, `name` (1–200 characters), `country` (0–100), finite `latitude` (-90…90), finite `longitude` (-180…180), optional nonempty `region` (up to 200), optional valid IANA `timeZone` (up to 100). An already resolved device location may have country `""` and id 0. Tools never request device permission.

A place label is untrusted display data. Coordinates determine the weather location; the browser does not independently verify an arbitrary caller's label against its coordinates. Search candidates are explicit choices, not instructions. Ask the person to resolve ambiguous places rather than guessing.

`when` is either `{ "mode": "now" }` or `{ "mode": "later", "date": "YYYY-MM-DD", "time": "HH:mm", "durationDays": 1 }`. Impossible dates/times, unknown fields, and multi-day inputs fail before state changes. The weather API resolves destination time zone, effective forecast hour and availability. A failed forecast never becomes current weather. The exact requested minutes remain separate from the effective weather hour.

Example (replace the date with one inside the available forecast):

```json
{
  "activity": "running",
  "exertion": "easy",
  "place": {
    "id": 5241611,
    "name": "Stowe",
    "region": "Vermont",
    "country": "United States",
    "latitude": 44.46533,
    "longitude": -72.68456,
    "timeZone": "America/New_York"
  },
  "when": { "mode": "later", "date": "2026-10-22", "time": "09:15", "durationDays": 1 }
}
```

## Outcomes and readback

`submitOuting(input, { signal })` is exposed by `useGearUp`. It never chains setters then submits from old closures. The form/native Gear Up action and the programmatic action share `recommendFor`, `buildLayersResult`, the reducer, the weather adapter and protected recommendation requests. No second outing/result store is added.

- Completed: `{ status: "completed", snapshot }`. Completion means the result was shown; inspect `snapshot.displayed.advice.kind` and `reason` to understand the advice.
- Action failure: `{ status: "error", code, message, snapshot }`. Codes: `invalid_input`, `not_ready`, `busy`, `cancelled`, `weather_unavailable`, `recommendation_unavailable`.
- Tool validation failure: `{ status: "error", code: "invalid_input", message }` before calling the controller.
- Search failure: `{ status: "error", code: "location_unavailable", message }` without raw transport errors.
- Browser/lifetime aborts reject with `AbortError`; a disposed callback cannot read a new account's handler. The direct action returns `cancelled` and stops its fetches. Unmount/account changes return no private snapshot to an old action.

Snapshot `status` is `empty`, `loading`, `error`, or `ready`. `pending` is the form draft; `request` identifies an active/failed submitted outing independently of `displayed`. During an update or after a failed update, the retained result keeps its original activity/place/time/weather and edited layers. A failed initial personalization request can still complete with general/missing advice and reason `unavailable`.

`displayed` contains outing, weather with explicit Fahrenheit/mph units and available provider/time/coverage metadata, advice kind/reason, and the committed `LayerDisplay` projection. Wear names are grouped by body area and base/mid/outer, with separate Carry arrays for climb/descent, an active phase, manual-edit flag, guidance, missing gear, warnings, transition steps and evaluation status (`pending`, `failed`, `ready`, `unavailable`). Pending/failed evaluations omit a decision for the changed layers rather than attributing an old check to them. Read again after edits or a pending evaluation completes. No raw recommendation payload, wardrobe IDs, body measurements, auth tokens, invite links or unrelated account data are returned.

The human UI's multi-day flow still works. These tools do not submit multi-day requests. Readback explicitly returns `multi_day_readback_unsupported` with `displayed: null` while a human multi-day result is shown.

### Advice support

| Activity | Guest / expired session | Signed in |
|---|---|---|
| Alpine, XC | General guide, `auth_required` | Personalized, or general with `no_gear` / `unavailable` |
| Running, Biking, Backcountry | No layers, `auth_required` | Personalized, or no layers with `no_gear` / `unavailable` |
| Hiking / snowshoeing | General guide, `unsupported` | General guide, `unsupported` |

Targets-only responses map to `no_gear`, never invented garments. Request status and advice kind remain separate. Hiking never claims a biophysics model.

## Cancellation, identity and access

A second agent request returns `busy` before changing inputs. A human edit/submission, Edit outing, Start over, navigation or account change retires agent work; late weather/recommendation completions cannot change a newer result. Weather and personalized fetches receive the invocation's cancellation signal. Cancellation settles promptly even if a transport ignores abort. Registration cleanup and per-invocation cancellation have distinct controllers; cancelling one call leaves discovery intact.

The existing Clerk session and same-origin APIs remain authoritative. `/api/v1/recommendations/*` remains protected and `/api/agent/*` retains its MPP behavior. The tools accept no account selector or credentials and never automate sign-in, save a trip, edit Wardrobe/preferences, share, invite, pay, or request device location. Existing sign-in-return UI remains the recovery path. Account switches invalidate in-flight work and clear readback before the new account's data can be read. Registration omits cross-origin exposure options.

## Verification and rollout

See [the acceptance record](qa/183-browser-gear-up/README.md) and [sanitized native Chrome evidence](qa/183-browser-gear-up/chrome-155-guest.json). The action, tools and page integration are implemented. Signed-in browser acceptance, real preview enablement, Safari/Capacitor smoke and production setup/enablement are still open; keep #183/#186 open and the flag off until those checks are complete. Mocked integration tests and a localhost guest walkthrough do not complete deployment acceptance.
