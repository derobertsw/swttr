import "server-only";
import { closuresFor, type WinterClosure } from "@/lib/locations/closures";
import { accessPointFor } from "@/lib/trip-location";
import { dateLabel, shiftDate } from "@/lib/trip-lodging";
import { formatZonedTime, isTimeZone } from "@/lib/timeZones";
import type { TripDay, TripDriveDay, TripDriveEstimate, TripDriveManualEstimate, TripFull, TripLocation, TripStayDepartures } from "@/types/trips";

/**
 * Which drive each trip day has (#209): from the stay of the night before, or
 * the day's own starting point, to the day's access point (#208). The rules
 * are in docs/trip-locations.md.
 */

/** Older estimates are recalculated; if that fails they're shown as stale. */
export const DRIVE_ESTIMATE_MAX_AGE_MS = 7 * 86_400_000;

/** Where a day's drive starts, with its location when it has one. */
export interface DriveOrigin {
  label: string;
  /** The saved stay it is, if any. */
  stay_id: string | null;
  location: TripLocation | null;
  /** The day's own starting point rather than the crew stay of the night before. */
  own: boolean;
}

/** A day's drive, ready to estimate, or the reason it can't be. */
export type DrivePlan = {
  date: string;
  origin: DriveOrigin | null;
  /** The crew stay of the night before, when there is one. */
  crew_stay: { label: string; stay_id: string } | null;
  destination: { label: string; location: TripLocation } | null;
} & (
  | { state: "ready"; route_key: string; pair_key: string; closures: WinterClosure[] }
  | { state: Exclude<TripDriveDay["state"], "available" | "stale" | "unavailable" | "no_route" | "manual">; route_key: null; pair_key: null; closures: [] }
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

/** Your estimate as stored in trip_drive_manual_estimates (029), with its day's current date. */
export interface StoredManualEstimate {
  date: string;
  pair_key: string;
  origin_label: string;
  destination_label: string;
  duration_seconds: number;
  note: string | null;
  use_calculated: boolean;
  entered_at: string;
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

/**
 * Names the pair and mode alone, which is what your estimate is for: routing
 * options and closures are the provider's to account for, not yours.
 */
const pairKey = (origin: TripLocation, destination: TripLocation) => `drive|${coordinates(origin)}>${coordinates(destination)}`;

/**
 * Where a day starts: its own starting point while it has one, otherwise the
 * crew stay of the night before. An own point picked from a saved stay
 * follows that stay's name and place while the stay exists.
 */
function originFor(full: TripFull, day: TripDay | undefined, crewStayId: string | null): DriveOrigin | null {
  const stays = full.lodging?.stays ?? [];
  if (day?.origin) {
    const stay = day.origin_stay_id ? stays.find((candidate) => candidate.id === day.origin_stay_id) : undefined;
    return stay ? { label: stay.name, stay_id: stay.id, location: stay.location ?? null, own: true }
      : { label: day.origin.label, stay_id: null, location: day.origin, own: true };
  }
  const stay = crewStayId ? stays.find((candidate) => candidate.id === crewStayId) : undefined;
  return stay ? { label: stay.name, stay_id: stay.id, location: stay.location ?? null, own: false } : null;
}

/** Every trip day's drive, in date order. */
export function drivePlans(full: TripFull): DrivePlan[] {
  const lodging = full.lodging;
  return (lodging?.days ?? []).map(({ date, starting_stay_id }) => {
    const day = full.days.find((candidate) => candidate.date === date);
    const crewStay = starting_stay_id ? lodging?.stays.find((candidate) => candidate.id === starting_stay_id) : undefined;
    const origin = originFor(full, day, starting_stay_id);
    const point = day ? accessPointFor(full.stops, day) : null;
    const destination = point ? { label: point.location.label, location: point.location } : null;
    const shared = { date, origin, crew_stay: crewStay ? { label: crewStay.name, stay_id: crewStay.id } : null, destination };
    const blocked = (state: Exclude<DrivePlan["state"], "ready">): DrivePlan => ({ ...shared, state, route_key: null, pair_key: null, closures: [] });
    if (!day || !full.stops.length) return blocked("no_destination");
    // The organizer's choice, whatever else is missing.
    if (day.no_drive) return blocked("no_drive");
    // The origin comes first: the Getting there card already asks for a missing access point.
    if (!origin) return blocked("missing_origin");
    if (!origin.location) return blocked("origin_not_located");
    if (origin.location.precision === "approximate") return blocked("approximate_origin");
    if (!point) return blocked("missing_access_point");
    if (point.location.precision === "approximate") return blocked("approximate_access_point");
    const closures = closuresFor(date, origin.location, point.location);
    return {
      ...shared, state: "ready", closures,
      route_key: routeKey(origin.location, point.location, closures), pair_key: pairKey(origin.location, point.location),
    };
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

/** Age at response time; the browser displays it without calculating freshness. */
function estimateAge(calculatedAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(calculatedAt)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** Formats road figures with response-time freshness; no-route rows have no figures. */
const estimateOf = (row: StoredDriveEstimate, now: number): TripDriveEstimate | null =>
  row.status === "ok" && row.duration_seconds !== null && row.distance_meters !== null
    ? { duration_label: durationLabel(row.duration_seconds), distance_label: distanceLabel(row.distance_meters), calculated_at: row.calculated_at,
      age_label: estimateAge(row.calculated_at, now), stale: now - Date.parse(row.calculated_at) > DRIVE_ESTIMATE_MAX_AGE_MS }
    : null;

/** The same estimate, saved for several days together: one entry, one entered time. */
const sameManual = (a: StoredManualEstimate, b: StoredManualEstimate) =>
  a.pair_key === b.pair_key && a.duration_seconds === b.duration_seconds && a.note === b.note && Date.parse(a.entered_at) === Date.parse(b.entered_at);

/**
 * The day as the page shows it. `row` is the day's estimate, newly
 * calculated or stored, and `failed` says recalculating it failed this time.
 * A stored estimate for another pair is only ever `previous`. `manual` is
 * every day's estimate of your own; the day's is in use while it's for the
 * day's pair, unless the organizer chose a calculated estimate for that pair
 * and there is one. Your estimate for another pair is shown for review only.
 */
export function driveDay(plan: DrivePlan, row: StoredDriveEstimate | undefined, failed: boolean, now: number,
  context: { plans?: DrivePlan[]; manual?: StoredManualEstimate[] } = {}): TripDriveDay {
  const plans = context.plans ?? [plan], manual = context.manual ?? [];
  const base = {
    date: plan.date, date_label: dateLabel(plan.date), night_label: dateLabel(shiftDate(plan.date, -1)),
    origin: plan.origin && { label: plan.origin.label, stay_id: plan.origin.stay_id, own: plan.origin.own },
    crew_stay: plan.crew_stay,
    destination: plan.destination && { label: plan.destination.label },
    closures: plan.closures.map((closure) => `${closure.label}, ${closure.season}`),
    estimate: null, manual: null, previous: null, directions: null, pair_key: plan.pair_key, same_drive_dates: [],
  };
  if (plan.state !== "ready") return { ...base, state: plan.state };
  const directions = directionsUrls(plan.origin!.location!, plan.destination!.location);
  const sameDrive = plans.filter((other) => other.pair_key === plan.pair_key).map((other) => other.date);
  const pairOf = (date: string) => plans.find((other) => other.date === date)?.pair_key;
  const own = manual.find((entry) => entry.date === plan.date);
  const yours: TripDriveManualEstimate | null = own ? {
    duration_label: durationLabel(own.duration_seconds), duration_seconds: own.duration_seconds, note: own.note, entered_at: own.entered_at,
    origin_label: own.origin_label, destination_label: own.destination_label,
    current: own.pair_key === plan.pair_key, use_calculated: own.use_calculated,
    dates: manual.filter((entry) => sameManual(entry, own) && pairOf(entry.date) === own.pair_key).map((entry) => entry.date),
  } : null;
  const day = { ...base, directions, manual: yours, same_drive_dates: sameDrive };

  let calculated: TripDriveDay;
  if (row?.route_key === plan.route_key) {
    const stale = now - Date.parse(row.calculated_at) > DRIVE_ESTIMATE_MAX_AGE_MS;
    // An expired no-route answer isn't proof there's still no road route
    // when refreshing fails. Keep Directions, Retry and manual recovery available.
    calculated = row.status === "no_route" ? { ...day, state: stale && failed ? "unavailable" : "no_route",
      directions: stale && failed ? directions : null }
      : { ...day, state: stale && failed ? "stale" : "available", estimate: estimateOf(row, now) };
  } else {
    const earlier = row && estimateOf(row, now);
    calculated = {
      ...day, state: "unavailable",
      previous: earlier ? { ...earlier, origin_label: row.origin_label, destination_label: row.destination_label } : null,
    };
  }
  // Yours is the day's estimate unless the calculated one was chosen and there is one.
  if (yours?.current && !(yours.use_calculated && calculated.estimate)) {
    return { ...calculated, state: "manual", directions };
  }
  return calculated;
}

/**
 * Each stay's departures: the mornings that start there, whether from the
 * crew stay of the night before (checkout morning included, arrival day not)
 * or as a day's own starting point, within the trip. `next` is the first from
 * today on, using the stay's time zone when it has one.
 */
export function stayDepartures(full: TripFull, now: number, plans = drivePlans(full)): TripStayDepartures[] {
  const lodging = full.lodging;
  return (lodging?.stays ?? []).map((stay) => {
    const dates = plans.filter((plan) => plan.origin?.stay_id === stay.id).map((plan) => plan.date);
    const zone = stay.location?.time_zone;
    const today = (isTimeZone(zone) ? formatZonedTime(now, zone) : new Date(now).toISOString()).slice(0, 10);
    return { stay_id: stay.id, dates, next: dates.find((date) => date >= today) ?? null };
  });
}
