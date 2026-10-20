import type { TripDriveDay, TripLocation } from "@/types/trips";

export type TripMapRole = "stay" | "destination" | "origin" | "access" | "meeting" | "tonight" | "pickup";
export interface TripMapPlace {
  /** Canonical entity/field identity; never derived from coordinates. */
  id: string;
  source: { kind: "stay" | "stop" | "day"; id: string; field: "location" | "destination" | "access_point" | "origin" };
  label: string;
  address: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  mapping: "mapped" | "missing_coordinates" | "invalid_coordinates";
  precision: TripLocation["precision"] | "unknown";
  provenance: { source: TripLocation["source"] | "legacy_destination" | null; provider: TripLocation["provider"]; provider_id: string | null; attribution: string | null };
  dates: string[];
  nights: string[];
  night_range: { check_in: string | null; check_out: string | null } | null;
  associations: Array<{ day_id: string; date: string; role: TripMapRole }>;
}

export interface TripMapDay {
  id: string;
  date: string;
  date_label: string;
  /** Opaque content revision, including endpoints, mode and closure options. */
  revision: string;
  destination: string | null;
  origin: string | null;
  crew_stay: string | null;
  access: string | null;
  meeting: string | null;
  tonight: string | null;
  pickup: string | null;
  /** #210 has free text pickup notes, no saved pickup coordinates. */
  pickup_state: "notes_only" | "not_set";
  starting_from: string;
  staying_tonight: string;
  tonight_state: "assigned" | "no_stay" | "unplanned";
  meet_label: string | null;
  drive: TripDriveDay;
}

export interface TripMapData {
  trip_id: string;
  revision: string;
  places: TripMapPlace[];
  days: TripMapDay[];
  selected_day: TripMapDay | null;
  provider: {
    renderer: "maplibre";
    style_url: string;
    attribution: Array<{ label: string; url: string }>;
  };
}

/** Geometry has its own state: an estimate does not imply a polyline. */
export type TripMapGeometry = {
  trip_id: string;
  day_id: string;
  date: string;
  revision: string;
  mode: "drive";
  origin: string | null;
  access: string | null;
} & (
  | { state: "available"; geometry: { type: "MultiLineString"; coordinates: number[][][] }; provider: "geoapify"; calculated_at: string; attribution: Array<{ label: string; url: string }> }
  | { state: "unavailable" | "no_route" | "not_applicable"; geometry: null }
);
