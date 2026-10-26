import { describe, expect, it } from "vitest";
import { buildDayMeets, parseDayMeetEdit, returnsAfterMeet } from "@/lib/trip-meets";
import type { TripDay } from "@/types/trips";

const DAY_ID = "4c1d7a2e-9a51-4f5e-8f0a-2b3c4d5e6f70";
const day = (date: string, extra: Partial<TripDay> = {}): TripDay => ({
  id: `day-${date}`, trip_id: "trip-1", stop_id: null, date, activity: "Alpine",
  meet_time: null, meet_day_offset: 0, meet_time_zone: null, ...extra,
});

describe("buildDayMeets", () => {
  it("labels each day's meet time on the destination's clock, for every sport", () => {
    expect(buildDayMeets([
      day("2026-10-09"),
      day("2026-10-10", { meet_time: "08:30:00", meet_time_zone: "America/New_York" }),
      day("2026-10-11", { activity: "Backcountry", meet_time: "18:00:00", meet_day_offset: -1, meet_time_zone: "America/New_York" }),
    ], [])).toEqual([
      { date: "2026-10-10", meet_label: "8:30 AM EDT · Sat Oct 10", time_zone_label: "Local time at the destination (America/New_York)." },
      { date: "2026-10-11", meet_label: "6:00 PM EDT · Sat Oct 10, the day before", time_zone_label: "Local time at the destination (America/New_York)." },
    ]);
  });

  it("uses that date's abbreviation and says when the time zone wasn't confirmed", () => {
    // US daylight saving ends on Sunday November 1, 2026.
    expect(buildDayMeets([day("2026-11-01", { meet_time: "07:00:00", meet_time_zone: "America/Denver" })], [])[0].meet_label)
      .toBe("7:00 AM MST · Sun Nov 1");
    expect(buildDayMeets([day("2026-10-10", { meet_time: "07:00:00", meet_time_zone: "Not/AZone" })], [])[0]).toEqual({
      date: "2026-10-10", meet_label: "7:00 AM destination time · Sat Oct 10",
      time_zone_label: "Local time at the destination. Its time zone wasn't confirmed when the meet time was saved.",
    });
  });

  it("ignores tour plans' meet times once days have their own", () => {
    const plan = { trip_day_id: "day-2026-10-10", meet_time: "06:00:00", meet_day_offset: 0, time_zone: "America/New_York" };
    expect(buildDayMeets([day("2026-10-10")], [plan])).toEqual([]);
  });

  it("reads the tour plan's meet time before the migration, as it copies it", () => {
    const legacy = { id: "day-2026-10-10", trip_id: "trip-1", stop_id: null, date: "2026-10-10", activity: "Alpine" };
    const plan = { trip_day_id: "day-2026-10-10", meet_time: "18:00:00", meet_day_offset: -1, time_zone: "America/New_York" };
    expect(buildDayMeets([legacy], [plan])).toEqual([
      { date: "2026-10-10", meet_label: "6:00 PM EDT · Fri Oct 9, the day before", time_zone_label: "Local time at the destination (America/New_York)." },
    ]);
    expect(buildDayMeets([legacy], [{ ...plan, meet_time: null }])).toEqual([]);
  });
});

describe("parseDayMeetEdit", () => {
  const body = { day_id: DAY_ID, meet_time: "06:30", meet_day_offset: 0, expected: { meet_time: null, meet_day_offset: 0 } };

  it("takes a time on the day or the evening before, and what the editor showed", () => {
    expect(parseDayMeetEdit(body)).toEqual(body);
    expect(parseDayMeetEdit({ ...body, meet_time: "18:00:00", meet_day_offset: -1, expected: { meet_time: "06:30:00", meet_day_offset: 0 } }))
      .toEqual({ ...body, meet_time: "18:00", meet_day_offset: -1, expected: { meet_time: "06:30", meet_day_offset: 0 } });
  });

  it("clears it with no time, on the day", () => {
    expect(parseDayMeetEdit({ ...body, meet_time: null, meet_day_offset: -1 })).toEqual({ ...body, meet_time: null, meet_day_offset: 0 });
  });

  it.each([
    [{ ...body, meet_time: "24:00" }, "meet_time"],
    [{ ...body, meet_time: 630 }, "meet_time"],
    [{ ...body, meet_day_offset: 1 }, "meet_day_offset"],
  ])("names the field to fix (%#)", (input, field) => {
    expect(parseDayMeetEdit(input)).toMatchObject({ field });
  });

  it.each([
    null, [], { ...body, day_id: "day-1" }, { ...body, expected: undefined },
    { ...body, expected: { meet_time: "6:30", meet_day_offset: 0 } }, { ...body, expected: { meet_time: null } },
  ])("asks for a reload without the day as the editor showed it (%#)", (input) => {
    expect(parseDayMeetEdit(input)).toEqual({ error: expect.any(String) });
  });
});

describe("returnsAfterMeet", () => {
  it("compares the times with their day offsets", () => {
    expect(returnsAfterMeet({ time: "08:00", offset: 0 }, { time: "07:30", offset: 0 })).toBe(false);
    expect(returnsAfterMeet({ time: "08:00", offset: 0 }, { time: "08:00", offset: 0 })).toBe(false);
    expect(returnsAfterMeet({ time: "08:00", offset: 0 }, { time: "07:00", offset: 1 })).toBe(true);
    expect(returnsAfterMeet({ time: "18:00:00", offset: -1 }, { time: "09:00:00", offset: 0 })).toBe(true);
  });

  it("is true while either has no time", () => {
    expect(returnsAfterMeet({ time: null, offset: 0 }, { time: "07:00", offset: 0 })).toBe(true);
    expect(returnsAfterMeet({ time: "08:00", offset: 0 }, { time: undefined, offset: 0 })).toBe(true);
  });
});
