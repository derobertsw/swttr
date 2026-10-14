# #130 web release matrix — signed-out pass, October 12, 2026

This is the first run of #130's shared release matrix: the web app, signed out. It covers the rows that can be checked in a desktop browser without an account. Rows that need a signed-in account, the iOS shell, a real iPhone, VoiceOver or participants aren't covered and are listed under [Not covered](#not-covered). Three issues were filed for what failed: #284, #285 and #286.

## Setup

- `origin/main` at `054078b` (after #275), `next dev` 16.3.6 on localhost, real Open-Meteo forecasts and the real recommendation APIs.
- Headless Chrome 155, driven over the DevTools protocol. The emulation covered device metrics at 2× scale (with touch below 768px), `prefers-color-scheme` and `prefers-reduced-motion`. Keys were sent as real key events, and API failures were injected with a `fetch` wrapper that delays a request, answers it with an error or drops it.
- Signed out, with storage cleared before each scene. Stowe, Vermont unless noted.
- This is browser emulation. It isn't the iOS WKWebView, Safari, VoiceOver or a real device.

## Viewports and appearance

Twelve screens were each loaded at every width:
- Gear up on Now, on Later (one day) and on Later (several days);
- one-day results for Alpine Skiing, Running and Hiking / Snowshoeing;
- a 3-day plan on Daily plan and on Packing;
- FAQ, Settings, and Wardrobe and Trips (which send a guest to sign-in).

| Width × height | Appearance | Screens | Result |
|---|---|---|---|
| 320 × 568 (touch) | dark | 12 | Clean apart from sign-in |
| 390 × 844 (touch) | dark, light | 24 | Clean apart from sign-in |
| 768 × 1024 | dark | 12 | Clean apart from sign-in |
| 1024 × 768 | dark | 12 | Clean apart from sign-in |
| 1280 × 720 | dark, light | 24 | Clean apart from sign-in |
| 640 × 360 (1280 × 720 at 200% zoom) | dark | 12 | Clean apart from sign-in |

Each screen was audited in the page:

- **Horizontal overflow:** no document scroll past the viewport, and no visible element outside it unless a scrolling container clips it.
- **Target size:** every visible control is at least 24 × 24px (WCAG 2.5.8). On touch widths it's at least 44 × 44px, the product target. Inline links in running text are excepted.
- **Names:** every visible control has an accessible name.
- **Structure:** one visible `<main>` and one visible `<h1>`.
- **Text contrast:** rendered text is 4.5:1 or better, or 3:1 or better when large. Colors are composited through ancestor backgrounds and opacity.

In total the audit covered 96 screens, 1,551 controls and 2,959 text nodes. Every screen ran. The audit flagged something on 16 of them, all sign-in redirects; every other screen passed every check. The condensed results are in [checks.json](checks.json). Its `scenesThatFailedToRun` counts screens the script couldn't load or drive, not failed checks.

**Sign-in (#285).** Wardrobe and Trips send a guest to Clerk's default sign-in card. It has no SWTTR header or navigation and no `<main>`. It isn't themed, so dark mode shows a white card. On phones its controls are 30px tall, under the 44px target. Two links, **Sign up** (46 × 18) and the Clerk logo (48 × 14), are under 24px at every width, so `checks.json` lists them under `under24px`. Both still meet WCAG 2.5.8 through its spacing exception: a 24px circle centred on either one touches no other control, measured at 1280 and 390. **Sign up** also ends its sentence ("Don’t have an account? Sign up"). On phones they also miss the 44px target. Clerk paints the card's footer with a background image, which the audit can't composite, so its contrast results there were measured again from rendered pixels. Each text was hidden, the box behind it captured, and the text color compared with the lightest and darkest background pixels:
- "Don’t have an account?" (4.95:1), **Sign up** (12.3:1) and "Secured by" (4.84:1) pass. The audit's dark-mode flags on these were false positives.
- **Development mode** fails at 2.59–2.73:1 in both appearances; the audit had missed it in dark. It's Clerk's badge for a development instance. The live site still uses a development key (`pk_test_`), so it shows there too. A production Clerk instance (#16) removes it.

## Advice states

| Row | Result |
|---|---|
| Alpine Skiing, signed out | General guide, with "Sign in to get layers matched to your body and gear. You'll come back to this outing." |
| Running, signed out | "Sign in for Running layers", with weather and no invented layers. |
| Hiking / Snowshoeing | General guidance: "Personalized layers aren't available for this activity yet". |
| One-day Later | Tomorrow at 8:00 → "Forecast for Tue, Oct 13, 8:00 AM EDT"; `/api/weather` got `datetime=2026-10-13T08:00`. |
| Multi-day | A 3-day plan from Oct 13 has a daily plan and a packing list. A 5-day plan from Oct 23 to 27 (ending on the last forecast day) built normally. |
| Start date past the forecast | Oct 25 for 5 days was refused before any plan was built: "The forecast for this place covers Oct 12 to Oct 27. A 5-day plan can start from Oct 12 to Oct 23." |
| No start date | "Choose a start date." on the field. Nothing was requested. |
| Long place name | Llanfairpwllgwyngyll, United Kingdom: no overflow on the form at 320 or 1280, or on results at either width. |

A plan with a partly covered day (`uncoveredDays`) wasn't reachable with live data, because the date validation keeps a plan inside the forecast. Fixtures cover that state (see #127's report).

## Async and failure

These ran at 1280 × 720 and 390 × 844, with the same results at both widths. The network-error case ran at 1280 only.

| Row | Result |
|---|---|
| Slow weather (6 s) | The button read "Getting your layers…" and the inputs stayed. A second submit while loading sent no second request (one `/api/weather`). |
| Weather 502 or network error on the first request | An alert named the outing ("XC Skiing · Moderate effort · Stowe… · Now") and said "Could not get weather for this location." A toast repeated it. All inputs stayed, and the next submit succeeded. Wording: #286. |
| Changing the activity on results, recommendation 500 | The previous result stayed. "Outing update failed … Still showing the previous result" with **Try update again**. The retry asked for fresh weather plus the recommendation, succeeded, and moved focus to the result heading. |
| Edit outing during a slow activity change | "Updating outing… Still showing the previous result" while it loaded. **Edit outing** opened the form on the outing shown (Alpine), and the late XC answer didn't replace it. |
| Plan 502 | An alert with the outing and "Couldn't get the forecast for this place. Try again."; inputs kept. |
| Packing list 500 | "Packing list unavailable … The daily plan isn't affected." **Try again** loaded it. |
| Back, Forward, reload | Back from results showed the form with the outing's activity, place and Now. Forward and a reload on the results asked again and showed the results. |
| Overlapping edits | Activity and place/time controls are disabled while a change loads. Overlapping responses are only possible across Edit outing, which is covered above. |

## Keyboard, focus and motion

- **Gear up.** Tab order: skip link, logo, sidebar toggle, navigation, Settings, FAQ, Feedback, Sign In, activity, effort, place, Use my location, Now/Later, submit. Every stop showed a focus outline. An outing was completed by keyboard alone: arrow keys within the activity group, typing in the place field, arrow keys and Enter on the suggestion, then Enter on the submit button.
- **After results appear, focus is lost (#284).** Focus falls to `<body>`, and nothing announces the result. The same happens after Back, Forward and reload. Only **Try update again** focuses the result heading.
- **Settings.** At 1280 it's opened from the sidebar, and at 390 from the ☰ menu by keyboard. Focus moves into the drawer, Tab stays inside it, and Escape closes it and returns focus to Settings or Open menu. This passed with and without reduced motion.
- **Reduced motion.** The drawer's and overlay's transitions and animations computed to 0.01 ms.
- **The start-date calendar stays open after a date is picked (#286).**
- **The results' activity menu doesn't expose which activity is selected, and opens with focus on the first item (#286).**

## Settings save truthfulness

#279 now owns this: a change the server didn't save is kept on the device and saved again on the next sync. The drawer says so. #278 no longer touches Settings. A real failed save on an account is still a signed-in row below.

## Not covered

Each of these remains open for #130:

- **Signed in:** personalized advice for every activity, targets only (`no_gear`), multi-phase Backcountry, all items excluded, an empty and a populated wardrobe, an expired session, a failed save and its rollback, and #279's not-saved notice with a real account.
- **Trips:** every row (solo, crew, invited, left, multiple stops, shared-stop edits, creation Back and refresh, unauthorized actions). Trips needs an account.
- **Native and device:** the iOS shell, native tabs, a real iPhone's safe areas and keyboard, VoiceOver, and the #168 device checks listed in #130.
- **Text-only 200%:** iOS Dynamic Type and Safari's text-only zoom. Page zoom was approximated by the 640 × 360 layout.
- **Other browsers:** Safari and Firefox.
- **Participants:** the formative study. No usability result is claimed here.
