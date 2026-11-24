# Offline trip brief

Before leaving connectivity, a trip member saves a dated, read-only brief of chosen trip days on their device and reopens it there with no connection ([#214](https://github.com/derobertsw/swttr/issues/214), under [#205](https://github.com/derobertsw/swttr/issues/205)). Saving is a deliberate action: viewing a trip never saves it, and a saved copy never updates by itself.

This page covers the web app. The iPhone app's offline path is the last section; it isn't built yet, and offline availability isn't claimed for any surface until it's checked on real devices in airplane mode.

## What the person sees

- **Plan's own page** (`/trips/:id`) has an **Offline copy** section once the trip has days.
  - Without a copy: **Save for offline** opens a sheet with the trip's days. The days from today at the destination on are preselected (every day before the trip starts or after it's over). Each day can be unticked or ticked. Under the days, **Included** and **Not available offline** list what the copy will hold, what these days don't have yet, and what is never saved offline. The lists come from the server for the days ticked. Saving needs at least one day.
  - With a copy: "Saved on this device [absolute date and time] · [covered dates]", then whether it still matches the trip ("Trip changed — update saved copy" when it doesn't), and **Open saved brief**, **Update saved copy**, **Change saved days** and **Remove from this device**. Removing says the trip online stays as it is.
  - **Change saved days** lists the trip's days as they are now, with the copy's days ticked. Days the trip no longer has (its dates changed) are left out, and the sheet says which; when none remain, the days ahead are ticked instead. The saved copy stays until the new one is saved.
- **Trips** (`/trips`) links to **Saved on this device · N trips** when the device has copies for the signed-in account. Trips itself needs a connection, so after a save the Plan page says: "Without a connection, open Saved on this device from a bookmark or this browser's history. Other pages need a connection."
- **Saved on this device** (`/trips/saved`) lists the device's copies, and `?trip=<id>` shows one. It opens with no connection (see [Service worker](#service-worker)) and never redirects to sign-in. Its title is "Saved on this device | SWTTR", so bookmarks and the browser's history name it, and the list says "Without a connection, this is the only SWTTR page that opens. Bookmark it so you can find it then."
  - Offline, or before the account is known (Clerk doesn't load without a connection): "Showing saved copy; changes since [saved time] are unknown.", on each row of the list and on the brief. Only when Clerk has loaded and says nobody is signed in does it add "Sign in to check for changes."
  - Online, signed in as the copy's account: the page checks each copy against the trip. It says "Matches the trip online", "Trip changed — update saved copy" with **Update saved copy**, or why it couldn't check, and then shows the saved copy as above.
  - Removing a copy from its own page moves focus to the "Not saved on this device" heading, which is described by what happened ("Removed [trip] from this device. The trip online hasn't changed.").
  - When another account's copies are removed, by the page or first by the account guard below, the page says "Trips saved by another account were removed from this device."
  - A copy whose trip the person can no longer open (the API's 404) is removed from the device, and the page says so. A 503 (access couldn't be checked), a server error or a dropped connection keeps it. Plan's Offline copy section does the same.
- The brief opens with the trip's name, the covered dates and when it was saved. Then each day, in the day brief's order (#334): the meet and the meeting point with its address and coordinates, the day's notes, where you start, getting there, tonight's stay, the tour plan, conditions sources with dated reviews, your kit, your touring equipment as packed when saved, and your day checks. Then the crew's shared gear and the copy's Included / Not available offline lists.
- Every link out of the app says **Requires connection**. There are no edit, check or record controls in the copy: states such as packed items and day checks are read-only labels as of saving, with a pointer to the trip for changes. Status lines are text, announced in a polite live region, never color alone.
- Nothing implies offline maps, terrain navigation, emergency monitoring or check-in alerts. A conditions review reads "A review notes who looked at a source and when. It isn't a current forecast or a sign the plan is safe."

## Snapshot contract

`GET /api/v1/trips/:id/brief?dates=2027-02-13,2027-02-14` returns `TripOfflineBriefResponse` (`src/types/trip-offline-brief.ts`): `brief`, `trip_days` (every day with its label, for choosing) and `default_dates`. Without `dates` it uses the default days.

- **Authorization:** `requireTripAccess`, as for every trip read: 401 signed out, 404 not on the trip, 503 when the trip or membership couldn't be read (`TripAccessUnavailable`), so a database blip never reads as access removed. The brief is the trip as this person sees it (`tripFullFor`), built from the same server reads as the trip pages: `loadTripFull`, lodging and attendance (#331), meets (#333), tour plans (#210), conditions (#211), day checks (#212), the person's packing list for touring equipment (#212), and drive estimates (#209) read with `refresh: false`, so building a brief never calls a routing provider.
- **Errors:** 400 for unreadable dates (`?dates=` must be up to 62 valid calendar dates), 409 when none of the asked dates are trip days any more, 429 past 30 a minute per person, 500 when it can't be built. Every response, errors included, is `Cache-Control: private, no-store` with `Vary: Cookie, Authorization`.
- **Format:** `version: 1`, `kind: "swttr.trip-offline-brief"`. Every label is the server's (`src/lib/trip-offline-brief.ts`); the client only lays them out and formats the saved time on the device's clock. A reader refuses any other version or a brief whose days don't match its covered dates (`readOfflineBrief`).
- **`revision`:** a hash of everything in the brief except `saved_at`. Comparing it with a fresh brief for the same days says whether anything the copy shows changed. A recalculated drive time alone changes only its "Calculated …" detail and doesn't count; a change to the note on the organizer's own drive estimate does, and so does a calculated estimate going stale. Each person's brief has its own revision.
- **`viewer.user_id`:** the account it was built for. The device stores it only for that account.

What a day holds:

| Part | Source | Notes |
|---|---|---|
| Meet | `TripFull.meets` | Label and whose clock |
| Meeting point | `accessPointFor` (#208) | User-confirmed label, address, coordinates, precision, saved attribution |
| Notes | `trip_days.notes` (#334) | |
| Starting from | `TripFull.starts` (the day's departures, #333), as the live day brief reads it | Their own or the day's own starting point ("· only this day"), else the stay they slept in; someone without a departure keeps the lodging's reason. The crew's too when it differs |
| Getting there | The person's own departure, else the crew's (#333) | Duration and distance with "Calculated [date] · typical traffic, not live", Geoapify and OSM credit, closures, and Apple/Google directions links |
| Tonight | Lodging person day | The stay's name, dates, booked or not, check-in/out times and location; a move between stays |
| Tour plan | Backcountry days with a plan | Objective, figures, approach, access, backup, return, check-in, pickup, links, last change and revision |
| Conditions | Sources on the day | Category, name, region, link, and the crew's current reviews: who, when on the destination's clock, note, and "Reviewed before the plan changed: …" |
| My kit | The person's own kit | Saved outfit by body area (and climb/descent), a plan day's layers with each part of the day that wears something else, or the older checklist; "No kit saved" otherwise |
| My equipment | The person's touring equipment (#212) | "Packed" or "Not packed yet" as of saving |
| Day checks | The person's own checks | Recorded, not recorded or out of date, with the server's time label |
| `missing` | | What the day doesn't have yet: activity, meet time, access point, tour plan, conditions sources, kit |

Trip-wide: `shared_gear` lists every shared item (crew-visible) with its assignee ("You", a name, or Unassigned) and its #179 status, the person's own first. `contents` holds the Included and Not available offline lists: `included`, `absent` (what these days don't have, days the trip no longer has, and drive times or equipment that couldn't be read), and `omitted`.

**Never in a brief (`omitted`):** weather forecasts, maps and route lines, other people's kits and packing lists, stay notes and booking links (free text and URLs that can hold door codes and confirmation links), invitation links, and editing. Forecast values are left out so a saved copy can't read as a current bulletin. Drive estimates and saved coordinates are Geoapify results we may store and reuse with attribution ([trip-locations.md](trip-locations.md)); route geometry and basemap tiles aren't saved, and the copy doesn't claim to contain a map ([trip-maps.md](trip-maps.md)). Context keys, invite tokens and other members' private data never reach the builder's output.

## Storage on the device

`src/lib/offline-briefs.ts` keeps briefs in the browser's IndexedDB, database `swttr-offline`:

- `briefs`, keyed by trip id: `{ trip_id, account_id, stored_at, brief }`.
- `meta`, `account`: the account this device's briefs belong to. A device holds one account's briefs at a time.
- localStorage `swttr-offline-briefs-account` mirrors the account, so the account check can skip opening the database when nothing is saved.

Writes are atomic. A save downloads the whole brief, checks it (`readOfflineBrief`, and that it was built for the signed-in account), and only then writes it in one transaction, which also removes any other account's briefs. A download that fails, times out (20 s) or arrives truncated writes nothing, so it can't look successful and the last good copy stays. Saving and updating say when the earlier copy is still on the device. A download that finishes after its account signed out or switched isn't written. The write checks, inside its transaction after its last wait, both the account the guard below noted in this tab and a `generation` counter in `meta` that every clear moves on: each save takes it (`saveTicket`) before downloading, so a sign-out or account change in another tab refuses it too. The account hint is set before the writes, so a sign-out after that point clears the save once it commits. `readOfflineBrief` checks every field the saved brief's page reads (trip dates, each day's sections, kit items, links), so an incomplete download is refused and a stored record that no longer reads as a brief is listed as damaged and not shown, without breaking the list. Storage that's blocked (a private window) or full is reported as such; nothing is saved.

## Signing out and account changes

- **Sign out** in the account menu is SWTTR's own action now, not Clerk's built-in one. Clerk keeps its own Sign out in the menu whatever the menu lists, and that item can't take an onClick, so the menu's `appearance` hides it (`userButtonPopoverActionButton__signOut`, and `__signOutAll` for multiple sessions). With briefs on the device it first asks "Sign out and remove saved trips?", naming how many, and then removes them before signing out. If they can't be removed, it doesn't sign out: the dialog says so and offers to try again. Without briefs it signs out at once, still clearing (and moving the generation on) so another tab's download can't land afterwards; a browser that won't open the storage at all has nothing to clear.
- **Any page** runs `OfflineBriefAccountGuard` (root layout). Once Clerk knows who's signed in, briefs saved by another account are removed. When Clerk says nobody is signed in, they're removed only once the server agrees (`GET /api/v1/trips` answers 401), so a session that hasn't loaded, or a flaky connection, never wipes them, and only while the device's briefs are still that account's (checked in the same transaction), so another account's save that finished meanwhile stays. Saved on this device applies the same rule before showing anything, and hides another account's briefs while they're removed.
- The invite page's Switch account clears the same way before signing out, without asking (the person is changing accounts), so a save still downloading in any tab can't land afterwards.
- Offline, Clerk can't load, so nothing is checked and the device's briefs show. Online, the page waits up to 3 seconds for Clerk before showing them.

**Revocation caveat:** a copy follows the person's access when it was saved. Removing someone from a trip, deleting the trip, or changing what they may see can't reach a device that's offline. The copy goes the next time that device opens Saved on this device online (the check gets a 404), signs out, or signs in as someone else. Until then it stays readable on that device.

## Service worker

`public/offline-sw.js`, registered by `prepareOfflineOpening` (`src/lib/offline-shell.ts`) when a brief is saved or updated, with **scope `/trips/saved`**. A service worker only controls pages in its scope, so it never sees another page's navigation, and the only subresource requests it gets are the saved page's own.

- **Kept:** the `/trips/saved` page itself, fetched by the worker with no cookies (`credentials: "omit"`), and the build's static files it names. The files its script, style and preload tags name are required; chunk names picked out of its page data, its icons and the fonts its stylesheets load are kept when they download. Everything goes into a staging cache (`swttr-saved-staging-<time>`) first. Only when every required file arrived is it copied into the kept cache (`swttr-saved-shell-<time>`), page last, and the previous kept cache deleted. An optional file that fails, even with a dropped connection, is skipped. Downloads that stall are cancelled after 25 seconds, so the attempt ends and the next one starts afresh; a stalled optional file is just left out, since the page works without it. A required file answering with an error or not arriving, or a page that isn't the page, rejects instead: the previous copy stays as it was, and the save or update that asked says this device can't open the copy without a connection yet (an alert, not a success).
- **Answered:** a navigation to exactly `/trips/saved` (any query) gets the live page, or the kept one when the network fails or takes over 4 seconds. Requests for `/_next/static/*` and the page's icons are answered from the kept cache, then the network. When the live page names build files the cache doesn't have (a new deploy), it refreshes the kept page in the background.
- **Never answered or stored:** any API request (including `/api/v1/trips/:id/brief`), any other page, `?_rsc=` requests, or anything sent with cookies. The page has no account data in it: briefs are only in IndexedDB.
- `/trips/saved` is public in `src/proxy.ts` and skips Clerk's middleware like the support pages, so its HTML is the same for everyone and loading it never goes through a sign-in or Clerk handshake redirect. `/trips/saved-x`, `/trips/saved/...` and every other trip page stay behind sign-in.
- Where service workers aren't available (some private windows, the iOS app today), saving still keeps the brief and says "Saved, but this device can't open it without a connection yet" with the reason, or that the browser can't open saved trips without a connection.

### The start page's redirect

`public/offline-start-sw.js` is a second, tiny worker at **scope `/`**, so the site's start page and Trips lead to the saved briefs when they can't load. The owner approved it on November 22, 2026.

- **Registered** only while this device holds a saved brief: by `prepareOfflineOpening` once the saved page's worker is ready (`keepStartPageRedirect`, `src/lib/offline-shell.ts`), and by `OfflineBriefAccountGuard` on any page when the signed-in account owns this device's briefs. The guard covers briefs saved before this worker existed. Registering again changes nothing.
- **Unregistered** with the briefs (`removeStartPageRedirect`): when the last one is removed (`removeSavedBrief`, from the brief, the list or the Plan page, or when a 404 removes it), and whenever `clearSavedBriefs` clears them (sign-out, Switch account on an invite, the account guard). The saved page's own worker stays, as before, because it holds no account data. Offline, `/` then shows the browser's own offline page again, not an empty list.
- **Answered:** only `GET` page loads (`mode: navigate`) of exactly `/` or `/trips` on this origin, any query. Offline (`navigator.onLine` false), the worker redirects them (302) to `/trips/saved` at once, without trying the network. Online, it passes the load to the network unchanged and hands back whatever the server answers: 200s, Clerk's redirects and errors alike. It steps in only when no answer arrives at all.
- **Weak signal** (the browser says online, nothing loads): the worker redirects once the network fails. Unlike the saved page's worker, which shows its kept copy after 4 seconds, it has no deadline. The kept copy there is the same page, but sending someone away from a start page that's only slow would be wrong. A connection that hangs therefore takes as long to give up as it does with no worker, then lands on Saved on this device instead of the browser's error page.
- **Never:** it caches nothing (it never touches Cache Storage), and never answers another page, an API request, a build file, `?_rsc=` requests, a write or another site.
- **Static routing:** in Chromium, `addRoutes` at install sends only those two page loads to the worker. Every other request from a page at `/` goes straight to the network without starting the worker. Other browsers (Safari, Firefox) call its fetch listener for every request in scope, and it returns at once for anything else, which leaves the request to the network. A browser that refuses the rules still installs the worker, with the same check in the listener.
- `/trips/saved` stays with `offline-sw.js`: the longer scope wins.

Cold start on the web: with the network off, opening the site's start page or Trips, a bookmark to `/trips/saved`, browser history or a home-screen shortcut shows the saved briefs. Saved on this device's title, "Saved on this device | SWTTR", is how history and bookmarks name it. Every other URL shows the browser's own offline page. Browsers that put home-screen web apps in their own storage (iOS Safari) need the brief saved from inside the home-screen app.

## iPhone app (#146)

How the shell loads the app: `ios/App/App/SWTTRViewController.swift` is a UIKit tab bar whose tabs are plain `WKWebView`s loading the remote site (`SWTTRWebURL`, `https://swttr.vercel.app`; Capacitor's bridge isn't used for pages). There's no `WKAppBoundDomains` entry in `Info.plist` and the configuration doesn't set `limitsNavigationsToAppBoundDomains`. WKWebView only enables service workers for app-bound domains, so in the app today `navigator.serviceWorker` is missing: a brief can be saved (IndexedDB persists in the web view's default data store) but can't be opened cold in airplane mode, and saving says the browser can't open saved trips without a connection.

What the native side needs, for #146 to agree and build (this PR changes no native code):

1. Add `WKAppBoundDomains` with the app's own host (and any other host the app navigates its main frame to: check Clerk's development handshake host while the production instance is a Clerk development instance), and set `limitsNavigationsToAppBoundDomains = true` on the tabs' `WKWebViewConfiguration`. Check that the activity bridge script, cookies and sign-in still work, since app-bound domains also limit script injection and message handlers to those hosts.
2. #146's offline view ("Can't reach SWTTR" with Retry) adds **Open saved trips**, which loads `/trips/saved` in the same web view. That's the app's cold-start entry: launching in airplane mode fails the start page, shows the offline view, and its button opens the saved briefs without remembering any URL. A Trips tab (#361) can link there too.
3. Verify on a device: save a brief, force-quit, airplane mode, relaunch, Open saved trips, read the day, trailhead, backup plan and kit; then restart the phone and repeat; sign out and confirm the copy is gone.

If app-bound domains turn out not to work with the sign-in flow, the fallback is a native copy: the web page hands the saved brief JSON to a script message handler, the shell stores it, and its offline view renders it natively. That's a bigger change and should be decided in #146.

## Verifying

- Unit and component tests: `src/lib/trip-offline-brief.test.ts`, `src/app/api/v1/trips/[id]/brief/route.test.ts`, `src/lib/offline-briefs.test.ts` (fake-indexeddb), `src/components/trips/OfflineBrief.test.tsx`, `src/app/trips/saved/page.test.tsx`, `src/components/AccountMenu.test.tsx`, `src/proxy.test.ts`. For the workers: `src/lib/offline-sw.test.ts`, `src/lib/offline-start-sw.test.ts` (the start page's redirect: its routing decision and static routing rules), `src/lib/offline-shell.test.ts` (registering both, unregistering the redirect) and `src/components/OfflineBriefAccountGuard.test.tsx`.
- Browser: service workers need a production build (`next build && next start`). [docs/qa/214-offline-brief](qa/214-offline-brief/README.md) is the acceptance record: a production build with fictional fixture trips in headless Chrome, including a cold start where Chrome is quit and restarted on the same profile with every request failing from the first one. That's still not a device; the issue asks for real devices in airplane mode, on the web and in the iPhone app, before offline availability is claimed, and the record lists those checks.

## Deployment

No migration. Deploying adds the brief endpoint, the public `/trips/saved` page, `/offline-sw.js` and `/offline-start-sw.js`. Rolling back leaves any installed `offline-sw.js` controlling only `/trips/saved`. To remove it, deploy an `offline-sw.js` that unregisters itself, or leave it: it holds no account data. `/offline-start-sw.js` needs the same treatment: a 404 during an update check doesn't unregister it, so the installed worker stays and keeps redirecting `/` and `/trips` when they can't load. To remove it, deploy an `offline-start-sw.js` that unregisters itself, and keep serving it until browsers have fetched it on an update check. Removing every saved brief, or signing out, also unregisters it on that device.
