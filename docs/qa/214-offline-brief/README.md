# #214 acceptance record: Save a dated trip brief for offline reference

Audited against `origin/main` at `5f2b8d6` (November 17, 2026), after #214's web implementation merged as #382 (squash `8f12d0f`). Each acceptance box on #214 was checked against the code and its tests, then in a browser on a local production build. #382's description was read for orientation, not taken as evidence.

Every box gets one status:

- **Implemented:** the behavior is in the code and a test covers it.
- **Manual check:** code and tests exist, but only a signed-in person, a real device, VoiceOver or participants can confirm it. The check is named.
- **Gap fixed:** a real gap, fixed in this PR, with a test that fails on `main`.
- **Gap left:** a real gap, not fixed here, with the option I recommend.

Line numbers are for this PR's branch. "Saved page" is `src/app/trips/saved/page.tsx`; "builder" is `src/lib/trip-offline-brief.ts`; "storage" is `src/lib/offline-briefs.ts`; "worker" is `public/offline-sw.js`; "Plan section" is `TripOfflineSave` in `src/components/trips/OfflineBrief.tsx`.

## Summary

| Box | Status |
|---|---|
| 1. Offline reopening path on web and iPhone, cold start in airplane mode | **Gap left**: web path works from Saved on this device, not from the site's start page; iPhone blocked on #146 |
| 2. Explicit save/remove, pre-save lists, logistics-only, interrupted download | **Gap fixed**: Remove on the brief's own page lost keyboard focus |
| 3. Last good copy kept, saved line, Trip changed, offline line, no sync | **Gap fixed**: offline cold start rows said nothing about freshness |
| 4. Provider content omitted unless #208's terms allow it | Implemented |
| 5. Conditions aren't a live bulletin; expiry visible, unknown not current | Implemented |
| 6. No tokens, secrets or others' kit; sign-out and account switch clear; reconnect rechecks | **Gap fixed**: after an account switch the list was often empty with no reason |
| 7. No offline maps, navigation, monitoring or alerts implied | Implemented |
| 8. Tests on both surfaces; find the brief from the cold-start entry without its URL | **Gap left**: web done here; iPhone needs #146; start page as in 1 |
| Measurement: a member retrieves day, trailhead, backup plan and kit in airplane mode | Manual check (devices and participants) |
| Delivery quality: mobile/desktop, keyboard, labels, announced states | **Gap fixed** (200% text, focus) plus Manual check (VoiceOver) |

Counts for the eight boxes: Implemented 3, Manual check 0, Gap fixed 3, Gap left 2.

**What this PR changes**

1. **Saved on this device has its own title** (box 1, 8). It was "SWTTR — What to Wear Outside" like every page, so browser history and bookmarks couldn't name it. It's now "Saved on this device | SWTTR" (`src/app/trips/saved/layout.tsx`), and the page says "Without a connection, this is the only SWTTR page that opens. Bookmark it so you can find it then." (saved page `:152`). Measured: Chrome's history now lists it by name offline.
2. **The Plan page no longer sends people to Trips offline** (box 1). After a save it said "Open it from Trips, then Saved on this device, with or without a connection." Offline, Trips shows Chrome's error page. It now says "Without a connection, open Saved on this device from a bookmark or this browser's history. Other pages need a connection." (`OfflineBrief.tsx:346`).
3. **Offline list rows say changes are unknown** (box 3). On a real cold start Clerk never loads, so the list rows showed only the saved line. Each row now says "Showing saved copy; changes since [time] are unknown." (`UncheckedStatus`, saved page `:37`). The brief no longer says "Sign in to check for changes" to a signed-in person whose connection is down; that only shows once Clerk has loaded and says nobody is signed in (saved page `:123`).
4. **Remove from this device keeps focus** (box 2). On the brief's own page the button disappeared with the brief and focus fell to the document body. Focus now moves to the "Not saved on this device" heading, which is described by "Removed [trip] from this device. The trip online hasn't changed." (saved page `:134`, `:247`).
5. **An account switch says why the list is empty** (box 6). The root layout's guard and the page both remove another account's briefs. When the guard won (2 of 4 browser runs), the page said only "No trips are saved on this device." It now says "Trips saved by another account were removed from this device." either way (saved page `:99`, `:110`). 4 of 4 runs after the fix.
6. **Buttons wrap with large text** (delivery quality). At 390 px with 200% text, Remove from this device (395 px) and the Plan section's buttons pushed the page to 427 px. They wrap now (`WRAP` in both files).
7. **Tests added** for the worker leaving API requests, other pages, writes and map tiles to the network (`offline-sw.test.ts`).

The fake Clerk in `src/test/fakeClerk.tsx` gained a `loaded` flag, so tests can show a page before Clerk loads, as it is offline.
