import type { LocationSuggestion } from "@/types/recommendations";

/**
 * Resort identity on a picked place (#7), shared by the browser and the API.
 * A place is either an ordinary geocoded place (numeric ID, or 0 for the
 * device) or a catalog resort ("resort:<resortId>") with its forecast point.
 */

/**
 * A trip stop's place in Gear up (#335). A resort stop keeps this ID with its
 * resort fields: its point is the one the trip saved, not today's catalog's.
 */
export const TRIP_STOP_PLACE_ID = -1;

/** Catalog resort IDs: Wikidata, skimap.org or OpenStreetMap identities (docs/ski-resort-catalog.md). */
export function isResortId(value: unknown): value is string {
  return typeof value === "string" && /^(wd-Q\d{1,12}|skimap-\d{1,12}|osm-[nwr]\d{1,15})$/.test(value);
}

const POINT_KINDS = new Set(["lift", "reference"]);

/** Plausible forecast-point elevations in meters; Open-Meteo accepts any finite value. */
const isElevationM = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= -500 && value <= 9_000;

type ResortFields = Pick<LocationSuggestion, "kind" | "source" | "resortId" | "elevationM" | "pointLabel" | "pointKind">;

/**
 * A place's resort fields, checked: {} for an ordinary place, null when they
 * are malformed or don't agree with each other (a resort ID on a place whose
 * ID says it's a town).
 */
export function readResortFields(value: Record<string, unknown>): ResortFields | null {
  const keys = ["kind", "source", "resortId", "elevationM", "pointLabel", "pointKind"];
  if (keys.every((key) => value[key] === undefined)) {
    return typeof value.id === "string" ? null : {};
  }
  const label = value.pointLabel;
  if (value.kind !== "resort" || value.source !== "openskidata" || !isResortId(value.resortId)
    || (value.id !== `resort:${value.resortId}` && value.id !== TRIP_STOP_PLACE_ID)
    || !(value.elevationM === null || isElevationM(value.elevationM))
    || typeof label !== "string" || !label.trim() || label.length > 200
    || !POINT_KINDS.has(value.pointKind as string)) return null;
  return {
    kind: "resort", source: "openskidata", resortId: value.resortId,
    elevationM: value.elevationM as number | null, pointLabel: label,
    pointKind: value.pointKind as "lift" | "reference",
  };
}

/** "1,262 m (4,140 ft)": both, since the forecast point is the same for everyone. */
export function formatElevation(meters: number): string {
  const feet = Math.round(meters * 3.28084);
  return `${Math.round(meters).toLocaleString("en-US")} m (${feet.toLocaleString("en-US")} ft)`;
}

/** Where a picked resort's weather is read: "Forecast at Top of K-1 Express Gondola, 1,262 m (4,140 ft)". */
export function forecastPointText(place: LocationSuggestion): string | null {
  if (place.kind !== "resort" || !place.pointLabel) return null;
  return place.elevationM == null
    ? `forecast at ${place.pointLabel}, elevation not mapped`
    : `forecast at ${place.pointLabel}, ${formatElevation(place.elevationM)}`;
}

/** The place's ID as a list key or map key: geocoder IDs and resort IDs never collide. */
export const placeKey = (place: Pick<LocationSuggestion, "id">) => String(place.id);

/**
 * The same weather location: same coordinates and the same resort point. A
 * resort's point and a town at those coordinates aren't the same place.
 */
export function isSameLocation(a: LocationSuggestion, b: LocationSuggestion | null): boolean {
  return b !== null && a.latitude === b.latitude && a.longitude === b.longitude
    && (a.resortId ?? null) === (b.resortId ?? null) && (a.elevationM ?? null) === (b.elevationM ?? null);
}

/** A picked place without how the search matched it, which means nothing once chosen. */
export function pickedPlace(suggestion: LocationSuggestion): LocationSuggestion {
  const place = { ...suggestion };
  delete place.match;
  return place;
}

/** Which search a picker runs: resorts only, or every place including resorts. */
export type LocationSearchKind = "resort" | "all";

/**
 * Resort search (#7). Every forecast path reads a resort's point and
 * elevation; set to false to put every picker back on the general search.
 */
const RESORT_SEARCH_ENABLED = true;

/** Alpine skiing searches resorts; every other activity, and none, searches all places. */
export function searchKindFor(activity: string | null | undefined, enabled = RESORT_SEARCH_ENABLED): LocationSearchKind | undefined {
  if (!enabled) return undefined;
  return activity === "alpine_skiing" || activity === "Alpine" ? "resort" : "all";
}

/**
 * A trip stop's resort as a place's fields (#7), so Gear up for a trip day
 * reads the same forecast point the trip saved. {} for a general place.
 */
export function resortFieldsOfStop(stop: { resort_id?: string | null; forecast_elevation_m?: number | null; forecast_point_label?: string | null }): Partial<LocationSuggestion> {
  if (!isResortId(stop.resort_id) || !stop.forecast_point_label) return {};
  return {
    kind: "resort", source: "openskidata", resortId: stop.resort_id,
    elevationM: isElevationM(stop.forecast_elevation_m) ? stop.forecast_elevation_m : null,
    pointLabel: stop.forecast_point_label,
    pointKind: stop.forecast_point_label === REFERENCE_POINT_LABEL ? "reference" : "lift",
  };
}

/** What the catalog calls a resort's fallback point (src/lib/locations/resorts.ts). */
const REFERENCE_POINT_LABEL = "Resort reference point";

/**
 * Where a place's forecast is read, as the weather APIs take it:
 * - a picked resort by its catalog ID; the API reads its point and elevation
 *   from the catalog;
 * - a trip stop's resort by the point and elevation the trip saved, as the
 *   trip's own forecast reads it, so a re-imported or removed catalog entry
 *   can't move it (or break it);
 * - anything else by its coordinates.
 */
export function forecastLocationOf(place: Pick<LocationSuggestion, "id" | "latitude" | "longitude" | "kind" | "resortId" | "elevationM" | "pointLabel">): { lat: number; lon: number; resort?: string; elevation?: number; label?: string } {
  const location = { lat: place.latitude, lon: place.longitude };
  if (place.kind !== "resort" || !isResortId(place.resortId)) return location;
  if (place.id !== TRIP_STOP_PLACE_ID) return { ...location, resort: place.resortId };
  return {
    ...location,
    ...(isElevationM(place.elevationM) ? { elevation: place.elevationM } : {}),
    ...(place.pointLabel ? { label: place.pointLabel } : {}),
  };
}

/** A trip place (stop or destination) from a picked place; the API fills the resort's point from the catalog. */
export function tripPlaceFrom(place: LocationSuggestion): { name: string; latitude: number; longitude: number; resort_id?: string } {
  return {
    name: place.region ? `${place.name}, ${place.region}` : `${place.name}, ${place.country}`,
    latitude: place.latitude,
    longitude: place.longitude,
    ...(place.kind === "resort" && place.resortId ? { resort_id: place.resortId } : {}),
  };
}
