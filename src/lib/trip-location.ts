import { isTimeZone } from "@/lib/timeZones";
import type { TripDay, TripLocation, TripStop } from "@/types/trips";

/** The search results' required credit when they come from Geoapify (#208). */
export const GEOAPIFY_CREDIT = { label: "Powered by Geoapify", url: "https://www.geoapify.com/" };
export const OSM_CREDIT = { label: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" };

/** A coordinate pair a place can have: in range, and not 0, 0 (a missing value, not a place). */
export function isUsableCoordinate(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === "number" && typeof longitude === "number"
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    && !(latitude === 0 && longitude === 0);
}

/** About 10 cm, more than any search result or typed coordinate means. */
export const roundCoordinate = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Checks a location sent by the browser, as the database's
 * is_trip_location does, and keeps only the known fields.
 */
export function parseTripLocation(value: unknown): TripLocation | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Choose the location again." };
  const input = value as Record<string, unknown>;
  const text = (key: string, max: number) => input[key] == null || input[key] === "" ? null
    : typeof input[key] === "string" && input[key].trim().length <= max ? input[key].trim() || null : undefined;
  const label = text("label", 300);
  if (!label) return { error: "Choose the location again." };
  if (!isUsableCoordinate(input.latitude, input.longitude)) {
    return { error: "Enter a latitude from -90 to 90 and a longitude from -180 to 180. 0, 0 isn't a usable location." };
  }
  if (input.precision !== "exact" && input.precision !== "approximate") return { error: "Choose the location again." };
  if (input.source !== "search" && input.source !== "manual") return { error: "Choose the location again." };
  const address = text("address", 1000), providerId = text("provider_id", 500), attribution = text("attribution", 300);
  if (address === undefined || providerId === undefined || attribution === undefined) return { error: "Choose the location again." };
  const provider = input.provider == null ? null : input.provider === "geoapify" ? "geoapify" : undefined;
  if (provider === undefined) return { error: "Choose the location again." };
  if (input.source === "manual" && (provider || providerId)) return { error: "Choose the location again." };
  return {
    label, address,
    latitude: roundCoordinate(input.latitude as number), longitude: roundCoordinate(input.longitude as number),
    precision: input.precision, time_zone: isTimeZone(input.time_zone) ? input.time_zone : null,
    source: input.source, provider, provider_id: providerId, attribution,
  };
}

/** Opens the place in OpenStreetMap, which needs no key and works on every device. */
export function locationMapUrl(location: Pick<TripLocation, "latitude" | "longitude">): string {
  const { latitude, longitude } = location;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
}

/** The same place: two saved copies of one search result or one pair of typed coordinates. */
export const sameLocation = (a: TripLocation, b: TripLocation) =>
  a.label === b.label && a.address === b.address && a.latitude === b.latitude && a.longitude === b.longitude;

/** A day's access point (#208) and whose it is. */
export interface DayAccessPoint {
  location: TripLocation;
  /** "day" when it's the day's own, "stop" when every day at the stop shares it. */
  scope: "day" | "stop";
}

/**
 * The access point a day uses: its own while it's still at the stop it was
 * set for, otherwise its stop's. A day without a stop goes to the base, the
 * first stop, so `stops` must be in position order. Null when there's none.
 */
export function accessPointFor(
  stops: Array<Pick<TripStop, "id" | "access_point">>,
  day: Pick<TripDay, "stop_id" | "access_point" | "access_point_stop_id">,
): DayAccessPoint | null {
  const stop = stops.find((candidate) => candidate.id === day.stop_id) ?? stops[0];
  if (!stop) return null;
  if (day.access_point && day.access_point_stop_id === stop.id) return { location: day.access_point, scope: "day" };
  return stop.access_point ? { location: stop.access_point, scope: "stop" } : null;
}
