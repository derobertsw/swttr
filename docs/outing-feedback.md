# Outing feedback — #8

After an outing, a signed-in person can say how the layers felt: **Too cold**, **Just right** or **Too warm**, in one tap. When and where it felt off, and what they actually wore, are optional details. The answers are kept so recommendations can be reviewed against them later (#243's running/XC calibration among them). Nothing learns from them yet: feedback changes no recommendation, setting or garment value.

## Where it's asked

Gear up results aren't stored ([outing-contract.md](outing-contract.md)), and the only outings kept are saved trip kits ([trip-saved-kits.md](trip-saved-kits.md)). So the first release asks in two places and builds no reminders:

| Where | When it shows | What the answer is about |
| --- | --- | --- |
| Gear up results for **Now**, signed in, with layers | Right away, under Save to trip: the outing is underway once the layers show, so the card says "Once you're back". It stays while the result is on screen, including when the app comes back from the background. | The outfit as shown, with any edits, sent with the answer as Save to trip sends it. Answering again on the same result replaces the answer, and editing its layers keeps the card as it is. A reload or any new request for layers (another warm/cold setting included) is a new result, so the card starts over with a new answer. |
| A trip day's **My kit**, for the person's own saved outfit or plan day | Once the kit's outing has started on the destination's clock: a later outing at its time, a plan day at its first hour, an outing for now at the time its conditions were read. It stays open afterwards, with the answer given. A page opened before then asks again at the start time (at least hourly until then) and whenever it's shown again, so coming back from the outing shows the card without a reload. | The kit as the page showed it: the answer names the kit and when it was saved, and if the kit was replaced since (another tab, Update in Gear up) the save is refused with `409 kit_changed` and the card says to reload. Replacing the kit asks again about the new one. |

Not asked: guests, general guidance without layers, Gear up results for **Later** (they're asked about on their trip day once saved there), multi-day plans in Gear up (each day can be saved to a trip), other people's kits and category checklists. The server refuses an answer about an outing that hasn't started (`409`, `code: "not_started"`).

## What's asked

- **How the layers felt**, required: too cold, just right or too warm. The tap saves it.
- **When did you notice it?** optional, for too cold or too warm: while moving, at the start, at stops, afterwards. Several can be picked.
- **Where?** optional, for too cold or too warm: head & neck, torso, hands, legs, feet. Feet aren't part of the layers, but they're asked about.
- **What did you wear?** optional: **What was suggested**, or **Something different**, which starts from the suggested items to take off, and adds generic items (T-shirt, long-sleeve top, light jacket, shorts, tights or leggings, pants, hat or headband, gloves), items from the wardrobe, or **No hat** / **No gloves**.

Not answering what was worn leaves it unknown (`worn: null`). It's never read as wearing the suggestion, and ignoring the prompt records nothing.

A failed save keeps the answer on screen with Try again. Details are saved with **Save details**; tapping another overall answer saves the details shown with it.

## What's kept

`public.user_outing_feedback` (migration `20261124130000_user_outing_feedback.sql`), one row per person and outing (`user_id`, `source_key`):

| Column | Holds |
| --- | --- |
| `source`, `source_key` | `gear_up` with a key the browser makes per result, or `trip_kit` with the kit's ID and when it was saved. |
| `trip_id`, `trip_date` | The trip day for a kit (the trip ID is cleared if the trip is deleted; the feedback is the person's own and stays). The outing's date for Gear up. |
| `activity`, `exertion`, `advice_kind` | Sport, effort, and whether the layers were personalized or general guidance. |
| `temperature_f`, `wind_mph` | For grouping: the reading the layers were for, or a plan day's coldest temperature and strongest wind. |
| `overall`, `moments`, `body_areas`, `worn` | The answer. |
| `recommended` | The outfit as shown (for Gear up, edits included and marked `edited`), apart from `worn`. Its place is reduced to region and country. |
| `weather` | The conditions: a reading (temperature, wind, precipitation, current or forecast, its time and time zone) or a plan day's summary (low, high, wind, precipitation chance, effective temperature, hours). |
| `context` | The outing's mode, date, time and XC details; region and country; the warm/cold preference the layers were asked with (Gear up results record it; saved kits don't, so it's null) and the saved preference when answering (#251); height and weight in 4-inch and 20-lb bands (lower bound), or null; minutes from the outing's start to the answer. |
| `outing_started_at`, `recommended_at`, `app_version` | When the outing started; when the layers were worked out (the kit's save, or the reading for now); the deployment's commit (`VERCEL_GIT_COMMIT_SHA`) when the answer was saved. |

There's no separate policy version number. `recommended_at` and `app_version` identify the code that made the layers: for an outing for now they're the same deployment unless one landed in between, and for a saved kit the deployment live at `recommended_at` made it. No place name or coordinates are stored.

Access follows the other tables: row-level security on, nothing granted to `anon` or `authenticated`, and the API writes with the service role for the signed-in user only. A trip kit's feedback needs the person's own member row on the trip. Account deletion deletes the rows (`delete_user_data`, [account-deletion.md](account-deletion.md)).

## Deploy

1. Apply `supabase/migrations/20261124130000_user_outing_feedback.sql` on its own in the SQL editor. It needs `20261116150000_delete_user_data.sql`. Until it's applied the routes answer 503 and the card says feedback can't be saved yet.
2. Deploy the API and the app.

The migration adds the feedback to `delete_user_data` by patching the function in place, so it keeps what other migrations added (#426's catalog reports, `20261124120000`). Apply a migration that replaces `delete_user_data` whole before this one. If one is applied after it, run this file again: it's safe to repeat, and puts back only the feedback deletion.

## API

| Route | Does |
| --- | --- |
| `POST /api/v1/outing-feedback` | `{ key, outfit, sensitivity?, answer }`: a Gear up result's outfit (checked as Save to trip checks it) and the answer. `200 {feedback}`, `400` for a malformed request, `401` signed out, `409 not_started`, `503` before the migration. |
| `GET /api/v1/trips/:id/days/:date/feedback` | `{status: "open", feedback}` (null before an answer), `{status: "not_started", opens_at}`, or `{status: "no_kit"}`. |
| `PUT /api/v1/trips/:id/days/:date/feedback` | `{ answer, kit: { id, saved_at } }` for the person's own kit on the day, naming the kit shown. Same answers as the POST, `404` without a saved outfit, and `409` with `code: "kit_changed"` when the kit shown has been replaced since. |

`src/lib/outing-feedback-server.ts` checks the answer, works out when the outing started, and builds the row; `src/components/OutingFeedback.tsx` is the card.

## Reviewing feedback

There's no admin screen in the first release. Run these read-only queries in the Supabase SQL editor.

Answers by sport, effort and temperature band, with how often what was worn is known:

```sql
SELECT activity, exertion, floor(temperature_f / 10) * 10 AS temp_band_f,
  count(*) AS answers,
  count(*) FILTER (WHERE overall = 'too_cold') AS too_cold,
  count(*) FILTER (WHERE overall = 'just_right') AS just_right,
  count(*) FILTER (WHERE overall = 'too_warm') AS too_warm,
  count(*) FILTER (WHERE worn IS NOT NULL) AS worn_known,
  count(*) FILTER (WHERE worn->>'as_suggested' = 'false') AS wore_something_else
FROM user_outing_feedback
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
```

Where and when it felt off:

```sql
SELECT activity, overall, area, count(*) FROM user_outing_feedback, unnest(body_areas) AS area
WHERE overall <> 'just_right' GROUP BY 1, 2, 3 ORDER BY 1, 2, 4 DESC;

SELECT activity, overall, moment, count(*) FROM user_outing_feedback, unnest(moments) AS moment
WHERE overall <> 'just_right' GROUP BY 1, 2, 3 ORDER BY 1, 2, 4 DESC;
```

Recent answers with their conditions, what was suggested on the torso and legs, and what was worn instead (for reading a case like #243's 56°F run). Answers given within 20 minutes of the start are probably from before the outing:

```sql
SELECT created_at, activity, exertion, advice_kind, temperature_f, wind_mph, overall, moments, body_areas,
  context->'preference' AS preference, (context->>'minutes_after_start')::int AS minutes_after_start,
  (SELECT jsonb_agg(item->>'name') FROM jsonb_array_elements(recommended->'phases') AS phase,
     unnest(ARRAY['torso', 'legs']) AS part, unnest(ARRAY['base', 'mid', 'outer']) AS layer,
     jsonb_array_elements(coalesce(phase->'wear'->part->layer, '[]')) AS item) AS suggested,
  worn, app_version
FROM user_outing_feedback
WHERE activity IN ('running', 'xc_skiing') AND recommended ? 'phases'
ORDER BY created_at DESC LIMIT 50;
```

Interpret with care: answers are self-selected, one person can answer about many outings, a preference or body band of null means unknown, and a few answers aren't enough to recalibrate anything. #243 asks for validated observations before any learning.

## Not in this release

- Learning from feedback (adjusting clo, targets or preferences). Any later adjustment must be bounded, sport-specific, explainable and resettable (#243).
- Reminders or notifications, and asking about Gear up results for Later outings that aren't saved to a trip.
- An admin dashboard.
- Verifying that a wardrobe item named in `worn` is still in the person's wardrobe; the item's catalog ID is kept as sent.
