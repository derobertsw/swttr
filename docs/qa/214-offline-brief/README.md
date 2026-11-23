# #214 acceptance record: Save a dated trip brief for offline reference

Audited against `origin/main` at `5f2b8d6` (November 17, 2026), after #214's web implementation merged as #382 (squash `8f12d0f`). Each acceptance box on #214 was checked against the code and its tests, then in a browser on a local production build. #382's description was read for orientation, not taken as evidence.

Every box gets one status:

- **Implemented:** the behavior is in the code and a test covers it.
- **Manual check:** code and tests exist, but only a signed-in person, a real device, VoiceOver or participants can confirm it. The check is named.
- **Gap fixed:** a real gap, fixed in this PR, with a test that fails on `main`.
- **Gap left:** a real gap, not fixed here, with the option I recommend.

**Update, November 22, 2026.** The owner accepted #382's choices 2–8 as built and approved the start-page fallback for choice 1. The follow-up PR, "Open saved briefs from the start page offline", adds it as `public/offline-start-sw.js`. Box 1's web gap and the start-page part of box 8 are closed, and the coldstart check that failed now passes (see [The start page's redirect](#the-start-pages-redirect-november-22-2026)). The iPhone app and Safari checks moved to #144.

Line numbers are for this PR's branch. "Saved page" is `src/app/trips/saved/page.tsx`; "builder" is `src/lib/trip-offline-brief.ts`; "storage" is `src/lib/offline-briefs.ts`; "worker" is `public/offline-sw.js`; "Plan section" is `TripOfflineSave` in `src/components/trips/OfflineBrief.tsx`.

## Summary

| Box | Status |
|---|---|
| 1. Offline reopening path on web and iPhone, cold start in airplane mode | **Gap fixed** (November 22): `/` and `/trips` now reach Saved on this device offline. The iPhone app waits on #146, and its device checks are in #144 |
| 2. Explicit save/remove, pre-save lists, logistics-only, interrupted download | **Gap fixed**: Remove on the brief's own page lost keyboard focus |
| 3. Last good copy kept, saved line, Trip changed, offline line, no sync | **Gap fixed**: offline cold start rows said nothing about freshness |
| 4. Provider content omitted unless #208's terms allow it | Implemented |
| 5. Conditions aren't a live bulletin; expiry visible, unknown not current | Implemented |
| 6. No tokens, secrets or others' kit; sign-out and account switch clear; reconnect rechecks | **Gap fixed**: after an account switch the list was often empty with no reason |
| 7. No offline maps, navigation, monitoring or alerts implied | Implemented |
| 8. Tests on both surfaces; find the brief from the cold-start entry without its URL | **Gap fixed** on the web (November 22): the start page is the cold-start entry. The iPhone surface needs #146, with device checks in #144 |
| Measurement: a member retrieves day, trailhead, backup plan and kit in airplane mode | Manual check (devices and participants) |
| Delivery quality: mobile/desktop, keyboard, labels, announced states | **Gap fixed** (200% text, focus) plus Manual check (VoiceOver) |

Counts for the eight boxes: Implemented 3, Manual check 0, Gap fixed 3, Gap left 2. Since November 22: Gap fixed 5, Gap left 0, with the iPhone and Safari checks for boxes 1 and 8 in #144.

**What this PR changes**

1. **Saved on this device has its own title** (box 1, 8). It was "SWTTR — What to Wear Outside" like every page, so browser history and bookmarks couldn't name it. It's now "Saved on this device | SWTTR" (`src/app/trips/saved/layout.tsx`), and the page says "Without a connection, this is the only SWTTR page that opens. Bookmark it so you can find it then." (saved page `:152`). Measured: Chrome's history now lists it by name offline.
2. **The Plan page no longer sends people to Trips offline** (box 1). After a save it said "Open it from Trips, then Saved on this device, with or without a connection." Offline, Trips shows Chrome's error page. It now says "Without a connection, open Saved on this device from a bookmark or this browser's history. Other pages need a connection." (`OfflineBrief.tsx:346`).
3. **Offline list rows say changes are unknown** (box 3). On a real cold start Clerk never loads, so the list rows showed only the saved line. Each row now says "Showing saved copy; changes since [time] are unknown." (`UncheckedStatus`, saved page `:37`). The brief no longer says "Sign in to check for changes" to a signed-in person whose connection is down; that only shows once Clerk has loaded and says nobody is signed in (saved page `:123`).
4. **Remove from this device keeps focus** (box 2). On the brief's own page the button disappeared with the brief and focus fell to the document body. Focus now moves to the "Not saved on this device" heading, which is described by "Removed [trip] from this device. The trip online hasn't changed." (saved page `:134`, `:247`).
5. **An account switch says why the list is empty** (box 6). The root layout's guard and the page both remove another account's briefs. When the guard won (2 of 4 browser runs), the page said only "No trips are saved on this device." It now says "Trips saved by another account were removed from this device." either way (saved page `:99`, `:110`). 4 of 4 runs after the fix.
6. **Buttons wrap with large text** (delivery quality). At 390 px with 200% text, Remove from this device (395 px) and the Plan section's buttons pushed the page to 427 px. They wrap now (`WRAP` in both files).
7. **Tests added** for the worker leaving API requests, other pages, writes and map tiles to the network (`offline-sw.test.ts`).

The fake Clerk in `src/test/fakeClerk.tsx` gained a `loaded` flag, so tests can show a page before Clerk loads, as it is offline.

## Acceptance criteria

| # | Criterion | Status | Evidence | Tests |
|---|---|---|---|---|
| 1 | A concrete offline reopening path on web and Capacitor/iOS, including a cold start in airplane mode; a cached online page isn't enough | **Gap fixed** on the web (November 22); iPhone in #144 after #146 | **Web:** `/trips/saved` reads only IndexedDB and is public without Clerk's middleware (`src/proxy.ts:10`, `:81`). The worker is registered with scope `/trips/saved` when a brief is saved (`src/lib/offline-shell.ts:66`) and keeps the page, fetched without cookies, plus its build files (worker `:99-159`, `:111`); it answers navigations to that page, falling back to the kept copy offline or after 4 s (worker `:169-190`). Checked in a true cold start ([Results](#results)): Chrome quit, a new process on the same profile with every request failing from the first. **Gap:** the site's start page (`/`) and Trips (`/trips`) show Chrome's "No internet" page offline, by #382's design (no site-wide fallback). Someone who opens the site the usual way can't reach the copy; only a bookmark, history or a typed `/trips/saved` does. This PR names the page so history and bookmarks find it, and stops telling people to go through Trips (fixes 1 and 2). **Fixed November 22:** `public/offline-start-sw.js`, at scope `/` and registered only while a brief is saved, redirects page loads of `/` and `/trips` that can't load to `/trips/saved`. In a true cold start both reach the saved brief; see [The start page's redirect](#the-start-pages-redirect-november-22-2026). **iPhone:** no service worker in the app until #146 adds App-Bound Domains, and no offline entry yet (see [What #146 must provide](#what-146-must-provide)). | `offline-shell.test.ts` "registers the worker for /trips/saved only…"; `offline-sw.test.ts` "keeps the page and every file it needs, and opens it with no network", **new** "leaves every API request, every other page and every write to the network…"; `proxy.test.ts` "opens trip briefs saved on this device without a sign-in redirect in %s (#214)"; **new** `saved/layout.test.tsx` "names the page…" and saved page "tells people to bookmark it…"; **new** `OfflineBrief.test.tsx` "says how to open the copy with no connection, without claiming Trips opens offline" (all three fail on `main`) |
| 2 | Explicit save/remove; selected days and an Included / Not available offline list before saving, separating saved logistics from absent kit/source content; a clearly scoped logistics-only brief; an interrupted or corrupted download can't look successful | **Gap fixed** (focus after Remove) | Save only from **Save for offline** (`OfflineBrief.tsx:355`); viewing never saves. The sheet ticks the days from destination-local today (`defaultBriefDates`, builder `:64`) and lists **Included**, **Not available offline** with "Not planned yet for these days" and "Never saved offline" from the server for the ticked days (`BriefContents`, `OfflineBrief.tsx:278`; builder `:365-380`). Each day says what it lacks (`missing`, builder `:278-285`; "Not planned yet for this day: …", `OfflineBrief.tsx:271`). A download is fetched whole, checked by `readOfflineBrief` (storage `:94`) and written in one transaction (`storeSavedBrief`, storage `:231`), so a cut-off or altered download or a full disk writes nothing and says "Nothing was saved." or that the earlier copy is still there (`OfflineBrief.tsx:576`). **Gap:** removing from the brief's own page dropped focus to the document body. Fixed (fix 4). | `OfflineBrief.test.tsx` "saves the chosen days after showing what's included and what isn't", "won't save with no days chosen", "keeps the days chosen and says nothing was saved when the download fails"; `trip-offline-brief.test.ts` "says what each day doesn't have yet, so a logistics-only brief isn't read as complete"; `offline-briefs.test.ts` "replaces the trip's copy only with a whole brief…", "refuses a brief missing a field its page reads…", "refuses a brief that didn't arrive whole"; **new** saved page "moves focus to the page after removing the copy, and says what happened" (fails on `main`) |
| 3 | Keep the last good copy when refresh fails; "Saved on this device [absolute time] · [dates]"; "Trip changed — update saved copy" for a newer revision; offline "Showing saved copy; changes since [time] are unknown."; no background sync or edit queue | **Gap fixed** (offline list rows) | `savedLine` (`OfflineBrief.tsx:26`) on both pages. `useBriefCheck` (`:57`) asks the server for the same days and compares `revision`, a content hash that ignores `saved_at` (builder `:396-408`). `CheckStatus` (`:87`) words each state. A failed update keeps the copy and says so (`OfflineBrief.tsx:405`; saved page `update`). Nothing syncs: the copy changes only on Update saved copy, and the worker never answers an API or a write (worker `:225-237`). **Gap:** on a real cold start Clerk doesn't load, so the list rows had no status line, and an online-but-unreachable brief said "Sign in to check for changes" to a signed-in person. Fixed (fix 3). | `OfflineBrief.test.tsx` "says when the trip changed since, keeps the last good copy when updating fails…", "keeps the copy when %s"; `trip-offline-brief.test.ts` "changes revision when the brief would change, not when it's only saved again…"; saved page "opens a saved brief with no connection…", "online, says the trip changed and updates the copy on request"; **new** saved page "lists the briefs on a cold start with no connection, before Clerk loads…" and "doesn't ask someone to sign in when the connection, not the account, is missing" (both fail on `main`), "asks to sign in to check for changes when nobody is signed in…" |
| 4 | Omit provider-owned route/forecast/map content unless #208's terms permit offline storage; user-authored logistics stay; omitted sections are named | Implemented | `OMITTED` (builder `:31-38`) is shown in every copy: forecasts, "Maps and route lines: the copy has place names, addresses and coordinates, not a map", other people's kits, stay notes and booking links, invitation links. Kept provider results are the ones `docs/trip-locations.md:9` records as storable "including reuse in offline trip summaries": saved places with their attribution (builder `:70-78`) and stored drive estimates with Geoapify/OSM credit (builder `:130`), read with `refresh: false` so no provider is called (`brief/route.ts:52`). No tiles or geometry (`docs/trip-maps.md:40`). | `trip-offline-brief.test.ts` "leaves out invitation links, stay notes, booking links…" (asserts the omitted lines), "keeps the day's logistics…" (credit); `brief/route.test.ts`; **new** `offline-sw.test.ts` (a tile request isn't answered or kept); browser: the worker's cache held only the page, build files and icons |
| 5 | Forecast links and review notes don't become an offline live bulletin; known expiry is visible; unknown validity isn't shown as current | Implemented | No forecast values are saved. Each conditions review is "Reviewed [time on the destination's clock]", with "Reviewed before the plan changed: [reason]" when stale and "You haven't recorded a review." when missing (builder `:243-259`), under "A review notes who looked at a source and when. It isn't a current forecast or a sign the plan is safe…" (`OfflineBrief.tsx:225`). Sources (#211) have no expiry field, so the only known ages are the review times and the drive estimate's "Calculated [date] · typical traffic, not live", plus "· not updated since" once stale (builder `:111`). | `trip-offline-brief.test.ts` "keeps the tour plan, conditions sources with dated reviews…", "changes revision when a calculated drive time goes stale"; browser "Expired or unknown conditions aren't shown as current…" |
| 6 | No invite tokens, booking secrets or another member's private kit; scope follows access at download; sign-out/account switch clears account copies; reconnect rechecks access; revocation caveat documented | **Gap fixed** (explaining the empty list) | `requireTripAccess` on every brief (`brief/route.ts:29`); a failed access read is 503, not 404 (`src/lib/trips.ts:44-106`), so only a real 404 removes a copy (`useBriefCheck`, `OfflineBrief.tsx:69`; `useRemoveWhenGone`, saved page `:193`). The builder reads only display names from members, the member's own kit (`kit = me ? …trip_member_id === me.id`, builder `:239`) and stay fields without notes or links (builder `:141-154`). Account binding: `viewer.user_id` must match (storage `:232`); one account per device; late saves refused (storage `:245`). The app's Sign out warns and clears first (`AccountMenu.tsx:79-111`, `:147`), and Clerk's own items are hidden (`:30-31`); the invite page's Switch account clears too (`invite/[token]/page.tsx:76-83`); `OfflineBriefAccountGuard` clears another account's copies on any page, and a signed-out device's only after the server answers 401 (`reconcileSavedBriefs`, storage `:321-330`). Caveat: `docs/trip-offline-brief.md:72`. **Gap:** after an account switch, Saved on this device often showed an empty list with no reason (the guard had removed them first). Fixed (fix 5). | `trip-offline-brief.test.ts` "holds only the member's own kit and equipment…", "leaves out invitation links…"; `offline-briefs.test.ts` "holds one account's briefs…", "doesn't write a brief that finishes downloading after its account signed out…", "after an account change or sign-out" (5 tests); `AccountMenu.test.tsx` "offers one Sign out, its own…", "warns that signing out removes…", "stays signed in, and says why…"; invite page "switching accounts stops a trip brief still downloading…"; `trips.test.ts` "treats an id that isn't a trip id as no trip, and any other read error as unknown"; saved page "removes the copy once the server says the person isn't on the trip any more", "removes another account's briefs instead of showing them"; **new** saved page "says another account's briefs were removed when the app's account guard removed them first" (fails on `main`) |
| 7 | No offline maps, terrain navigation, emergency monitoring or automatic check-in alerts implied | Implemented | The copy says it isn't a map (above), carries the check-in plan only as the organizer's words ("Check-in", `OfflineBrief.tsx:196`), and has no timers, notifications or location code. Day checks say "Record checks in the trip when you have a connection." (`:266`). | `trip-offline-brief.test.ts` "leaves out…" (the map line); browser "No offline map, navigation, emergency monitoring or check-in alert is implied" |
| 8 | Test cold start, restart, logistics-only, missing vs interrupted, expired/unknown conditions, stale revision, sign-out/account change, removed membership and storage failure on both supported surfaces; find the brief from the cold-start entry without its URL | **Gap left** (iPhone; start page) | Every case was tested on the web: unit and component tests above, and in the browser ([Results](#results)). The iPhone surface can't be tested until #146 (box 1). Finding the brief without its URL works on the web through history or a bookmark now that the page has a name (fix 1), not from the start page (box 1). | as above |

**Measurement (Manual check).** In the browser, after a true cold start, the brief showed Saturday, the Sterling Pond trailhead with its coordinates, the backup plan, My kit and My equipment. #214 asks for actual devices and participants before offline availability is claimed: see [Untested surfaces](#untested-surfaces).

**Delivery quality (Gap fixed, then Manual check).** Fixed here: buttons pushing the page sideways at 390 px with 200% text, and focus after Remove. Checked in the browser: keyboard order and focus return in the sheet, names on every control, polite status regions and alerts for save and error states, no sideways scroll at 320, 390 and 1280 px, and at 390 and 1280 px with 200% text. VoiceOver and real phones are listed under [Untested surfaces](#untested-surfaces).

### Choices #382 made without asking that still need a decision

**Decided November 22, 2026.** The owner accepted choices 2–8 as built. Choice 1 is resolved by the start page's redirect worker (below), the option recommended here, which the owner approved.

1. **The worker's scope is `/trips/saved` only, with no site-wide offline page** (#382 choice 10). This is what left box 1's start-page gap. **Resolved:** the saved page's worker keeps its scope, and a second worker at `/` only redirects `/` and `/trips` to it when they can't load, caching nothing. See [The start page's redirect](#the-start-pages-redirect-november-22-2026).
2. **"Booking secrets" means stay notes and the stay's property/booking link** (choice 4). The stay's name, address, location, dates, booked status and check-in/out times are saved.
3. **A member's copy includes everyone's current conditions reviews (name, time, note) and all shared gear with assignees** (choice 5), as the crew sees them online.
4. **Clerk's own Sign out is hidden through `appearance`** (choice 8), so the app's warning is the only way out of the menu. Needs the real-menu check below.
5. **A 404 on reconnect removes the copy without asking** (choice 9); any other failure keeps it.
6. **Remove from this device has no confirmation** (choice 11).
7. **One account's briefs per device**; saving as a second account drops the first's (choice 7).
8. **Stored drive times are included** with their calculation date and credit (choice 3).

## Browser evidence

"Pass" means the check passed in headless Chrome against fictional fixture trips on a local production build. It isn't device, Safari, VoiceOver, signed-in production or participant evidence; those are under [Untested surfaces](#untested-surfaces).

### Revision and environment

| | |
|---|---|
| Revision | `main` at `5f2b8d6` for the **main** column, then this branch's final commit for the **branch** column |
| Build | `next build --turbopack` (Next.js 16.4.6), served by `next start` on `localhost:3433`, with [`preview-auth.mjs`](preview-auth.mjs) applied for the build only and reverted right after |
| API | The app's own `/api/v1/trips/*` route handlers, the brief route among them, run by [`api.mjs`](api.mjs) against #337's in-memory fixture database ([`../337-group-planning/fixtures.ts`](../337-group-planning/fixtures.ts)). No database, Clerk, routing or forecast provider was called. |
| Accounts | [`fake-clerk.tsx`](fake-clerk.tsx) stands in for `@clerk/nextjs` in the preview build: the `qa337_viewer` cookie is who's signed in, and, like Clerk's script, it doesn't load without a connection. The account menu is the test stand-in from `src/test/fakeClerk.tsx`, with Clerk's own Sign out kept and hidden through `appearance` as the app hides it. Never signed in to anything real. |
| Browser | Headless Chrome 157.0.8103.79 over the DevTools Protocol ([`browser.mjs`](browser.mjs), reusing #337's client). Each group keeps its Chrome profile on disk so it can quit Chrome and start a new process on the same profile. |
| Offline | **Cold start:** Chrome quit, then a new Chrome process with `--proxy-server` pointed at a closed port and `--proxy-bypass-list=<-loopback>`, so every request, `localhost` and the service worker's included, fails from the first one; plus `Network.emulateNetworkConditions` offline on the tab so `navigator.onLine` is false. **Weak signal:** the same proxy without the tab emulation (the browser reports online, nothing loads). **Offline tab:** only the tab emulation, server up. |
| Machine | macOS 27.0.1, Apple silicon, Node 26.10.0. Four other agents shared it (load averages 6 to 100). |
| Trips | `qa337-backcountry` (Fri Jan 8 – Mon Jan 11 2027, clock pinned to Sat Jan 9 7:00 AM EST) as Blair (member) and Alex (organizer): tour plans, three conditions sources with a current, a stale and a missing review, day checks, touring equipment, a pending invitation with a token, a hut stay whose notes hold a fictional key code. `qa337-downhill` (Fri Oct 9 – Mon Oct 12 2026) as Blair: no kit saved, Monday without a meet time, other members' kits (Alex, Eli flagged "needs help", the managed guest Dana) and a rental note with a door code. |

### Results

Raw output: `results.json` in `OUT` when you re-run. **main** is the first run on `main`; "—" means the check was added with its fix.

| Group | Check | main | branch |
|---|---|---|---|
| save | Plan page offers Save for offline in an Offline copy section; viewing saved nothing | Pass | Pass |
| save | The days from destination-local today are ticked (Sat, Sun, Mon; Fri Jan 8 is past) and can be changed | Pass | Pass |
| save | Before saving: Included ("Day logistics for 3 days…"), Not available offline with "Not planned yet for these days" (Sat Jan 9: No kit saved) apart from "Never saved offline" (forecasts, maps, others' kits, stay notes, invitation links) | Pass | Pass |
| save | Unticking Monday relists "Day logistics for 2 days" from the server; ticking it again, 3 | Pass | Pass |
| save | Save writes one brief for `user-blair` and says "Saved on this device Sat, Jan 9, 7:00 AM EST · Sat Jan 9 – Mon Jan 11", with no alert | Pass | Pass |
| save | After saving, the app says how to reach the copy offline and doesn't claim Trips opens without a connection | — (said "Open it from Trips … with or without a connection") | Pass |
| save | The section then shows Open saved brief, Update saved copy, Change saved days and Remove from this device | Pass | Pass |
| save | One worker, scope `/trips/saved`; its caches hold `/trips/saved`, `/_next/static/*` and icons only, no API response or other page | Pass | Pass |
| save | IndexedDB snapshot: no invite token, hut key-code note, `property_url`, `context_key`, organizer's kit items or packing rows | Pass | Pass |
| save | Trips links to "Saved on this device · 1 trip" | Pass | Pass |
| restart | Chrome quit and restarted online: the brief is still listed, "Matches the trip online." | Pass | Pass |
| coldstart | Cold start offline: the site's start page `/` and `/trips` reach the saved briefs | **Fail** (Chrome's "No internet" page, `ERR_INTERNET_DISCONNECTED`) | **Fail** (Gap left) |
| coldstart | Cold start offline: `chrome://history` lists Saved on this device by name | **Fail** (every entry "SWTTR — What to Wear Outside") | Pass ("Saved on this device \| SWTTR") |
| coldstart | Cold start offline: `/trips/saved` opens from the kept copy, lists the brief, no sign-in redirect | Pass | Pass |
| coldstart | Offline, the list says it's the only page that opens without a connection and suggests a bookmark | — | Pass |
| coldstart | Offline list row says "Showing saved copy; changes since … are unknown." | **Fail** (saved line only) | Pass |
| coldstart | Participant task, by clicking the trip in the list: Sat Jan 9, Sterling Pond trailhead "44.555100, -72.795300", Backup plan, My kit, My equipment (transceiver Packed) | Pass | Pass |
| coldstart | The brief opens with the trip name, "Saved on this device [time] · Sat Jan 9 – Mon Jan 11" and the offline line | Pass | Pass |
| coldstart | Every link out of the app ends "· Requires connection" | Pass | Pass |
| coldstart | Read-only: no inputs; the only button is Remove from this device | Pass | Pass |
| coldstart | No offline map, navigation, monitoring or alert wording; "not a map" is said | Pass | Pass |
| coldstart | Conditions: "Reviewed 5:00 PM EST · Thu Jan 7" with "Reviewed before the plan changed: Route changed", "You haven't recorded a review.", the not-a-forecast note, no forecast values | Pass | Pass |
| coldstart | Drives: "Calculated Sat Jan 9 · typical traffic, not live", "No drive planned", "No road route found" | Pass | Pass |
| coldstart | Weak signal (browser says online, nothing loads): the kept page opens after the 4 s fallback and says changes are unknown | Pass, but said "Sign in to check for changes. Showing saved copy…" | Pass ("Showing saved copy; changes since … are unknown.") |
| changed | Organizer changes Saturday's backup plan: Plan page says "Trip changed — update saved copy" | Pass | Pass |
| changed | The saved brief online says the same and offers Update saved copy | Pass | Pass |
| changed | The same copy in an offline tab: "Showing saved copy; changes since Sat, Jan 9, 7:00 AM EST are unknown." | Pass | Pass |
| changed | Update with a 500, a download cut off half way, or a download missing a day: "Couldn't update the saved copy: … The copy saved Sat, Jan 9, 7:00 AM EST is still on this device." and the old revision and backup plan stay | Pass (3 checks) | Pass (3 checks) |
| changed | Update saved copy then stores the new backup plan and says "Matches the trip online." / "Updated." | Pass | Pass |
| changed | No background sync: the revision stayed through two page loads that saw the newer trip, until the button was pressed | Pass | Pass |
| interrupted | First save cut off half way, or missing a day: "Couldn't save on this device: The trip didn't download completely. Nothing was saved."; nothing stored; ticks kept | Pass (2 checks) | Pass (2 checks) |
| interrupted | First save answered 503: "…Couldn't check access. Try again. Nothing was saved." | Pass | Pass |
| interrupted | First save with no answer for 25 s: "…The trip took too long to download. Nothing was saved." | Pass | Pass |
| interrupted | Behind the sheet the section never showed a saved line; the next save works | Pass (2 checks) | Pass (2 checks) |
| storage | Quota set to 1 byte (`Storage.overrideQuotaForOrigin`): "Couldn't save on this device: This device is out of storage space for saved trips. Nothing was saved." | Pass | Pass |
| logistics | Downhill as Blair: Included has no kit line; "Sat Oct 10: No kit saved", "Mon Oct 12: No meet time set" | Pass | Pass |
| logistics | Blair's snapshot holds none of Alex's, Eli's or Dana's kits, Eli's flag, the rental's door-code note or an invite token | Pass | Pass |
| logistics | The saved brief shows the meet ("8:30 AM EDT · Sat Oct 10") and "Not planned yet for this day: No kit saved." | Pass | Pass |
| account | Account menu: one visible Sign out; "Sign out and remove saved trips?" ("…removes the trip brief saved on this device for offline use…"); confirming signs out to `/` with IndexedDB and the hint empty | Pass | Pass |
| account | Alex's (organizer) snapshot has no invite token though Alex sees it online, no hut note or packing rows; keeps Alex's own kit | Pass | Pass |
| account | Switching to Blair and opening `/privacy` clears Alex's copies (the guard) | Pass | Pass |
| account | Saved on this device as Blair never shows Alex's copies, and they're removed | Pass | Pass |
| account | It then says "Trips saved by another account were removed from this device." | **Fail** in 2 of 4 runs (empty list, no reason) | Pass (4 of 4) |
| account | Signed out elsewhere (cookie gone): the copy stays while `/api/v1/trips` answers 503, and goes once it answers 401 | Pass | Pass |
| membership | A 503 on the check keeps the copy: "Couldn't check for changes: Couldn't check access. Try again." | Pass | Pass |
| membership | Blair marked as left on the trip: reopening Saved on this device online removes it, "Removed from this device: you're no longer on Smugglers' Notch hut tour, or it was deleted." | Pass | Pass |
| remove | Saved brief: Remove from this device (Enter) removes only the device copy, "Removed Smugglers' Notch hut tour from this device. The trip online hasn't changed."; no write request reached the API | Pass (2 checks) | Pass (2 checks) |
| remove | Saved brief: focus then goes to the "Not saved on this device" heading | **Fail** (document body) | Pass |
| remove | Plan page: Remove says so in its status region and moves focus to the Offline copy heading | Pass | Pass |
| a11y | Keyboard in the sheet: Close, then the four day checkboxes named "Fri Jan 8 · Travel" … "Mon Jan 11 · Travel", Save for offline, Cancel, wrapping inside the sheet; every stop has a focus ring | Pass (the first run's harness counted the wrap-around twice) | Pass |
| a11y | Space ticks Friday and the lists update ("Day logistics for 4 days") in a polite live region; no unnamed control | Pass | Pass |
| a11y | Escape closes the sheet and focus returns to Save for offline | Pass | Pass |
| a11y | The save is announced as text in a polite status region | Pass | Pass |
| a11y | Saved brief: one h1, a heading per day, no unnamed control, its state in a polite status region; the list has no unnamed control | Pass (2 checks) | Pass (2 checks) |
| layout | No sideways scroll on the Plan page, the list, the brief and the Change saved days sheet at 320, 390 and 1280 px, and at 1280 px with 200% text | Pass (16 checks) | Pass (16 checks) |
| layout | The same at 390 px with 200% text | **Fail** on the Plan page, the brief and the sheet (427 px wide: Remove from this device was 395 px) | Pass (4 checks) |

Final branch run: 79 passed, 1 failed (the start-page gap). The account-switch notice also passed in 4 separate reruns of that group.

## The start page's redirect (November 22, 2026)

`public/offline-start-sw.js`, registered at scope `/` by `keepStartPageRedirect` (`src/lib/offline-shell.ts`) once the saved page's worker is ready after a save or update. `OfflineBriefAccountGuard` also registers it when the signed-in account owns this device's briefs, which covers briefs saved before it existed. `removeStartPageRedirect` unregisters it when the last brief is removed and whenever `clearSavedBriefs` runs (sign-out, Switch account, the account guard). `docs/trip-offline-brief.md` ("The start page's redirect") has the detail.

- It answers only `GET` page loads of exactly `/` and `/trips`. Offline, it redirects them (302) to `/trips/saved` without trying the network. Online, it passes the load to the network and returns the server's answer unchanged.
- **Weak signal (choice made here):** online by `navigator.onLine` but nothing loads, it redirects once the network fails, with no deadline. A slow start page keeps loading; one that can't load at all leads to Saved on this device instead of the browser's error page. The saved page's own worker still falls back to its kept copy after 4 s.
- It caches nothing. In Chromium, static routing (`addRoutes`) sends every other request straight to the network without starting it.

Checked on a local production build (Next.js 16.4.6, `next start`), headless Chrome 157, with the same fixtures, shims and cold start as above. These are the groups `save`, `restart`, `coldstart`, `remove` and `account` from the final run of each. The machine's load averages were 12 to 30.

| Group | Check | Result |
|---|---|---|
| save | Before a brief is saved, no service worker is registered and none controls the page | Pass |
| save | Once saved: `offline-sw.js` at `/trips/saved` and `offline-start-sw.js` at `/`, both activated | Pass |
| save | Every cache is a `swttr-saved-shell-*` cache holding only `/trips/saved`, build files and icons; nothing from the new worker | Pass |
| restart | Online after a restart, `/` and `/trips` stay put and show their own pages ("What should I wear?", "Trips") with the server's 200 | Pass |
| restart | Online, of the 31 requests `/` makes and the 38 `/trips` makes, Chrome's router sent every one to the network (`matchedSourceType: network`); none was answered by a worker. The two page loads matched rules 1 and 2 (`fetch-event`) | Pass |
| coldstart | Cold start offline: `/` and `/trips` land on `/trips/saved` and list Smugglers' Notch hut tour | Pass (was **Fail** on `main`) |
| coldstart | After those redirects, every cache is still the saved page's own | Pass |
| coldstart | Weak signal (browser online, every request failing): `/` and `/trips` reach `/trips/saved` and list the brief, in about 3 s | Pass |
| coldstart | The 13 other coldstart checks above (history, the kept page, the participant task, wording) | Pass |
| remove | Remove from this device on the brief: the start page's worker is unregistered, the saved page's stays | Pass |
| remove | Then, offline, `/` isn't redirected: the browser shows its own offline page, not an empty list | Pass |
| remove | Remove on the Plan page also unregisters it | Pass |
| account | The app's Sign out unregisters it | Pass |
| account | Switching accounts (the guard, on `/privacy`) unregisters it | Pass |
| all five | Every earlier check in these groups | Pass |

Final run of each group: save 12/12, restart 3/3, coldstart 15/15, remove 7/7, account 8/8. Under load, earlier runs failed three checks that later passed unchanged: "Changing the ticked days updates the lists" once, and the weak-signal checks twice. Those were the old one, which never touches the new worker, and the new one while it waited 20 s. Each time the redirect had already landed on `/trips/saved`, and the saved page was still hydrating. The new check now waits up to 45 s, and took 3 s.

Not checked here: Safari and WebKit (no static routing, so the fetch listener sees every request at `/` and returns at once), the iPhone app (no service workers until #146), and real devices. These are in #144.

## Bugs found, not fixed

| Severity | Where | What happens | Recommended fix |
|---|---|---|---|
| ~~Medium (box 1 and 8)~~ **Fixed November 22** | Site start page and Trips, offline | A cold start offline on `/` or `/trips` showed Chrome's "No internet" page. Only `/trips/saved` itself opened, from a bookmark, history or the typed path. | Fixed as recommended, with the owner's approval: the start page's redirect worker ([above](#the-start-pages-redirect-november-22-2026)). It differs in one way: online, it also redirects when a load of `/` or `/trips` fails outright (the weak-signal case), passing every answer that does arrive back unchanged. The iPhone app's entry stays with #146. |
| Low (not #214) | Trips list at 390 px with 200% text | The trip cards' "2 stops" badge pushes the page to 489 px. | Let the card's badge row wrap, as #337 did for the touring buttons. |
| Low (not #214) | Bottom navigation at 390 px with 200% text, every page | The Wardrobe tab runs to 432 px, past the right edge. The bar is fixed, so the page doesn't scroll, but the tab is cut off. | Let the tab labels shrink or wrap below a width, or drop to icons with labels for screen readers. |

## Untested surfaces

These need a person, a device or #146. They move to the iPhone tracker #144 and the #205 pilot, and #214 can then close.

1. **iPhone app cold start in airplane mode, once #146 lands.** On a real iPhone with a TestFlight or Xcode build that has App-Bound Domains and the offline entry:
   1. Sign in, open a backcountry trip's Plan page, tap Save for offline, keep the ticked days, tap Save for offline. Confirm "Saved on this device …" and no alert saying the device can't open it offline.
   2. Force-quit the app (swipe it away). Turn on airplane mode, Wi-Fi off too.
   3. Launch the app. The start page fails and #146's "Can't reach SWTTR" view shows. Tap **Open saved trips**, without typing anything.
   4. Pass if the list shows the trip with "Showing saved copy; changes since … are unknown.", and tapping it shows the day, the trailhead with coordinates, the backup plan and My kit / My equipment.
   5. Restart the phone, stay in airplane mode, repeat 3–4.
   6. Turn airplane mode off, sign out from the account menu, confirm the warning, then go offline and repeat 3: the list must be empty.
2. **Safari and WebKit service workers.** On an iPhone in Safari (not the app) and on a Mac in Safari:
   1. Save a brief, bookmark Saved on this device, close every Safari tab and quit Safari.
   2. Airplane mode (or Wi-Fi off on the Mac), open Safari, open the bookmark. Pass if the brief opens as in 1.4.
   3. Leave the brief saved and don't open SWTTR in Safari for 8 days, then repeat 2. WebKit deletes a site's script-written storage after 7 days of browser use without a visit, so the copy may be gone; record what happens and what the page says.
   4. Add Saved on this device to the iPhone home screen, open it from there online, save a brief inside it, then repeat 2 from the home-screen icon (home-screen web apps have their own storage).
3. **VoiceOver.** On an iPhone (Safari now, the app after #146), with VoiceOver on:
   1. On the Plan page, swipe to Offline copy and open Save for offline. Each day is read as "[date] · [activity], checkbox, checked/not checked"; changing one reads the updated lists.
   2. Save. VoiceOver reads "Saved on this device …" without moving focus. Then make a save fail (airplane mode before tapping Save): it reads the alert "Couldn't save on this device: … Nothing was saved."
   3. On Saved on this device, open the brief: the status line is read; each day is a heading; every link ends "Requires connection".
   4. Tap Remove from this device: focus lands on "Not saved on this device" and VoiceOver reads "Removed … from this device. The trip online hasn't changed."
   5. Sign out from the avatar menu: the dialog "Sign out and remove saved trips?" takes focus and its buttons are named.
4. **A signed-in account on production data.**
   1. As an organizer with a pending invitation, save a real trip's brief. In Safari's Web Inspector (or Chrome DevTools) → Storage → IndexedDB → `swttr-offline` → `briefs`, confirm no invite token, no stay notes or booking link, and no other member's kit.
   2. As a member, save the same trip. Confirm the Included / Not available offline lists match what the trip shows online, and that only your kit is there.
   3. Have the organizer change a backup plan. The member's Plan page and Saved on this device say "Trip changed — update saved copy"; Update saved copy then matches.
   4. Remove the member from the trip. The member opens Saved on this device online: the copy goes with "Removed from this device: you're no longer on …".
5. **The real Clerk menu.** Signed in on desktop (1280 px) and phone width (390 px), open the avatar menu:
   1. Exactly one Sign out shows (the app's, last), not Clerk's own as well.
   2. With a brief saved, Sign out asks "Sign out and remove saved trips?"; Cancel keeps you signed in with the brief; Sign out and remove signs you out and Saved on this device is then empty.
   3. With two accounts signed in (Clerk multi-session, if enabled), check that "Sign out of all accounts" doesn't show either.
6. **Participant task in airplane mode.** Give a pilot participant (#205) a phone with their trip's brief saved the day before. Turn on airplane mode and ask: "Find the meet time and trailhead for Saturday, the backup plan, and what you're wearing and bringing." Don't help. Pass if they find all four, starting from the app (or the site) as they normally open it; record how long it took and where they first looked. Do it on the web now (from their bookmark) and in the iPhone app after #146.

## What #146 must provide

`docs/trip-offline-brief.md` ("iPhone app (#146)") has the detail. In short:

1. `WKAppBoundDomains` in `Info.plist` with the app's host and every host the app's main frame loads (including Clerk's development handshake host while production uses a Clerk development instance), and `limitsNavigationsToAppBoundDomains = true` on the tabs' web view configuration. That's what turns service workers on in WKWebView. Recheck the activity bridge script, cookies and sign-in, since App-Bound Domains also limit script injection.
2. **Open saved trips** in the "Can't reach SWTTR" view, loading `/trips/saved` in the same web view: the app's cold-start entry without a URL. A Trips tab (#361) can link there too.
3. The device checks in [Untested surfaces](#untested-surfaces) 1.
4. If App-Bound Domains break sign-in: the fallback is a native copy (the page hands the brief JSON to a message handler; the shell stores and renders it), decided in #146.

## Re-running

From the worktree root, with dependencies installed, `.env.local` present and nothing else on ports 3433, 39214 or 9433:

```sh
node docs/qa/214-offline-brief/preview-auth.mjs apply
npx next build --turbopack; node docs/qa/214-offline-brief/preview-auth.mjs revert
API_PORT=39214 node docs/qa/214-offline-brief/api.mjs &
QA214_API=http://127.0.0.1:39214 npx next start -p 3433 -H localhost &
OUT=/tmp/qa214 node docs/qa/214-offline-brief/run.mjs        # or name groups: save restart coldstart changed interrupted storage logistics account membership remove a11y layout
# stop both servers; `revert` already checked next.config.ts and src/proxy.ts match HEAD
```

Run `revert` even if the build fails. `save`, `restart` and `coldstart` share one Chrome profile under `OUT` and must run in that order; the other groups start fresh. Files: `api.mjs` (fixture API), `fake-clerk.tsx` (Clerk stand-in for the preview build), `preview-auth.mjs` (the build-only edits), `browser.mjs` (Chrome launch and page helpers) and `run.mjs` (the checks).
