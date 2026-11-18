# SWTTR for iPhone

The iPhone app is a UIKit tab bar (`App/App/SWTTRViewController.swift`) that
hosts the live web app in WKWebViews. Capacitor supplies the Xcode project and
`npx cap sync`, but the shell doesn't use Capacitor's web bridge: it loads the
site named in `App/App/Info.plist`. Its navigation policy, Gear Up pulse
tracking and URL configuration live in [`apple/SWTTRShellKit`](../apple/SWTTRShellKit),
which the Mac app shares. All recommendation calculations stay on the server.

The app is iPhone only (`TARGETED_DEVICE_FAMILY = 1`). iPads run it in iPhone
compatibility mode.

## Requirements

- Xcode 26 or later, with the iOS Simulator platform installed. Open Xcode once
  to accept its license, then make it the active developer directory:
  `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. To skip
  that, prefix the command-line steps below with
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- Node 22 and npm, as in CI.

## Build and run

From the repository root:

```sh
npm ci
npx cap sync ios
open ios/App/App.xcodeproj
```

In Xcode, choose the **App** scheme and an iPhone simulator, then Run. The
Simulator needs no signing team. To run on an iPhone, pick your team under
**Signing & Capabilities**. Xcode writes it into `project.pbxproj` as
`DEVELOPMENT_TEAM`; don't commit that line. Distribution signing belongs to the
TestFlight work (#148).

What the two commands do:

- `npm ci` installs the Capacitor packages. `App/CapApp-SPM/Package.swift`
  points into `node_modules/@capacitor/*`, so Xcode can't resolve packages
  without it.
- `npx cap sync ios` copies `capacitor-web/` (a placeholder page; the shell
  never shows it) to `App/App/public/`, and writes `App/App/capacitor.config.json`
  and `App/App/config.xml`. The Xcode project bundles all three, and all three
  are gitignored, so a fresh clone must sync before it builds. Sync also
  rewrites `App/CapApp-SPM/Package.swift`, pinning `capacitor-swift-pm` to the
  installed `@capacitor/ios` version. Run sync again after changing Capacitor
  packages or `capacitor.config.ts`, and commit `Package.swift` if it changed.

The same build from the command line, as CI runs it:

```sh
swift test --package-path apple/SWTTRShellKit
xcodebuild build -project ios/App/App.xcodeproj -scheme App \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO
```

With only the Command Line Tools, `swift build --package-path apple/SWTTRShellKit`
compiles the package, but `swift test` and `xcodebuild` need Xcode.

## Which site the app loads

- **Release** always loads `SWTTRWebURL` from `Info.plist`
  (`https://swttr.vercel.app`).
- **Debug** loads `SWTTRWebURLDebug`, which defaults to `http://localhost:3000`.
  To test your checkout, start the web app with `npm run dev` before running
  the app. The Simulator shares the Mac's `localhost`. When a load from
  `localhost` or `127.0.0.1` fails, that tab switches to `SWTTRWebURL` (once per
  tab), so without a dev server you see production.
- To point Debug somewhere else, change `SWTTRWebURLDebug` in
  `App/App/Info.plist` locally and don't commit it. Plain `http` is accepted
  only for `localhost`, `127.0.0.1` and `[::1]`. Anything else must be `https`,
  or Debug uses `http://localhost:3000`. A physical iPhone can't reach the Mac's
  `localhost`, so use an `https` tunnel URL there.

The web side of the shell (user-agent marker, events, query parameters and
storage keys) is described in the
[native shell contract](../docs/native-shell-contract.md).

## Tests and CI

`apple/SWTTRShellKit` has swift-testing tests for the navigation policy, the
Gear Up pulse tracker and config resolution. The tabs, the Gear Up button and
the injected activity script have no automated tests; check them in the
Simulator.

[`.github/workflows/ios-app.yml`](../.github/workflows/ios-app.yml) runs on pull
requests and pushes to `main` that touch `ios/`, `apple/`, `capacitor-web/`,
`capacitor.config.ts`, `package-lock.json` or the workflow. It installs, syncs,
runs the ShellKit tests, and builds Debug and Release for the iOS Simulator
without signing. It's separate from `merge-requirements.yml` because
path-filtered workflows can't be required checks.

Remaining iPhone work is tracked in #144.
