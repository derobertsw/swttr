# Trip workspace

Every trip page shares one frame ([#330](https://github.com/derobertsw/swttr/issues/330), part of [#329](https://github.com/derobertsw/swttr/issues/329)): the trip's name and dates, then four local sections, **Plan · Stays · Crew · Packing**. The trip layout renders it (`TripWorkspace`), so it stays mounted while the page below it changes, and it sits inside the app's own navigation: the sidebar on wide screens and the bottom tab bar on phones. The section tabs are links, not a tablist, and stick below the safe area so a long day can change section without scrolling back up. The page's scroll padding keeps linked headings, like a map link's `#getting-there-<date>`, and focused controls below them.

## Sections and URLs

Every earlier URL still works and belongs to the section that now holds it (`src/lib/trip-sections.ts`). Its tab is current: `aria-current="page"` on the section's own page, `"true"` on a page inside it.

| Section | Its page | Pages inside it |
|---|---|---|
| Plan | `/trips/:id` | `/days`, `/days/:date`, `/map`, `/stops`, `/settings` |
| Stays | `/trips/:id/stays` | |
| Crew | `/trips/:id/manage` | `/rollcall` (the Day checklist, [trip-crew-checklist.md](trip-crew-checklist.md)) |
| Packing | `/trips/:id/pack` | `/gear` (shared gear) |

- Plan, opened from another section, returns to the day it last showed, even after that section reloads (the tab's session storage, per trip). Before Plan has shown a page in the tab, it opens the trip on your day ([Opening a trip](#opening-a-trip)). From inside Plan it opens Plan's own page with every day.
- Stays used to be part of the overview. A link to a stay on the overview, `/trips/:id#stay-<id>` or `#trip-stays-heading`, now opens it in Stays. The map and drive estimates link to Stays directly.
- **Edit trip** is in the header on every page except the settings it opens. On Plan's own page the trip's name is the page's title (`h1`); on every other page the page has its own title.
- Packing reads its own endpoint, so it names the trip for the header from that response (`usePublishTripSummary`) rather than loading the whole trip. Once a full-trip read fails and leaves no trip, as lost access does, the header stops naming it.
- A solo trip needs no crew: nothing in Plan depends on Crew.

## Plan

Plan's own page and its days share a route-group layout (`src/app/trips/[id]/(plan)/layout.tsx`, `PlanWorkspace`), so the days list stays put while the day changes.

- **Wide:** the days, in order and grouped by destination, beside the page Plan shows, with one rule between them. The list leads with your next step and marks the selected day. Beside a long day it sticks and scrolls on its own.
- **Narrow:** one view at a time. Plan's own page lists every day; a day has an underlined date strip with **All days**. The strip scrolls sideways on its own and centers the selected day, so the page never does.
- The split depends on the workspace's width, not the window's (a container query at 56rem). An expanded sidebar at 1024px leaves too little room, so the day opens as a focused view with the date strip, as on a tablet.

The previous and next arrows on a day are gone: the strip and the list replace them.

### Opening a trip

A trip opens on the day that matters to you ([#334](https://github.com/derobertsw/swttr/issues/334)). The trip list, and Plan from another section before Plan has shown a page in the tab, go to `/trips/:id/days`. That page replaces itself with the day, so Back skips it, and on a phone it doesn't flash the days list first.

- **During the trip:** today, by the destination's clock.
- **Before it:** your first day still to plan: a day with no activity, or one you take part in, with clothing to plan, that has no kit of yours yet. Travel and Rest days, and days you aren't taking part in, have nothing to plan. Once every day is planned, the first day.
- **After it**, or with no days: Plan's own page.
- **A day you picked in this tab wins**, while it's still on the trip and not over. During the trip a picked day that's over gives way to today, and after it to Plan's own page. The day the trip opened on isn't a pick, so once you've planned it, opening the trip again moves on to the next one. Going to another day and back to it makes it one.

The server works out the day and the next step for whoever's signed in, as `focus` on `GET /api/v1/trips/:id` (`tripFocusFor` in `src/lib/trip-focus.ts`): `date`, `reason` (`today`, `unfinished` or `first_day`) and `next_step` (`add_destination`, `choose_activity` or `plan_kit`, with its date). The days list's Next step reads it, and only looks from today on, so a day that's over is never next. The destination's clock is the day's tour plan zone or its access point's, else UTC, as day checks use it. The tab remembers the day it picked and the day the trip opened on in session storage (`openTripPath` in `src/lib/trip-sections.ts`).

A new trip still opens on Plan's own page, which confirms it's saved (#169), and links to `/trips/:id` from inside the trip (All days, Back to Plan, saving trip settings) open Plan's own page as before.

## Day brief

A day reads in one order on every width ([#334](https://github.com/derobertsw/swttr/issues/334)), so a phone shows the essentials first and a wide screen keeps them beside the days:

1. **What the day is.** The date, the activity and the destination, and on a Backcountry day the route. It says when you aren't taking part, or aren't on the trip that day, and offers **Choose an activity** when the day has none. A Backcountry day, or any day with official sources, adds one line for your conditions reviews (recorded, out of how many, and how many were recorded before the plan changed), linked to Conditions below.
2. **Meet and start.** The day's meet time, for every sport, at its access point ([#333](trip-locations.md#meet-time), set here by the organizer), then where you start, with the crew's where it differs.
3. **Getting there.** The access point, your drive and everyone's departures, then the ski or walk approach, kept apart from the road.
4. **Tonight.** Where you sleep, with the crew's where it differs. On a morning you move stays it names both, with their check-out and check-in times when they're saved.
5. **The tour and its conditions** on a Backcountry day: the tour plan, then each source with your review. A review shows as an icon and text, never a badge or a box: not recorded, recorded by you at a time, or recorded before the plan changed and why.
6. **Weather, My kit and My equipment**, then the crew's kits.
7. **The activity**, a control rather than part of the reading, then Copy this day.

**Downhill skiing** and **Backcountry skiing** are the labels for the stored `Alpine` and `Backcountry` activities everywhere a day's activity is shown, including itinerary reviews and a review's "Activity changed to" reason. Storage, links and older app versions keep the stored names (`tripActivityLabel` in `src/lib/trip-activities.ts`). **Travel** joins Rest as a day type with no clothing to plan (`tripActivityNeedsClothing`): neither asks anyone for a kit, and neither do days someone isn't taking part in, by the attendance the server works out (#331). The days list's Next step skips them too, and on the packing list a Travel or Rest day, or a day you aren't taking part in, gets no clothing guidance and links to its day ("Review day") rather than to Plan kit manually.

## No content cards

Plan, Stays, Crew and Packing put their content on the page without cards. Headings and spacing group it, and quiet rules separate comparable rows: crew and their kits, stays, shared gear and packing lists. Editors, sheets, popovers, the map and alerts keep their containment. On a trip day, Gear up's saved outfit views drop their frames too (`framed={false}` on `PlanDayCard` and `CarryCard`); Gear up itself is unchanged.

## What this doesn't change

Data, permissions and calculations are as they were. Per-person nightly lodging (#331), split-stay views (#332, in [trip-stays.md](trip-stays.md)), meeting details and departures (#333), trip-day context in Gear up (#335) and dated crew tasks and statuses (#336, [trip-crew-checklist.md](trip-crew-checklist.md)) build on this frame.
