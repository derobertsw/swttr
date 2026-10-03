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

The advice kind and the request status are separate:
- A failed recommendation is a result with `unavailable` advice. The weather is shown, with Try again.
- A failed weather or plan request isn't a result. It's a toast, or an inline error on the start date. The inputs stay as entered, and any result already on screen stays.

## Requests

- **One snapshot per request.** A request builds its `Outing` first and reads its inputs only from it. Changes made from the results start from the shown result's outing, not the form:
  - switching the activity;
  - changing the weather's place or time;
  - Try again.
- **Only the latest request lands.** Each request gets a number, and only the latest one may change the page. Starting over, Edit outing, or switching the form between Now and Later (on the form, or with the iOS Plan tab) retires the running request, so a late answer can't replace a newer outing. A request made from the form being shown otherwise stays current.
- **The shown result stays put.** While a newer request loads, and when it fails, the page keeps showing the last result with its own activity, place and time. The results header shows the result's activity until the new advice arrives.

## Edit outing and Start over

- **Back (Edit outing)** returns to the form on Now or Later, as the results were requested, with the activity, effort, place, date, time and duration as they were entered. An activity picked on the results reaches the form only once its layers arrive, so Back while they load, or after they fail, opens on the activity that was shown.
- **Plan Another Trip** and the iOS Plan tab's `navigatePlanAhead` event do the same, on Later.
- **The logo (Start over)** clears the inputs and the last outing, and returns to the form on Now with the default activity.

Known gap: the form keeps what was typed into it. If the weather drawer moved the results to another place or time, Edit outing still shows the form's place. #126/#127 replace the drawer with Edit outing.

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

#168 decides what happens to the kept outing across sign-in, sign-out and account switches.

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
