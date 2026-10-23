# Day checklist (#336)

The Day checklist (`/trips/:id/rollcall`, in Crew) replaces Roll call, which judged everyone Ready or Missing from the first day's clothing slots. It shows one trip day at a time and states each person's facts separately, each linked to where it's done. Nothing on it combines lodging, clothing, packing and conditions into Ready or Safe. Part of [#329](https://github.com/derobertsw/swttr/issues/329); the workspace is in [trip-workspace.md](trip-workspace.md).

## What it shows

- **The day.** Underlined dates, like Plan's date strip. It opens on today during the trip, the first day before it, and the last day after it. A link can name the day with `?date=YYYY-MM-DD`. Changing the day doesn't reload anything.
- **Who.** Grouped by attendance on that day ([trip-stays.md](trip-stays.md), #331): Taking part, There, not taking part (an evening arrival), Invitation pending, and a line naming who isn't on the trip that day. A pending invitation is never counted as coming. Each person's membership stays a fact of its own: Organizer, Joined, Managed guest or Invitation pending.
- **Clothing** for that day, linked to their kit row on the day (`/days/:date#kit-<member>`):
  - Outfit saved.
  - Outfit saved for another plan, with the same reasons the day page gives (another place, date or activity).
  - Older checklist: the category slots (Shell, Gloves), never treated as an outfit.
  - Not started: no kit, or a kit with nothing in it. An empty kit is never OK.
  - Flagged: needs help, when someone flagged their checklist.
- **Tonight**: their stay that night, or Not planned yet for a gap, linked to Stays.
- **Shared gear** assigned to them, for the whole trip, with #179's states: Awaiting acceptance, Accepted · not packed, Packed. A response from before acceptance tracking says only Assigned. Each item links to it on the shared gear page (`/gear#shared-<id>`), which scrolls to it once the list loads.
- **Source reviews**, on days with official sources (#211): how many of the day's sources they've reviewed, how many reviews were recorded before the plan changed, and the latest review's date. A review is a dated fact, not a verdict about conditions. Managed guests and pending invitations have no account to record one, so they have none.
- **Your packing**, on your own row only: a link to Packing. Packing checks are private (#171), so nobody's checks or counts appear here, and touring equipment checks (#212) stay on Packing.

## API

`GET /api/v1/trips/:id/checklist`, for anyone on the trip (`requireTripAccess`), returns `{trip, default_date, viewer_member_id, days}`. Each day has its `date_label`, activity and place, and `people`, each with `membership`, `participation`, `clothing`, `tonight`, `shared` and `conditions` and their labels. `buildDayChecklists` in `src/lib/trip-checklist.ts` works it out from the trip as `GET /api/v1/trips/:id` loads it, with names as the viewer sees them (the organizer is "You" only to themself). Responses are `private, no-store`.

## Elsewhere

- On a day, an empty kit row says Not started, and its badge says Checklist once it has slots; Flag needs help and Clear needs help replace Flag warn and Flag ok.
- Packing opens on My packing, with Shared items a tab away (`PackingNav` on `/pack` and `/gear`).
