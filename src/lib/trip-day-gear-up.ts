/**
 * Planning a trip day's layers in Gear up (#335), in the browser: the day's
 * outing comes from the server (GET /api/v1/trips/:id/days/:date/outing),
 * and Gear up keeps the day with the outing it asked for. See
 * docs/trip-saved-kits.md#planning-from-a-trip-day.
 */
import { format } from "date-fns";
import { tripRequest } from "@/lib/trip-requests";
import type { Outing } from "@/types/outing";
import type { GearUpTripDay, TripDayContext, TripDayOuting } from "@/types/trip-day-outing";

/** The signed-in person's outing for the trip day, or why layers can't be planned for it. */
export function fetchTripDayOuting(tripId: string, date: string, signal?: AbortSignal): Promise<TripDayOuting> {
  return tripRequest<TripDayOuting>(`/api/v1/trips/${encodeURIComponent(tripId)}/days/${encodeURIComponent(date)}/outing`, "GET", undefined, { signal });
}

/**
 * Whether `outing` is still the trip day's: the activity, place and date that
 * were asked for for it. Effort and the time of day can change; anything
 * else makes the results another outing's.
 */
export function isTripDayResult(tripDay: GearUpTripDay, outing: Outing): boolean {
  const planned = tripDay.outing;
  return outing.activity === planned.activity
    && outing.place.latitude === planned.place.latitude && outing.place.longitude === planned.place.longitude
    && outing.when.mode === "later" && planned.when.mode === "later"
    && outing.when.date === planned.when.date && outing.when.durationDays === 1;
}

/** "Day 2 of 3 · Sat, Feb 13" */
export function tripDayLabel(context: TripDayContext): string {
  return `Day ${context.day_number} of ${context.day_count} · ${format(new Date(`${context.date}T00:00:00`), "EEE, MMM d")}`;
}

/** The trip day itself, at the person's kit. */
export function tripDayHref(context: TripDayContext): string {
  return `/trips/${encodeURIComponent(context.trip_id)}/days/${encodeURIComponent(context.date)}#kit-${context.member_id}`;
}

/**
 * Plans for the trip day as it is now, by asking the server for its outing
 * again, as after the day changed during planning. Resolves with why layers
 * can't be planned for it any more, or null once Gear up is asking for them.
 */
export async function planTripDayAgain(context: TripDayContext, plan: (tripDay: GearUpTripDay) => void): Promise<string | null> {
  const next = await fetchTripDayOuting(context.trip_id, context.date);
  if (next.status !== "ready" || !next.outing) return next.message;
  plan({ context: next.context, outing: next.outing });
  return null;
}
