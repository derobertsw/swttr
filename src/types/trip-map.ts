import type { TripDriveRoute, TripLocation } from "@/types/trips";

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
  /** As the Day page shows it: the day's own activity, or its destination's first. */
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
  /** The day's meet time (#333), for every sport; where is `meeting_place_id`, the access point. */
  meet: { label: string; time_zone_label: string } | null;
  /** approach_notes is the organizer's ski/walk approach as entered: never a calculated route or time. */
  tour: { objective: string; route_url: string | null; access_notes: string | null; approach_notes: string | null } | null;
  drive: TripMapDrive;
  geometry: TripMapGeometry;
  /**
   * Who starts where that morning (#333), the crew's first: its drive and
   * geometry are the day's own. Another departure's road line is requested
   * with its own geometry revision, only when someone shows that drive.
   */
  departures: TripMapDeparture[];
  /** Each person's morning and night (#333), so a view can lead with the signed-in person's own. */
  people: TripMapPerson[];
}

export interface TripMapPerson {
  member_id: string;
  /** Their departure's key, while they're taking part. */
  departure_key: string | null;
  /** Their stay's name, "Not set", "Arrives this day", "Not taking part" or "Not on trip". */
  starting_from: string;
  tonight_place_id: string | null;
  staying_tonight: string;
}

export type TripMapDrive = TripDriveRoute & { source: "geoapify" | "manual" | null };

/** People taking part in a day who start from the same place, and their drive. */
export interface TripMapDeparture {
  key: string;
  /** The stay's or place's name, "Not set" or "Arrives this day". */
  label: string;
  /** In crew order; a pending invitation is listed once it has a stay for the night. */
  people: Array<{ member_id: string; name: string; pending: boolean }>;
  crew: boolean;
  origin_place_id: string | null;
  drive: TripMapDrive;
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
