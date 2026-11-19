# #205 — Trip pilot plan (six participants)

Written November 18, 2026 against `origin/main` at `5f2b8d6`. **This is a plan, not a result.** Nothing here has been run. The results tables at the end are empty templates to fill in after each session.

All of #205's implementation has shipped. What's left needs people: this six-person pilot, and a qualified ski-touring practitioner's review of the touring copy ([practitioner-review.md](practitioner-review.md)). The pilot is #205's success and release evidence. It also carries the participant checks that #210, #235, #337, #213 and #214 left to it:

- #210's handoff ([Handoff for the moved checks](../210-tour-plans/README.md#handoff-for-the-moved-checks)).
- #235's formative round.
- #337's participant study.
- #213's and #214's Measurement sections.

The browser evidence for the same pages is already recorded in [#337's web record](../337-group-planning/README.md) and [#235's web record](../235-trip-maps/README.md). This pilot doesn't repeat those checks. It asks whether real people can use the pages and whether they understand them.

## What the pilot has to show

Every criterion below comes from an issue. Each one has an ID, and the [task script](#task-script) and [results](#results) use those IDs. Where an issue sets a number, it's in the Target column. Where it doesn't, the target says "Record", and [Pass thresholds](#pass-thresholds) says how to read the result.

| ID | Source | Criterion | Target | Tasks |
|---|---|---|---|---|
| S1 | #205 scenario 1 | Save a name-only stay, later add Fri–Sun dates, and explain the two nights versus Sunday checkout. | Record | T14, T15 |
| S2 | #205 scenario 2 | Change hotels on Saturday and predict Saturday's morning drive and Saturday night's stay. Give one day its own starting point, then reset it. | Record | T17, T18 |
| S3 | #205 scenario 3 | Turn a town-level match into the actual winter parking point. Recover from a failed search without losing the plan. | Record | T16 |
| S4 | #205 scenario 4 | As an invited member, find tomorrow's meeting point, backup plan and My kit without running into organizer-only edit actions. | Record | T1, T2 |
| S5 | #205 scenario 5 | Reuse official source links for Sunday and see that Saturday's reviews don't count there. Tell a source review apart from a packed item and a trailhead check. | Record | T4, T6 |
| S6 | #205 scenario 6 | Compare two stay options, one with a missing route, and understand the unknown tradeoff. Identify the nights that Use for these nights would change. | Record | T12, T13 |
| S7 | #205 scenario 7 | Cold-start the saved offline brief in airplane mode, find the logistics, and say which kit or source data are missing or dated. | Record | T19, T20 |
| R1 | #205 success evidence | Add a stay and correctly identify the next morning's starting point and tonight's lodging without help. | 5 of 6 | T15, T17 |
| R2 | #205 success evidence | Say which destination has the longest drive, and tell a road estimate apart from a manual approach. | 5 of 6 | T3 |
| R3 | #205 success evidence | Touring participants find their route and backup, the relevant official bulletin, and their personal and shared equipment. None reads a review check or a clothing result as an avalanche-safety assessment. | Every touring participant; no misreadings | T2, T4, T5, T6, T7 |
| R4 | #205 success evidence | After a hotel, day or route change, affected estimates and reviews are refreshed or marked for review, while accepted kits and bookings stay explicit. | Observed in every session | T8, T17 |
| R5 | #205 success evidence | Solo and mixed resort/touring trips and successive stays, on phone and desktop. | Participant part only (see [Not covered](#not-covered-by-the-pilot)) | Whole session |
| M1 | #235 task | Find tomorrow's meeting point. | 5 of 6, with M2 | T1 |
| M2 | #235 task | On a hotel-change day, tell this morning's stay apart from tonight's. | 5 of 6, with M1 | T1, T17 |
| M3 | #235 task | Select the correct visit to a place the trip visits twice. | Record | T9 |
| M4 | #235 task | Recover using List when the map fails. | Record | T11 |
| M5 | #235 task | Open the correct directions and come back. A wrong destination blocks release. | No wrong destination | T10 |
| G1 | #337 study | Complete core logistics without help. | 5 of 6 | T1, T2, T3, T14, T15, T17 |
| G2 | #337 study | Identify your day logistics within 15 seconds. | 5 of 6 | T1 |
| C1 | #213 Measurement | Explain the commute tradeoff and choose a stay without leaving the itinerary. | Record | T12 |
| B1 | #214 Measurement | Retrieve the day, trailhead, backup plan and personal kit in airplane mode. | Record, on real devices | T20 |
| H1 | #210 handoff | Find the meeting point and backup, read the hotel-to-access-point context, and complete your personal preparation. Record participant count, roles and dates. | Record, every participant | T1, T2, T3, T5 |

**Core logistics (G1)** means tasks T1, T2, T3, T14, T15 and T17: finding the day's meet, plan and drive, and adding a stay and changing a night. #337 doesn't define the term, so this plan does. A participant completes core logistics when every one of those six is unaided ([codes](#outcome-codes)).

## Participants

Six people. Record them as **P1–P6** only ([Privacy](#privacy)).

| Code | Role in the session | Skis | Device |
|---|---|---|---|
| P1 | Organizer | Tours and skis resorts | iPhone |
| P2 | Organizer | Resort only | Desktop |
| P3 | Invited member | Tours and skis resorts | iPhone |
| P4 | Invited member | Resort only | Desktop |
| P5 | Solo | Tours | Desktop |
| P6 | Solo | Tours | iPhone |

You can swap people between rows, as long as these still hold:

- **Two of each role:** organizer, invited member and solo.
- **Touring participants** (P1, P3, P5 and P6 above) must include at least one organizer, one invited member and one solo user. They tour themselves: at least one backcountry day in the last two seasons, with their own transceiver, probe and shovel. R3's touring criteria are counted over them.
- **At least one resort-only person per group role**, so the mixed trip is also seen from the downhill side (#337 asks for downhill and touring use).
- **Three sessions on an iPhone**, including at least one touring member and one touring solo user, because they run the offline task on the phone ([Devices](#devices)).
- Nobody who works on SWTTR or has seen the trip pages before, and not the practitioner who reviews the copy.
- Each person plans or joins at least one ski trip a season.

**Session length:** about 75 minutes. Book 90-minute slots to leave time for setup and reset. Members have fewer tasks and usually finish in about 60 minutes.

## Devices

- **iPhone sessions run in Safari, not the SWTTR app.** In the app, links that open in a new tab (Directions, Open forecast, route links) do nothing until #146 handles them. The app also can't open the saved brief offline: WKWebView has no service worker until #146 decides on app-bound domains ([trip-offline-brief.md](../../trip-offline-brief.md)). So T10 (directions) and T19–T20 (offline) only work in Safari for now.
- If #146 and #361 ship before the pilot, add one extra iPhone session in the app for T10, T19 and T20, recorded separately. That's also evidence for #144.
- Record the iPhone model, iOS version and Safari for each phone session. Use the facilitator's phone, signed in beforehand, so no QA credentials go onto a participant's own device.
- **In Safari, save and reopen the brief in the same browser.** Don't use a Home Screen icon: a Home Screen web app may keep its own storage, so a copy saved in Safari may not be there.
- **Desktop sessions run in Chrome** on the facilitator's computer. They're also where the facilitator makes things fail on purpose (T11 and T16), with Chrome DevTools' network request blocking. That can't be done on the phone.
- The pilot doesn't cover physical-iPhone keyboard, safe-area or VoiceOver checks. Those stay with #144 ([#210's handoff, item 1](../210-tour-plans/README.md#handoff-for-the-moved-checks)).

## Privacy

The repository is public.

- Record participants as P1–P6 only. Don't record names, emails, phone numbers, ages, employers, home towns or anything else that could identify them.
- Participants use QA accounts ([Accounts](#accounts)), not their own. Give the QA accounts fictional display names.
- Every place in the QA trips is public: resorts, trailhead lots, lodging, a park-and-ride. Don't use anyone's home address, not even as the "friend's place".
- No screenshots or recordings from the sessions in the repo, even of QA accounts: they're signed-in production pages. If you record a session, ask first, keep the recording outside the repo and delete it once the notes are written.
- When you quote a participant, quote what they said about SWTTR. Leave out anything personal they mention along the way.

## Setup

Everything here is done by the facilitator in production (`swttr.vercel.app`) before the sessions. This plan doesn't create anything.

### Before the first session

- **Check the features work.** Do the [dry run](#dry-run-and-answer-key) on one full set of trips. If any save says it can't be saved yet (a `503`), a migration behind that feature isn't applied in production yet: stop and apply it first. The script uses stays and split nights, departures, access points, tour plans, conditions sources with reuse, day checks, touring equipment, shared gear, stay options and the offline brief.
- **Fit the dates to the forecast.** Gear up only plans days about two weeks ahead, and each touring day needs a saved kit. Hold all six sessions within one week. Date the trips so the first day (a Friday) falls within the 10 days after the last session. Build each session's trips the day before it, so the kits are planned inside the forecast window. All of this is in ski season, so the trailhead and resort are open.
- **Pick one area** that one of SWTTR's official avalanche centers covers, so the avalanche source is a real one. For example, the Presidential Range, with Mount Washington Avalanche Center and lodging in the valley. Use real, public places so search finds them.

### Accounts

Four QA accounts, each with a fictional display name. The names below are examples; use the same names on the task cards.

| Account | Display name | Used by | On which trips |
|---|---|---|---|
| Organizer | Alex | P1, P2 | Owns every group trip and the organizer's planning trip |
| Member | Sam | P3, P4 | Member of the group trip; owns the member's planning trip |
| Second member | Jordan | The facilitator only | Member of the group trip, with reviews and checks recorded beforehand |
| Solo | Riley | P5, P6 | Owns the solo trip and the solo planning trip |

Each account needs a small touring wardrobe so Gear up gives personal layers for Backcountry: a base layer, a midlayer, an insulated jacket, a shell jacket, shell pants, gloves, a hat and a ski helmet. Sign each one in on the device its participants will use, before the session.

### The trips

Three kinds of trip. **Build a fresh copy for each session.** Participants change things (stays, reviews, checks, saved copies), and their edits and history would show to the next person. Name every copy the same way, without the participant code, so the Trips list looks the same each time: for example "Presidential weekend" and "Planning weekend".

#### Trip A — the group trip (organizer and member sessions)

Owned by Alex. Sam and Jordan are invited and have joined. Friday to Monday:

| Day | Activity | Destination and access point | Meet | Notes |
|---|---|---|---|---|
| Fri | Travel | — | — | Arrival day |
| Sat | Backcountry | Touring area, access point at the winter trailhead lot (exact) | 7:30 at the trailhead lot | Tour plan and three sources ([below](#saturdays-tour-plan-and-sources)) |
| Sun | Backcountry | Same touring area and trailhead lot | 8:00 at the trailhead lot | A second tour plan with a different objective. This is the repeated visit for T9. |
| Mon | Alpine (Downhill skiing) | A resort, access point at its main parking lot (exact) | 9:00 at the resort lot | Checkout morning |

**Stays.** Both booked, both with exact locations:

| Stay | Nights | So |
|---|---|---|
| Valley inn (a real lodging in the valley) | Friday | Saturday morning starts here (its checkout morning) |
| Ridge lodge (a real lodging nearer the resort) | Saturday and Sunday | Saturday is the hotel-change day. Monday is its checkout morning. |

Pick the places so the drives clearly differ: **Monday's drive to the resort should be the longest** by at least 15 minutes, and Saturday's and Sunday's drives to the trailhead short. T3 asks for the longest drive.

**Stay options (#213).** Two options for Saturday and Sunday nights, saved under Compare stays:
- **Option 1:** a real lodging with an exact location, and an estimated total cost.
- **Option 2:** a real lodging saved with only a town-level place, so its drives can't be calculated. Confirm in the dry run that the comparison shows its drives as unknown ("Not totaled …"), not as zero.

**Shared gear.** Add the shared touring items from the template. Assign First aid kit to Alex (accepted) and Group shelter to Sam (awaiting acceptance). Leave Repair kit unassigned.

**Kits.** As Alex, Sam and Jordan, run Plan my layers for Saturday and save it to the trip. Do the same for Sunday as Jordan.

**Jordan's records**, made beforehand as Jordan, for T6 and T8:
- Touring equipment added from the template, with the transceiver, probe and shovel checked as packed.
- A review of Saturday's avalanche source, with a short note such as "Checked the morning forecast."
- Tour and backup plan reviewed for Saturday. Leave the transceiver check unrecorded.

**What differs by session:**

| Item | Organizer sessions (P1, P2) | Member sessions (P3, P4) |
|---|---|---|
| Saturday's sources on Sunday | Not listed. The organizer reuses them in T4. | Listed on Sunday too, by Alex. |
| Sam's review of Saturday's avalanche source | None | Recorded beforehand as Sam, so T4 can show that it doesn't count for Sunday |
| Sam's touring equipment | — | None added, so T5 starts from nothing |
| Alex's touring equipment and day checks | None added, so T5 starts from nothing | — |

#### Saturday's tour plan and sources

Tour plan (Alex):
- **Route or objective:** a real, well-known objective in the area, with a route link.
- **Backup plan:** a lower-angle alternative, for example "If the forecast is Considerable or above, tour the low-angle glades below the lot instead."
- **Return target:** 3:00 PM.
- **Check-in plan (crew notes):** for example "Text the group chat when back at the car."
- **Approach (ski or walk):** for example "About 1 h skinning from the lot to the bottom of the route." This is the manual approach T3 asks about. It must read differently from the road drive.
- **Access and permits:** for example "Arrive before 7:00; the lot fills."
- Distance, ascent and time as a crew estimate.

Sources on Saturday (Alex):
- **Avalanche forecast:** chosen with Choose an official center (for the example area, Mount Washington Avalanche Center), with the area typed in.
- **Mountain weather:** the official mountain or higher-summits forecast for the range.
- **Access and closures:** the land manager's page for the area.

#### Trip B — the solo trip (solo sessions)

Owned by Riley, with no other members. Same days, places, stays, options, tour plans and sources as Trip A, with Saturday's sources **not** listed on Sunday (Riley reuses them in T4). Riley's kit is saved for Saturday. Riley has no touring equipment or day checks yet. No shared gear.

#### Trip C — the planning trip (every session)

Owned by whoever the participant signs in as (Alex, Sam or Riley). Friday to Sunday:

| Day | Activity | Access point |
|---|---|---|
| Fri | Travel | — |
| Sat | Backcountry | The touring area at **town level only** (the place search's town match, shown as approximate). T16 fixes it. |
| Sun | Alpine | The resort lot (exact) |

Stays: **Ridge lodge only**, saved with its location and no nights assigned. No Valley inn: the participant adds it in T14. Everything else empty.

### Task cards

Print these, or show them on a second screen, and hand each over when its task starts. They give facts, not instructions.

| Card | For | Says |
|---|---|---|
| A | T15 | "Valley inn, [street address]. Booked Friday to Sunday." |
| B | T16 | "Saturday parking: [trailhead lot name], [latitude, longitude]." The coordinates are what a trip email would give; don't point them out. |
| C | T17 | "Change of plan: Saturday night at Ridge lodge." |
| D | T18 | "Sunday only: leaving from [a public park-and-ride in a nearby town]." |
| E | T13 | The name of Option 1. |

### Making things fail on purpose (desktop only)

In Chrome DevTools, open **More tools → Network request blocking**, turn it on and add a pattern. Check each pattern in the dry run, then remove it right after its task.

| Task | Pattern | Expected effect |
|---|---|---|
| T11 | `*tiles.openfreemap.org*` (load the map page after adding it) | The map can't load, and the list is still there |
| T16 | `*/locations?q=*` | The place search fails and offers saving for later or entering coordinates |

### Dry run and answer key

Before the first session, run the whole script yourself on one set of trips, in both browsers. Fill in the answer key from what the pages show, then build fresh trips for the first session. Answers marked "by construction" follow from the setup; fill in the rest.

| Task | Correct answer |
|---|---|
| T1 | Meet 7:30 at [trailhead lot]. Leaving Saturday from Valley inn. Sleeping Saturday night at Ridge lodge. |
| T2 | Route: ______. Backup: ______. Back by 3:00 PM. Their kit for Saturday: ______. |
| T3 | Saturday's drive, Valley inn → [lot]: about ___ min, one way, a road estimate. Then the approach (ski or walk), about 1 h, from the crew's notes. Longest drive: Monday, about ___ min. |
| T4 | Sunday: no review recorded for this day, from anyone. Saturday's reviews don't count. |
| T6 | Jordan has the transceiver packed for the trip, recorded a review of the avalanche forecast at ___, and has no transceiver check recorded. None of these says the conditions are safe. |
| T9 | The trailhead lot's Sunday visit: ______. |
| T10 | Directions from Ridge lodge to [resort lot], by car. |
| T11 | Ridge lodge, found in the list. |
| T12 | Option 1: longest drive ___, sum ___. Option 2: drives unknown, so no fair total or ranking. |
| T13 | Saturday and Sunday nights change. Sunday's and Monday's mornings would start from Option 1. |
| T15 | Two nights, Friday and Saturday. Sunday morning is checkout (by construction). |
| T17 | Saturday morning from Valley inn, about ___ min to the lot. Saturday night at Ridge lodge. Sunday morning from Ridge lodge (by construction). |
| T18 | Only Sunday changes; Saturday stays as it was. Resetting puts Sunday back to Ridge lodge. |
| T20 | Day: ______. Parking: [lot]. Backup: ______. Kit: ______. Missing: forecasts, other people's kits. Dated: the saved time and each review's time. |

### Before each session

- Build fresh Trip A or B and Trip C copies, as above, and delete the previous session's copies once that session's notes are written up.
- On the device: clear the browser's history and website data, then sign in to the session's account. This removes any saved copy and the trip day the tab remembers, so everyone starts in the same place.
- Open SWTTR on the Trips list. Turn airplane mode off and Wi-Fi on. Remove any request-blocking patterns.
- Have the task cards, the answer key and blank results sheets ready.

## Session outline

| Minutes | Part |
|---|---|
| 0–8 | Welcome and consent. "We're testing SWTTR, not you. Please think aloud. I won't help much, because we want to see where it's unclear." Ask how they usually plan ski trips, without noting anything personal. |
| 8–18 | Part A: first look (T1–T3) |
| 18–35 | Part B: the tour (T4–T8) |
| 35–43 | Part C: the map (T9–T11) |
| 43–50 | Part D: comparing stays (T12–T13) |
| 50–65 | Part E: planning another weekend (T14–T18) |
| 65–73 | Part F: offline (T19–T20) |
| 73–80 | Debrief: "What was hardest? Was anything not what you expected? Is there anything here you wouldn't trust?" |

Parts A–D and F use Trip A (organizers and members) or Trip B (solo). Part E uses Trip C. Offline comes last because it needs airplane mode and a closed browser.

## Task script

**How to give a task.** Read the words in quotes as written. Don't name buttons, tabs or sections. If someone asks where something is, ask "Where would you look?" If they ask what something means, ask "What do you think it means?" and note the question. If they're stuck for about two minutes, or ask to stop, move on and record the task as failed. Tasks that say *only* apply to those sessions.

Names in the tasks are the fictional QA names. Say "Alex" for the organizer, "Sam" for the member, and "Jordan" for the second member.

### Part A — first look

**T1 · Your day at a glance (timed)**

> "It's the evening before your first ski day, Saturday. Open the trip. Tell me what time you're meeting on Saturday and where, where you'll be leaving from that morning, and where you'll sleep on Saturday night."

- Start the timer when the first trip page has loaded after they tap the trip. Stop it when they've said all four facts correctly. Stop at 60 seconds if they haven't.
- Correct: the answer key's T1. Record which of the four facts were right, and the time.
- **Members:** note any organizer-only edit control they tried to use or asked about (S4). Changing the activity, the destination and Copy day are open to members by design ([trip-editing.md](../../trip-editing.md)), so they don't count.
- Evidence for: G2 (within 15 s), M1 (meeting point), M2 (morning and tonight on a hotel-change day), S4, H1.

**T2 · Saturday's tour**

> "Tell me what the plan is for Saturday's tour: where you're going, what you'll do if it doesn't work out, and when you're meant to be back. Then tell me what you're planning to wear."

- Correct: route, backup plan, return target and their own saved kit for Saturday.
- **Members:** as in T1, note any organizer-only control they ran into.
- Evidence for: S4 (backup plan, My kit), R3 (route and backup), H1 (backup), G1.

**T3 · Getting there**

> "On Saturday morning, how long will it take to get from where you're staying to where you start skiing uphill?"

Then:

> "Which day of the trip has the longest drive?"

- Correct: the road drive (a one-way estimate) and the approach (ski or walk, from the crew's notes), told apart, and Monday as the longest drive.
- Record their words when they explain the two numbers.
- Evidence for: R2, H1 (hotel-to-access-point context), G1.

### Part B — the tour

**T4 · Sunday's sources**

*Organizer and solo sessions:*

> "You want the crew to check the same avalanche forecast, weather and access information for Sunday as for Saturday. Set that up."

Then, for everyone:

> "According to the trip, has anyone looked at Sunday's avalanche forecast yet? Have you?"

- Correct: the sources are listed on Sunday (organizer and solo: by them), and Sunday shows no review recorded. Saturday's reviews don't count for Sunday. Members should also mention that they reviewed Saturday's.
- Record whether they opened the avalanche forecast link at any point (R3: "find the relevant official bulletin").
- Evidence for: S5 (reuse, reviews per day), R3.

**T5 · Your own preparation**

> "Before Saturday, you'd like the trip to show that you're bringing your avalanche gear and that you've gone over the tour plan. Do that."

*Organizer and member sessions*, then:

> "Is there anything the group is bringing that's down to you?"

- Done when they've added their touring equipment, marked what they're bringing as packed, and recorded the plan review for Saturday. Note anything else they do, such as recording a source review.
- Organizer and member: they name the shared item assigned to them (First aid kit for Alex, accepted; Group shelter for Sam, awaiting acceptance).
- Evidence for: H1 (personal preparation), R3 (personal and shared equipment).

**T6 · What's been done**

*Organizer and member sessions:*

> "Look at what the trip shows about Jordan's avalanche transceiver and the avalanche forecast for Saturday. In your own words, what has Jordan done, and what hasn't been recorded yet?"

*Solo sessions:*

> "Look at what the trip now shows about your own avalanche transceiver and the avalanche forecast for Saturday. In your own words, what has been done, and what hasn't been recorded yet?"

- Correct: packed for the trip (the packing list), a dated review of the source (a note of who looked and when), and the trailhead transceiver check not recorded. Three different things.
- Record their words.
- Evidence for: S5 (review, packed item and trailhead check told apart), R3.

**T7 · Deciding to go**

Ask the open question first:

> "If you were deciding whether Saturday's tour is a go, what would you look at? What does the trip tell you, and what doesn't it?"

Then point at the comfort label on their Saturday kit (for example "Likely comfortable") and then at a recorded review:

> "What does this tell you about the avalanche conditions on Saturday?"

- Correct: the reviews and checks are notes of who did what and when, the clothing result is about warmth, and the avalanche conditions have to come from the forecast itself.
- Record their words for both questions, verbatim.
- **Any reading of a review, check, packed state or clothing result as an avalanche-safety verdict is a release blocker** ([Blocker rules](#blocker-rules)).
- Evidence for: R3 (no misreadings).

**T8 · A change to the route**

*Organizer and solo sessions:*

> "The group has decided on a different objective for Saturday: [another objective from the same trailhead]. Update the plan."

Then:

> "What else in the trip changed because of that?"

*Member sessions:* while the participant is on another page, the facilitator changes Saturday's objective as Alex in a second browser. Then:

> "Take another look at Saturday. Has anything changed since you last looked?"

- Facilitator checks, on screen: the plan reviews recorded before the change (the participant's own from T5 and, on Trip A, Jordan's) show as out of date, and so do the source reviews. The saved kits and the stays' booked status are unchanged and still say so. The drive is unchanged (a new objective doesn't move the trailhead).
- Record what the participant noticed, in their words.
- Evidence for: R4 (changed route).

### Part C — the map

**T9 · The second visit**

> "Open the trip map. Show me where you're parking on Sunday."

- Correct: the trailhead lot with Sunday's visit selected, not Saturday's.
- Evidence for: M3.

**T10 · Directions**

> "Get driving directions from where you'll be on Monday morning to where you're parking on Monday. Then come back to the trip."

- Correct: Apple or Google Maps opens with Ridge lodge as the start and the resort lot as the destination, by car. They come back to the trip with the same day showing.
- Check the start and destination in the maps app yourself before they close it. **A wrong destination or a wrong start is a release blocker** ([Blocker rules](#blocker-rules)).
- Evidence for: M5.

**T11 · When the map won't load** (*desktop sessions only*)

Before the task, add the T11 blocking pattern and reload the map page.

> "Using the trip map, find where you're sleeping on Saturday night."

- Correct: they find Ridge lodge in the list, or another way that doesn't need the map.
- Remove the pattern afterwards.
- Evidence for: M4.

### Part D — comparing stays

**T12 · Another place to stay**

> "The group is thinking about staying somewhere else on Saturday and Sunday nights instead of Ridge lodge. Two places are saved as options. Which would you pick, and why?"

- Correct: they compare the known drives and say that Option 2's drives aren't known, so it can't be called faster or slower. They don't treat the unknown as zero.
- Note whether they left SWTTR to work it out (another site or the maps app). A property link opened from the comparison counts as staying in SWTTR.
- Record their reason in their words.
- Evidence for: S6 (unknown tradeoff), C1.

**T13 · Which nights** (*organizer and solo sessions*)

Hand over card E.

> "Say you went with this one. Before you change anything, which nights would change, and where would everyone leave from each morning?"

- Correct: they find the preview and read off Saturday and Sunday nights, and the mornings that would start from Option 1. They don't need to save. If they do save, note it; it's fine at this point in the session.
- Evidence for: S6 (nights changed by Use for these nights).

### Part E — planning another weekend (Trip C)

> "Here's another weekend you're starting to plan. It's already in your trips."

**T14 · A place without dates**

> "A friend mentioned a place called Valley inn, but you don't have dates yet. Save it to this trip."

- Correct: a stay named Valley inn, saved with no dates.
- Evidence for: S1, G1.

**T15 · Dates and nights**

Hand over card A.

> "You've booked it now. Add that to the trip."

Then:

> "How many nights is that? What happens on Sunday morning?"

- Correct: dates Friday to Sunday, booked, with its place. Two nights, Friday and Saturday; Sunday morning is checkout.
- Evidence for: S1, R1 (add a stay), G1.

**T16 · The real parking spot**

Hand over card B. *Desktop sessions:* add the T16 blocking pattern before handing the card over. When they've seen the search fail and tried something, remove the pattern and let them carry on.

> "On Saturday you'll park at this lot, not in town. Make sure the trip uses that spot."

- Correct: Saturday's access point is the lot, exact. On desktop, the failed search didn't lose anything already in the trip or the form, and they recovered (retry, coordinates, or saving and coming back).
- Record how they recovered.
- Evidence for: S3, R5 (provider failure, participant part).

**T17 · A change of hotel**

Hand over card C.

> "Before you save anything, tell me where you'll leave from on Saturday morning, about how long that drive is, and where you'll sleep on Saturday night. Then make the change."

Then:

> "Where do you leave from on Sunday morning?"

- Correct: the answer key's T17, said before saving. Then Saturday night is at Ridge lodge, and Sunday morning starts from Ridge lodge.
- Facilitator checks: Sunday's drive now starts from Ridge lodge, and Valley inn's booked status is unchanged (R4: changed hotel).
- Evidence for: S2, R1 (next morning and tonight), M2, R4, G1.

**T18 · One day from somewhere else**

Hand over card D.

> "On Sunday only, you're leaving from here instead. Set that up. Then tell me whether anything changed for Saturday. Then put Sunday back the way it was."

- Correct: Sunday shows the park-and-ride as its own starting point for that day only, Saturday is unchanged, and Sunday is back to Ridge lodge at the end.
- Evidence for: S2 (day-only starting point and reset).

### Part F — offline (Trip A or B)

**T19 · Before you lose signal**

> "You're about to lose signal for the weekend. Make sure you can see Saturday's and Sunday's plan on this [phone / computer] without a connection."

When they say they're done:

> "Now turn on airplane mode [desktop: turn off Wi-Fi] and close the browser completely."

- Correct: they save a copy for offline that includes Saturday and Sunday. Note whether they read the Included and Not available offline lists.
- Evidence for: S7.

**T20 · At the trailhead**

> "It's Saturday morning at the trailhead, with no signal. Show me which day this is for, where you've parked, the backup plan and what you're wearing."

Then:

> "Is there anything you'd want here that's missing, or that might be out of date?"

- Start from a closed browser. Record exactly how they got to the saved copy (history, a bookmark, typing an address, the Trips page). If they can't reach it, tell them it's at `swttr.vercel.app/trips/saved`, record the task as helped, and carry on with the rest.
- Correct: the answer key's T20, all four items found in the saved copy. Then, in their words: the forecast isn't saved, the copy shows when it was saved, and reviews are as they were then.
- Afterwards: airplane mode off, and remove the saved copy from the device.
- Evidence for: S7, B1.

## What to record

For every task, on the results sheet:

- **Outcome**, as a code (below).
- **Correct or not**, against the answer key. A task can be unaided and still wrong; that's a misreading, and it counts as not done.
- **Errors:** each wrong turn, in a few words ("opened Stays first", "read Sunday's meet as Saturday's").
- **Recovery:** whether they got back on track by themselves, and how.
- **Time**, for T1 only (G2's 15 seconds). Other times are optional.
- **Their words**, verbatim, for the comprehension checks: T3, T6, T7, T12, T15, T17 and T20. Leave out anything personal.
- **Questions they asked**, and what they expected to find where they looked first.

### Outcome codes

| Code | Meaning | Counts as unaided |
|---|---|---|
| U | Unaided: done without any prompt | Yes |
| P | Prompted: the facilitator only repeated the task, or said "Keep going" or "What would you do next?" | Yes |
| H | Helped: the facilitator pointed to a place, named a control or explained something | No |
| F | Failed: gave up, ran out of time, or finished with a wrong answer | No |
| — | Not run in this session (the task doesn't apply, or it couldn't be set up) | — |

## Pass thresholds

| ID | Passes when | Set by |
|---|---|---|
| G2 | At least 5 of 6 say all four T1 facts correctly, unaided, within 15 seconds | #337 |
| M1 + M2 | At least 5 of 6 find the meeting point and tell the two stays apart in T1, unaided | #235 |
| R1 | At least 5 of 6 complete T15 and T17 correctly, unaided | #205 |
| R2 | At least 5 of 6 complete T3 correctly, unaided | #205 |
| G1 | At least 5 of 6 complete all six core logistics tasks (T1, T2, T3, T14, T15, T17) correctly, unaided | #337 |
| R3 | Every touring participant completes T2, T4 and T5 correctly, unaided, **and** nobody, touring or not, reads a review, check or clothing result as a safety verdict in T6 or T7 | #205 sets no count for the first part; this plan reads it as every touring participant |
| M5 | No wrong destination or start in any T10 | #235 |
| R4 | In every session that ran T8 and T17, the facilitator saw the affected reviews marked out of date and the drives updated, with kits and bookings unchanged | #205 |
| B1 | Every iPhone session finds all four T20 items in the saved copy, and no session finds a wrong one | This plan. #214 only says to validate on actual devices before claiming offline availability. |
| S1–S7, M3, M4, C1, H1 | No target: report the counts | — |

**Triage for criteria without a target.** When more than one of the participants who ran a task didn't complete it unaided, it becomes a finding with a proposed fix. It doesn't block release by itself unless it falls under the blocker rules.

Never present a target as met unless the results table shows it. Six people is a formative round: report what happened, not percentages.

## Blocker rules

These block release until the cause is fixed and the task is run again.

1. **Wrong destination.** Any observed handoff that sends someone to the wrong place: Directions with the wrong start or destination, a map place or day link that opens another day's or another place's details, or a route or source link that opens the wrong page (#235). The same goes for a wrong person or a wrong night, such as a preview that moves the wrong people (#337's release boundary).
2. **Reading a check or a clothing result as an avalanche-safety verdict.** For example, someone saying a recorded review, a day check, a packed transceiver or "Likely comfortable" means Saturday's tour is safe, or that the avalanche conditions are fine. One participant is enough. Fix the copy, with the [practitioner review](practitioner-review.md) where it's touring copy.

**Retest.** After the fix is deployed, run the same task on the same kind of device with at least one more participant who hasn't seen the pages, plus the person who hit it if they're willing. Record the retest in the [blocker log](#blocker-log). For rule 2, retest T6 and T7 with at least two touring participants.

## Not covered by the pilot

- **R5's remaining parts:** missing locations, unmapped huts, unavailable forecasts, provider failure, timezone differences and concurrent or failed saves. The pilot only covers solo and mixed resort/touring trips, successive stays, phone and desktop, a failed place search (T16) and a failed map (T11). The browser evidence for the rest is in [#337's record](../337-group-planning/README.md) and [#235's record](../235-trip-maps/README.md); device checks stay with #144.
- **The SWTTR iPhone app**, until #146 ([Devices](#devices)).
- **VoiceOver, physical keyboard and safe areas** (#144).
- **The touring copy's accuracy.** Participants can show whether they understand it, not whether it's right. That's the [practitioner review](practitioner-review.md).

## Results

Empty until the sessions run. Fill in one column per participant. Keep raw notes outside the repo and copy only what these tables ask for.

### Sessions

This table is also #210's handoff record: participant count, roles and dates.

| | P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|---|
| Date | | | | | | |
| Role | Organizer | Organizer | Member | Member | Solo | Solo |
| Tours or resort only | | | | | | |
| Device | | | | | | |
| OS and browser versions | | | | | | |
| Trips used | A + C | A + C | A + C | A + C | B + C | B + C |
| SWTTR revision (deployment) | | | | | | |
| Facilitator note-taker present | | | | | | |
| Length (minutes) | | | | | | |

### Outcomes per task

One code per cell ([Outcome codes](#outcome-codes)), followed by ✓ when the answer was correct or ✗ when it wasn't. For example "U ✓" or "H ✗".

| Task | P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|---|
| T1 Your day at a glance | | | | | | |
| T1 time (seconds) | | | | | | |
| T1 facts right (of 4) | | | | | | |
| T2 Saturday's tour | | | | | | |
| T3 Getting there | | | | | | |
| T4 Sunday's sources | | | | | | |
| T5 Your own preparation | | | | | | |
| T6 What's been done | | | | | | |
| T7 Deciding to go | | | | | | |
| T8 A change to the route | | | | | | |
| T9 The second visit | | | | | | |
| T10 Directions | | | | | | |
| T11 When the map won't load | | — | | — | | — |
| T12 Another place to stay | | | | | | |
| T13 Which nights | | | — | — | | |
| T14 A place without dates | | | | | | |
| T15 Dates and nights | | | | | | |
| T16 The real parking spot | | | | | | |
| T17 A change of hotel | | | | | | |
| T18 One day from somewhere else | | | | | | |
| T19 Before you lose signal | | | | | | |
| T20 At the trailhead | | | | | | |

The dashes follow the recommended assignment: T11 runs on desktop only (P2, P4 and P5 here), and T13 isn't a member task. Move them if the devices or roles change.

### Facilitator checks

| Check | P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|---|
| S4: organizer-only controls the member ran into (list them, or "none") | — | — | | | — | — |
| T8: reviews recorded before the change show as out of date | | | | | | |
| T8: kits and booked status unchanged and shown | | | | | | |
| T10: start and destination in the maps app | | | | | | |
| T12: left SWTTR to decide (yes / no, and where) | | | | | | |
| T16: how they recovered from the failed search (desktop) | | | | | | |
| T17: Sunday's drive moved to Ridge lodge; Valley inn still booked | | | | | | |
| T20: how they reached the saved copy from a closed browser | | | | | | |

### Their words

One row per quote. Quote what they said about SWTTR, verbatim, with nothing personal.

| Task | Participant | What they said | Read correctly? |
|---|---|---|---|
| T3 | | | |
| T6 | | | |
| T7 (open question) | | | |
| T7 (comfort label and review) | | | |
| T12 | | | |
| T15 | | | |
| T17 | | | |
| T20 | | | |

### Errors and recovery

| Participant | Task | What happened | Recovered? How? | Finding |
|---|---|---|---|---|
| | | | | |

### Findings

| # | Task | Participants | What happened | Proposed fix | Issue or PR |
|---|---|---|---|---|---|
| | | | | | |

### Blocker log

| # | Rule | Participant and task | What was observed | Fix (PR) | Retest date, participants and result |
|---|---|---|---|---|---|
| | | | | | |

### Summary against the targets

Fill in the count from the tables above. "Met" is yes only when the count reaches the target.

| ID | Target | Result | Met? |
|---|---|---|---|
| G2 | 5 of 6 within 15 s, unaided | of 6 | |
| M1 + M2 | 5 of 6 unaided | of 6 | |
| R1 | 5 of 6 unaided | of 6 | |
| R2 | 5 of 6 unaided | of 6 | |
| G1 | 5 of 6 unaided on all six core tasks | of 6 | |
| R3 | Every touring participant; no misreadings | of ___ touring; ___ misreadings | |
| M5 | No wrong destination | ___ wrong destinations | |
| R4 | Observed in every session | of 6 | |
| B1 | Every iPhone session | of ___ iPhone sessions | |
| S1 | Record | of ___ who ran T14–T15 | — |
| S2 | Record | of ___ who ran T17–T18 | — |
| S3 | Record | of ___ who ran T16 | — |
| S4 | Record | of ___ members | — |
| S5 | Record | of ___ who ran T4 and T6 | — |
| S6 | Record | of ___ who ran T12–T13 | — |
| S7 | Record | of ___ who ran T19–T20 | — |
| M3 | Record | of ___ | — |
| M4 | Record | of ___ desktop sessions | — |
| C1 | Record | of ___ | — |
| H1 | Record | of 6 | — |
| Blockers open | None | | |
