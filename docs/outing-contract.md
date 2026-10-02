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
- **Only the latest request lands.** Each request gets a number, and only the latest one may change the page. Starting over, Edit outing, or switching to the plan form retires the running request, so a late answer can't replace a newer outing. A request made from the form being shown stays current.
- **The shown result stays put.** While a newer request loads, and when it fails, the page keeps showing the last result with its own activity, place and time. The results header shows the result's activity until the new advice arrives.

## Edit outing and Start over

- **Back (Edit outing)** returns to the form the results came from, with the activity, effort, place, date, time and duration as they were entered.
- **Plan Another Trip** and the iOS Plan tab's `navigatePlanAhead` event do the same for the plan form.
- **The logo (Start over)** clears the inputs and returns to the Now form with the default activity.

Known gap: the form keeps what was typed into it. If the weather drawer moved the results to another place or time, Edit outing still shows the form's place. #126/#127 replace the drawer with Edit outing.

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
- Running, Biking and Backcountry get each day's forecast with "No layer recommendation available" in place of layers.
- The packing list reads the wardrobe only for a signed-in user.

The auth boundary is set in [`src/proxy.ts`](../src/proxy.ts). `/api/v1/recommendations/*` needs a signed-in user; `/api/weather`, `/api/plan-ahead` and `/api/packing-list` are public. #130 checks this matrix on the device.
