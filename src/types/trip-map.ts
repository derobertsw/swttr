import type { TripDriveDay, TripLocation } from "@/types/trips";

export type TripMapRole = "stay" | "destination" | "access" | "origin" | "pickup";
export type TripMapSource = { type: "stay" | "stop" | "day"; id: string; slot: "location" | "destination" | "access_point" | "origin" };

/** Identity belongs to the saved entity/slot, never to its coordinates. */
export interface TripMapPlace {
  id: string;
  source: TripMapSource;
  name: string;
  address: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  mapping: "mapped" | "missing_coordinates" | "invalid_coordinates";
  precision: TripLocation["precision"] | "unknown";
  provenance: Pick<TripLocation, "source" | "provider" | "provider_id" | "attribution"> | null;
  time_zone: string | null;
  roles: TripMapRole[];
  visits: Array<{ date: string; day_id: string; role: TripMapRole }>;
  nights: string[];
  night_range: { check_in: string | null; check_out: string | null } | null;
}

/** No fabricated line, including when a matrix estimate is available. */
export interface TripMapGeometry {
  state: "unavailable" | "not_applicable";
  reason: "not_requested" | "drive_not_ready";
  mode: "drive";
  revision: string | null;
  origin_place_id: string | null;
  access_place_id: string | null;
}

export interface TripMapDay {
  id: string;
  date: string;
  date_label: string;
  activity: string | null;
  revision: string;
  destination_place_id: string | null;
  origin_place_id: string | null;
  access_place_id: string | null;
  tonight_place_id: string | null;
  crew_stay_place_id: string | null;
  meeting_place_id: string | null;
  starting_from: string;
  staying_tonight: string;
  tonight_status: "assigned" | "no_stay" | "unplanned";
  /** #210 currently has free text only; there is no separately mappable pickup. */
  pickup: { place_id: null; state: "notes_only" | "not_set"; notes: string | null };
  tour: { objective: string; route_url: string | null; meet_label: string | null; time_zone_label: string | null; access_notes: string | null } | null;
  drive: TripDriveDay & { source: "geoapify" | "manual" | null };
  geometry: TripMapGeometry;
}

export interface TripMap {
  trip: { id: string; name: string };
  /** Opaque equality token. Consumers must also match the requested date and discard older requests. */
  revision: string;
  scope: { date: string | null };
  dates: Array<{ date: string; label: string }>;
  places: TripMapPlace[];
  days: TripMapDay[];
  counts: { mapped: number; total: number };
  provider: {
    renderer: "maplibre";
    style_url: string;
    browser_key_required: false;
    geometry: "on_demand";
    attribution: Array<{ label: string; url: string }>;
  };
}

/** A selected-day road line is independent of the saved/manual estimate. */
export type TripMapRoadGeometry = {
  trip_id: string;
  day_id: string;
  date: string;
  revision: string;
  mode: "drive";
  origin_place_id: string | null;
  access_place_id: string | null;
} & (
  | { state: "available"; geometry: { type: "MultiLineString"; coordinates: number[][][] }; provider: "geoapify"; calculated_at: string; attribution: Array<{ label: string; url: string }> }
  | { state: "unavailable" | "no_route" | "not_applicable"; geometry: null }
);
