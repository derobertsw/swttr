import "server-only";
import { dateLabel, isUuid, shiftDate } from "@/lib/trip-lodging";
import { isTimeZone, zonedTimeToInstant } from "@/lib/timeZones";
import type { TripDay, TripDayMeet } from "@/types/trips";

/** A meet time as the organizer sets it on a day (#333): see docs/trip-locations.md#meet-time. */
interface TripDayMeetEdit {
  /** The day the editor opened for: after a date change another day can hold the date. */
  day_id: string;
  /** "HH:MM" on the destination's clock, or null to clear it. */
  meet_time: string | null;
  meet_day_offset: -1 | 0;
  /** The day's meet time as the editor showed it. */
  expected: { meet_time: string | null; meet_day_offset: -1 | 0 };
}

/** "HH:MM" from "HH:MM" or "HH:MM:00", null for no time, undefined for anything else. */
export const clockTime = (value: unknown): string | null | undefined => value == null || value === "" ? null
  : typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(value) ? value.slice(0, 5) : undefined;

const minutesOf = (time: string, offset: number) => offset * 1440 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Whether a return target comes after the meet; true while either has no time. */
export function returnsAfterMeet(meet: { time: string | null | undefined; offset: number }, back: { time: string | null | undefined; offset: number }): boolean {
  return !meet.time || !back.time || minutesOf(back.time, back.offset) > minutesOf(meet.time, meet.offset);
}

const clock = (time: string) => new Date(Date.UTC(2000, 0, 1, Number(time.slice(0, 2)), Number(time.slice(3, 5))))
  .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/** "6:30 AM MDT · Sat Oct 10", on the destination's clock; its zone's abbreviation for that date when known. */
export function timeLabel(date: string, time: string | null, offset: number, zone: string | null): string | null {
  if (!time) return null;
  const day = shiftDate(date, offset);
  let suffix = "destination time";
  if (zone) {
    const instant = zonedTimeToInstant(`${day}T${time.slice(0, 5)}`, zone);
    suffix = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? zone;
  }
  const relative = offset < 0 ? ", the day before" : offset > 0 ? ", the day after" : "";
  return `${clock(time.slice(0, 5))} ${suffix} · ${dateLabel(day)}${relative}`;
}

/** A tour plan's meet columns, which days read only before migration 20261024230000. */
type LegacyMeet = { trip_day_id: string; meet_time?: string | null; meet_day_offset?: number; time_zone: string | null };

/**
 * Each day's meet time with its labels, in the days' order. Before migration
 * 20261024230000 days have no meet columns, so a day reads its tour plan's
 * meet time, as the migration copies it.
 */
export function buildDayMeets(days: TripDay[], plans: LegacyMeet[]): TripDayMeet[] {
  return days.flatMap((day) => {
    const legacy = "meet_time" in day ? undefined : plans.find((plan) => plan.trip_day_id === day.id);
    const time = legacy ? legacy.meet_time : day.meet_time;
    if (!time) return [];
    const offset = (legacy ? legacy.meet_day_offset : day.meet_day_offset) === -1 ? -1 : 0;
    const saved = legacy ? legacy.time_zone : day.meet_time_zone;
    const zone = saved && isTimeZone(saved) ? saved : null;
    return [{
      date: day.date,
      meet_label: timeLabel(day.date, time, offset, zone)!,
      time_zone_label: zone ? `Local time at the destination (${zone}).`
        : "Local time at the destination. Its time zone wasn't confirmed when the meet time was saved.",
    }];
  });
}

/** The organizer's meet time for a day, or what to fix. */
export function parseDayMeetEdit(value: unknown): TripDayMeetEdit | { error: string; field?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Invalid request." };
  const input = value as Record<string, unknown>;
  const time = clockTime(input.meet_time);
  if (time === undefined) return { error: "Choose a valid meet time.", field: "meet_time" };
  const offset = input.meet_day_offset ?? 0;
  if (offset !== 0 && offset !== -1) return { error: "Choose the day you meet.", field: "meet_day_offset" };
  const expected = input.expected as Record<string, unknown> | null | undefined;
  const seenTime = clockTime(expected?.meet_time);
  if (!isUuid(input.day_id) || !expected || typeof expected !== "object" || seenTime === undefined
    || (expected.meet_day_offset !== 0 && expected.meet_day_offset !== -1)) {
    return { error: "Reload the trip before changing the meet time." };
  }
  return {
    day_id: input.day_id,
    meet_time: time,
    meet_day_offset: time ? offset : 0,
    expected: { meet_time: seenTime, meet_day_offset: expected.meet_day_offset },
  };
}
