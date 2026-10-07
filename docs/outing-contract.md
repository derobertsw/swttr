# Gear up outing contract

Gear up turns an outing into advice: an activity, effort, place and time go in, and layers or a multi-day plan come out. This page describes the types that carry an outing from the form to the result (#166). The entry form (#126), the results (#127), sign-in return (#168), saving to a trip (#170) and the WebMCP action (#185) all build on them.

The types live in [`src/types/outing.ts`](../src/types/outing.ts). The reducer and request helpers are in [`src/lib/gearUp.ts`](../src/lib/gearUp.ts), and [`src/hooks/useGearUp.ts`](../src/hooks/useGearUp.ts) connects them to the page.

## Outing

An `Outing` is what a person asked for, as submitted:

| Field | Meaning |
|---|---|
| `activity` | An activity ID from `src/data/activities.ts`. |
| `exertion` | The effort level. |
| `place` | The picked `LocationSuggestion`: its name, region, country and coordinates. "Your location" when it came from the device. |
| `when` | `{ mode: "now" }`, or `{ mode: "later", date, time, durationDays }`. The date (`yyyy-MM-dd`) and time (`HH:mm`) are on the destination's clock, wherever the device is. |

Every outing is plain data, so it can be stored and restored.

Account preferences aren't part of the outing: temperature sensitivity, body metrics and wardrobe. The request reads them for the signed-in user.

## Result

A result keeps the outing it was requested for:

- **`{ kind: "layers", outing, weather, advice }`** for a one-day outing, now or later. `weather` is the reading the advice used. Its `context` says where it applies and, for a forecast, the forecast hour and the place's time zone.
- **`{ kind: "plan", outing, plan }`** for a 2–7 day outing. The plan's days carry their own forecasts.

`advice` says what kind of advice a one-day result has:

| `advice.kind` | Meaning | Reason kept |
|---|---|---|
| `personalized` | Layers from the biophysics API, built from the user's body and gear. | — |
| `general` | Layers from the static table, for the temperature only. | Why it isn't personalized. |
| `none` | No layers. The weather is still shown. | Why there are none. |

The reasons:

| Reason | Meaning |
|---|---|
| `unsupported` | The activity has no biophysics model (hiking). |
| `auth_required` | The API needs a signed-in user: a guest, or a session that expired. |
| `no_gear` | The API returned clo targets only. The wardrobe has no usable items. |
| `unavailable` | The recommendation request failed or its response was unusable. |

The advice kind and the request status are separate. `OutingRequestState` is `idle`, `loading` with the submitted outing, or `error` with that outing, a recoverable message and an optional `startDate` field. `loading` is derived from this state, rather than kept separately.

- An initial failed recommendation still produces `unavailable` general/missing advice with weather and Try again.
- When a result is already shown, a failed recommendation **update** keeps that exact result and its edited outfit. A persistent notice names the failed activity/place/time and the previous outing. The previous weather is not relabeled with the attempted inputs.
- Weather and plan failures produce no new result. Generic failures remain visible, with the attempted inputs; date-range errors stay attached to the appropriate start-date field. Toasts are supplementary.
- **Try update again** uses the failed outing snapshot, including exact local minutes, and requests weather again. Only a successful, current attempt replaces the result and synchronizes the form/tab draft. The retry button stays focused while busy; success moves keyboard focus into the result. Initial failures on the form use the normal submit action, so edits are honored.
- Auth-required, no-gear and unsupported outcomes are explicit results, not transport failures. They can replace an earlier result and explain what personalization needs.

### Weather provenance

The one-day adapter keeps the API's source facts on `weather.context.provenance`; multi-day plans keep them on `plan.provenance`. Both use `WeatherProvenance` from `src/types/weather.ts`. The APIs add source facts, without changing either recommendation engine:

| Fact | Source / limitation |
|---|---|
| Provider and units | Open-Meteo; our requests specify Fahrenheit and mph. Display conversion is separate. |
| Time zone | The provider's valid IANA zone, when available. The chosen place may also carry its geocoding zone. Neither is inferred from the device. |
| Current conditions timestamp | `current.time`, requested as Unix time and displayed with the provider zone's offset. It is omitted when absent. It is not a forecast issuance time or a client fetch timestamp. |
| Effective one-day forecast time | `WeatherContext.forecastTime`, the hour selected by the API, including its offset. The result separately displays the exact requested local date/time from `Outing.when`. |
| Available forecast coverage | First and last usable hour plus usable-hour count. Hours with missing required values are excluded; the bounds do not imply gap-free coverage. Multi-day `days`/`uncoveredDays`, dayparts and start/end-hour fields remain the authority for which parts of the requested window received advice. |
| Freshness / model issuance | Not supplied by these adapters. No generation timestamp, age badge or freshness guarantee is invented. Open-Meteo's computation duration is not a forecast issuance time. |

`Weather source and coverage` discloses the available facts on both result screens. Older plans without provenance still render without fabricated details. Malformed optional metadata is omitted. Missing/non-finite required temperature or wind values fail the request, while an actual numeric zero is valid. Unknown precipitation remains unknown. A Later response without a valid forecast timestamp and zone fails instead of being labeled as current weather; impossible dates fail before any current-weather fallback.

One-day advice uses the start hour. Multi-day guidance uses destination-local daytime windows and rounds the requested start down to its hour as before. The requested exact time remains in the outing; no duration-in-hours or common engine capability is invented.

## Requests

- **One snapshot per request.** A request builds its `Outing` first and reads its inputs only from it. Changes made from the results start from the shown result's outing, not the form:
  - switching the activity;
  - changing the weather's place or time;
  - Try again.
- **Only the latest request lands.** Each request gets a number, and only the latest one may change the page or resolve as successfully shown. Starting over, Edit outing, or switching the form between Now and Later (on the form, or with the iOS Plan tab) retires the running request, so a late answer can't replace a newer outing. A retired weather request never starts a recommendation request. A request made from the form being shown otherwise stays current.
- **The shown result stays put.** While a newer request loads, and when it fails, the page keeps showing the last result with its own activity, place and time. The results header shows the result's activity until the new advice arrives. A live status notice separately identifies the pending outing and the retained result; stale success and failure responses cannot replace this notice.

## Edit outing and Start over

- **Back (Edit outing)** returns to the form with the shown result's activity, effort, place, Now/Later mode, date, time and duration. Changes made on results reach the form and tab draft only once they succeed. Back while a change loads, or after it fails, opens on the outing still shown.
- **Plan Another Trip** and the iOS Plan tab's `navigatePlanAhead` event do the same, on Later.
- **The logo (Start over)** clears the inputs and the last outing, and returns to the form on Now with the default activity.

**Change place or time** keeps the submitted destination-local date and time, including minutes, rather than reconstructing it from the provider's forecast hour. A successful change updates the edit form and tab draft together with the result, including when it switches between Now and Later. A failed or retired change keeps the previous outing. Browser Back and the native Plan event use the same form restoration; the native event intentionally opens Later. Resuming a saved result or returning from sign-in/Wardrobe restores the last submitted outing, repairing older drafts whose form fields still describe the original place or time. Switching a Now form to Later can still recover its last hidden date/time choices.

## Back, Forward and reload

The results have their own browser history entry, at the same URL. [`src/hooks/useResultsHistoryEntry.ts`](../src/hooks/useResultsHistoryEntry.ts) marks it in `history.state`.

| What happens | Outcome |
|---|---|
| Results show from the form | One history entry is added. Changing the activity, place or time on the results replaces the result without adding entries. |
| The browser's Back from the results | The form, as Edit outing shows it. Anything still loading for the results is dropped. |
| Edit outing, Plan Another Trip, the iOS Plan tab, or Now/Later on the form while results load | The form, and the page steps back over the results' entry, so the browser's next Back leaves Gear up. |
| The browser's Forward to the results | The last outing is asked for again, with fresh weather. With no last outing, the browser steps back. |
| Reload on the form | The form comes back with what was entered. Nothing is requested. |
| Reload on the results, or Back to them from another page | The last outing is asked for again, once sign-in and preferences have loaded; leaving the results before then drops the request. The form shows in the outing's mode with the request running. If it fails, the form says why and the browser steps back off the results' entry. |
| Coming back to Gear up from a link, in the same tab | The form, with what was entered. |
| The logo | The entry stops being a results entry. The browser's next Back may show the same form once. |

Results aren't stored, so anything shown after a reload or Forward is a new request for whoever is signed in.

Known gap: following a link to `/` while on the results, like Gear up in the sidebar, keeps the results on screen. Next.js then replaces the entry's state, so a reload afterwards shows the form instead of the results. Back still works.

### What's kept for the tab

[`src/lib/gearUpDraft.ts`](../src/lib/gearUpDraft.ts) keeps the form and the last outing in `sessionStorage`, under `swttr-gear-up`:
- the activity, effort and picked place, which is "Your location" with the device's coordinates when it came from the device;
- Now or Later, the start date and time, and the number of days;
- the last result's outing.

It's never put in the URL. It's gone when the tab closes. A draft that doesn't validate is ignored, including a date or time that isn't real, like `2026-02-31`. Weather, advice, body metrics and the wardrobe aren't kept.

`/?mode=planAhead` still opens on Later. Before anything is kept, the hook reads back what's there, so a reload can't save over it.

### Accounts

The guest and each account signed in to in the tab keep their own draft (#168). The page reads one back only once Clerk says who's signed in.

| Who's signed in | The draft they get |
|---|---|
| A guest | The guest's. |
| An account, after a guest in this tab picked a place or got a result | The guest's, so the outing carries on after signing in. The first account to sign in takes it over, on whichever page that happens (`useClaimGuestDraft` in `PageLayout`), and the guest's is removed. |
| An account, otherwise | The account's own, or the guest's when it has none. |

Another account's draft is never shown. A tab open from before each account kept its own has one draft, which stays the guest's.

When the account changes while Gear up is open (signing out, signing in to another account, or a session that ends), the page starts over, like the logo:
- from the first render with the new account, the page shows its loading outline until it has started over, so nothing of the last account's shows;
- the result goes, and any request still loading is dropped;
- the form is filled from the new account's draft.

The old account's draft stays in the tab, so signing back in to it brings it back. Clerk doesn't say whether a session was ended on purpose, so an expired session is treated the same way: the outing comes back after signing in again.

`useItemMappings` keeps an account's custom gear names with the account they were loaded for, so another account's never show.

## Sign-in and Wardrobe return

A return path names a page and what to do there, never the outing itself. The outing stays in the tab's draft. The paths are in [`src/lib/outingReturn.ts`](../src/lib/outingReturn.ts).

| From | Goes to | Comes back to |
|---|---|---|
| Sign in, on the results of a guest or an expired session | `/sign-in?redirect_url=%2F%3Fresume%3Douting` | `/?resume=outing` |
| Add gear, on results without usable gear | `/wardrobe?from=outing` | "Get my layers" on Wardrobe's "Back to your outing" card, which links to `/?resume=outing` |
| Go to Wardrobe, in the layer picker | `/wardrobe?from=outing` | The same |
| Save to trip, on the results of a guest (#170) | `/sign-in?redirect_url=%2F%3Fresume%3Dsave` | `/?resume=save`, which then opens Save to trip once ([trip-saved-kits.md](trip-saved-kits.md)) |

**`/?resume=outing`** takes `resume` out of the address with `history.replaceState`, then asks for the draft's last outing again, once sign-in and preferences have loaded. The form shows in the outing's mode with the request running, then the results show on a new history entry. A signed-in account gets advice built from its body and gear, labeled Personalized. Advice that still isn't personalized says why: no usable gear, or a failed request with Try again. With no last outing in the tab, as in a new tab, the form shows what was entered, and nothing is asked for. Start over while it loads drops the request.

**Cancelling sign-in.** The browser's Back returns to the results' entry, which asks for the outing again as before. Any other way back to Gear up shows the form with what was entered.

**Wardrobe's card** shows only on `/wardrobe?from=outing`, and only for a last outing in the signed-in account's draft. Coming back is a link. It changes no gear, so nothing is added twice.

**Sign-in and sign-up** go to their validated `redirect_url` afterwards, and so does switching between them. Clerk sends a full URL when a protected page asks for sign-in. `safeReturnPath` accepts:
- a path, or a full URL on the request's own host;
- only `/`, `/wardrobe`, `/faq` and `/trips` pages.

Anything else goes to Gear up: another site, an API route, or sign-in itself.

## What each activity gets

Single-day outings, now or later:

| Activity | Guest, or expired session | Signed in |
|---|---|---|
| Running, Biking, Backcountry | `none` · `auth_required` (sign in) | `personalized`; `none` · `no_gear` (add gear) or `unavailable` (try again) |
| Alpine, XC | `general` · `auth_required` | `personalized`; `general` · `no_gear` or `unavailable` |
| Hiking / snowshoeing | `general` · `unsupported` | `general` · `unsupported` |

Multi-day outings (2–7 days) are the same for guests and signed-in users:
- `/api/plan-ahead` is public and uses the static table.
- Alpine, XC and hiking get general layers for each day and daypart.
- Running, Biking and Backcountry get each day's forecast, with a notice that the general guide doesn't cover the activity.
- The packing list reads the wardrobe only for a signed-in user. Its `wardrobe` field says how it was matched: `matched`, `signedOut`, or `unavailable` when a signed-in user's wardrobe couldn't be read.

The auth boundary is set in [`src/proxy.ts`](../src/proxy.ts). `/api/v1/recommendations/*` needs a signed-in user; `/api/weather`, `/api/plan-ahead` and `/api/packing-list` are public. #130 checks this matrix on the device.


## #166 acceptance review — October 5, 2026

This completes the shared outing/result work begun in #215 and continued in #241. Evidence and browser screenshots are in [`docs/qa/166-outing-contract/README.md`](qa/166-outing-contract/README.md).

| Acceptance | Implementation / evidence |
|---|---|
| Entry and results consume the same context | `Outing`, `OutingResult`, `useGearUp` and the page adapters; both result screens receive the submitted outing and distinguish its requested time from effective weather time. |
| Loading/failure keeps previous advice under previous context | `OutingRequestState`, `OutingRequestNotice`, reducer/hook/page regression tests and browser pending/failure captures. Recommendation-update failures preserve the same result object, so manual edits remain in its mounted layer display. |
| Edit outing preserves inputs; Start over clears them | Existing #241 page tests cover changed destination/minutes, Now/Later, Back/reload and the native Plan compatibility event; Start over retires requests and clears the outing. Intentional navigation back to the form dismisses the result, as documented above. |
| Out-of-order, auth expiry, targets-only, no usable wardrobe, static guidance | `useGearUp.test.ts`, `page.test.tsx`, `gearUp.test.ts` and `useBiophysicsRecommendation.test.ts`; added old-failure/new-request and failed-snapshot retry checks. Account changes clear results and retire requests. |
| #123 forecast/date and #124 recovery remain intact | One-day route/client tests cover destination time, DST, missing hours and malformed responses; multi-day route/plan tests cover local windows, missing values and coverage. Existing guest, auth-required and retry flows pass. |
| Activity × auth × duration matrix | The matrix above remains authoritative; no activity IDs, protected endpoints or thermal thresholds changed. |
| Tests, lint and typecheck | Full and focused results are recorded in the QA report, together with the production-build environment limitation. |

Saving a result's outfit to a trip is described in [trip-saved-kits.md](trip-saved-kits.md).

#185 owns the programmatic `submitOuting` interface, caller cancellation, domain error codes and edited Wear/Carry readback. This change exposes no browser tool and adds no second store. #168 owns auth return, #170 owns durable saved snapshots, and #130 retains real-account browser/native/device/accessibility and participant validation. The synthetic browser and jsdom checks here are not represented as that release coverage.
