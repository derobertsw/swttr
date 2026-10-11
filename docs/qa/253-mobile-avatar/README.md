# #253 mobile avatar acceptance — October 10, 2026

This report covers #253: the signed-in avatar from #252 now sits in the header at every width, and the ☰ menu no longer holds a second, bare `UserButton`. It also fixes the bug recorded in [#168's checks](../168-pending-outing/README.md#found-during-these-checks): Sign out couldn't be clicked below 768px.

## What changed

- `Header` renders the account area at every width, the iOS shell included. Signed in, phones show **SWTTR · avatar · ☰**. Signed out, the header's Sign In link still shows only beside the desktop sidebar; phones and the iOS shell keep Sign In in the ☰ menu.
- The ☰ menu lists Sign In (guests only), Settings, FAQ, Feedback and Share. The avatar/"Account" row is gone.
- `AccountMenu` sizes Clerk's trigger to 44 × 44px (Clerk's own is the 28px avatar) and draws the app's 2px `--ring` focus outline. Clerk's unlayered styles override both Tailwind classes and the base `:focus-visible` rule, so both go through Clerk's `appearance`.
- If the window widens past `md` while the ☰ menu is open, its trigger is hidden. Closing the menu then focuses the avatar, or Sign In, instead of `<body>`.

## Automated verification

- New tests:
  - The signed-in ☰ menu has no avatar and lists Settings, FAQ, Feedback, Share.
  - The guest menu lists Sign In, then Settings.
  - In `PageLayout`, the avatar has no hiding breakpoint class, on the web or in the native shell.
  - All four fail against the previous `Header`.
- Header, AccountMenu and PageLayout suites pass. Lint and typecheck pass.

## Real-account browser checks

Local dev (`next dev` on :3253) in the desktop app's browser pane, with widths emulated. The repository owner signed in to their own Clerk development-instance account; Claude never entered credentials. Nothing was saved to the account. Screenshots aren't committed because the Clerk menu shows the account's name and email.

| Check | Result |
|---|---|
| 320px header | Wordmark 16–155px, avatar 200–244px (44 × 44), ☰ 260–304px. No horizontal scroll. One avatar on the page. |
| 390px header | Wordmark 16–155px, avatar 270–314px, ☰ 330–374px. |
| Avatar → Settings (click) | Clerk's popover closes, then one Settings drawer opens with focus inside. Escape returns focus to the avatar. |
| Keyboard | Tab from the wordmark focuses the avatar with a 2px violet outline (Clerk's default was a faint 15%-black halo). Enter opens the menu, Tab reaches Settings, Enter opens one drawer, Escape returns focus to the avatar with the outline. |
| Popover at 320px | Clerk's menu (Settings, Manage account, FAQ, Share, Sign out) fits inside the viewport. |
| ☰ menu, signed in | Settings, FAQ, Feedback, Share. No avatar inside the sheet. Settings → Done returns focus to Open menu. |
| Popover open, 390 → 900px | Still one avatar; the popover stays attached to it. |
| ☰ open, 600 → 900px, Escape | Focus goes to the avatar. |
| iOS shell (user agent spoofed to include `SWTTRNativeTabs`, then a client navigation) | No web tab bar or sidebar. Avatar and ☰ both show at 390px and 900px, and the header has no Sign In link. |
| `/trips/new` draft → avatar → Settings → Done | Dates and trip name unchanged. Test values cleared afterwards; nothing saved. |
| Gear up outing (guest) → ☰ → Settings → Done | XC Skiing, Hard, Later at 08:30 unchanged. |
| **Sign out at 390px** | With Clerk's menu open, `body` has `pointer-events: auto` and `elementFromPoint` at Sign out's center returns Sign out. A real mouse click signed the account out (Clerk's `invalidateCacheAction`, then `GET /`). The header then showed no avatar, Sign In moved to ☰, and ☰ showed. |

Guest checks: at 320px the ☰ menu reads Sign In, Settings, FAQ, Feedback, Share. At 768px the header shows Sign In and hides ☰, as before.

## Not verified here

- A real iPhone or the WKWebView shell, including VoiceOver, safe areas and touch. This Mac has no Xcode; the shell layout above came from a spoofed user agent in Chromium. Coordinate with #130.
- VoiceOver on any platform, and 200% text.
- Clerk's Manage account modal, opened from the avatar at phone width.
- An expired session. Clerk's `SignedIn`/`SignedOut` decide what shows: neither renders while Clerk loads, and Settings in ☰ doesn't depend on either.
