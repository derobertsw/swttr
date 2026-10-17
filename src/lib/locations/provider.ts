import "server-only";
import { isTimeZone } from "@/lib/timeZones";
import { isUsableCoordinate, roundCoordinate } from "@/lib/trip-location";
import type { TripLocation } from "@/types/trips";

/**
 * Place search for trip logistics (#208). Only this module knows the
 * provider: routes and the UI work with TripLocation, so a later switch
 * (#283) changes this file, not the database or the picker.
 *
 * Provider choice and pilot: docs/trip-locations.md.
 */

export class LocationSearchUnavailable extends Error {}

type Point = { latitude: number; longitude: number };

const AUTOCOMPLETE_URL = "https://api.geoapify.com/v1/geocode/autocomplete";
const TIMEOUT_MS = 6_000;
const PROVIDER_LIMIT = 10;
const RESULT_LIMIT = 6;
/** Farther than this from every trip destination is the pilot's junk (Osaka for "Hotel Jay"). */
const FAR_KM = 1_000;

/** Results of these types or categories are a town or area, not a door or a lot. */
const AREA_TYPES = new Set(["city", "suburb", "district", "county", "state", "country", "postcode", "street", "unknown"]);
const AREA_CATEGORY = /^(administrative|populated_place)/;

interface GeoapifyResult {
  name?: unknown; address_line1?: unknown; address_line2?: unknown; formatted?: unknown;
  lat?: unknown; lon?: unknown; result_type?: unknown; category?: unknown; place_id?: unknown;
  timezone?: { name?: unknown }; rank?: { confidence?: unknown };
  datasource?: { attribution?: unknown };
}

const text = (value: unknown, max: number) => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;

function kilometres(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

/** Geoapify's result_type alone isn't enough: Jay Peak Nordic Center came back as a postcode. */
function precisionOf(result: GeoapifyResult): TripLocation["precision"] {
  const category = typeof result.category === "string" ? result.category : "";
  if (category && !AREA_CATEGORY.test(category) && text(result.name, 300)) return "exact";
  return AREA_TYPES.has(String(result.result_type)) || AREA_CATEGORY.test(category) ? "approximate" : "exact";
}

function toTripLocation(result: GeoapifyResult): TripLocation | null {
  if (!isUsableCoordinate(result.lat, result.lon)) return null;
  const label = text(result.name, 300) ?? text(result.address_line1, 300) ?? text(result.formatted, 300);
  if (!label) return null;
  // The second line repeats a town's own name ("Lake Placid, Lake Placid, FL").
  const line2 = text(result.address_line2, 1000);
  const address = line2?.startsWith(`${label}, `) ? line2.slice(label.length + 2) : line2;
  const zone = result.timezone?.name;
  return {
    label, address: address && address !== label ? address : null,
    latitude: roundCoordinate(result.lat as number), longitude: roundCoordinate(result.lon as number),
    precision: precisionOf(result),
    time_zone: isTimeZone(zone) ? zone : null,
    source: "search", provider: "geoapify",
    provider_id: text(result.place_id, 500),
    attribution: text(result.datasource?.attribution, 300) ?? "© OpenStreetMap contributors",
  };
}

/**
 * Most confident first, then exact places before areas, then nearest a trip
 * destination, without far-away namesakes or duplicates. Ties keep the
 * provider's order.
 */
const exactFirst = (location: TripLocation) => location.precision === "exact" ? 0 : 1;

export function rankResults(results: GeoapifyResult[], near: Point[]): TripLocation[] {
  const seen = new Set<string>();
  return results.flatMap((result, order) => {
    const location = toTripLocation(result);
    if (!location) return [];
    const distance = near.length ? Math.min(...near.map((point) => kilometres(point, location))) : 0;
    if (distance > FAR_KM) return [];
    const key = `${location.label.toLowerCase()}|${location.latitude.toFixed(4)}|${location.longitude.toFixed(4)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const confidence = typeof result.rank?.confidence === "number" && Number.isFinite(result.rank.confidence) ? result.rank.confidence : 0;
    return [{ location, confidence, distance, order }];
  }).sort((a, b) => b.confidence - a.confidence || exactFirst(a.location) - exactFirst(b.location)
    || a.distance - b.distance || a.order - b.order)
    .slice(0, RESULT_LIMIT).map(({ location }) => location);
}

/** Counts only: no query text, no coordinates. Shows how close we run to the free daily credits. */
function logUsage(outcome: string, results = 0) {
  console.info(JSON.stringify({ event: "location_search", provider: "geoapify", outcome, results }));
}

/**
 * Searches names and addresses near the trip's destinations. Throws
 * LocationSearchUnavailable when the key is missing or the provider fails or
 * refuses the search, so the caller can say so and offer manual entry.
 */
export async function searchLocations(query: string, near: Point[]): Promise<TripLocation[]> {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) throw new LocationSearchUnavailable("Location search isn't configured.");
  const url = new URL(AUTOCOMPLETE_URL);
  url.searchParams.set("text", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("lang", "en");
  url.searchParams.set("limit", String(PROVIDER_LIMIT));
  if (near.length) {
    const centre = {
      latitude: near.reduce((sum, point) => sum + point.latitude, 0) / near.length,
      longitude: near.reduce((sum, point) => sum + point.longitude, 0) / near.length,
    };
    url.searchParams.set("bias", `proximity:${centre.longitude},${centre.latitude}`);
  }
  url.searchParams.set("apiKey", key);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    logUsage("network_error");
    throw new LocationSearchUnavailable("Location search didn't respond.");
  }
  if (!response.ok) {
    // 401/403: key problem. 429: Geoapify limited the account (see Provider in
    // docs/trip-locations.md).
    logUsage(`http_${response.status}`);
    throw new LocationSearchUnavailable(`Location search failed (${response.status}).`);
  }
  const body: unknown = await response.json().catch(() => null);
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) {
    logUsage("bad_response");
    throw new LocationSearchUnavailable("Location search sent an unreadable answer.");
  }
  const ranked = rankResults(results as GeoapifyResult[], near);
  logUsage("ok", ranked.length);
  return ranked;
}
