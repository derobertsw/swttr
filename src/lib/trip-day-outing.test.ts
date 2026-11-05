import { describe, expect, it } from "vitest";
import { buildLodging } from "@/lib/trip-lodging";
import { isTripDayOuting, tripDayChanges, tripDayOutingFor, tripDayPlannedFor } from "@/lib/trip-day-outing";
import { savedOutfit } from "@/test/savedKit";
import { ORGANIZER, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import type { TripDay, TripFull, TripMember, TripMemberDayKit, TripStop } from "@/types/trips";

const SATURDAY: TripDay = { id: "day-1", trip_id: TRIP.id, stop_id: STOWE_STOP.id, date: "2026-10-10", activity: "Alpine" };
const SUNDAY: TripDay = { ...SATURDAY, id: "day-2", date: "2026-10-11" };
const JAY: TripStop = { ...STOWE_STOP, id: "stop-jay", position: 1, name: "Jay Peak", latitude: 44.94, longitude: -72.5 };
const ANA: TripMember = { ...ORGANIZER, id: "member-ana", user_id: "user-2", display_name: "Ana", role: "member" };
// Before the trip, with Saturday in the forecast window.
const NOW = Date.parse("2026-10-07T12:00:00Z");

const trip = (overrides: Partial<TripFull> = {}) =>
  tripFull({ stops: [STOWE_STOP, JAY], days: [SUNDAY, SATURDAY], members: [ORGANIZER, ANA], ...overrides });
const kit = (extra: Partial<TripMemberDayKit> = {}): TripMemberDayKit => ({
  id: "kit-1", trip_day_id: SATURDAY.id, trip_member_id: ORGANIZER.id, effort: "steady", items: [], note: null,
  state: "ok", updated_at: "2026-10-06T20:01:02Z", ...extra,
});

describe("A trip day as Gear up's outing (#335)", () => {
  it("plans the person's own kit for the day's activity at its stop, on the day's date from 9 AM", () => {
    expect(tripDayOutingFor(trip(), "user-1", "2026-10-10", "America/New_York", NOW)).toEqual({
      status: "ready",
      message: "",
      outing: {
        activity: "alpine_skiing",
        exertion: "moderate",
        place: { id: -1, name: "Stowe, Vermont", country: "", latitude: 44.47, longitude: -72.69, timeZone: "America/New_York" },
        when: { mode: "later", date: "2026-10-10", time: "09:00", durationDays: 1 },
      },
      context: {
        trip_id: TRIP.id, trip_name: "Whistler", date: "2026-10-10", day_number: 1, day_count: 2, member_id: ORGANIZER.id,
        planned: { day_id: "day-1", activity: "Alpine", stop: { id: STOWE_STOP.id, latitude: 44.47, longitude: -72.69 }, participation: "participating" },
      },
    });
    expect(tripDayOutingFor(trip(), "user-2", "2026-10-11", null, NOW)?.context).toMatchObject({ day_number: 2, member_id: ANA.id });
  });

  it("uses the stop's first activity on a day without one, and the trip's first stop on a day without a stop, as the day page does", () => {
    const full = trip({ days: [{ ...SATURDAY, stop_id: null, activity: null }], stops: [{ ...JAY, activities: ["Backcountry"] }] });
    const day = tripDayOutingFor(full, "user-1", "2026-10-10", null, NOW);
    expect(day?.outing).toMatchObject({ activity: "backcountry_skiing", place: { name: "Jay Peak", latitude: 44.94 } });
    expect(day?.outing?.place).not.toHaveProperty("timeZone");
  });

  it("starts at the day's meet time that morning, not one the evening before", () => {
    const at = (meet: Partial<TripDay>) => tripDayOutingFor(trip({ days: [{ ...SATURDAY, ...meet }] }), "user-1", "2026-10-10", null, NOW)?.outing?.when;
    expect(at({ meet_time: "06:45:00", meet_day_offset: 0 })).toMatchObject({ time: "06:45" });
    expect(at({ meet_time: "18:00:00", meet_day_offset: -1 })).toMatchObject({ time: "09:00" });
  });

  it("keeps the saved outfit's effort and XC details for the same activity, else the checklist's effort", () => {
    const xc = savedOutfit({ outing: { ...savedOutfit().outing, activity: "xc_skiing", exertion: "hard", outingPattern: "frequent_stops", xcExposure: "exposed" } });
    const xcDay = trip({ days: [{ ...SATURDAY, activity: "XC" }], kits: [kit({ effort: "easy", outfit: xc })] });
    expect(tripDayOutingFor(xcDay, "user-1", "2026-10-10", null, NOW)?.outing).toMatchObject({
      activity: "xc_skiing", exertion: "hard", outingPattern: "frequent_stops", xcExposure: "exposed",
    });
    // The day became a downhill day: the outfit was for another activity.
    const alpine = trip({ kits: [kit({ effort: "easy", outfit: xc })] });
    const outing = tripDayOutingFor(alpine, "user-1", "2026-10-10", null, NOW)?.outing;
    expect(outing).toMatchObject({ activity: "alpine_skiing", exertion: "easy" });
    expect(outing).not.toHaveProperty("outingPattern");
  });

  it.each([
    ["no activity", { days: [{ ...SATURDAY, activity: null }] }, NOW, "no_activity", "Choose an activity for this day to plan layers for it."],
    ["a Travel day", { days: [{ ...SATURDAY, activity: "Travel" }] }, NOW, "no_clothing", "Nothing to plan for a Travel day."],
    ["a sport without layers", { days: [{ ...SATURDAY, activity: "Surf" }] }, NOW, "unsupported", "Gear up can't plan layers for Surf yet. Mark what you'll bring below."],
    ["a stop without a location", { stops: [{ ...STOWE_STOP, latitude: null, longitude: null }] }, NOW, "no_destination", "Add a location to this day's destination to plan layers for it."],
    ["a day that's over there", {}, Date.parse("2026-10-11T04:30:00Z"), "past", "This day is over, so there's no forecast to plan layers from."],
    ["a day past the forecast", {}, Date.parse("2026-09-24T12:00:00Z"), "outside_forecast", "The forecast reaches this day on Sep 25. Plan layers then, or mark what you'll bring below."],
  ])("says why layers can't be planned for %s", (_case, overrides, now, status, message) => {
    const day = tripDayOutingFor(trip(overrides as Partial<TripFull>), "user-1", "2026-10-10", "America/New_York", now);
    expect(day).toMatchObject({ status, message, outing: null });
    expect(day?.context.trip_id).toBe(TRIP.id);
  });

  it("judges the forecast window and a past day on the destination's calendar", () => {
    // 9:30 PM Friday in Vermont is already Saturday in UTC.
    const friday = Date.parse("2026-10-10T01:30:00Z");
    expect(tripDayOutingFor(trip(), "user-1", "2026-10-09", "America/New_York", friday)).toBeNull();
    expect(tripDayOutingFor(trip({ days: [{ ...SATURDAY, date: "2026-10-09" }] }), "user-1", "2026-10-09", "America/New_York", friday)?.status).toBe("ready");
    expect(tripDayOutingFor(trip({ days: [{ ...SATURDAY, date: "2026-10-09" }] }), "user-1", "2026-10-09", null, friday)?.status).toBe("past");
    expect(tripDayOutingFor(trip(), "user-1", "2026-10-10", null, Date.parse("2026-09-25T00:00:00Z"))?.status).toBe("ready");
  });

  it("says when the person isn't taking part, by their trip dates", () => {
    const full = trip({ days: [SATURDAY] });
    full.lodging = buildLodging(TRIP, [], [], {
      members: full.members, per_member: true,
      attendance: [{ trip_id: TRIP.id, member_id: ORGANIZER.id, arrival_date: "2026-10-11", departure_date: null, skipped_dates: [] }],
    });
    expect(tripDayOutingFor(full, "user-1", "2026-10-10", null, NOW)).toMatchObject({
      status: "not_taking_part", message: "You're not on the trip this day, so there's no kit to plan.",
      context: { planned: { participation: "not_on_trip" } },
    });
  });

  it("is nothing for a day that isn't on the trip, or someone who isn't", () => {
    expect(tripDayOutingFor(trip(), "user-1", "2026-10-12", null, NOW)).toBeNull();
    expect(tripDayOutingFor(trip(), "user-3", "2026-10-10", null, NOW)).toBeNull();
    expect(tripDayOutingFor(trip({ members: [{ ...ORGANIZER, status: "left" }] }), "user-1", "2026-10-10", null, NOW)).toBeNull();
  });
});

describe("Saving layers planned for a trip day (#335)", () => {
  const planned = tripDayOutingFor(trip(), "user-1", "2026-10-10", null, NOW)!;

  it("takes only layers for the day's activity at its stop, whatever the effort or time", () => {
    const outing = planned.outing!;
    expect(isTripDayOuting({ ...outing, exertion: "hard", when: { ...outing.when, time: "13:00" } } as typeof outing, planned.context.planned)).toBe(true);
    expect(isTripDayOuting({ ...outing, activity: "hiking_snowshoeing" }, planned.context.planned)).toBe(false);
    expect(isTripDayOuting({ ...outing, place: { ...outing.place, latitude: 44.94 } }, planned.context.planned)).toBe(false);
    expect(isTripDayOuting(outing, { ...planned.context.planned, stop: null })).toBe(false);
  });

  it("finds nothing changed on the day as it was planned", () => {
    const now = tripDayPlannedFor(trip(), "user-1", "2026-10-10")!;
    expect(tripDayChanges(planned.context.planned, now.planned, now.stopName)).toEqual([]);
  });

  it("names each change since: the activity, the destination and the person's attendance", () => {
    const full = trip({ days: [{ ...SATURDAY, activity: "Hike", stop_id: JAY.id }] });
    full.lodging = buildLodging(TRIP, [], [], {
      members: full.members, per_member: true,
      attendance: [{ trip_id: TRIP.id, member_id: ORGANIZER.id, arrival_date: null, departure_date: null, skipped_dates: ["2026-10-10"] }],
    });
    const now = tripDayPlannedFor(full, "user-1", "2026-10-10")!;
    expect(tripDayChanges(planned.context.planned, now.planned, now.stopName)).toEqual([
      "Activity changed to Hike.",
      "Destination changed to Jay Peak.",
      "You're no longer taking part this day.",
    ]);
  });

  it("counts a stop moved to another place, a cleared activity and a removed day", () => {
    const moved = tripDayPlannedFor(trip({ days: [{ ...SATURDAY, activity: null }], stops: [{ ...STOWE_STOP, latitude: 44.5 }, JAY] }), "user-1", "2026-10-10")!;
    expect(tripDayChanges(planned.context.planned, moved.planned, moved.stopName)).toEqual([
      "The day's activity was cleared.", "Destination changed to Stowe, Vermont.",
    ]);
    const readded = tripDayPlannedFor(trip({ days: [{ ...SATURDAY, id: "day-9" }] }), "user-1", "2026-10-10")!;
    expect(tripDayChanges(planned.context.planned, readded.planned, readded.stopName)).toEqual(["This day was removed from the trip, or its dates changed."]);
    expect(tripDayChanges(planned.context.planned, null, null)).toEqual(["This day was removed from the trip, or its dates changed."]);
  });
});
