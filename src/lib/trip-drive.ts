import "server-only";
import { closuresFor, type WinterClosure } from "@/lib/locations/closures";
import { accessPointFor } from "@/lib/trip-location";
import { dateLabel, shiftDate } from "@/lib/trip-lodging";
import { formatZonedTime, isTimeZone } from "@/lib/timeZones";
import type { TripDriveDay, TripDriveEstimate, TripFull, TripLocation, TripStayDepartures } from "@/types/trips";

/**
 * Which drive each trip day has (#209): from the stay of the night before to
 * the day's access point (#208). The rules are in docs/trip-locations.md.
 */

/** Older estimates are recalculated; if that fails they're shown as stale. */
export const DRIVE_ESTIMATE_MAX_AGE_MS = 7 * 86_400_000;

/** A day's drive, ready to estimate, or the reason it can't be. */
export type DrivePlan = {
  date: string;
  /** The stay of the night before, with its location when it has one. */
  origin: { label: string; stay_id: string; location: TripLocation | null } | null;
  destination: { label: string; location: TripLocation } | null;
} & (
  | { state: "ready"; route_key: string; closures: WinterClosure[] }
  | { state: Exclude<TripDriveDay["state"], "available" | "stale" | "unavailable" | "no_route">; route_key: null; closures: [] }
);

/** An estimate as stored in trip_drive_estimates (028). */
export interface StoredDriveEstimate {
  date: string;
  route_key: string;
  origin_label: string;
  destination_label: string;
  status: "ok" | "no_route";
  duration_seconds: number | null;
  distance_meters: number | null;
  calculated_at: string;
}

const coordinates = (location: TripLocation) => `${location.latitude},${location.longitude}`;

/** The closures a drive avoids, with the exact points sent to the router, so a corrected point is a different key. */
export function closureKey(closures: WinterClosure[]): string {
  return closures.map((closure) => `${closure.id}@${closure.points.map((point) => `${point.latitude},${point.longitude}`).join(";")}`).join("+") || "none";
}

/**
 * Names the pair and the options an estimate was calculated for. Any change,
 * such as a new stay, a moved access point, a closure coming into season or
 * a corrected closure point, makes a new key, so the old estimate is never
 * shown for the new pair.
 */
function routeKey(origin: TripLocation, destination: TripLocation, closures: WinterClosure[]): string {
  return `drive|approximated|${coordinates(origin)}>${coordinates(destination)}|${closureKey(closures)}`;
}

/** Every trip day's drive, in date order. */
export function drivePlans(full: TripFull): DrivePlan[] {
  const lodging = full.lodging;
  return (lodging?.days ?? []).map(({ date, starting_stay_id }) => {
    const day = full.days.find((candidate) => candidate.date === date);
    const stay = starting_stay_id ? lodging?.stays.find((candidate) => candidate.id === starting_stay_id) : undefined;
    const point = day ? accessPointFor(full.stops, day) : null;
    const origin = stay ? { label: stay.name, stay_id: stay.id, location: stay.location ?? null } : null;
    const destination = point ? { label: point.location.label, location: point.location } : null;
    const blocked = (state: Exclude<DrivePlan["state"], "ready">): DrivePlan => ({ date, origin, destination, state, route_key: null, closures: [] });
    if (!day || !full.stops.length) return blocked("no_destination");
    // The origin comes first: the Getting there card already asks for a missing access point.
    if (!stay) return blocked("missing_origin");
    if (!stay.location) return blocked("origin_not_located");
    if (stay.location.precision === "approximate") return blocked("approximate_origin");
    if (!point) return blocked("missing_access_point");
    if (point.location.precision === "approximate") return blocked("approximate_access_point");
    const closures = closuresFor(date, stay.location, point.location);
    return { date, origin, destination, state: "ready", route_key: routeKey(stay.location, point.location, closures), closures };
  });
}

/** One way, rounded to the minute: "Under 1 min", "35 min", "1 hr 5 min". */
export function durationLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "Under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** In miles, matching the app's mph until #172 settles units: "0.4 mi", "14 mi". */
export function distanceLabel(meters: number): string {
  const miles = meters / 1609.344;
  if (miles < 0.1) return "Under 0.1 mi";
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

/** Apple Maps opens the Maps app on Apple devices; Google Maps works everywhere else. Both drive between the exact points. */
function directionsUrls(origin: TripLocation, destination: TripLocation): { apple: string; google: string } {
  return {
    apple: `https://maps.apple.com/?saddr=${coordinates(origin)}&daddr=${coordinates(destination)}&dirflg=d`,
    google: `https://www.google.com/maps/dir/?api=1&origin=${coordinates(origin)}&destination=${coordinates(destination)}&travelmode=driving`,
  };
}

const estimateOf = (row: StoredDriveEstimate): TripDriveEstimate | null =>
  row.status === "ok" && row.duration_seconds !== null && row.distance_meters !== null
    ? { duration_label: durationLabel(row.duration_seconds), distance_label: distanceLabel(row.distance_meters), calculated_at: row.calculated_at }
    : null;

/**
 * The day as the page shows it. `row` is the day's estimate, newly
 * calculated or stored, and `failed` says recalculating it failed this time.
 * A stored estimate for another pair is only ever `previous`.
 */
export function driveDay(plan: DrivePlan, row: StoredDriveEstimate | undefined, failed: boolean, now: number): TripDriveDay {
  const base = {
    date: plan.date, date_label: dateLabel(plan.date), night_label: dateLabel(shiftDate(plan.date, -1)),
    origin: plan.origin && { label: plan.origin.label, stay_id: plan.origin.stay_id },
    destination: plan.destination && { label: plan.destination.label },
    closures: plan.closures.map((closure) => `${closure.label}, ${closure.season}`),
    estimate: null, previous: null, directions: null,
  };
  if (plan.state !== "ready") return { ...base, state: plan.state };
  const directions = directionsUrls(plan.origin!.location!, plan.destination!.location);
  if (row?.route_key === plan.route_key) {
    if (row.status === "no_route") return { ...base, state: "no_route" };
    const stale = now - Date.parse(row.calculated_at) > DRIVE_ESTIMATE_MAX_AGE_MS;
    return { ...base, state: stale && failed ? "stale" : "available", estimate: estimateOf(row), directions };
  }
  const earlier = row && estimateOf(row);
  return {
    ...base, state: "unavailable", directions,
    previous: earlier ? { ...earlier, origin_label: row.origin_label, destination_label: row.destination_label } : null,
  };
}

/**
 * Each stay's departures: the mornings after its assigned nights, checkout
 * morning included and arrival day not, within the trip. `next` is the first
 * from today on, using the stay's time zone when it has one.
 */
export function stayDepartures(full: TripFull, now: number): TripStayDepartures[] {
  const lodging = full.lodging;
  return (lodging?.stays ?? []).map((stay) => {
    const dates = (lodging?.days ?? []).filter((day) => day.starting_stay_id === stay.id).map((day) => day.date);
    const zone = stay.location?.time_zone;
    const today = (isTimeZone(zone) ? formatZonedTime(now, zone) : new Date(now).toISOString()).slice(0, 10);
    return { stay_id: stay.id, dates, next: dates.find((date) => date >= today) ?? null };
  });
}
