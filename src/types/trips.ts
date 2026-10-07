import type { SavedOutfit } from "@/types/savedKit";

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
  /** The outing outfit saved to this day (#170); null or missing when there's none. */
  outfit?: SavedOutfit | null;
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

export type TripLodgingAction = "save" | "remove" | "night";
export interface TripLodgingPreview {
  revision: number;
  nights: Array<{ date: string; date_label: string; before: string; after: string; morning: string | null; morning_origin: string }>;
  conflicts: string[];
  review_dates: string[];
  date_label: string;
}
