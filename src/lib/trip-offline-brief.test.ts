import { describe, expect, it } from "vitest";
import { buildOfflineBrief, defaultBriefDates, parseBriefDates } from "@/lib/trip-offline-brief";
import { buildLodging } from "@/lib/trip-lodging";
import { dayStarts } from "@/lib/trip-drive";
import { tripFullFor } from "@/lib/trips";
import { planDay, savedOutfit, savedPlan, WEAR } from "@/test/savedKit";
import type {
  TripDay, TripDayConditionsSource, TripDriveDay, TripDriveEstimates, TripFull, TripLocation, TripMember, TripStay,
  TripTourPlanSummary,
} from "@/types/trips";

const SAT = "2027-02-13", SUN = "2027-02-14", MON = "2027-02-15";
const NOW = Date.parse("2027-02-10T12:00:00Z");
// The labels are on the destination's clock, from the IANA rules Node ships.
// Rogers Pass is in British Columbia, which tzdata 2026b moved to permanent
// UTC-7, so America/Vancouver's February offset depends on the Node release
// (PST in 2026a, -07 from 2026b). A zone whose winter rules aren't changing
// keeps the expected labels the same everywhere.
const ZONE = "America/Los_Angeles";
const lot: TripLocation = {
  label: "Rogers Pass lot", address: "Trans-Canada Hwy, Glacier National Park", latitude: 51.301234, longitude: -117.52, precision: "exact",
  time_zone: ZONE, source: "search", provider: "geoapify", provider_id: "p-1", attribution: "© OpenStreetMap contributors",
};
const trip = { id: "trip-1", owner_user_id: "user-org", name: "Rogers Pass", start_date: SAT, end_date: MON, status: "planning",
  created_at: "2027-01-01T00:00:00Z", updated_at: "2027-01-01T00:00:00Z" } as TripFull["trip"];
const member = (id: string, name: string, user: string | null, extra: Partial<TripMember> = {}): TripMember => ({
  id, trip_id: trip.id, user_id: user, display_name: name, role: "member", status: "joined", invite_token: null, created_at: "2027-01-01T00:00:00Z", ...extra,
});
const members = [
  member("m-org", "You", "user-org", { role: "organizer" }),
  member("m-ana", "Ana", "user-ana", { created_at: "2027-01-02T00:00:00Z" }),
  member("m-ivy", "Ivy", null, { status: "invited", invite_token: "secret-invite-token", created_at: "2027-01-03T00:00:00Z" }),
];
const day = (id: string, date: string, activity: string | null, extra: Partial<TripDay> = {}): TripDay =>
  ({ id, trip_id: trip.id, stop_id: "stop-1", date, activity, ...extra });
const inn: TripStay = {
  id: "stay-inn", trip_id: trip.id, name: "Glacier Park Lodge", check_in: "2027-02-12", check_out: MON, type: "hotel",
  address: "Rogers Pass", property_url: "https://booking.example/confirm?code=SECRET123", check_in_time: "16:00:00", check_out_time: "10:00:00",
  notes: "Door code 4321", booking_status: "booked", location: { ...lot, label: "Glacier Park Lodge", latitude: 51.3, longitude: -117.51 },
  created_at: "", updated_at: "",
};
const plan = {
  id: "plan-1", trip_id: trip.id, trip_day_id: "day-sat", date: SAT, objective: "Asulkan Valley", route_url: "https://example.com/asulkan",
  distance: 12, distance_unit: "km", ascent: 1100, ascent_unit: "m", duration_minutes: 390, metrics_source: null, metrics_source_url: null,
  approach_notes: "Skin the old road", access_notes: null, access_url: null, backup_plan: "Glacier Crest trees", return_time: "15:00:00",
  return_day_offset: 0, checkin_notes: "Text Sam by 4", pickup_notes: null, time_zone: ZONE, revision: 3,
  created_by: "user-org", updated_by: "user-org", created_at: "", updated_at: "2027-02-08T00:00:00Z",
  return_label: "3:00 PM PST · Sat Feb 13", metrics_label: "12 km · 1,100 m ascent · 6 h 30 min", metrics_source_label: "Crew estimate",
  time_zone_label: "Rogers Pass time (PST)", updated_label: "Last changed Mon Feb 8 by the organizer",
} as TripTourPlanSummary;
const source = (reviews: TripDayConditionsSource["reviews"]): TripDayConditionsSource => ({
  id: "src-1", trip_id: trip.id, category: "avalanche", name: "Avalanche Canada", region: "Glacier", url: "https://avalanche.ca/forecasts",
  revision: 1, created_by: "user-org", updated_by: "user-org", created_at: "", updated_at: "", date: SAT, trip_day_id: "day-sat",
  context_key: "ctx", reviews,
});
const review = (user: string, at: string, stale: string[] = [], note: string | null = null) => ({
  user_id: user, stale_reasons: stale, history: [],
  current: { id: `r-${user}`, action: "reviewed" as const, note, reviewed_at: at, created_at: at },
});
const driveRoute = (memberIds: string[], crew: boolean, duration: string) => ({
  date: SAT, date_label: "Sat Feb 13", night_label: "Fri Feb 12", state: "available" as const,
  origin: { label: crew ? "Glacier Park Lodge" : "Golden motel", stay_id: null, own: false }, crew_stay: null,
  destination: { label: "Rogers Pass lot" },
  estimate: { duration_label: duration, distance_label: "3 mi", calculated_at: "2027-02-09T08:00:00Z", age_label: "1 day ago", stale: false },
  manual: null, obsolete: [], previous: null, pair_key: "pair", same_drive_dates: [SAT], closures: [],
  directions: { apple: "https://maps.apple.com/?daddr=51.3", google: "https://www.google.com/maps/dir/?api=1" },
  key: crew ? "stay:stay-inn" : "place:51.2,-117", label: crew ? "Glacier Park Lodge" : "Golden motel", member_ids: memberIds, own_member_ids: [], crew,
});
const drive = (): TripDriveEstimates => {
  const crew = driveRoute(["m-ana"], true, "5 min");
  return { days: [{ ...crew, departures: [crew, driveRoute(["m-org"], false, "45 min")] } as TripDriveDay], stays: [] };
};

function fullTrip(extra: Partial<TripFull> = {}): TripFull {
  const days = [
    day("day-sat", SAT, "Backcountry", { meet_time: "06:30:00", meet_day_offset: 0, notes: "Park at the far end" }),
    day("day-sun", SUN, "Alpine"),
    day("day-mon", MON, "Travel"),
  ];
  return {
    trip, members, days,
    stops: [{ id: "stop-1", trip_id: trip.id, position: 0, name: "Rogers Pass", latitude: 51.3, longitude: -117.52, activities: [], created_at: "", access_point: lot }],
    kits: [
      { id: "kit-org", trip_day_id: "day-sat", trip_member_id: "m-org", effort: "hard", items: [], note: null, state: "ok", updated_at: "", outfit: savedOutfit(), outfit_saved_at: "2027-02-09T20:00:00Z" },
      { id: "kit-ana", trip_day_id: "day-sat", trip_member_id: "m-ana", effort: "easy", items: ["shell"], note: "Ana's private note", state: "warn", updated_at: "" },
    ],
    gear: [
      { id: "g-1", trip_id: trip.id, description: "Group first aid kit", assignee_member_id: "m-ana", sort_order: 0, created_at: "", accepted_at: "2027-02-01T00:00:00Z", packed_at: null },
      { id: "g-2", trip_id: trip.id, description: "Repair kit", assignee_member_id: "m-org", sort_order: 1, created_at: "", accepted_at: null, packed_at: null },
      { id: "g-3", trip_id: trip.id, description: "Group shelter", assignee_member_id: null, sort_order: 2, created_at: "" },
    ],
    lodging: buildLodging(trip, [inn], [
      { trip_id: trip.id, date: "2027-02-12", stay_id: inn.id, status: "assigned" },
      { trip_id: trip.id, date: SAT, stay_id: inn.id, status: "assigned" },
      { trip_id: trip.id, date: SUN, stay_id: inn.id, status: "assigned" },
    ], { members }),
    tour_plans: [plan],
    meets: [{ date: SAT, meet_label: "6:30 AM PST · Sat Feb 13", time_zone_label: "Rogers Pass time (PST)" }],
    conditions: [source([review("user-ana", "2027-02-12T15:00:00Z", ["Route changed"], "Considerable above treeline"), review("user-org", "2027-02-12T16:30:00Z")])],
    day_checks: [{ date: SAT, trip_day_id: "day-sat", plan_available: true, checks: [
      { kind: "plan_review", member_id: "m-org", status: "recorded", current: { id: "c-1", action: "recorded", recorded_by: "user-org", created_at: "", time_label: "8:00 PM PST · Fri Feb 12", plan_revision: 3 }, history: [], stale_reasons: [], can_record: true, context_key: "k" },
      { kind: "plan_review", member_id: "m-ana", status: "out_of_date", current: null, history: [], stale_reasons: ["Backup plan changed"], can_record: false, context_key: null },
    ] }],
    ...extra,
  };
}

const equipment = {
  dates: [SAT],
  items: [
    { id: "transceiver", name: "Avalanche transceiver", tier: "suggested" as const, purpose: "", key: "equipment:transceiver", quantity: 1 },
    { id: "probe", name: "Avalanche probe", tier: "suggested" as const, purpose: "", key: "equipment:probe", quantity: 2 },
  ],
  checks: { "equipment:transceiver": { packed: true, quantity: 1, version: "00000000-0000-4000-8000-000000000000" } },
};

const briefFor = (userId: string, dates = [SAT, SUN, MON], extra: Partial<TripFull> = {}, now = NOW) =>
  buildOfflineBrief({ full: tripFullFor(fullTrip(extra), userId), userId, dates, drive: drive(), equipment, now });

describe("A member's offline trip brief (#214)", () => {
  it("opens with the trip, the days it covers and when it was saved", () => {
    const brief = briefFor("user-org");
    expect(brief).toMatchObject({
      version: 1, kind: "swttr.trip-offline-brief",
      trip: { id: trip.id, name: "Rogers Pass", dates_label: "Sat Feb 13 – Mon Feb 15" },
      viewer: { user_id: "user-org", member_id: "m-org" },
      covered: { dates: [SAT, SUN, MON], label: "Sat Feb 13 – Mon Feb 15" },
      saved_at: "2027-02-10T12:00:00.000Z",
    });
    expect(brief.days.map((d) => [d.date_label, d.position_label, d.activity_label])).toEqual([
      ["Sat Feb 13", "Day 1 of 3", "Backcountry skiing"], ["Sun Feb 14", "Day 2 of 3", "Downhill skiing"], ["Mon Feb 15", "Day 3 of 3", "Travel"],
    ]);
  });

  it("keeps the day's logistics: meet, the confirmed access point's coordinates, notes, the member's own drive and tonight's stay", () => {
    const [sat] = briefFor("user-org").days;
    expect(sat.meet).toEqual({ label: "6:30 AM PST · Sat Feb 13", time_zone_label: "Rogers Pass time (PST)" });
    expect(sat.meeting_point).toMatchObject({ label: "Rogers Pass lot", coordinates: "51.301234, -117.520000", precision_label: "Exact location" });
    expect(sat.notes).toBe("Park at the far end");
    expect(sat.starting_from).toEqual({ yours: "Glacier Park Lodge", crew: null });
    // Their own departure, not the crew's, with the provider's credit and no age that would date it.
    expect(sat.getting_there).toMatchObject({
      from: "Golden motel", to: "Rogers Pass lot", summary: "45 min · 3 mi by road",
      detail: "Calculated Tue Feb 9 · typical traffic, not live", credit: "Powered by Geoapify · © OpenStreetMap contributors",
    });
    expect(sat.getting_there?.directions.map((link) => link.label)).toEqual(["Directions in Apple Maps", "Directions in Google Maps"]);
    expect(sat.tonight).toMatchObject({
      yours: "Glacier Park Lodge",
      stay: { name: "Glacier Park Lodge", booking_label: "Booked", times_label: "Check-in from 16:00 · Check-out by 10:00 · property local time" },
    });
  });

  it("says where the member starts as the day's departures do: their own starting point, or the day's own", () => {
    const golden: TripLocation = { ...lot, label: "Golden motel", latitude: 51.29, longitude: -116.96 };
    const cabin: TripLocation = { ...lot, label: "Ridge cabin", latitude: 51.31, longitude: -117.5 };
    const trip = fullTrip();
    trip.days = trip.days.map((entry) => entry.date === SUN ? { ...entry, origin: cabin, origin_stay_id: null } : entry);
    trip.member_origins = [{ trip_id: trip.trip.id, trip_day_id: "day-sat", member_id: "m-org", origin: golden, origin_stay_id: null, no_drive: false }];
    trip.starts = dayStarts(trip);
    const brief = (userId: string) => buildOfflineBrief({ full: tripFullFor(trip, userId), userId, dates: [SAT, SUN], drive: drive(), equipment, now: NOW });

    // Saturday: the organizer starts from a place of their own; Ana from the lodge, where she slept.
    const [orgSat, orgSun] = brief("user-org").days;
    expect(orgSat.starting_from).toEqual({ yours: "Golden motel · only this day", crew: "Glacier Park Lodge (1) · Golden motel (1)" });
    expect(brief("user-ana").days[0].starting_from).toEqual({ yours: "Glacier Park Lodge", crew: "Glacier Park Lodge (1) · Golden motel (1)" });
    // Sunday: the day's own starting point, for everyone.
    expect(orgSun.starting_from).toEqual({ yours: "Ridge cabin · only this day", crew: null });
  });

  it("keeps a member's own night with no stay, rather than the crew's stay", () => {
    const trip = fullTrip();
    const org = trip.lodging!.people.find((person) => person.member_id === "m-org")!;
    org.days = org.days.map((entry) => entry.date === SAT ? { ...entry, tonight_stay_id: null, staying_tonight: "No accommodation needed" } : entry);
    const [sat] = buildOfflineBrief({ full: tripFullFor(trip, "user-org"), userId: "user-org", dates: [SAT], drive: drive(), equipment, now: NOW }).days;
    expect(sat.tonight).toMatchObject({ yours: "No accommodation needed", crew: "Glacier Park Lodge", stay: null });
  });

  it("keeps the tour plan, conditions sources with dated reviews, and the member's day checks", () => {
    const [sat] = briefFor("user-org").days;
    expect(sat.tour_plan).toMatchObject({
      objective: "Asulkan Valley", backup_plan: "Glacier Crest trees", return_label: "Back by 3:00 PM PST · Sat Feb 13",
      approach_notes: "Skin the old road", checkin_notes: "Text Sam by 4", metrics: "12 km · 1,100 m ascent · 6 h 30 min · Crew estimate",
      links: [{ label: "Route link", url: "https://example.com/asulkan" }],
    });
    expect(sat.conditions).toEqual([{
      category_label: "Avalanche forecast", name: "Avalanche Canada", region: "Glacier",
      link: { label: "Open avalanche forecast", url: "https://avalanche.ca/forecasts" },
      your_review: null,
      reviews: [
        { who: "You", label: "Reviewed 8:30 AM PST · Fri Feb 12", note: null, stale: null },
        { who: "Ana", label: "Reviewed 7:00 AM PST · Fri Feb 12", note: "Considerable above treeline", stale: "Reviewed before the plan changed: Route changed" },
      ],
    }]);
    expect(sat.day_checks).toEqual([{ label: "Tour and backup plan reviewed", status_label: "Recorded 8:00 PM PST · Fri Feb 12" }]);
  });

  it("holds only the member's own kit and equipment, as packed when saved", () => {
    const org = briefFor("user-org");
    expect(org.days[0].kit).toMatchObject({ kind: "outfit", summary: "Outfit · Personalized · saved Tue Feb 9 for the forecast then" });
    expect(org.days[0].kit?.kind === "outfit" && org.days[0].kit.parts[0].wear).toEqual([
      { area: "Upper body", items: ["Merino crew", "Fleece", "Ski shell"] },
      { area: "Legs", items: ["Long johns", "Ski pants"] },
      { area: "Hands", items: ["Insulated gloves"] },
    ]);
    expect(org.days[0].equipment).toEqual([
      { name: "Avalanche transceiver", quantity: 1, status_label: "Packed" },
      { name: "Avalanche probe", quantity: 2, status_label: "Not packed yet" },
    ]);
    const ana = briefFor("user-ana");
    expect(ana.days[0].kit).toEqual({ kind: "checklist", summary: "Checklist · Easy effort · flagged: needs help", items: ["Shell"] });
    expect(JSON.stringify(ana)).not.toContain("Merino crew");
    expect(JSON.stringify(org)).not.toContain("Ana's private note");
  });

  it("leaves out invitation links, stay notes, booking links and anything another member keeps private", () => {
    for (const user of ["user-org", "user-ana"]) {
      const text = JSON.stringify(briefFor(user));
      for (const secret of ["secret-invite-token", "Door code 4321", "SECRET123", "context_key", "ctx"]) expect(text).not.toContain(secret);
    }
    expect(briefFor("user-org").contents.omitted).toEqual(expect.arrayContaining([
      "Weather forecasts: check the forecast when you have a connection.",
      "Maps and route lines: the copy has place names, addresses and coordinates, not a map.",
      "Stay notes and booking links.",
      "Invitation links.",
    ]));
  });

  it("lists crew-visible shared gear with who's bringing it, the member's own first", () => {
    expect(briefFor("user-ana").shared_gear).toEqual([
      { description: "Group first aid kit", assignee: "You", status_label: "Accepted · not packed", mine: true },
      { description: "Repair kit", assignee: "Organizer", status_label: "Awaiting acceptance", mine: false },
      { description: "Group shelter", assignee: "Unassigned", status_label: null, mine: false },
    ]);
  });

  it("says what each day doesn't have yet, so a logistics-only brief isn't read as complete", () => {
    const brief = briefFor("user-org", [SAT, SUN, MON], { meets: [], tour_plans: [], conditions: [], kits: [] });
    expect(brief.days[0].missing).toEqual(["No meet time set", "No tour plan saved", "No official conditions sources added", "No kit saved"]);
    expect(brief.days[0].kit).toEqual({ kind: "none", summary: "No kit saved for this day." });
    // Travel days have nothing to wear to plan, and needn't have a meet.
    expect(brief.days[2]).toMatchObject({ kit: null, missing: [] });
    expect(brief.contents.absent).toContain("Sat Feb 13: No meet time set, No tour plan saved, No official conditions sources added, No kit saved");
    expect(brief.contents.included[0]).toBe("Day logistics for 3 days: meet, where you start, getting there and tonight's stay");
  });

  it("covers only the chosen days, and names chosen days the trip no longer has", () => {
    const brief = briefFor("user-org", [SUN, "2027-02-20"]);
    expect(brief.covered).toEqual({ dates: [SUN], label: "Sun Feb 14" });
    expect(brief.contents.absent).toContain("Sat Feb 20: no longer a day of this trip");
  });

  it("changes revision when the brief would change, not when it's only saved again or a drive time is recalculated", () => {
    const first = briefFor("user-org");
    expect(briefFor("user-org", undefined, {}, NOW + 3_600_000).revision).toBe(first.revision);
    const recalculated = drive();
    recalculated.days[0].departures[1].estimate!.calculated_at = "2027-02-10T09:00:00Z";
    expect(buildOfflineBrief({ full: tripFullFor(fullTrip(), "user-org"), userId: "user-org", dates: [SAT, SUN, MON], drive: recalculated, equipment, now: NOW }).revision).toBe(first.revision);
    expect(briefFor("user-org", undefined, { tour_plans: [{ ...plan, backup_plan: "Bald Mountain" }] }).revision).not.toBe(first.revision);
    // Each member's brief is their own.
    expect(briefFor("user-ana").revision).not.toBe(first.revision);
  });

  it("changes revision when the organizer changes only the note on their own drive estimate", () => {
    const manual = (note: string) => {
      const estimates = drive();
      const mine = estimates.days[0].departures[1];
      Object.assign(mine, { state: "manual", manual: {
        pair_key: "pair", duration_label: "50 min", duration_seconds: 3000, note, entered_at: "2027-02-09T08:00:00Z",
        origin_label: "Golden motel", destination_label: "Rogers Pass lot", current: true, use_calculated: false, dates: [SAT],
      } });
      return buildOfflineBrief({ full: tripFullFor(fullTrip(), "user-org"), userId: "user-org", dates: [SAT], drive: estimates, equipment, now: NOW });
    };
    const before = manual("Chains required past Golden");
    expect(before.days[0].getting_there).toMatchObject({ summary: "50 min · the organizer's estimate", detail: "Chains required past Golden · Entered Tue Feb 9" });
    expect(manual("Road open, no chains").revision).not.toBe(before.revision);
    expect(manual("Chains required past Golden").revision).toBe(before.revision);
  });

  it("changes revision when a calculated drive time goes stale", () => {
    const withState = (state: "available" | "stale") => {
      const estimates = drive();
      Object.assign(estimates.days[0].departures[1], { state });
      return buildOfflineBrief({ full: tripFullFor(fullTrip(), "user-org"), userId: "user-org", dates: [SAT], drive: estimates, equipment, now: NOW });
    };
    const fresh = withState("available");
    const stale = withState("stale");
    expect(stale.days[0].getting_there?.detail).toBe("Calculated Tue Feb 9 · typical traffic, not live · not updated since");
    expect(stale.revision).not.toBe(fresh.revision);
  });

  it("keeps a plan day's layers, and each part of the day that wears something else", () => {
    const shell = { name: "Wind shell", rcl: 0.2, sourceId: "g-9" };
    const evening = { ...WEAR, torso: { ...WEAR.torso, outer: [...WEAR.torso.outer, shell] } };
    const day = planDay(SAT, {
      dayparts: planDay(SAT).dayparts.map((part) => part.id === "evening" ? { ...part, recommendation: evening } : part),
    });
    const plan = savedPlan();
    const kit = { version: 1 as const, kind: "plan_day" as const, outing: plan.outing, startHour: 6, endHour: 21, day };
    const trip = fullTrip();
    trip.kits = [{ id: "kit-org", trip_day_id: "day-sat", trip_member_id: "m-org", effort: "steady", items: [], note: null, state: "ok", updated_at: "", outfit: kit }];
    const [sat] = buildOfflineBrief({ full: tripFullFor(trip, "user-org"), userId: "user-org", dates: [SAT], drive: drive(), equipment, now: NOW }).days;
    // The morning wears the day's layers, so only the evening is listed with them.
    expect(sat.kit?.kind === "outfit" && sat.kit.parts.map((part) => [part.label, part.wear[0].items])).toEqual([
      ["Day", ["Merino crew", "Fleece", "Ski shell"]],
      ["Evening", ["Merino crew", "Fleece", "Ski shell", "Wind shell"]],
    ]);
  });

  it("says when drive times or equipment couldn't be read rather than leaving them out silently", () => {
    const brief = buildOfflineBrief({ full: tripFullFor(fullTrip(), "user-org"), userId: "user-org", dates: [SAT], drive: null, equipment: null, now: NOW });
    expect(brief.days[0]).toMatchObject({ getting_there: null, equipment: [] });
    expect(brief.contents.absent).toEqual(expect.arrayContaining([
      "Drive times couldn't be read, so they aren't in this copy",
      "Your touring equipment couldn't be read, so it isn't in this copy",
    ]));
  });
});

describe("Choosing the brief's days", () => {
  it("reads ?dates= as sorted, unique calendar dates, and refuses anything else", () => {
    expect(parseBriefDates(null)).toEqual([]);
    expect(parseBriefDates(`${SUN},${SAT},${SAT}`)).toEqual([SAT, SUN]);
    expect(parseBriefDates("")).toBeNull();
    expect(parseBriefDates("2027-02-30")).toBeNull();
    expect(parseBriefDates("tomorrow")).toBeNull();
    expect(parseBriefDates(Array.from({ length: 63 }, () => SAT).join(","))).toBeNull();
  });

  it("defaults to the days from today at the destination on, or every day once the trip is over", () => {
    const full = fullTrip();
    expect(defaultBriefDates(full, NOW)).toEqual([SAT, SUN, MON]);
    expect(defaultBriefDates(full, Date.parse("2027-02-14T20:00:00Z"))).toEqual([SUN, MON]);
    expect(defaultBriefDates(full, Date.parse("2027-03-01T00:00:00Z"))).toEqual([SAT, SUN, MON]);
  });
});
