import "server-only";
import { dateLabel, isCalendarDate, isUuid } from "@/lib/trip-lodging";
import { accessPointFor, parseTripLocation, sameLocation, type DayAccessPoint } from "@/lib/trip-location";
import type { TripAccessPointRequest, TripDay, TripFull, TripItineraryOption, TripItineraryPreview, TripLocation } from "@/types/trips";

/**
 * Access point changes (#208). previewAccessPoint builds the review, "Only
 * this day" or "All days at <stop>" with their dates, by the same rules as
 * set_trip_access_point (migration 027), which saves the chosen option and
 * refuses it if the trip no longer matches what the review showed.
 */

type Invalid = { error: string; field?: string };
/**
 * A change as it's saved: the chosen scope plus what the review showed, the
 * day's stop, its point and each day at it with the own point that applies.
 * The points are compared with the saved ones, never stored.
 */
type AccessPointEdit = {
  date: string;
  scope: "day" | "stop";
  location: TripLocation | null;
  expected: { stop_id: string; point: unknown; days: Array<{ date: string; point: unknown }> };
};

const MAX_DAYS = 400;
const INVALID: Invalid = { error: "Reload the trip and try again." };
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const plural = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;
const listed = (items: string[]) => new Intl.ListFormat("en", { type: "conjunction" }).format(items);

/** The change to preview: a day and a checked place, or null to remove its point. */
export function parseAccessPointRequest(body: unknown): TripAccessPointRequest | Invalid {
  if (!isObject(body) || !isCalendarDate(body.date) || !("location" in body)) return INVALID;
  if (body.location === null) return { action: "set_access_point", date: body.date, location: null };
  const location = parseTripLocation(body.location);
  return "error" in location ? { error: location.error, field: "location" } : { action: "set_access_point", date: body.date, location };
}

/** The change to save, rebuilt from its validated fields only, or why it can't be. */
export function parseAccessPointEdit(body: unknown): AccessPointEdit | Invalid {
  const request = parseAccessPointRequest(body);
  if ("error" in request) return request;
  const { scope, expected } = body as Record<string, unknown>;
  const isPoint = (value: unknown) => value === undefined || value === null || isObject(value);
  if ((scope !== "day" && scope !== "stop") || !isObject(expected) || !isUuid(expected.stop_id) || !isPoint(expected.point)) return INVALID;
  const days = expected.days;
  if (!Array.isArray(days) || days.length > MAX_DAYS || !days.every((day) => isObject(day) && isCalendarDate(day.date) && isPoint(day.point))) return INVALID;
  return {
    date: request.date, scope, location: request.location,
    expected: {
      stop_id: expected.stop_id.toLowerCase(), point: expected.point ?? null,
      days: (days as Array<Record<string, unknown>>).map((day) => ({ date: day.date as string, point: day.point ?? null })),
    },
  };
}

const samePoint = (a: DayAccessPoint | null, b: DayAccessPoint | null) =>
  a === b || (!!a && !!b && a.scope === b.scope && sameLocation(a.location, b.location));

/**
 * A day's point as a review reads it. Two different places with one name,
 * like the unnamed lots along one road, are told apart by address or
 * coordinates.
 */
function describe(point: DayAccessPoint | null, other: DayAccessPoint | null): string {
  if (!point) return "Not set";
  const { location } = point;
  let label = location.label;
  if (other && other.location.label === label && !sameLocation(location, other.location)) {
    label += ` (${location.address && location.address !== other.location.address ? location.address : `${location.latitude}, ${location.longitude}`})`;
  }
  return point.scope === "day" ? `${label} · this day only` : label;
}

/**
 * The options for setting or removing a day's access point, each with the
 * days at its stop that change and the payload to save it. `full.stops` is in
 * position order, as loadTripFull returns it.
 */
export function previewAccessPoint(full: TripFull, request: TripAccessPointRequest): TripItineraryPreview | { error: string; status: 400 | 404 } {
  const { stops, days } = full;
  const stopOf = (day: Pick<TripDay, "stop_id">) => stops.find((stop) => stop.id === day.stop_id) ?? stops[0];
  const day = days.find((candidate) => candidate.date === request.date);
  if (!day) return { error: "This day isn't on the trip anymore. Reload the trip.", status: 404 };
  const stop = stopOf(day);
  if (!stop) return { error: "Choose this day's destination first.", status: 400 };
  const current = accessPointFor(stops, day);
  const { location } = request;
  if (!location && !current) return { error: "This day has no access point to remove.", status: 400 };

  const atStop = days.filter((candidate) => stopOf(candidate) === stop).sort((a, b) => a.date.localeCompare(b.date));
  const own = (candidate: TripDay) => candidate.access_point && candidate.access_point_stop_id === stop.id ? candidate.access_point : null;
  const shared: DayAccessPoint | null = stop.access_point ? { location: stop.access_point, scope: "stop" } : null;
  const option = (scope: "day" | "stop", fields: Pick<TripItineraryOption, "key" | "label" | "detail">): TripItineraryOption => {
    const after = (candidate: TripDay): DayAccessPoint | null => scope === "stop"
      ? location && { location, scope: "stop" }
      : candidate !== day ? accessPointFor(stops, candidate) : location ? { location, scope: "day" } : shared;
    const changes = atStop.flatMap((candidate) => {
      const [was, now] = [accessPointFor(stops, candidate), after(candidate)];
      return samePoint(was, now) ? [] : [{ date: candidate.date, date_label: dateLabel(candidate.date), before: describe(was, now), after: describe(now, was) }];
    });
    return {
      ...fields, changes, unchanged: atStop.length - changes.length,
      payload: {
        date: day.date, scope, location,
        expected: { stop_id: stop.id, point: stop.access_point ?? null, days: atStop.map((candidate) => ({ date: candidate.date, point: own(candidate) })) },
      },
    };
  };

  const only = `Only ${dateLabel(day.date)}`;
  const dates = listed(atStop.map((candidate) => dateLabel(candidate.date)));
  const others = listed(atStop.filter((candidate) => candidate !== day).map((candidate) => dateLabel(candidate.date)));
  const everyDay = option("stop", {
    key: "stop", label: `All days at ${stop.name} (${plural(atStop.length)})`,
    detail: location ? `${dates}.` : `${dates} will have no access point.`,
  });
  if (atStop.length === 1) {
    return { options: [{
      ...everyDay, label: only,
      detail: location ? `It's the only day at ${stop.name}, so days added there later get it too.` : `${dateLabel(day.date)} will have no access point.`,
    }] };
  }
  // A day goes without an access point only when its stop has none.
  if (!location && current?.scope === "stop") return { options: [everyDay] };
  return { options: [
    option("day", {
      key: "day", label: only,
      detail: location ? `${others} at ${stop.name} ${atStop.length === 2 ? "doesn't" : "don't"} change.`
        : shared ? `It uses ${stop.name}'s access point, ${shared.location.label}, again.` : "It will have no access point.",
    }),
    everyDay,
  ] };
}
