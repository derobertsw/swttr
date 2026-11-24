# Touring copy review packet (#205)

For a qualified ski-touring practitioner. Prepared November 18, 2026 from `origin/main` at `5f2b8d6`, and updated November 22, 2026 when the helmet became a suggested item (EQ7, questions 1, 4 and 29). **Not reviewed yet.** The verdict columns are empty.

#212 and #205 ask for SWTTR's touring copy to be reviewed by a qualified ski-touring practitioner before release. This packet holds every piece of text SWTTR shows on touring days that says something close to safety: equipment, shared items, day checks, the tour plan, conditions sources and reviews, the official avalanche centers, the offline brief, and the clothing advice for the climb and descent. You don't need to read code or use the app.

## What SWTTR does, and doesn't

SWTTR helps a group plan a trip: where they sleep, how they get to the trailhead, what to wear for the climb and the descent, and what to pack. On a Backcountry (ski touring) day it adds:

- **A tour plan** the organizer writes: route, backup plan, return time, check-in plan, approach notes, access notes.
- **Conditions sources**: links to the official avalanche forecast, mountain weather and access information that the organizer adds for the day. Each person can then record "I reviewed this source" for that day. SWTTR doesn't read the forecasts. It never shows a danger rating, an issue or expiry time, or a go/no-go.
- **Touring equipment**: a template of personal items each person can add to their own packing list, and shared items for the group.
- **Day checks**: two dated notes per person per touring day. "Tour and backup plan reviewed" before leaving, and "Transceiver check" at the trailhead.
- **Clothing advice** for the climb, the descent and the transition between them.

Nothing in SWTTR adds these up into a readiness score. Each check and review is a note of who did what and when. A shared item's packed mark also records who packed it and when. A personal packed mark records only that it's packed, with no time. The pilot ([README.md](README.md)) tests whether people read them that way. This review asks whether the words are right.

## How to review

- Each table lists the text exactly as SWTTR shows it. Text in `{braces}` is filled in by the app, for example `{date}` becomes "Sat Feb 13". A slash ( / ) separates variants, or lines shown one under the other; a middle dot ( · ) is shown as it is. "Shown" says where people see it. "File" is for the developer who makes the change.
- In the **Verdict** column write **OK**, **Change**, **Remove**, or **Add** (for something missing). Put the wording you'd use, or the reason, under **Suggested change**.
- Answer the numbered questions after each section. They're the points we're least sure about.
- Then fill in [Overall verdict](#overall-verdict) and [About the reviewer](#about-the-reviewer). Please don't write your name unless you're happy for it to be public: this file is in a public repository.

## 1. Personal touring equipment

On a Backcountry day, each person can open **Add touring equipment**. It shows the template below, grouped as **Suggested additions** (ticked to start with) and **Optional** (not ticked). Nothing is added until they press Add selected items. Each item has a "What it's for" line that opens to show its purpose. The items go into that person's own packing list, where they check them off as packed for the trip.

Files: items in `src/lib/touring-equipment.ts`; the preview and day page in `src/components/trips/TouringEquipment.tsx`; the packing page in `src/components/trips/TripPacking.tsx`.

| ID | Item | Group | "What it's for" | Verdict | Suggested change |
|---|---|---|---|---|---|
| EQ1 | Avalanche transceiver | Suggested | Sends a signal, and searches for one, to find someone buried in an avalanche. Wear it switched on, and know how to use it. | | |
| EQ2 | Avalanche probe | Suggested | Pinpoints a buried person once the transceiver search gets you close. | | |
| EQ3 | Avalanche shovel | Suggested | Digs out a buried person. Avalanche debris is dense and hard, so bring a sturdy one. | | |
| EQ4 | Climbing skins | Suggested | Grip for skinning uphill. | | |
| EQ5 | Avalanche airbag pack | Optional | Deployed in an avalanche, it can help keep you near the surface. It doesn't replace the transceiver, probe and shovel. | | |
| EQ6 | Ski crampons | Optional | Grip on firm or icy climbs where skins slip. | | |
| EQ7 | Helmet | Suggested | Head protection on the descent, in any weather. | | |
| EQ8 | Headlamp | Optional | For early starts and returns after dark. | | |

| ID | Shown | Text | File | Verdict | Suggested change |
|---|---|---|---|---|---|
| EQ9 | Under the template, followed by a link, **Read the gear guidance**, to https://avalanche.org/avalanche-tutorial/get-the-gear.php | These are packing suggestions, not a complete safety assessment. The rescue gear follows the National Avalanche Center's guidance: always carry a transceiver, probe and shovel, and know how to use them. | `TouringEquipment.tsx` | | |
| EQ10 | Day page, My equipment, above each item marked **Packed** or **Not packed yet** | Packed for the trip, as checked on your packing list. | `TouringEquipment.tsx` | | |
| EQ11 | Day page, when nothing is added | No touring equipment in your packing list yet. | `TouringEquipment.tsx` | | |
| EQ12 | Packing page, when nothing is added | Nothing added yet. Add the touring equipment you're bringing, like your transceiver, probe and shovel. | `TripPacking.tsx` | | |

**Questions**

1. Is the split right? Transceiver, probe, shovel, skins and helmet are suggested; airbag pack, ski crampons and headlamp are optional. Should anything move between the groups?
2. Is anything missing from the personal template? For example spare transceiver batteries, a way to call for help, navigation, an extra warm layer, eye and sun protection, or ski straps. We'd rather leave something out than list something wrong, so say which you'd add and which you'd deliberately leave off.
3. Are the purposes accurate, and do any of them claim too much? Especially EQ1 ("Wear it switched on") and EQ5 ("can help keep you near the surface").
4. **The helmet now matches the clothing advice.** It used to be optional here, while the clothing advice for the descent calls a ski helmet required in any weather (CL15 below). SWTTR now treats it as required in both: the helmet is a suggested item, selected to start with, and its purpose reads "Head protection on the descent, in any weather." Can you confirm a helmet should be suggested for every touring day, and that EQ7 and CL15 say the same thing?
5. Is the National Avalanche Center's gear page the right reference? Users in Canada will see the same link.

## 2. Shared touring items

On the shared gear page, the organizer of a trip with Backcountry days can open **Add shared touring items**. All three items are suggested and start unassigned; the organizer then chooses who's bringing each one, and that person accepts it.

File: items in `src/lib/trip-shared-touring.ts`; the preview text in `src/components/trips/TouringEquipment.tsx`.

| ID | Item | "What it's for" | Verdict | Suggested change |
|---|---|---|---|---|
| SH1 | First aid kit | For injuries on the tour, from blisters to a fall, until help arrives. Someone in the group should know how to use it. | | |
| SH2 | Repair kit | Field fixes for skins, bindings, boots and poles, like ski straps, a multi-tool and spare binding parts. | | |
| SH3 | Group shelter | A lightweight shelter, like a bothy bag, the group can get into out of the wind while waiting out weather or looking after someone hurt. | | |

| ID | Shown | Text | File | Verdict | Suggested change |
|---|---|---|---|---|---|
| SH4 | Under the shared template, followed by **Read the gear guidance** (same link as EQ9) | These are suggestions for the group, not a complete safety assessment. Shared items don't replace anyone's own rescue gear: following the National Avalanche Center's guidance, each person carries their own transceiver, probe and shovel, and knows how to use them. | `TouringEquipment.tsx` | | |

**Questions**

6. Are these the right three shared items? Is anything missing, for example a group communication device or a rescue sled, and should any of them be personal instead?
7. Is "until help arrives" (SH1) the right framing?

## 3. Day checks

Each person taking part on a Backcountry day has two checks for that day, shown on the day page under **Day checks**. Ticking one records it with the time and who saved it; unticking undoes it. Both start unrecorded each day. The organizer can also record checks for a "managed guest" (someone in the crew without an account). The crew sees a summary, and the trip's Plan page lists checks that are out of date.

Files: `src/components/trips/DayChecks.tsx`; labels on the Plan page in `src/lib/trip-day-checks.ts`; the Crew page's Day checklist in `src/lib/trip-checklist.ts`.

| ID | Shown | Text | File | Verdict | Suggested change |
|---|---|---|---|---|---|
| DC1 | Day checks, first check, under the heading **Before leaving** | Tour and backup plan reviewed | `DayChecks.tsx` | | |
| DC2 | Under DC1 until it's recorded | Not recorded yet · The route, backup plan, meet and return times and meeting point in the tour plan. | `DayChecks.tsx` | | |
| DC3 | Day checks, second check, under the heading **At the trailhead** | Transceiver check | `DayChecks.tsx` | | |
| DC4 | Under DC3 until it's recorded | Not recorded yet · Record it at the trailhead, once your transceiver has been checked. | `DayChecks.tsx` | | |
| DC5 | Top of Day checks | Each person records their own on the day. A check notes who did it and when; it isn't a safety assessment. | `DayChecks.tsx` | | |
| DC6 | A plan review recorded before the plan changed (amber badge, then the reasons from the table below) | Plan changed — review it again | `DayChecks.tsx` | | |
| DC7 | A transceiver check recorded before the transceiver changed (amber badge) | Transceiver changed — check it again | `DayChecks.tsx` | | |
| DC8 | When the day has no tour plan yet | Tour and backup plan reviewed: no tour plan to review yet. Once the organizer saves one, review it here. | `DayChecks.tsx` | | |
| DC9 | The organizer, above a managed guest's checks | You record their checks. They show as recorded by you. | `DayChecks.tsx` | | |
| DC10 | Crew preparation, the summary of everyone else that day | Plan reviewed: {n} of {m} · Transceiver checks: {n} of {m} | `DayChecks.tsx` | | |
| DC11 | Under Crew preparation | Not recorded yet doesn't mean anything is missing or failed. | `DayChecks.tsx` | | |
| DC12 | Crew preparation, a person's check recorded before a change | Recorded before it changed: {reasons} | `DayChecks.tsx` | | |
| DC13 | Plan page, Tour preparation, on any day ahead (link: **Review the plan again**) | Your tour and backup plan review for {day} is out of date: {reasons} | `trip-day-checks.ts` | | |
| DC14 | Plan page, Tour preparation (link: **Check again**) | Your transceiver check for {day} is out of date: {reasons} | `trip-day-checks.ts` | | |
| DC15 | Plan page, Tour preparation, only on the day itself (link: **Open the day's checks**) | Your tour and backup plan review for today, {day} isn't recorded yet / Your transceiver check for today, {day} isn't recorded yet | `trip-day-checks.ts` | | |
| DC16 | Plan page, for the organizer (link: **See crew preparation**) | {n} people reviewed the tour plan for {day} before it changed | `trip-day-checks.ts` | | |
| DC17 | Crew page, Day checklist, per person | Tour and backup plan review not recorded yet / Transceiver check not recorded yet | `trip-checklist.ts` | | |
| DC18 | Crew page, Day checklist, once recorded | Tour and backup plan reviewed · {time} / Transceiver check recorded · {time} | `trip-checklist.ts` | | |

**Why a check goes out of date.** The reasons shown after DC6, DC7, DC12, DC13 and DC14. File: `src/lib/trip-day-checks.ts`.

| ID | Applies to | Text | Verdict | Suggested change |
|---|---|---|---|---|
| DS1 | Both checks | Date changed from {date} (or Date changed) | | |
| DS2 | Plan review | Tour plan removed | | |
| DS3 | Plan review | Tour plan changed | | |
| DS4 | Plan review | Route changed | | |
| DS5 | Plan review | Backup plan changed | | |
| DS6 | Plan review | Meet time changed | | |
| DS7 | Plan review | Return time changed | | |
| DS8 | Plan review | Meeting point changed | | |
| DS9 | Transceiver check | Transceiver taken off the packing list | | |
| DS10 | Transceiver check | Transceiver replaced in the packing list | | |

Notes, the approach, access and pickup notes, and the distance, ascent and time figures don't make a plan review out of date.

**Questions**

8. Do these two checks match practice? In particular, should the trailhead check be a group transceiver check (everyone's transceiver sending and receiving), and should its label or hint say so? Today the hint (DC4) deliberately doesn't say what the check involves.
9. Are DC5 and DC11 clear enough that a check isn't a safety assessment, without being so long nobody reads them?
10. Is the list of what makes a plan review out of date right (DS1–DS8)? Is anything missing, such as someone new joining the day? Should a plan review also lapse after a while, or overnight?
11. Is it acceptable for the organizer to record a managed guest's checks (DC9), attributed to the organizer?

## 4. Tour plan and the approach

The organizer writes the day's tour plan. Members read it without editing. Only the route or objective is required. The labels and hints below are what the organizer sees while writing it; the labels also head each part of the saved plan.

Files: `src/components/trips/TourPlan.tsx`; the figures' source and time zone lines in `src/lib/trip-tour-plans.ts`; the road drive in `src/components/trips/DriveEstimate.tsx`.

| ID | Field or place | Text | File | Verdict | Suggested change |
|---|---|---|---|---|---|
| TP1 | Day page, when there's no tour plan (organizer) | No tour plan yet. Add the route, a backup plan and when to be back; everything but the route is optional. | `TourPlan.tsx` | | |
| TP2 | **Backup plan**, hint | An alternative route or plan if conditions or the crew need it. | `TourPlan.tsx` | | |
| TP3 | **Return target (destination time)**, hint | Your turnaround or back-at-the-car time. | `TourPlan.tsx` | | |
| TP4 | **Check-in plan (crew notes)**, hint | Who to tell and by when. SWTTR doesn't send messages or watch for check-ins. | `TourPlan.tsx` | | |
| TP5 | **Approach (ski or walk)**, hint. The saved approach shows under its own heading, apart from the road drive. | Separate from the drive, e.g. a hut approach. | `TourPlan.tsx` | | |
| TP6 | **Exit or pickup**, hint | For a point-to-point tour: where it ends and how you get back. | `TourPlan.tsx` | | |
| TP7 | **Parking, road access and permits**, the field; saved as **Access and permits** | Parking, road access and permits | `TourPlan.tsx` | | |
| TP8 | **Where these figures come from**, hint; the saved figures then say **Crew estimate**, or **Source: {source}** | Leave blank for the crew's own estimate. | `TourPlan.tsx`, `trip-tour-plans.ts` | | |
| TP9 | Saved plan, when a part is empty: under **Backup plan** and **Return target**, then under **Meet** | Not set / Time not set · Meeting point not set | `TourPlan.tsx` | | |
| TP10 | Under the saved plan's times | Times are local to the destination ({time zone}). / Times are local to the destination. Its time zone wasn't confirmed when this plan was saved. | `trip-tour-plans.ts` | | |
| TP11 | Getting there, when no road reaches the access point (for example a hut): a heading, then a line | No road route found / Check the access point, or plan the approach separately. | `DriveEstimate.tsx` | | |
| TP12 | Getting there, Estimate details, under the road drive | Typical traffic, not live. No departure time is used. Check road conditions before you drive. | `DriveEstimate.tsx` | | |

**Questions**

12. Is anything missing from the tour plan for a group's trip plan, compared with what you'd expect (for example Avalanche Canada's trip plan)? Such as decision points, terrain to avoid, the group's experience, or an emergency plan. Say whether it belongs in SWTTR or should stay out.
13. Is TP4 clear enough that nobody will raise an alarm if a group is late?
14. TP3 puts a turnaround time and a back-at-the-car time in one field. Is that a problem?

## 5. Conditions sources and reviews

The organizer adds a day's sources: each has a type, a name, an optional area or region and a link. Members can't edit them. Everyone can record their own review of each source for that day, with an optional note the crew sees. Opening a link never records a review. A review goes out of date when the plan it was recorded against changes. A source can be listed on several days, but reviews always belong to the day they were recorded for.

Files: `src/components/trips/DayConditions.tsx`; out-of-date reasons and reuse text in `src/lib/trip-conditions.ts`.

| ID | Shown | Text | File | Verdict | Suggested change |
|---|---|---|---|---|---|
| CO1 | The source's type, then its link | Avalanche forecast / Open forecast (new tab) | `DayConditions.tsx` | | |
| CO2 | The source's type, then its link | Mountain weather / Open weather (new tab) | `DayConditions.tsx` | | |
| CO3 | The source's type, then its link | Access and closures / Open access information (new tab) | `DayConditions.tsx` | | |
| CO4 | Under every source | Validity not available in SWTTR — check the source. | `DayConditions.tsx` | | |
| CO5 | Under every source | Added by the organizer | `DayConditions.tsx` | | |
| CO6 | Top of Conditions, for members | Sources are managed by the organizer. You record your own reviews. | `DayConditions.tsx` | | |
| CO7 | No sources yet, organizer | No sources yet. Add or check an official source: the avalanche forecast, mountain weather and access or closures for this area. | `DayConditions.tsx` | | |
| CO8 | No sources yet, members | No sources yet. Check an official source before you go; the organizer can add links here. | `DayConditions.tsx` | | |
| CO9 | Top of the day's sources | Your reviews: {n} of {m} recorded for {weekday} | `DayConditions.tsx` | | |
| CO10 | Near the top of the day page, linking to Conditions | Conditions · No official sources added yet / Conditions · Your reviews: {n} of {m} recorded · {k} reviewed before the plan changed | `DayConditions.tsx` | | |
| CO11 | A source you haven't reviewed for this day | No review recorded for this day | `DayConditions.tsx` | | |
| CO12 | A source you've reviewed | You reviewed this source {time} | `DayConditions.tsx` | | |
| CO13 | A review recorded before the plan changed (amber icon), as three lines | Plan changed — review again / {reasons} / You reviewed it {time}, before the change. | `DayConditions.tsx` | | |
| CO14 | Crew reviews (collapsed) | {name} recorded a review · {time} / Plan changed since · {reasons} | `DayConditions.tsx` | | |
| CO15 | Under the day's sources | A recorded review notes who looked at a source and when. It doesn't mean the forecast is current or the plan is safe. | `DayConditions.tsx` | | |
| CO16 | **Record my review** opens a form that starts with this, then the source's link | Records that you reviewed {source} for {date}, with the time you save it. Opening the link doesn't record anything. | `DayConditions.tsx` | | |
| CO17 | The review's **Note (optional)**, hint | The crew sees it. Say if you checked earlier, or what to watch for. | `DayConditions.tsx` | | |
| CO18 | Adding a source, **Source name** hint | e.g. Mount Washington Avalanche Center | `DayConditions.tsx` | | |
| CO19 | Adding a source, **Area or region (optional)** hint | The forecast zone or area it covers, e.g. Presidential Range. | `DayConditions.tsx` | | |
| CO20 | Adding a source, **Link** hint | The official page, starting with https:// | `DayConditions.tsx` | | |
| CO21 | Listing a source on more days, before saving | Reviews stay with the day they were recorded for, so none come from other days. | `trip-conditions.ts` | | |
| CO22 | The same, for each added day | No review recorded for this day. | `trip-conditions.ts` | | |
| CO23 | The same, for a day it was removed from before, for example | 1 review recorded here before it was removed shows again, marked Plan changed — review again. | `trip-conditions.ts` | | |
| CO24 | Editing a source listed on several days | A new link or area changes what was reviewed, so reviews recorded for these days need recording again. / The link and area stay the same, so reviews stay as recorded. | `trip-conditions.ts` | | |
| CO25 | Removing a source from a day | {source} will no longer be listed for {date}. Reviews already recorded for it are kept. | `DayConditions.tsx` | | |

**Why a review goes out of date.** The reasons shown after CO13 and CO14. File: `src/lib/trip-conditions.ts`.

| ID | Text | Verdict | Suggested change |
|---|---|---|---|
| CS1 | Date changed from {date} (or Date changed) | | |
| CS2 | Destination changed | | |
| CS3 | Activity changed to {activity} | | |
| CS4 | Access point changed | | |
| CS5 | Tour plan added | | |
| CS6 | Tour plan removed | | |
| CS7 | Route changed | | |
| CS8 | Source link changed | | |
| CS9 | Source area changed | | |

Notes, meet and return times, stays, the backup plan, and the source's name or type don't make a review out of date.

**Questions**

15. Are three types enough (avalanche forecast, mountain weather, access and closures)? For example, should recent observations or road conditions be a type of their own?
16. Is CO4 the right wording? SWTTR has no bulletin times, so it can't say when a forecast was issued or when it expires.
17. **A review never goes out of date with time.** A review recorded on Wednesday for Saturday still counts on Saturday morning unless the plan changed (CS1–CS9). Should SWTTR say something about that, for example on the day itself, or after a new forecast would normally be issued?
18. Could "Record my review" or "You reviewed this source" be read as approving the plan, or as the forecast being fine? Is CO15 enough to prevent that?
19. Is CO8 enough for members on a day with no sources?

## 6. Official avalanche centers

When the organizer adds an avalanche forecast source, **Choose an official center** loads a checked list of centers, and, in Canada, a suggestion for the day. Choosing a center only fills in the source's name and link. The organizer types the area and saves. SWTTR never picks the nearest center. It suggests only from Avalanche Canada's published forecast areas, and only when the day's place is inside one. There are no U.S. suggestions: avalanche.org's zone data needs permission to use.

Files: `src/components/trips/OfficialCenterPicker.tsx`; the list in `src/lib/avalanche-centers.ts`; how each link was checked in [trip-conditions.md](../../trip-conditions.md#official-forecast-centers).

| ID | Shown | Text | File | Verdict | Suggested change |
|---|---|---|---|---|---|
| OC1 | Under the **Choose an official center** button | A checked list of avalanche.org's U.S. centers and Canada's forecasters, with a suggestion for this day when Avalanche Canada has one. | `OfficialCenterPicker.tsx` | | |
| OC2 | **Suggested for this day**, when the day's place is in an area; then a button, **Use {center}** | Avalanche Canada's forecast areas put this day's {access point / destination} in “{area}” today, forecast by {forecaster}. (For merged areas: … in a combined forecast area today, …) | `OfficialCenterPicker.tsx` | | |
| OC3 | Under a suggestion | Checked {time}. Forecast areas change through the season: check the map covers your route before you go. | `OfficialCenterPicker.tsx` | | |
| OC4 | No area contains the place | Avalanche Canada's forecast areas don't include this day's {access point / destination} today, so there's no suggestion. | `OfficialCenterPicker.tsx` | | |
| OC5 | The day has no place yet | Add the day's destination or access point to get a suggestion. | `OfficialCenterPicker.tsx` | | |
| OC6 | Avalanche Canada can't be reached | Suggestions aren't available right now. You can still choose a center from the list. | `OfficialCenterPicker.tsx` | | |
| OC7 | Always, under the suggestions | SWTTR doesn't suggest U.S. centers. Choose the one whose forecast map covers your route. | `OfficialCenterPicker.tsx` | | |
| OC8 | Under the **Official center** list | Fills in the name and link; you still save the source. Links checked Nov 16, 2026 against avalanche.org, Avalanche Canada, Parks Canada and Avalanche Québec. | `OfficialCenterPicker.tsx` | | |
| OC9 | After choosing a center | Filled in {name}. Check its map covers your route, then save the source. | `OfficialCenterPicker.tsx` | | |
| OC10 | When the list fails to load, after the error | You can still enter the source yourself. | `OfficialCenterPicker.tsx` | | |

**The list.** Each entry appears in the **Official center** list as "{name} · {area}", under **United States** or **Canada**. For U.S. centers the area is the state avalanche.org lists the center under, which is where it's based, not its forecast boundary. Verified November 16, 2026.

| ID | Name | Area | Link | Verdict | Suggested change |
|---|---|---|---|---|---|
| L1 | Chugach National Forest Avalanche Center | Alaska | https://www.cnfaic.org/forecast/ | | |
| L2 | Coastal Alaska Avalanche Center | Alaska | https://www.coastalakavalanche.org/forecast/ | | |
| L3 | Haines Avalanche Center | Alaska | https://alaskasnow.org/haines-forecast/ | | |
| L4 | Hatcher Pass Avalanche Center | Alaska | https://hpavalanche.org/forecast/ | | |
| L5 | Valdez Avalanche Center | Alaska | https://alaskasnow.org/valdez-forecast/ | | |
| L6 | Kachina Peaks Avalanche Center | Arizona | https://kachinapeaks.org/Forecast/ | | |
| L7 | Bridgeport Avalanche Center | California | https://bridgeportavalanchecenter.org/avalanche-forecast/ | | |
| L8 | Eastern Sierra Avalanche Center | California | https://www.esavalanche.org/forecasts/ | | |
| L9 | Mount Shasta Avalanche Center | California | https://www.shastaavalanche.org/forecasts/avalanche/mount-shasta | | |
| L10 | Sierra Avalanche Center | California | https://www.sierraavalanchecenter.org/forecasts/avalanche/central-sierra-nevada | | |
| L11 | Colorado Avalanche Information Center | Colorado | https://avalanche.state.co.us/ | | |
| L12 | Crested Butte Avalanche Center | Colorado | https://cbavalanchecenter.org/forecasts/ | | |
| L13 | Idaho Panhandle Avalanche Center | Idaho | https://www.idahopanhandleavalanche.org/forecasts/ | | |
| L14 | Payette Avalanche Center | Idaho | https://payetteavalanche.org/forecasts/avalanche | | |
| L15 | Sawtooth Avalanche Center | Idaho | https://www.sawtoothavalanche.com/forecasts/avalanche | | |
| L16 | Flathead Avalanche Center | Montana | https://www.flatheadavalanche.org/avalanche-forecast/ | | |
| L17 | Gallatin National Forest Avalanche Center | Montana | https://www.mtavalanche.com/avalanche-forecast | | |
| L18 | West Central Montana Avalanche Center | Montana | https://missoulaavalanche.org/forecasts/ | | |
| L19 | Mount Washington Avalanche Center | New Hampshire | https://www.mountwashingtonavalanchecenter.org/forecasts/ | | |
| L20 | Taos Avalanche Center | New Mexico | https://taosavalanchecenter.org/forecasts/ | | |
| L21 | Central Oregon Avalanche Center | Oregon | https://coavalanche.org/pages/forecasts/ | | |
| L22 | Utah Avalanche Center | Utah | https://utahavalanchecenter.org/ | | |
| L23 | Northwest Avalanche Center | Washington | https://nwac.us/forecasts/avalanche | | |
| L24 | Bridger-Teton Avalanche Center | Wyoming | https://bridgertetonavalanchecenter.org/forecasts/ | | |
| L25 | Avalanche Canada | Forecast areas on avalanche.ca's map | https://avalanche.ca/map | | |
| L26 | Parks Canada avalanche forecast | Banff, Yoho, Kootenay, Jasper, Glacier and Waterton Lakes national parks | https://avalanche.ca/map | | |
| L27 | Avalanche Québec | Chic-Chocs, Québec | https://avalanchequebec.ca/en/avalanche-bulletin/ | | |

**Left out on purpose** (organizers can still add these as their own sources): Wallowa Avalanche Center (its site blocks automated checks, so the link couldn't be verified); Cordova and Eastern Alaska Range (observations and weather, no forecast); the Eastern Wyoming and Southern Oregon information exchanges (observations, not forecasts); New York DEC's Adirondack page (no avalanche forecast on it); the National Avalanche Center and the Alaska Avalanche Information Center (they don't issue forecasts themselves).

**Questions**

20. Is the list right and complete for the regions SWTTR's users tour in? Should any left-out center be added, or any listed one removed?
21. Is showing the state as the area misleading? For example "Haines Avalanche Center · Alaska" could suggest it covers all of Alaska. OC7 and OC9 ask people to check that the center's map covers their route; is that enough?
22. Is the suggestion (OC2, OC3) clear that it's a lead to confirm, not a decision?
23. Avalanche Canada and Parks Canada both link to avalanche.ca's map, because their bulletin addresses change with each forecast. Is that the right link?

## 7. The offline brief

Before losing signal, a person can save a read-only copy of chosen trip days on their device. It shows what was saved and when, and never updates by itself.

Files: `src/components/trips/OfflineBrief.tsx`; the lists and labels in `src/lib/trip-offline-brief.ts`.

| ID | Shown | Text | File | Verdict | Suggested change |
|---|---|---|---|---|---|
| OB1 | Under a day's conditions sources | A review notes who looked at a source and when. It isn't a current forecast or a sign the plan is safe: check each source again when you have a connection. | `OfflineBrief.tsx` | | |
| OB2 | A crew review recorded before the plan changed / when you haven't reviewed a source | Reviewed before the plan changed: {reasons} / You haven't recorded a review. | `trip-offline-brief.ts` | | |
| OB3 | Every link in the saved copy, for example | Open avalanche forecast · Requires connection | `OfflineBrief.tsx`, `trip-offline-brief.ts` | | |
| OB4 | **Never saved offline** | Weather forecasts: check the forecast when you have a connection. | `trip-offline-brief.ts` | | |
| OB5 | **Never saved offline** | Maps and route lines: the copy has place names, addresses and coordinates, not a map. | `trip-offline-brief.ts` | | |
| OB6 | Under the day checks, each of which says Not recorded, Out of date: {reasons}, or Recorded {time} | Record checks in the trip when you have a connection. | `OfflineBrief.tsx` | | |
| OB7 | Under My equipment | As your packing list was when saved. | `OfflineBrief.tsx` | | |
| OB8 | What a saved day doesn't have, for example | Not planned yet for this day: No tour plan saved, No official conditions sources added, No kit saved. | `OfflineBrief.tsx`, `trip-offline-brief.ts` | | |
| OB9 | Opening the saved copy with no connection | Showing saved copy; changes since {time} are unknown. | `OfflineBrief.tsx` | | |

**Questions**

24. Is it clear enough that a saved copy holds no forecast and can be out of date by the time people are at the trailhead? Should OB1 or OB4 say more, for example to check the forecast before leaving signal?

## 8. Clothing advice on touring days

From a Backcountry day, Plan my layers opens SWTTR's clothing advice for that day. It gives separate layers for the climb and the descent, what to carry, and steps for the transition. The result's label says how close the layers are to SWTTR's warmth target; it's about warmth only. Some of the text below depends on the forecast: the thresholds are noted under "Shown".

Files: the labels in `src/lib/biophysics/comfort.ts` and `src/components/ScoreDisplay.tsx`; the warnings box in `src/components/layers/RecommendationWarnings.tsx`; the touring steps, warnings and advice in `src/lib/recommendations/sports/ski-touring.ts`; the helmet in `src/lib/recommendations/requirements.ts`.

| ID | Shown | Text | File | Verdict | Suggested change |
|---|---|---|---|---|---|
| CL1 | The result's label, green for the first, amber for the rest | Likely comfortable / Cooler than recommended / Warmer than recommended / Uneven warmth / Comfort unknown | `comfort.ts`, `ScoreDisplay.tsx` | | |
| CL2 | Tapping the label | Estimated thermal comfort / Heuristic fit score: {n}/100. This is not a confidence percentage. | `ScoreDisplay.tsx` | | |
| CL3 | Last line of every assessment | These clothing targets are estimates, not a prediction of injury or a confidence percentage. | `comfort.ts` | | |
| CL4 | The warnings box | Recommendation warnings / For the suggested outfit and conditions. | `RecommendationWarnings.tsx` | | |
| CL5 | The transition, in the warnings box; the time is shown for urgent and quick transitions | At the climb-to-descent transition / Urgent transition · Suggested time: within 5 minutes / Quick transition · Suggested time: within 10 minutes / Normal transition | `RecommendationWarnings.tsx`, `ski-touring.ts` | | |
| CL6 | Urgent transition steps, when the climbing layers fall well short of what standing still needs | 1. IMMEDIATELY add insulation layer before doing anything else 2. Then handle skins and ski mode transition 3. Add shell if windy/snowing | `ski-touring.ts` | | |
| CL7 | Quick transition steps | 1. Add insulation layer first 2. Handle skins and boots 3. Add shell if needed | `ski-touring.ts` | | |
| CL8 | Normal transition steps | 1. Handle skins and ski mode at normal pace 2. Add layers if feeling cold | `ski-touring.ts` | | |
| CL9 | Wind above 10 m/s (36 km/h): a first step, and a warning | Find wind shelter if possible / High wind - minimize exposed time | `ski-touring.ts` | | |
| CL10 | Air temperature below −15 °C | Risk of freezing exposed skin - keep gloves on | `ski-touring.ts` | | |
| CL11 | With an urgent transition | High heat loss risk: {x} clo vs {y} clo needed | `ski-touring.ts` | | |
| CL12 | Weather and activity advice, above 0 °C | Warm conditions - may need minimal extra layers for descent | `ski-touring.ts` | | |
| CL13 | Weather and activity advice, 0 to −10 °C | Standard touring conditions - bring packable insulation | `ski-touring.ts` | | |
| CL14 | Weather and activity advice, below −10 °C | Cold conditions - ensure robust insulation in pack | `ski-touring.ts` | | |
| CL15 | Descent, when no ski helmet is in the wardrobe ("available to suggest" when signed out); the requirement line under Not in your wardrobe | Descent: No ski helmet in your wardrobe. Wear one in any weather: it's required protection, not optional warmth. / Ski helmet — required protection in any weather; none in your wardrobe | `requirements.ts`, `ski-touring.ts` | | |

**Questions**

25. Could "Likely comfortable" (green, CL1) on a touring day be read as "the day is fine"? Should touring results say that clothing advice says nothing about avalanche conditions? The pilot checks how people read it (task T7 in [README.md](README.md)).
26. In CL13, "Standard touring conditions" means only a temperature between 0 and −10 °C. Is "conditions" risky there, next to avalanche "conditions"? The same goes for CL12, CL14 and "For the suggested outfit and conditions" (CL4).
27. Is "IMMEDIATELY add insulation layer before doing anything else" (CL6) the right first step? Should the transition steps say anything about where to transition? Are the suggested times (5 and 10 minutes) sensible?
28. Are the thresholds sensible: the frozen-skin warning below −15 °C air temperature (wind isn't counted), and the high-wind advice above 10 m/s?
29. The helmet again (question 4): CL15 calls a ski helmet required on the descent, and the equipment template now suggests one too (EQ7). Is "required protection, not optional warmth" the right wording here, alongside EQ7's purpose?

## Anything else

| What | Where it should go, or what it should say |
|---|---|
| Text that's missing (a warning, an item, a check) | |
| Text that should be removed | |
| Anything SWTTR shouldn't do at all on touring days | |

## Overall verdict

Pick one and add a note.

| Verdict | Chosen | Note |
|---|---|---|
| Ready to release as it is | | |
| Ready once the changes marked above are made | | |
| Not ready: needs the changes above and another review | | |

Date of the review:

Revision reviewed: `5f2b8d6` (or the revision this packet was regenerated from)

## About the reviewer

Please don't write your name unless you're happy for it to be public.

| | |
|---|---|
| Qualification (for example an avalanche course level, a guide or patrol certification) | |
| Years ski touring, and the regions | |
| How you reviewed (this packet only, or also the app) | |

## After the review

For the developer:

- Each **Change**, **Remove** and **Add** becomes a copy change in the file listed, in one PR per section or one for all, with "Refs #205". Keep this file's tables in step with the new text, and note the PR beside the verdict.
- If a change touches what a check or review means (sections 3 and 5), update [trip-touring-prep.md](../../trip-touring-prep.md) or [trip-conditions.md](../../trip-conditions.md) too.
- If the pilot has found a misreading (blocker rule 2 in [README.md](README.md#blocker-rules)), retest T6 and T7 after the new copy is deployed.
