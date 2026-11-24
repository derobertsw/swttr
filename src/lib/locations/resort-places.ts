import "server-only";
import { isResortId } from "@/lib/locationSuggestion";
import { findResortPlace } from "./resorts";

/** A trip stop's resort columns (migration 20261124100000); all null for a general place. */
interface TripResortFields {
  resort_id: string | null;
  forecast_elevation_m: number | null;
  forecast_point_label: string | null;
}

export const NO_RESORT: TripResortFields = { resort_id: null, forecast_elevation_m: null, forecast_point_label: null };

/**
 * A trip place with its resort point from the catalog (#7). The browser sends
 * only the resort's ID; the coordinates, elevation and label saved with it
 * are the catalog's, so they always belong together. A general place comes
 * back as it was, without resort fields (the database reads them as null).
 * Null when the ID isn't a resort the catalog knows: the person picks again.
 */
export function withResortPoint<T extends { latitude: number; longitude: number; resort_id?: unknown }>(place: T): (Omit<T, "resort_id"> & Partial<TripResortFields>) | null {
  const { resort_id: resortId, ...rest } = place;
  if (resortId === undefined || resortId === null) return rest;
  if (!isResortId(resortId)) return null;
  const resort = findResortPlace(resortId);
  if (!resort) return null;
  return {
    ...rest,
    latitude: resort.latitude,
    longitude: resort.longitude,
    resort_id: resort.resortId,
    forecast_elevation_m: resort.elevationM === null ? null : Math.round(resort.elevationM),
    forecast_point_label: resort.pointLabel,
  };
}
