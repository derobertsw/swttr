import "server-only";
import { DEFAULT_EXERTION_LEVEL, type ExertionLevel } from "@/lib/biophysics/exertion";
import { addDaysToDateString, FORECAST_DAYS } from "@/lib/forecastRange";
import { formatZonedTime, isTimeZone } from "@/lib/timeZones";
import { tripActivityLabel, tripActivityNeedsClothing, tripActivityToRecommendationKey } from "@/lib/trip-activities";
import { dayTimeZone } from "@/lib/trip-day-checks";
import { hasTripCoordinates, resolveTripStop } from "@/lib/trip-forecast";
import { lookupTimeZone } from "@/lib/trip-tour-plans";
import type { Outing } from "@/types/outing";
import type { TripDayOuting, TripDayOutingStatus, TripDayPlanned } from "@/types/trip-day-outing";
import type { TripDay, TripEffort, TripFull } from "@/types/trips";

/** When the outing starts on a day without a meet time that morning. */
const DEFAULT_START = "09:00";
/** A trip stop as Gear up's place: not a geocoded place (positive ids) or the device's own (0). */
const TRIP_STOP_PLACE_ID = -1;
const EXERTION: Record<TripEffort, ExertionLevel> = { easy: "easy", steady: "moderate", hard: "hard" };

/** "Nov 3" for a "yyyy-MM-dd" date. */
function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" })
    .format(Date.parse(`${date}T00:00:00Z`));
}

/** The trip day `date` as it is now, for `userId`'s kit on it; null when the day or `userId` isn't on the trip. */
function readDay(full: TripFull, userId: string, date: string) {
  const days = [...full.days].sort((a, b) => a.date.localeCompare(b.date));
  const index = days.findIndex((entry) => entry.date === date);
  const member = full.members.find((entry) => entry.user_id === userId && entry.status !== "left");
  if (index < 0 || !member) return null;
  const day = days[index];
  const stop = resolveTripStop(day, full.stops);
  const planned: TripDayPlanned = {
    day_id: day.id,
    activity: day.activity ?? stop?.activities[0] ?? null,
    stop: hasTripCoordinates(stop) ? { id: stop.id, latitude: stop.latitude, longitude: stop.longitude } : null,
    participation: full.lodging?.people.find((person) => person.member_id === member.id)
      ?.days.find((entry) => entry.date === date)?.participation ?? "participating",
  };
  return { day, index, count: days.length, member, stop, planned };
}

/** The trip day `date` as layers would be planned for it now, and its stop's name; null when the day or `userId` isn't on the trip. */
export function tripDayPlannedFor(full: TripFull, userId: string, date: string): { planned: TripDayPlanned; stopName: string | null } | null {
  const read = readDay(full, userId, date);
  return read && { planned: read.planned, stopName: read.stop?.name ?? null };
}

/**
 * The destination's time zone on the trip day, as far as it can be told: the
 * tour plan's or access point's, the meet time's, else looked up from the
 * day's stop.
 */
export async function tripDayTimeZone(full: TripFull, day: TripDay): Promise<string | null> {
  return dayTimeZone(full, day)
    ?? (isTimeZone(day.meet_time_zone) ? day.meet_time_zone : null)
    ?? await lookupTimeZone(resolveTripStop(day, full.stops));
}

/**
 * The trip day `date` as the outing Gear up plans layers for (#335), for the
 * signed-in `userId`'s own kit: the day's activity, its stop (the one its
 * forecast is for), the date and the day's meet time, or 9 AM without one
 * that morning. Their saved outfit's effort and XC details carry over while
 * its activity is the day's, else their checklist's effort does. When layers
 * can't be planned, `status` says why and there's no outing. Null when the
 * day isn't on the trip or `userId` isn't on it.
 *
 * `zone` is the destination's time zone, when known: the outing's dates and
 * the forecast window are on its calendar, else on UTC's.
 */
export function tripDayOutingFor(full: TripFull, userId: string, date: string, zone: string | null, now = Date.now()): TripDayOuting | null {
  const read = readDay(full, userId, date);
  if (!read) return null;
  const { day, member, stop, planned } = read;
  const { activity, participation } = planned;
  const context = {
    trip_id: full.trip.id, trip_name: full.trip.name, date, day_number: read.index + 1, day_count: read.count, member_id: member.id, planned,
  };
  const unplanned = (status: Exclude<TripDayOutingStatus, "ready">, message: string, opens_on?: string): TripDayOuting =>
    ({ status, message, ...(opens_on && { opens_on }), outing: null, context });

  if (!activity) return unplanned("no_activity", "Choose an activity for this day to plan layers for it.");
  if (!tripActivityNeedsClothing(activity)) return unplanned("no_clothing", `Nothing to plan for a ${tripActivityLabel(activity)} day.`);
  if (participation !== "participating") {
    return unplanned("not_taking_part", participation === "skipping"
      ? "You're not taking part this day, so there's no kit to plan." : "You're not on the trip this day, so there's no kit to plan.");
  }
  if (!planned.stop || !stop) return unplanned("no_destination", "Add a location to this day's destination to plan layers for it.");
  const key = tripActivityToRecommendationKey(activity);
  if (!key) return unplanned("unsupported", `Gear up can't plan layers for ${tripActivityLabel(activity)} yet. Mark what you'll bring below.`);
  const today = zone ? formatZonedTime(now, zone).slice(0, 10) : new Date(now).toISOString().slice(0, 10);
  if (date < today) return unplanned("past", "This day is over, so there's no forecast to plan layers from.");
  // The forecast covers today and the next FORECAST_DAYS - 1 days there.
  const opensOn = addDaysToDateString(date, -(FORECAST_DAYS - 1));
  if (opensOn > today) {
    return unplanned("outside_forecast", `The forecast reaches this day on ${shortDate(opensOn)}. Plan layers then, or mark what you'll bring below.`, opensOn);
  }

  const kit = full.kits.find((entry) => entry.trip_day_id === day.id && entry.trip_member_id === member.id);
  const outfit = kit?.outfit;
  const saved = outfit && outfit.kind !== "plan_day" && outfit.outing.activity === key ? outfit.outing : null;
  // A meet the evening before isn't when the day's outing starts.
  const meet = day.meet_day_offset !== -1 ? day.meet_time?.slice(0, 5) : undefined;
  const outing: Outing = {
    activity: key,
    exertion: saved?.exertion ?? (kit ? EXERTION[kit.effort] : DEFAULT_EXERTION_LEVEL),
    ...(saved?.outingPattern && { outingPattern: saved.outingPattern }),
    ...(saved?.xcExposure && { xcExposure: saved.xcExposure }),
    place: {
      id: TRIP_STOP_PLACE_ID, name: stop.name, country: "", latitude: planned.stop.latitude, longitude: planned.stop.longitude,
      ...(zone && { timeZone: zone }),
    },
    when: { mode: "later", date, time: meet ?? DEFAULT_START, durationDays: 1 },
  };
  return { status: "ready", message: "", outing, context };
}

/**
 * Whether `outing` is one Gear up could have planned for the trip day as
 * `planned`: the day's activity, at its stop. Effort and the time of day are
 * the person's to change.
 */
export function isTripDayOuting(outing: Outing, planned: TripDayPlanned): boolean {
  return !!planned.stop && outing.activity === tripActivityToRecommendationKey(planned.activity)
    && outing.place.latitude === planned.stop.latitude && outing.place.longitude === planned.stop.longitude;
}

/**
 * What changed on the trip day since Gear up planned layers for it, as
 * `planned`, by how it is now, `current`; empty when nothing that the layers
 * depend on did. A move to another day of the trip counts.
 */
export function tripDayChanges(planned: TripDayPlanned, current: TripDayPlanned | null, stopName: string | null): string[] {
  if (!current || current.day_id !== planned.day_id) return ["This day was removed from the trip, or its dates changed."];
  const changes: string[] = [];
  if (current.activity !== planned.activity) {
    changes.push(current.activity ? `Activity changed to ${tripActivityLabel(current.activity)}.` : "The day's activity was cleared.");
  }
  const { stop } = current;
  const moved = !stop || !planned.stop || stop.id !== planned.stop.id
    || stop.latitude !== planned.stop.latitude || stop.longitude !== planned.stop.longitude;
  if (moved) changes.push(stop && stopName ? `Destination changed to ${stopName}.` : "The day no longer has a destination with a location.");
  if (current.participation !== planned.participation) {
    changes.push(current.participation === "participating" ? "You're taking part this day now."
      : current.participation === "skipping" ? "You're no longer taking part this day." : "You're no longer on the trip this day.");
  }
  return changes;
}
