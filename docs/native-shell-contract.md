# Native shell contract

Installed shells and the live web app update independently. Keep existing
markers, events, parameters, storage keys and message handler names compatible;
add new entries instead of renaming or removing old ones. Shell markers affect
UI only: Clerk and API authorization still apply to every request.

## User-agent markers

Append the marker to the normal WKWebView user agent before the first request.
Do not replace the user agent with a spoofed browser identity.

| Marker | Shell | Web behavior |
| --- | --- | --- |
| `SWTTRNativeTabs` | iOS | Hide web primary navigation; retain the header menu and native bottom padding. |
| `SWTTRNativeMac/1` | macOS, contract version 1 | Hide the web sidebar and bottom tabs at every width; retain the header menu and native bottom padding. |
| Neither | Browser | Keep the existing responsive sidebar, tabs and header. |

The Mac marker must be a separate whitespace-delimited token. If both markers
appear, Mac wins. Detection lives in `src/lib/native-shell.ts` and the client
hook `src/hooks/useNativeShell.ts`. Server-side sign-in and sign-up use the same
detector to hide Clerk's social buttons and divider before rendering. Email code
and password stay in the web view. This appearance setting does not disable
OAuth providers on the Clerk instance. Passkey behavior and Clerk bot protection
still need native device verification under #146 and #137.

Protected native page requests use the app's own `/sign-in`, with a validated
`redirect_url`, rather than Clerk's hosted Account Portal. The auth pages keep
that destination when switching between sign-in and sign-up. APIs keep their
existing auth responses. See [outing-contract.md](outing-contract.md#sign-in-and-wardrobe-return)
for the supported return actions and sessionStorage limitations. Shells must
retain the originating web view through same-tab email-code verification.

## Window events

| Event | Direction | Meaning |
| --- | --- | --- |
| `openPreferences` | Mac shell → web | `window.dispatchEvent(new Event("openPreferences"))` opens Header's existing Settings drawer on pages that render Header. Repeating it while open does not create another drawer or replace the focus-return target. Ignored outside the Mac shell. |
| `gearUp` | iOS shell → web | Ask Gear up to submit its form, subject to its existing validation and loading guards. This legacy event remains supported; the Mac app uses the page action. |
| `navigatePlanAhead` | iOS shell → web | Show Gear up's Plan Ahead form. |
| `activityChange` | Web → iOS shell script | `CustomEvent` with `detail: { name, value }`; synchronize the chosen activity. Not a command to generate advice. |

The Mac Settings… menu (⌘,) dispatches `openPreferences` into the current page.
No calculation or advice generation moves into the native shell.

## Query parameters and storage

- `/?gearUp=1`: legacy iOS fallback when Gear up is not the current page. The
  current page opens its form; loading the URL does not submit advice.
- `/?mode=planAhead`: load the Plan Ahead form.
- `swttr-last-activity` in localStorage: the selected activity value, read by
  the iOS shell's activity script when a page starts. It contains no advice.

Native navigation follows `/`, `/trips` and its nested routes, and `/wardrobe`,
as defined in `src/components/AppNavigation.tsx`. Other pages clear the native
primary destination selection.

## Script message handlers

The current iOS shell registers `swttrActivityChange`. Its injected script sends
`{ value, iconPngDataUrl, source, eventId, userInitiated }`; the shell checks the
frame host before accepting it. Bootstrap synchronization is not a user action.

`swttrGeolocation` and `swttrShare` are planned by #147 for ShellKit and reused
by #138. They are not implemented by this web integration. Their scripts,
origin validation, message types and error mapping must land together; the web
app continues to use the browser location/share APIs until those bridges exist.

## Verification

Web tests cover marker precedence, Mac navigation at 700px and 1280px, browser
chrome at 390px, 768px and 1280px, the Settings event and focus restoration,
server auth appearance, safe returns and native protected-page redirect options.
They do not verify WKWebView sign-in, bot protection, device location or sharing.

For visual QA, append `SWTTRNativeMac/1` in Chrome DevTools → Network conditions
→ User agent, reload, then check 1280×800 and 700×800. Dispatch the Settings
event above. Remove the marker and check 390×844, 768×1024 and 1280×720;
append `SWTTRNativeTabs` to compare iOS chrome. Real Mac app verification belongs
to #137; [macos/README.md](../macos/README.md) documents the SwiftUI shell build
and runtime acceptance checks. The package foundation in `apple/SWTTRShellKit`
is used by Mac; iOS adoption and its build plumbing remain under #145.
