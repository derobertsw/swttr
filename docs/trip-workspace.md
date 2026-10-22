# Trip workspace

Every trip page shares one frame ([#330](https://github.com/derobertsw/swttr/issues/330), part of [#329](https://github.com/derobertsw/swttr/issues/329)): the trip's name and dates, then four local sections, **Plan · Stays · Crew · Packing**. The trip layout renders it (`TripWorkspace`), so it stays mounted while the page below it changes, and it sits inside the app's own navigation: the sidebar on wide screens and the bottom tab bar on phones. The section tabs are links, not a tablist, and stick below the safe area so a long day can change section without scrolling back up.

## Sections and URLs

Every earlier URL still works and belongs to the section that now holds it (`src/lib/trip-sections.ts`). Its tab is current: `aria-current="page"` on the section's own page, `"true"` on a page inside it.

| Section | Its page | Pages inside it |
|---|---|---|
| Plan | `/trips/:id` | `/days/:date`, `/map`, `/stops`, `/settings` |
| Stays | `/trips/:id/stays` | |
| Crew | `/trips/:id/manage` | `/rollcall` |
| Packing | `/trips/:id/pack` | `/gear` (shared gear) |

- Plan, opened from another section, returns to the day it last showed. From inside Plan it opens Plan's own page with every day.
- Stays used to be part of the overview. A link to a stay on the overview, `/trips/:id#stay-<id>` or `#trip-stays-heading`, now opens it in Stays. The map and drive estimates link to Stays directly.
- **Edit trip** is in the header on every page except the settings it opens. On Plan's own page the trip's name is the page's title (`h1`); on every other page the page has its own title.
- Packing reads its own endpoint, so it names the trip for the header from that response (`usePublishTripSummary`) rather than loading the whole trip.
- A solo trip needs no crew: nothing in Plan depends on Crew.

## Plan

Plan's own page and its days share a route-group layout (`src/app/trips/[id]/(plan)/layout.tsx`, `PlanWorkspace`), so the days list stays put while the day changes.

- **Wide:** the days, in order and grouped by destination, beside the page Plan shows, with one rule between them. The list leads with the next step and marks the selected day. Beside a long day it sticks and scrolls on its own.
- **Narrow:** one view at a time. Plan's own page lists every day; a day has an underlined date strip with **All days**. The strip scrolls sideways on its own and centers the selected day, so the page never does.
- The split depends on the workspace's width, not the window's (a container query at 56rem). An expanded sidebar at 1024px leaves too little room, so the day opens as a focused view with the date strip, as on a tablet.

The previous and next arrows on a day are gone: the strip and the list replace them.

## No content cards

Plan, Stays, Crew and Packing put their content on the page without cards. Headings and spacing group it, and quiet rules separate comparable rows: crew and their kits, stays, shared gear and packing lists. Editors, sheets, popovers, the map and alerts keep their containment. On a trip day, Gear up's saved outfit views drop their frames too (`framed={false}` on `PlanDayCard` and `CarryCard`); Gear up itself is unchanged.

## What this doesn't change

Data, permissions and calculations are as they were. Per-person nightly lodging (#331), split-stay views (#332), meeting details and departures (#333), sport-specific day briefs (#334), trip-day context in Gear up (#335) and dated crew tasks and statuses (#336) build on this frame.
