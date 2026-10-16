import type { SavedKit } from "@/types/savedKit";

export type TripStatus = "planning" | "next_up" | "live" | "past";
export type TripMemberRole = "organizer" | "member" | "guest";
export type TripMemberStatus = "joined" | "invited" | "guest" | "left";
export type TripEffort = "easy" | "steady" | "hard";
export type TripKitState = "ok" | "warn" | "missing";

export interface Trip {
  id: string;
  owner_user_id: string;
  name: string;
  start_date: string; // ISO date
  end_date: string;
  status: TripStatus;
  created_at: string;
  updated_at: string;
  lodging_revision?: number;
}

export interface TripStop {
  id: string;
  trip_id: string;
  position: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  activities: string[];
  created_at: string;
  /** Where the crew parks or meets on days here (#208); missing before migration 027. Not the weather location. */
  access_point?: TripLocation | null;
}

export interface TripMember {
  id: string;
  trip_id: string;
  user_id: string | null;
  display_name: string;
  role: TripMemberRole;
  status: TripMemberStatus;
  invite_token: string | null;
  created_at: string;
}

export interface TripDay {
  id: string;
  trip_id: string;
  stop_id: string | null;
  date: string;
  activity: string | null;
  /** This day's own access point (#208), used instead of its stop's while the day is at `access_point_stop_id`. */
  access_point?: TripLocation | null;
  access_point_stop_id?: string | null;
}

export interface TripMemberDayKit {
  id: string;
  trip_day_id: string;
  trip_member_id: string;
  effort: TripEffort;
  /** Category checklist slots, from before saved outfits. */
  items: string[];
  note: string | null;
  state: TripKitState;
  updated_at: string;
  /** The outing outfit or plan day saved to this day (#170); null or missing when there's none. */
  outfit?: SavedKit | null;
  /** When the outfit was saved. */
  outfit_saved_at?: string | null;
}

export interface TripGroupGear {
  id: string;
  trip_id: string;
  description: string;
  assignee_member_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface TripSummary extends Trip {
  member_count: number;
  stop_count: number;
}

export interface TripFull {
  trip: Trip;
  stops: TripStop[];
  members: TripMember[];
  days: TripDay[];
  kits: TripMemberDayKit[];
  gear: TripGroupGear[];
  /** Optional for older cached trip responses; the API always supplies it. */
  lodging?: TripLodging;
}

export type TripStayType = "hotel" | "rental" | "hut" | "campground" | "other";

/**
 * A confirmed place for trip logistics (#208): a stay, or a destination's access point.
 * It is never an activity's weather location. See docs/trip-locations.md.
 */
export interface TripLocation {
  label: string;
  address: string | null;
  latitude: number;
  longitude: number;
  /** "approximate" is a town or area: too broad for a drive estimate. */
  precision: "exact" | "approximate";
  /** IANA zone, when the provider resolved one. */
  time_zone: string | null;
  /** A search result, or coordinates the organizer typed. */
  source: "search" | "manual";
  provider: "geoapify" | null;
  provider_id: string | null;
  /** The data source's credit, kept with the place as the provider asks. */
  attribution: string | null;
}

export interface TripStayInput {
  id: string;
  name: string;
  check_in: string | null;
  check_out: string | null;
  type: TripStayType | null;
  address: string | null;
  property_url: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  notes: string | null;
  booking_status: "not_booked" | "booked";
  /** Missing in a save keeps the saved location; null removes it. */
  location?: TripLocation | null;
}

export interface TripStay extends TripStayInput {
  trip_id: string;
  created_at: string;
  updated_at: string;
}

export interface TripLodgingNight {
  trip_id: string;
  date: string;
  stay_id: string | null;
  status: "assigned" | "no_stay";
}

export interface TripStaySummary extends TripStay {
  date_label: string;
  night_count: number;
  assigned_nights: string[];
  review_dates: string[];
}

export interface TripLodgingContext {
  date: string;
  starting_from: string;
  starting_stay_id: string | null;
  staying_tonight: string;
  tonight_stay_id: string | null;
}

export interface TripLodging {
  revision: number;
  stays: TripStaySummary[];
  assignments: TripLodgingNight[];
  nights: Array<{ date: string; date_label: string; pre_trip: boolean; label: string; stay_id: string | null; status: "assigned" | "no_stay" | "unplanned" }>;
  days: TripLodgingContext[];
}

/** How a date change treats day plans: see docs/trip-editing.md. */
export type TripDateChangeMode = "move" | "keep";

export interface TripDateChangeDay {
  date: string;
  date_label: string;
  /** For a moved day, the date its plan comes from. */
  from_date_label: string | null;
  destination: string;
  activity: string | null;
  /** Names of the crew with a kit on this day. */
  kits: string[];
}

/** A removed day as the server last saw it; sent back to confirm the removal. */
export interface TripRemovedDayCheck {
  date: string;
  stop_id: string | null;
  activity: string | null;
  kit_ids: string[];
}

export interface TripDateChangePlan {
  mode: TripDateChangeMode;
  moved: TripDateChangeDay[];
  added: TripDateChangeDay[];
  removed: TripDateChangeDay[];
  /** Days that keep their date and plan. */
  kept: number;
  expected_removed: TripRemovedDayCheck[];
}

export interface TripDateChangePreview {
  from: { start_date: string; end_date: string; label: string };
  to: { start_date: string; end_date: string; label: string };
  /** Moving is offered only when the trip keeps its length. */
  plans: { keep: TripDateChangePlan; move?: TripDateChangePlan };
  lodging_after: TripLodging;
  lodging_revision: number;
}

export type TripLodgingAction = "save" | "remove" | "night";
export interface TripLodgingPreview {
  revision: number;
  nights: Array<{ date: string; date_label: string; before: string; after: string; morning: string | null; morning_origin: string }>;
  conflicts: string[];
  review_dates: string[];
  date_label: string;
}

/**
 * A day's drive from its morning origin to its access point (#209), or why
 * there's no estimate. See docs/trip-locations.md.
 * - available: calculated for this origin and access point.
 * - stale: calculated for them over a week ago, and recalculating failed.
 * - unavailable: recalculating failed and there's no estimate for them.
 * - no_route: the provider found no road route (a hut, a summit).
 * - missing_origin: no stay the night before, or No stay needed.
 * - origin_not_located / approximate_origin: that stay has no location, or only a town or area.
 * - missing_access_point / approximate_access_point: the same for the day's access point.
 * - no_destination: no day plan or destination yet.
 */
export type TripDriveState =
  | "available" | "stale" | "unavailable" | "no_route"
  | "missing_origin" | "origin_not_located" | "approximate_origin"
  | "missing_access_point" | "approximate_access_point" | "no_destination";

export interface TripDriveEstimate {
  /** One way, by road: "35 min", "1 hr 5 min". */
  duration_label: string;
  /** "14 mi", "0.4 mi". */
  distance_label: string;
  calculated_at: string;
}

export interface TripDriveDay {
  date: string;
  date_label: string;
  /** The night whose stay the day starts from: "Fri Jan 9". */
  night_label: string;
  state: TripDriveState;
  /** The stay of the night before, when there is one. */
  origin: { label: string; stay_id: string } | null;
  /** The day's access point, when there is one. */
  destination: { label: string } | null;
  estimate: TripDriveEstimate | null;
  /** An earlier estimate for a different origin or access point: only for Estimate details, with its own pair. */
  previous: (TripDriveEstimate & { origin_label: string; destination_label: string }) | null;
  /** Winter closures the estimate avoids: "VT 108 through Smugglers' Notch, usually closed November to mid-May". */
  closures: string[];
  /** Directions with both exact endpoints, when there's a road route to expect. */
  directions: { apple: string; google: string } | null;
}

export interface TripStayDepartures {
  stay_id: string;
  /** Mornings that start from the stay, checkout morning included, in date order. */
  dates: string[];
  /** The first of them from today on, in the stay's time zone; null once they've all passed. */
  next: string | null;
}

/** GET /api/v1/trips/:id/drive-estimates. Overview stays and day pages share it. */
export interface TripDriveEstimates {
  days: TripDriveDay[];
  stays: TripStayDepartures[];
}

/** A searched place: its display name and coordinates. */
export interface TripPlace {
  name: string;
  latitude: number;
  longitude: number;
}

/** An itinerary change to review before saving: see docs/trip-editing.md. */
export type TripItineraryRequest =
  | { action: "remove_stop"; stop_id: string }
  | { action: "reorder_stops"; order: string[] }
  /** A present key sets that field on every date; `activity: null` clears it. */
  | { action: "assign_days"; dates: string[]; stop_id?: string; activity?: string | null }
  | { action: "set_day_place"; date: string; place: TripPlace }
  /** Gives `dates` the destination and activity of `from`, and with `kit` the signed-in member's kit too. */
  | { action: "copy_day"; from: string; dates: string[]; kit: boolean };

/** Sets or removes a day's access point (#208); the review asks whether it's for the day or every day at its stop. */
export interface TripAccessPointRequest {
  action: "set_access_point";
  date: string;
  location: TripLocation | null;
}

/** A day's destination and activity before and after, each as "<stop>[ (base)] · <activity|No activity>". */
export interface TripItineraryChange {
  date: string;
  date_label: string;
  before: string;
  after: string;
  /** What happens to kits on the day: a copied kit, and the kits that stay as saved when its plan changes. */
  notes?: string[];
}

export interface TripItineraryOption {
  key: string;
  label: string;
  detail: string | null;
  /** The days whose destination or activity changes, or that get a copied kit. */
  changes: TripItineraryChange[];
  /** How many other days keep their destination and activity. */
  unchanged: number;
  /** Sent back with the action to save this option; the server checks it against the trip. */
  payload: Record<string, unknown>;
}

export interface TripItineraryPreview {
  /** One option, or several to choose from with no default. */
  options: TripItineraryOption[];
}
