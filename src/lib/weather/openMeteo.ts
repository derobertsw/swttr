import "server-only";
import { isResortId } from "@/lib/locationSuggestion";
import { findResortPlace } from "@/lib/locations/resorts";
import type { TripStop } from "@/types/trips";
import type { ForecastPointProvenance } from "@/types/weather";

/**
 * Where a forecast is read, and how every Open-Meteo forecast request is
 * built (#7): Gear up's current, hourly and date-range weather, multi-day
 * plans and trip forecasts all go through here.
 *
 * A resort's point is read at its elevation. Open-Meteo downscales its
 * models to the `elevation` it's given (its docs: "Elevation used for
 * statistical downscaling"), so no lapse-rate correction is applied on top:
 * that would correct temperature twice. Without a known elevation the
 * parameter is left out and Open-Meteo uses its own terrain model. Raw air
 * temperature and wind go to the recommendation engine unchanged.
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
/** Below the Dead Sea shore to above any lift; Open-Meteo itself takes any number. */
const MIN_ELEVATION_M = -500;
const MAX_ELEVATION_M = 9_000;

export interface ForecastPoint {
  latitude: number;
  longitude: number;
  /** Meters; null leaves the elevation to the provider's terrain model. */
  elevationM: number | null;
  /** The resort catalog's ID, when the point is a resort's. */
  resortId: string | null;
  /** What the point is: "Top of K-1 Express Gondola", "Resort reference point". */
  label: string | null;
}

const finiteNumber = (value: unknown): number | null => {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
};

/**
 * A forecast point from a request: a known resort's catalog point, or
 * coordinates with an optional elevation in meters and label (a trip stop's
 * saved resort point, read where the trip saved it). A resort the catalog
 * doesn't know is refused rather than read somewhere else.
 */
export function readForecastPoint(input: { latitude: unknown; longitude: unknown; resortId?: unknown; elevationM?: unknown; label?: unknown }): ForecastPoint | { error: string } {
  if (input.resortId !== undefined && input.resortId !== null && input.resortId !== "") {
    const resort = isResortId(input.resortId) ? findResortPlace(input.resortId) : null;
    if (!resort) return { error: "That resort isn't in the resort list anymore. Choose the place again." };
    return {
      latitude: resort.latitude, longitude: resort.longitude, elevationM: resort.elevationM,
      resortId: resort.resortId, label: resort.pointLabel,
    };
  }
  const latitude = finiteNumber(input.latitude);
  const longitude = finiteNumber(input.longitude);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { error: "Invalid latitude or longitude" };
  }
  let elevationM: number | null = null;
  if (input.elevationM !== undefined && input.elevationM !== null && input.elevationM !== "") {
    elevationM = finiteNumber(input.elevationM);
    if (elevationM === null || elevationM < MIN_ELEVATION_M || elevationM > MAX_ELEVATION_M) {
      return { error: `Invalid elevation. Use meters from ${MIN_ELEVATION_M} to ${MAX_ELEVATION_M}.` };
    }
  }
  // A saved point's label (a trip stop's resort) is display text only, like a place's name.
  const label = typeof input.label === "string" && input.label.trim() && input.label.length <= 200 ? input.label.trim() : null;
  return { latitude, longitude, elevationM, resortId: null, label };
}

/**
 * A trip stop's forecast point: its saved coordinates, with the resort's
 * saved elevation and label. The stop's own saved values win over today's
 * catalog, so the forecast matches what the trip shows; a stop without a
 * resort is a general place.
 */
export function tripStopForecastPoint(stop: Pick<TripStop, "latitude" | "longitude"> & Partial<Pick<TripStop, "resort_id" | "forecast_elevation_m" | "forecast_point_label">>): ForecastPoint {
  const resort = isResortId(stop.resort_id) ? stop.resort_id : null;
  const elevation = resort ? finiteNumber(stop.forecast_elevation_m) : null;
  return {
    latitude: stop.latitude as number,
    longitude: stop.longitude as number,
    elevationM: elevation !== null && elevation >= MIN_ELEVATION_M && elevation <= MAX_ELEVATION_M ? elevation : null,
    resortId: resort,
    label: resort ? stop.forecast_point_label ?? null : null,
  };
}

/** One key per distinct point, for caches and shared in-flight requests. */
export function forecastPointKey(point: ForecastPoint): string {
  return `${point.latitude},${point.longitude},${point.elevationM ?? "terrain"}`;
}

/**
 * An Open-Meteo forecast URL for the point, in °F and mph, with Unix times
 * and the point's own time zone. `query` is the rest: "hourly=…&forecast_days=16".
 */
export function openMeteoForecastUrl(point: ForecastPoint, query: string): string {
  const elevation = point.elevationM === null ? "" : `&elevation=${Math.round(point.elevationM)}`;
  return `${FORECAST_URL}?latitude=${point.latitude}&longitude=${point.longitude}${elevation}&${query}`
    + "&timezone=auto&timeformat=unixtime&temperature_unit=fahrenheit&wind_speed_unit=mph";
}

/**
 * Where the forecast was read, for the weather's provenance: the point's
 * label, and the elevation Open-Meteo says it used (the requested one, or its
 * terrain model's).
 */
export function forecastPointProvenance(point: ForecastPoint, data: unknown): ForecastPointProvenance {
  const used = finiteNumber((data as { elevation?: unknown } | null)?.elevation);
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    ...(point.label ? { label: point.label } : {}),
    ...(point.resortId ? { resortId: point.resortId } : {}),
    ...(used !== null ? { elevationM: Math.round(used) } : point.elevationM !== null ? { elevationM: Math.round(point.elevationM) } : {}),
    elevationSource: point.elevationM === null ? "terrain" : "requested",
  };
}
