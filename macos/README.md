# SWTTR for Mac

The SwiftUI app hosts the live web app in one persistent WKWebView. Native
navigation, menus, shortcuts and failure states are implemented for #137. All
recommendation calculations stay on the server.

The web integration started in PR #280 (#136); this PR extends it with server
rendered native chrome and global Clerk appearance. Deploy the matching web
revision when testing production, or run this checkout using Debug's localhost
URL. The iPhone-first TestFlight and public-release gates in #135 still apply.

## Build

Install Xcode 16.4 or later for local builds and tests (16.4 is covered by CI,
and 27 is verified locally). App Store upload SDK requirements are a separate
gate under #141; compatibility CI does not certify an upload. Open Xcode once
to accept its license and complete setup,
then install XcodeGen with `brew install xcodegen`. From the repository root:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path apple/SWTTRShellKit
xcodegen generate --spec macos/project.yml
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild build \
  -project macos/SWTTR.xcodeproj -scheme SWTTR -configuration Debug \
  -destination 'platform=macOS' -derivedDataPath /tmp/swttr-mac-build \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=YES
open /tmp/swttr-mac-build/Build/Products/Debug/SWTTR.app
```

Or open `macos/SWTTR.xcodeproj` in Xcode, choose the SWTTR scheme and run.
The generated project is ignored; edit `project.yml` and regenerate it.
Ad-hoc signing supports local QA; select your team for distribution in #141.
Release builds always load `SWTTRWebURL` from Info.plist. Debug first loads
`SWTTRWebURLDebug` and falls back to the remote site after a localhost network
failure. Localhost requests need the web dev server (`npm run dev`).

For a compile-only check with Command Line Tools:

```sh
swift build --package-path macos
```

That executable is not the sandboxed app bundle. Use the Xcode build for runtime,
entitlement, authentication and accessibility checks.

## Navigation

- Gear up, Trips and Wardrobe: sidebar and ⌘1–⌘3. All nested trip routes select
  Trips; clicking a highlighted row still opens its root page. Help, sign-in and
  other secondary pages clear the selection. Native chrome follows system
  appearance, including loading and failure screens.
- Back/Forward: toolbar, Go menu and ⌘[/⌘]. Reload: ⌘R. New Trip: ⌘N.
- Settings: ⌘, dispatches `openPreferences` after a same-site page finishes
  loading. Open web menus close before the Settings drawer takes focus. Help
  loads `/faq`; Feedback opens the server-controlled `/feedback` route in the browser.
- Zoom: ⌘0, ⌘=, ⌘−, between 50% and 200%, in rounded 10% steps.
- Trusted new-window links load in place; external links open in the default
  browser. JavaScript alert, confirm and prompt show native sheets.
  Non-web schemes require an activated main-frame link; subframes and empty
  new-window `about:` URLs cannot launch an external app. File inputs open a
  native file picker with user-selected read-only sandbox access.
- The last successful same-origin page is restored. Auth and invite paths, and
  token-bearing query/fragment parameters are excluded. Cookies use WebKit's
  persistent store. Old unsafe saved URLs are discarded on startup.
- After a failed navigation, Reload retries the failed target. Repeated web
  process crashes within 30 seconds require an explicit Retry.

See [the shell contract](../docs/native-shell-contract.md). The user-agent marker
is `SWTTRNativeMac/1`; it never grants API access or bypasses Clerk.

## Remaining work

- #145: adopt this shared package in iOS, migrate its pulse tracker/tests and fix
  clean-checkout iOS build plumbing. This Mac phase does not certify #145.
- #147/#138: native location/share scripts and bridges. Until those land,
  location falls back to manual entry and sharing uses the web clipboard fallback.
- #141: signing team, app icons, completed privacy/data audit and TestFlight.
  The included manifest declares the last-page UserDefaults use only; it is not
  a completed App Privacy submission.
- #142: public release after its gates are met.

## Runtime acceptance

Record actual results under #137 or in a QA report. A successful build alone does
not prove these behaviors:

- Email-code/password sign-in and sign-up bot protection in WKWebView; Wardrobe
  return, sign-out, session persistence and relaunch restoration.
- Nested trip links, all menu shortcuts, toolbar history, Settings drawer,
  highlighted-row activation, external links, new-window links, file uploads and
  all three JavaScript dialogs; system light/dark changes while open.
- Offline, Retry after reconnecting, debug fallback and web-process recovery.
- 720×540 minimum window, full screen, keyboard navigation and VoiceOver.
- No sandbox violations in Console.

The path-filtered macOS CI workflow tests ShellKit and builds the sandboxed app
in Debug and Release. It is separate from the required web checks.
