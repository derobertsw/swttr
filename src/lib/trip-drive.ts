import "server-only";
import { closuresFor, type WinterClosure } from "@/lib/locations/closures";
import { accessPointFor } from "@/lib/trip-location";
import { CREW_STATUSES, dateLabel, shiftDate } from "@/lib/trip-lodging";
import { formatZonedTime, isTimeZone } from "@/lib/timeZones";
import type { TripDay, TripDriveEstimate, TripDriveManualEstimate, TripDriveRoute, TripFull, TripLocation, TripStayDepartures } from "@/types/trips";

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
  | { state: Exclude<TripDriveRoute["state"], "available" | "stale" | "unavailable" | "no_route" | "manual">; route_key: null; pair_key: null; closures: [] }
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

/** A saved place as a starting point: a stay it was picked from, by its current name and place while it exists. */
function savedOrigin(full: TripFull, origin: TripLocation, stayId: string | null | undefined): DriveOrigin {
  const stay = stayId ? full.lodging?.stays.find((candidate) => candidate.id === stayId) : undefined;
  return stay ? { label: stay.name, stay_id: stay.id, location: stay.location ?? null, own: true }
    : { label: origin.label, stay_id: null, location: origin, own: true };
}

/** A stay slept in the night before as a starting point. */
function stayOrigin(full: TripFull, stayId: string | null): DriveOrigin | null {
  const stay = stayId ? full.lodging?.stays.find((candidate) => candidate.id === stayId) : undefined;
  return stay ? { label: stay.name, stay_id: stay.id, location: stay.location ?? null, own: false } : null;
}

/**
 * Where a day starts: its own starting point while it has one, otherwise the
 * crew stay of the night before. An own point picked from a saved stay
 * follows that stay's name and place while the stay exists.
 */
function originFor(full: TripFull, day: TripDay | undefined, crewStayId: string | null): DriveOrigin | null {
  return day?.origin ? savedOrigin(full, day.origin, day.origin_stay_id) : stayOrigin(full, crewStayId);
}

/** The drive from `origin` to the day's access point, or what's missing for one. */
function planFor(full: TripFull, date: string, origin: DriveOrigin | null, crewStayId: string | null, noDrive?: boolean): DrivePlan {
  const day = full.days.find((candidate) => candidate.date === date);
  const crewStay = crewStayId ? full.lodging?.stays.find((candidate) => candidate.id === crewStayId) : undefined;
  const point = day ? accessPointFor(full.stops, day) : null;
  const destination = point ? { label: point.location.label, location: point.location } : null;
  const shared = { date, origin, crew_stay: crewStay ? { label: crewStay.name, stay_id: crewStay.id } : null, destination };
  const blocked = (state: Exclude<DrivePlan["state"], "ready">): DrivePlan => ({ ...shared, state, route_key: null, pair_key: null, closures: [] });
  if (!day || !full.stops.length) return blocked("no_destination");
  // The organizer's choice, whatever else is missing.
  if (noDrive ?? day.no_drive) return blocked("no_drive");
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
}

/** The people who start a day from the same place (#333), with their drive. */
export type DeparturePlan = DrivePlan & { key: string; label: string; member_ids: string[]; own_member_ids: string[]; crew: boolean };

/**
 * Names a departure by where it actually starts: the same stay, or the same
 * coordinates, is the same departure, and No drive planned is its own.
 */
const departureKey = (origin: DriveOrigin | null, unset: string, noDrive: boolean) =>
  (!origin ? unset : origin.stay_id ? `stay:${origin.stay_id}` : `place:${origin.location ? coordinates(origin.location) : origin.label}`)
  + (noDrive ? ":no_drive" : "");

/**
 * Each trip day's departures, in date order: the people taking part, grouped
 * by where they actually start. A person's own starting point for the day
 * (#333) comes first, then the day's own starting point, then the stay each
 * person slept in the night before. No drive planned, the day's or their own,
 * is a departure of its own. People with no starting point are grouped as
 * Not set, or Arrives this day when they weren't on the trip yet; they're
 * never assumed to travel with the crew. A pending invitation counts once it
 * has a stay for the night or a starting point of its own. The crew's
 * departure is the one most people take from the day's usual starting point.
 * See docs/trip-locations.md.
 */
export function departurePlans(full: TripFull): DeparturePlan[][] {
  const lodging = full.lodging;
  const stays = lodging?.stays ?? [];
  const people = lodging?.people ?? [];
  return (lodging?.days ?? []).map(({ date, starting_stay_id }) => {
    const day = full.days.find((candidate) => candidate.date === date);
    const plan = planFor(full, date, originFor(full, day, starting_stay_id), starting_stay_id);
    const crewKey = departureKey(plan.origin, "unset:not_set", !!day?.no_drive);
    const travellers = people.flatMap((person) => {
      const morning = person.days.find((entry) => entry.date === date);
      if (morning?.participation !== "participating") return [];
      const own = day ? full.member_origins?.find((row) => row.trip_day_id === day.id && row.member_id === person.member_id) : undefined;
      if (!CREW_STATUSES.has(person.membership) && !morning.starting_stay_id && !own) return [];
      const origin = own?.origin ? savedOrigin(full, own.origin, own.origin_stay_id)
        : day?.origin ? originFor(full, day, null) : stayOrigin(full, morning.starting_stay_id);
      const noDrive = !!day?.no_drive || !!own?.no_drive;
      const unset = morning.starting_from === "Arrives this day" ? "unset:arrives" : "unset:not_set";
      return [{ member_id: person.member_id, origin, noDrive, own: !!own, key: departureKey(origin, unset, noDrive) }];
    });
    // Nobody to group, such as a trip before per-person nights: the crew's drive alone.
    if (!travellers.length) return [{ ...plan, key: crewKey, label: plan.origin?.label ?? "Not set", member_ids: [], own_member_ids: [], crew: true }];

    const keys = [...new Set(travellers.map((entry) => entry.key))];
    const size = (key: string) => travellers.filter((entry) => entry.key === key).length;
    const unset = (key: string) => key.startsWith("unset:");
    const rank = (key: string) => {
      const index = stays.findIndex((stay) => key.startsWith(`stay:${stay.id}`));
      return index === -1 ? stays.length : index;
    };
    // Stays and places by size and stay order, then Not set, then Arrives this day.
    keys.sort((a, b) => Number(unset(a)) - Number(unset(b)) || Number(a.startsWith("unset:arrives")) - Number(b.startsWith("unset:arrives"))
      || size(b) - size(a) || rank(a) - rank(b));
    // The crew's departure leads: from the day's usual starting point, or the
    // largest group when everyone there has a starting point of their own.
    const crew = keys.includes(crewKey) ? crewKey : keys[0];
    keys.sort((a, b) => Number(b === crew) - Number(a === crew));
    return keys.map((key): DeparturePlan => {
      const group = travellers.filter((entry) => entry.key === key);
      const member_ids = group.map((entry) => entry.member_id);
      const own_member_ids = group.filter((entry) => entry.own).map((entry) => entry.member_id);
      const label = group[0].origin?.label ?? (key.startsWith("unset:arrives") ? "Arrives this day" : "Not set");
      if (key === crewKey) return { ...plan, key, label, member_ids, own_member_ids, crew: true };
      // Their own place only when every one of them is there by their own choice.
      const origin = group.find((entry) => !entry.own)?.origin ?? group[0].origin;
      return { ...planFor(full, date, origin, starting_stay_id, group[0].noDrive), key, label, member_ids, own_member_ids, crew: key === crew };
    });
  });
}

/** Every trip day's drive for the crew, in date order: its crew departure. */
export function drivePlans(full: TripFull): DrivePlan[] {
  return departurePlans(full).map((day) => day.find((plan) => plan.crew)!);
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
 * The drive as the page shows it. `row` is its estimate, newly calculated or
 * stored, and `failed` says recalculating it failed this time. A stored
 * estimate for another pair is only ever `previous`. `manual` is every
 * estimate of your own, each for a drive on a day (#333), and `plans` every
 * drive on the trip; yours for this drive is in use unless the organizer chose
 * a calculated estimate for it and there is one. With `earlier`, the crew's
 * drive also shows yours for a drive the day no longer has, for review only.
 */
export function driveDay(plan: DrivePlan, row: StoredDriveEstimate | undefined, failed: boolean, now: number,
  context: { plans?: DrivePlan[]; manual?: StoredManualEstimate[]; earlier?: boolean } = {}): TripDriveRoute {
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
  const sameDrive = [...new Set(plans.filter((other) => other.pair_key === plan.pair_key).map((other) => other.date))];
  const drives = (date: string, pair: string) => plans.some((other) => other.date === date && other.pair_key === pair);
  const own = manual.find((entry) => entry.date === plan.date && entry.pair_key === plan.pair_key)
    ?? (context.earlier ? manual.find((entry) => entry.date === plan.date && !drives(entry.date, entry.pair_key)) : undefined);
  const yours: TripDriveManualEstimate | null = own ? {
    pair_key: own.pair_key, duration_label: durationLabel(own.duration_seconds), duration_seconds: own.duration_seconds, note: own.note,
    entered_at: own.entered_at, origin_label: own.origin_label, destination_label: own.destination_label,
    current: own.pair_key === plan.pair_key, use_calculated: own.use_calculated,
    dates: manual.filter((entry) => sameManual(entry, own) && drives(entry.date, own.pair_key)).map((entry) => entry.date),
  } : null;
  const day = { ...base, directions, manual: yours, same_drive_dates: sameDrive };

  let calculated: TripDriveRoute;
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
 * or as a day's own starting point, within the trip. Anyone's departure
 * counts (#333), so a stay with part of the crew lists its mornings too.
 * `next` is the first from today on, using the stay's time zone when it has one.
 */
export function stayDepartures(full: TripFull, now: number, departures: DeparturePlan[][] = departurePlans(full)): TripStayDepartures[] {
  const lodging = full.lodging;
  return (lodging?.stays ?? []).map((stay) => {
    const dates = departures.filter((day) => day.some((plan) => plan.origin?.stay_id === stay.id)).map((day) => day[0].date);
    const zone = stay.location?.time_zone;
    const today = (isTimeZone(zone) ? formatZonedTime(now, zone) : new Date(now).toISOString()).slice(0, 10);
    return { stay_id: stay.id, dates, next: dates.find((date) => date >= today) ?? null };
  });
}
