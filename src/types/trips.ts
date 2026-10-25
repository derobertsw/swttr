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
  /**
   * This day's own starting point (#209), used instead of the crew stay of the
   * night before. `origin_stay_id` is the saved stay it was picked from, while
   * that stay exists; `origin` keeps the place under the stay's name.
   */
  origin?: TripLocation | null;
  origin_stay_id?: string | null;
  /** No drive planned: the day starts on foot or skis, or the crew meets there. */
  no_drive?: boolean;
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
  /** Missing only in snapshots from before shared responsibility tracking. */
  revision?: string;
  accepted_at?: string | null;
  accepted_by?: string | null;
  packed_at?: string | null;
  packed_by?: string | null;
  assigned_at?: string | null;
  assigned_by?: string | null;
  events?: SharedGearEvent[];
}

export interface SharedGearEvent {
  action: string;
  actor: string | null;
  at: string;
  assignee: string | null;
}

export interface TripCrewCounts {
  joined: number;
  pending: number;
  guests: number;
}

export interface TripSummary extends Trip {
  crew_counts?: TripCrewCounts;
  member_count: number;
  stop_count: number;
}

export interface TripFull {
  crew_counts?: TripCrewCounts;
  trip: Trip;
  stops: TripStop[];
  members: TripMember[];
  days: TripDay[];
  kits: TripMemberDayKit[];
  gear: TripGroupGear[];
  /** Optional for older cached trip responses; the API always supplies it. */
  lodging?: TripLodging;
  /** Backcountry days' tour plans (#210); optional like `lodging`. */
  tour_plans?: TripTourPlanSummary[];
  /** Each day's conditions sources with the crew's reviews (#211); optional like `lodging`. */
  conditions?: TripDayConditionsSource[];
  /** People's own starting points (#333); missing or empty before its migration. */
  member_origins?: TripMemberDayOrigin[];
  /** Backcountry days' day checks (#212); optional like `lodging`. */
  day_checks?: TripDayChecks[];
  /** Tour preparation the signed-in person can act on, for Plan's own page (#212); optional like `lodging`. */
  preparation?: TripPreparationItem[];
}

/**
 * One person's own starting point for a day (#333), used instead of the day's
 * own and the stay they slept in: see docs/trip-locations.md.
 */
export interface TripMemberDayOrigin {
  trip_id: string;
  trip_day_id: string;
  member_id: string;
  /** Null keeps where they'd start anyway; then `no_drive` is set. */
  origin: TripLocation | null;
  /** The saved stay it was picked from, while that stay exists. */
  origin_stay_id: string | null;
  no_drive: boolean;
}

/** A Backcountry day's tour plan as the organizer enters it: see docs/trip-tour-plans.md. */
export interface TripTourPlanInput {
  objective: string;
  route_url: string | null;
  /** "HH:MM" on the destination's clock. */
  meet_time: string | null;
  /** -1 meets the evening before. */
  meet_day_offset: -1 | 0;
  distance: number | null;
  distance_unit: "km" | "mi" | null;
  ascent: number | null;
  ascent_unit: "m" | "ft" | null;
  duration_minutes: number | null;
  /** Where the distance, ascent and duration come from; null is the crew's own estimate. */
  metrics_source: string | null;
  metrics_source_url: string | null;
  approach_notes: string | null;
  access_notes: string | null;
  access_url: string | null;
  backup_plan: string | null;
  return_time: string | null;
  /** 1 returns the day after. */
  return_day_offset: 0 | 1;
  checkin_notes: string | null;
  pickup_notes: string | null;
}

export interface TripTourPlan extends TripTourPlanInput {
  id: string;
  trip_id: string;
  trip_day_id: string;
  /** The destination's IANA time zone when the plan was saved, if it could be found. */
  time_zone: string | null;
  revision: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

/** A saved tour plan with the server's labels for it. */
export interface TripTourPlanSummary extends TripTourPlan {
  date: string;
  /** e.g. "6:30 AM MDT · Sat Oct 10", or with ", the day before". */
  meet_label: string | null;
  return_label: string | null;
  /** e.g. "14.2 km · 1,200 m ascent · 6 h 30 min". */
  metrics_label: string | null;
  /** "Crew estimate" or "Source: …", when there are figures. */
  metrics_source_label: string | null;
  /** Says whose clock the times use; null without times. */
  time_zone_label: string | null;
  updated_label: string;
}

export type TripConditionsCategory = "avalanche" | "weather" | "access";

/** An official conditions source as the organizer enters it: see docs/trip-conditions.md. */
export interface TripConditionsSourceInput {
  category: TripConditionsCategory;
  name: string;
  /** The forecast zone or area it covers. */
  region: string | null;
  url: string;
}

export interface TripConditionsSource extends TripConditionsSourceInput {
  id: string;
  trip_id: string;
  revision: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * What a review was recorded against: the day's plan and the source as they
 * were. A review goes stale when any of it changes.
 */
export interface TripConditionsContext {
  date: string;
  /** The destination, with its weather location. */
  stop: { id: string; latitude: number | null; longitude: number | null } | null;
  activity: string | null;
  access_point: { latitude: number; longitude: number } | null;
  route: { objective: string; route_url: string | null } | null;
  source: { url: string; region: string | null };
}

/** One entry in a person's review history. */
export interface TripConditionsReviewEntry {
  id: string;
  action: "reviewed" | "corrected" | "withdrawn";
  note: string | null;
  /** When the review was recorded; a correction or withdrawal keeps it. */
  reviewed_at: string;
  /** When this entry was saved. */
  created_at: string;
}

/** A person's review of a source on a day. */
export interface TripConditionsReview {
  user_id: string;
  /** Their latest entry: the review, or its withdrawal. */
  current: TripConditionsReviewEntry;
  /** What changed since the review was recorded, e.g. "Route changed"; empty while it matches the plan. */
  stale_reasons: string[];
  /** Earlier entries, newest first. */
  history: TripConditionsReviewEntry[];
}

/** A source on a day, with everyone's reviews of it for that day. */
export interface TripDayConditionsSource extends TripConditionsSource {
  date: string;
  trip_day_id: string;
  /** The day's plan and this source as the server reads them now; recording a review sends it back. */
  context_key: string;
  reviews: TripConditionsReview[];
}

/** A day check on a Backcountry day (#212): see docs/trip-touring-prep.md. */
export type TripDayCheckKind = "plan_review" | "transceiver";

/** What a plan review was recorded against. Notes and figures aren't part of it. */
export interface TripPlanReviewContext {
  date: string;
  plan: {
    objective: string;
    route_url: string | null;
    backup_plan: string | null;
    /** "HH:MM" on the destination's clock. */
    meet_time: string | null;
    meet_day_offset: number;
    return_time: string | null;
    return_day_offset: number;
  } | null;
  meeting_point: { latitude: number; longitude: number } | null;
}

/** What a transceiver check was recorded against: the transceiver in the person's packing list, if any. */
export interface TripTransceiverContext {
  date: string;
  /** `added_at` is when it was put in the list; null for one added before it was recorded. */
  transceiver: { added_at: string | null } | null;
}

/** One entry in a check's history. */
export interface TripDayCheckEntry {
  id: string;
  action: "recorded" | "withdrawn";
  /** Who saved it: the person, or the organizer for a managed guest. */
  recorded_by: string;
  created_at: string;
  /** e.g. "6:12 AM MST · Sat Feb 13", on the destination's clock. */
  time_label: string;
  /** The tour plan's revision a plan review was recorded against. */
  plan_revision: number | null;
}

/** One person's check on a day. */
export interface TripDayCheck {
  kind: TripDayCheckKind;
  member_id: string;
  /** Out of date: recorded, but what it covers has changed since. */
  status: "not_recorded" | "recorded" | "out_of_date";
  /** The latest entry: the check, or its withdrawal; null before anything was recorded. */
  current: TripDayCheckEntry | null;
  /** Earlier entries, newest first. */
  history: TripDayCheckEntry[];
  /** What changed since it was recorded, e.g. "Route changed"; empty unless it's out of date. */
  stale_reasons: string[];
  /** Whether the signed-in person may record or withdraw it: their own, or a managed guest's for the organizer. */
  can_record: boolean;
  /** What it covers as the server reads it now, sent back to record it; null for anyone who can't. */
  context_key: string | null;
}

/** A Backcountry day's checks, for each person taking part. */
export interface TripDayChecks {
  date: string;
  trip_day_id: string;
  /** False without a tour plan, when there's no plan to review yet. */
  plan_available: boolean;
  checks: TripDayCheck[];
}

/**
 * A fact about tour preparation that the signed-in person can act on, for
 * Plan's own page. Never a readiness score. `scope` puts their own first.
 */
export interface TripPreparationItem {
  kind: "plan_out_of_date" | "transceiver_out_of_date" | "plan_not_reviewed" | "transceiver_not_checked"
    | "no_tour_plan" | "guest_check" | "crew_out_of_date";
  scope: "personal" | "crew";
  date: string;
  label: string;
  action: { label: string; href: string };
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

/**
 * A saved lodging plan for a night: a person's (#331), or, without
 * `member_id`, the whole crew's from before per-person nights. No row is Not planned.
 */
export interface TripLodgingNight {
  trip_id: string;
  date: string;
  stay_id: string | null;
  status: "assigned" | "no_stay";
  member_id?: string;
}

/**
 * A person's dates on the trip (#331): see docs/trip-stays.md. Without a saved
 * row they're on it from the pre-trip night through the last night, taking
 * part every day. Their arrival night is on the trip and their departure night
 * isn't, like a stay's check-in and check-out.
 */
export interface TripAttendanceInput {
  arrival_date: string | null;
  departure_date: string | null;
  /** Days they're there but not taking part in the day's plan, such as an evening arrival. */
  skipped_dates: string[];
}

export interface TripMemberAttendance extends TripAttendanceInput {
  trip_id: string;
  member_id: string;
}

/** One person's plan for one night. */
export type TripLodgingState = "assigned" | "no_stay" | "unplanned" | "not_on_trip";
export type TripDayParticipation = "participating" | "skipping" | "not_on_trip";

export interface TripPersonNight {
  date: string;
  state: TripLodgingState;
  stay_id: string | null;
  /** The stay's name, "No accommodation needed", "Not planned" or "Not on trip". */
  label: string;
}

export interface TripPersonDay {
  date: string;
  participation: TripDayParticipation;
  /** Their stay the night before, while they take part. */
  starting_stay_id: string | null;
  /** The stay's name, "Not set", "Arrives this day", "Not taking part" or "Not on trip". */
  starting_from: string;
  tonight_stay_id: string | null;
  staying_tonight: string;
}

/** A person's consecutive nights with the same plan (#332). */
export interface TripPersonRun {
  state: TripLodgingState;
  stay_id: string | null;
  /** As TripPersonNight's. */
  label: string;
  /** The first night, and the morning after the last one. */
  start: string;
  end: string;
  nights: number;
  /** "Fri Oct 9 → Sun Oct 11 · 2 nights", as a stay's dates read. */
  date_label: string;
  /** Not planned on a night between trip days: see `gaps`. */
  gap: boolean;
}

/** A morning someone leaves one stay and sleeps in another that night. */
export interface TripPersonChangeover {
  date: string;
  date_label: string;
  from: string;
  to: string;
}

/** A person's attendance and nights, as the server works them out. */
export interface TripLodgingPerson {
  member_id: string;
  display_name: string;
  role: TripMemberRole;
  /** Their membership as saved: attendance and lodging never change it. */
  membership: TripMemberStatus;
  attendance: TripAttendanceInput & {
    /** "Whole trip", or e.g. "Arrives Sat Oct 10 · Skips Sat Oct 10". */
    label: string;
    /** Saved dates the trip's dates no longer include, kept for review. */
    review_dates: string[];
  };
  /** Every night from the pre-trip night through the last night. */
  nights: TripPersonNight[];
  days: TripPersonDay[];
  /** Nights between trip days they're on the trip with no plan. The pre-trip and last nights are never gaps. */
  gaps: string[];
  /** Saved nights they're no longer on the trip for, kept after a trip date change for review. */
  review_nights: string[];
  /** `nights` as consecutive runs, for views that show continuity (#332). */
  runs: TripPersonRun[];
  changeovers: TripPersonChangeover[];
}

/** People in one stay on a night or starting from it on a morning. */
export interface TripLodgingGroup {
  stay_id: string;
  label: string;
  member_ids: string[];
}

export interface TripStaySummary extends TripStay {
  date_label: string;
  night_count: number;
  /** Nights anyone has saved here. */
  assigned_nights: string[];
  /** Who has nights here, and which. */
  occupants: Array<{ member_id: string; nights: string[] }>;
  /** Its nights, consecutive ones with the same people together (#332). */
  occupancy: Array<{ dates: string[]; date_label: string; member_ids: string[] }>;
  /** "Check-out Sun Oct 11 morning": a starting point, not another night. */
  checkout_label: string | null;
  review_dates: string[];
}

/** The crew's mornings and nights, for views that show one plan; split nights list each group. */
export interface TripLodgingContext {
  date: string;
  /** One stay's name, "Not set", or each group, e.g. "Pine rental (3) · Village hotel (2)". */
  starting_from: string;
  /** Where most of the people taking part start from. */
  starting_stay_id: string | null;
  staying_tonight: string;
  tonight_stay_id: string | null;
  /** The people taking part, by the stay they start from. */
  origins: TripLodgingGroup[];
  /** They start from more than one stay. */
  split: boolean;
  participating_member_ids: string[];
}

export interface TripLodgingCrewNight {
  date: string;
  date_label: string;
  pre_trip: boolean;
  /** The night of the last trip day. Like the pre-trip night, it's planned only by choice. */
  last_night: boolean;
  /** One stay's name, "No stay needed", "Not planned yet", or each group, e.g. "Pine rental (3) · Village hotel (2)". */
  label: string;
  /** The stay most of the crew is in. */
  stay_id: string | null;
  status: "assigned" | "no_stay" | "unplanned";
  split: boolean;
  occupancy: TripLodgingGroup[];
  /** On the trip with no plan for the night. Pending invitations count once they have a plan. */
  unplanned_member_ids: string[];
}

export interface TripLodging {
  revision: number;
  /** Who's on the crew as the server read it; send it back as `expected_people_key` so a change meanwhile is reviewed first. */
  people_key: string;
  /** False until per-person nights are migrated: nights are then the crew's, and per-person changes can't be saved. */
  per_member: boolean;
  stays: TripStaySummary[];
  /** The saved nights: each person's, or the crew's before per-person nights. */
  assignments: TripLodgingNight[];
  attendance: TripMemberAttendance[];
  nights: TripLodgingCrewNight[];
  days: TripLodgingContext[];
  people: TripLodgingPerson[];
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
  /** The objective of the day's tour plan, if it has one. */
  tour_plan?: string | null;
}

/** A removed day as the server last saw it; sent back to confirm the removal. */
export interface TripRemovedDayCheck {
  date: string;
  stop_id: string | null;
  activity: string | null;
  kit_ids: string[];
  /** Present only when the day has a tour plan: its id and the revision the review showed. */
  tour_plan_id?: string;
  tour_plan_revision?: number;
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

export type TripLodgingAction = "save" | "remove" | "night" | "assign" | "attendance";

/** Sets one person's nights (#331). The other people and nights don't change. */
export interface TripLodgingAssignment {
  member_id: string;
  status: "assigned" | "no_stay" | "unplanned";
  /** Required, and only allowed, for "assigned". */
  stay_id?: string;
  /** Required unless assigning a stay: then omitting it means every night of the stay they're on the trip. */
  dates?: string[];
}

/** One person's night that a change affects. */
export interface TripLodgingPersonChange {
  member_id: string;
  display_name: string;
  membership: TripMemberStatus;
  date: string;
  date_label: string;
  before: string;
  after: string;
  /** The next morning, when it's a trip day, and where this person starts it after the change. */
  morning: string | null;
  morning_origin: string | null;
  /** It replaces a plan they already have: saving needs `replace_nights`. */
  conflict: boolean;
}

export interface TripLodgingPreview {
  revision: number;
  people_key: string;
  /** The crew's view of each night that changes. */
  nights: Array<{ date: string; date_label: string; before: string; after: string; morning: string | null; morning_origin: string }>;
  /** Dates with a person/night conflict, listed in `changes`. */
  conflicts: string[];
  changes: TripLodgingPersonChange[];
  /** `changes` in words, e.g. "Move Alex from Pine rental to Village hotel for the nights of Fri Oct 9 and Sat Oct 10." Empty before per-person nights. */
  summary: string[];
  /** For attendance: days whose participation changes. A saved kit stays saved. */
  day_changes: Array<{ member_id: string; display_name: string; date: string; date_label: string; before: string; after: string; kit_saved: boolean }>;
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
 * - manual: the organizer's own estimate for this pair is in use.
 * - no_drive: the organizer chose No drive planned.
 * - missing_origin: no stay the night before, or No stay needed, and no starting point of the day's own.
 * - origin_not_located / approximate_origin: the starting stay has no location, or only a town or area.
 * - missing_access_point / approximate_access_point: the same for the day's access point.
 * - no_destination: no day plan or destination yet.
 */
export type TripDriveState =
  | "available" | "stale" | "unavailable" | "no_route" | "manual" | "no_drive"
  | "missing_origin" | "origin_not_located" | "approximate_origin"
  | "missing_access_point" | "approximate_access_point" | "no_destination";

export interface TripDriveEstimate {
  /** One way, by road: "35 min", "1 hr 5 min". */
  duration_label: string;
  /** "14 mi", "0.4 mi". */
  distance_label: string;
  calculated_at: string;
  /** Age when the server returned the estimate, e.g. "2 days ago". */
  age_label: string;
  /** Also labels an old calculated estimate offered alongside a manual one. */
  stale: boolean;
}

/** The organizer's own one-way estimate for a day (#209), kept with the pair it was entered for. */
export interface TripDriveManualEstimate {
  /** The drive it was entered for (#333): it's kept per day and drive. */
  pair_key: string;
  duration_label: string;
  duration_seconds: number;
  /** Where the time comes from, in the organizer's words. */
  note: string | null;
  entered_at: string;
  origin_label: string;
  destination_label: string;
  /** False for a drive nobody has that day any more: shown for review, never as the day's estimate. */
  current: boolean;
  /** The organizer chose the calculated estimate for the same pair instead. */
  use_calculated: boolean;
  /** The days it was saved for together, this one included, while they're still that pair. */
  dates: string[];
}

/** A drive from one starting point to the day's access point, or why there's no estimate. */
export interface TripDriveRoute {
  date: string;
  date_label: string;
  /** The night whose stay the day starts from: "Fri Jan 9". */
  night_label: string;
  state: TripDriveState;
  /**
   * Where the day starts: the crew stay of the night before, or the day's own
   * starting point (`own`), which may be a saved stay or any place.
   */
  origin: { label: string; stay_id: string | null; own: boolean } | null;
  /** The crew stay of the night before, when there is one, even while the day starts elsewhere. */
  crew_stay: { label: string; stay_id: string } | null;
  /** The day's access point, when there is one. */
  destination: { label: string } | null;
  /** The calculated estimate for this pair, when there is one: the day's estimate, or the one offered instead of yours. */
  estimate: TripDriveEstimate | null;
  /** The organizer's own estimate for this drive, when there is one and the day has a drive to estimate. */
  manual: TripDriveManualEstimate | null;
  /**
   * On the crew's drive (#333): the organizer's estimates for drives nobody
   * has that day any more, each for review, to use for this drive or remove.
   */
  obsolete: TripDriveManualEstimate[];
  /** An earlier estimate for a different origin or access point: only for Estimate details, with its own pair. */
  previous: (TripDriveEstimate & { origin_label: string; destination_label: string }) | null;
  /** Names this origin, access point and mode, so a save can say which drive it was for; null without one. */
  pair_key: string | null;
  /** Days with the same drive, this one included, that your estimate can be saved for together. */
  same_drive_dates: string[];
  /** Winter closures the estimate avoids: "VT 108 through Smugglers' Notch, usually closed November to mid-May". */
  closures: string[];
  /** Directions with both exact endpoints, when there's a road route to expect. */
  directions: { apple: string; google: string } | null;
}

/**
 * The people taking part in a day who start from the same place (#333), with
 * their drive. They start from the day's own starting point when it has one,
 * otherwise from the stay each of them slept in the night before. See
 * docs/trip-locations.md.
 */
export interface TripDriveDeparture extends TripDriveRoute {
  /**
   * Where it starts: "stay:<id>", "place:<latitude>,<longitude>", or "unset:not_set" / "unset:arrives"
   * for people with no starting point, with ":no_drive" for No drive planned.
   */
  key: string;
  /** The stay's or place's name, "Not set", or "Arrives this day". */
  label: string;
  /** Who starts here, in crew order; empty when the trip has no per-person plan to go on. */
  member_ids: string[];
  /** Of them, the people here by a starting point or No drive planned of their own for the day. */
  own_member_ids: string[];
  /** The crew's departure: the one most people take, which the day's own fields describe. */
  crew: boolean;
}

/** A day's drive (#209): the crew's departure, with every departure that morning. */
export interface TripDriveDay extends TripDriveRoute {
  /** The crew's first, then other stays by size, then people with no starting point. One while everyone starts from the same place. */
  departures: TripDriveDeparture[];
}

export interface TripStayDepartures {
  stay_id: string;
  /** Mornings that anyone starts from the stay, checkout morning included, in date order. */
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
  /**
   * Gives `dates` the destination and activity of `from`, with `kit` the
   * signed-in member's kit too, and with `plan` its tour plan (#210, organizer only).
   */
  | { action: "copy_day"; from: string; dates: string[]; kit: boolean; plan?: boolean };

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
  /**
   * What happens on the day: a copied kit or tour plan, the kits that stay as
   * saved when its plan changes, and its access point and tour plan.
   */
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

/**
 * One person's facts for one trip day (#336). Each is its own status, linked
 * to its own task; nothing combines them into Ready or Safe.
 */
export interface TripChecklistPerson {
  member_id: string;
  display_name: string;
  role: TripMemberRole;
  membership: TripMemberStatus;
  /** "Organizer", "Joined", "Invitation pending" or "Managed guest". */
  membership_label: string;
  participation: TripDayParticipation;
  /** "Taking part", "There, not taking part" or "Not on trip". */
  participation_label: string;
  /** The day's saved outfit, an older checklist, or Not started. A checklist is never an outfit. */
  clothing: {
    /** Not needed on a Travel or Rest day, or a day they aren't taking part in (#334). */
    state: "outfit" | "outfit_review" | "checklist" | "not_started" | "not_needed";
    label: string;
    /** Why a saved outfit no longer fits the day, as the day page says it. */
    notes: string[];
    /** Flagged on the day, as Needs help or Missing; never set on a saved outfit, as the day page shows it. */
    flag: { state: "warn" | "missing"; label: string } | null;
  };
  /** Their plan for tonight; null without lodging. */
  tonight: { state: TripLodgingState; stay_id: string | null; label: string; gap: boolean } | null;
  /** Shared gear assigned to them, for the whole trip (#179). */
  shared: Array<{ id: string; description: string; status: "assigned" | "awaiting" | "accepted" | "packed"; label: string }>;
  /**
   * Their reviews of the day's official sources (#211). Null when the day has
   * none, or for someone without an account, who can't record one.
   */
  conditions: { sources: number; reviewed: number; out_of_date: number; latest: string | null; label: string } | null;
  /** Their day checks on a Backcountry day they take part in (#212); null otherwise, and for a pending invitation. */
  day_checks: Array<{ kind: TripDayCheckKind; status: TripDayCheck["status"]; label: string }> | null;
}

export interface TripDayChecklist {
  date: string;
  date_label: string;
  activity: string | null;
  place: string | null;
  people: TripChecklistPerson[];
}

/** `GET /api/v1/trips/:id/checklist`: every day's checklist, and the day to show first. */
export interface TripChecklist {
  /** For the workspace header, as Packing names the trip. */
  trip: Pick<Trip, "id" | "name" | "start_date" | "end_date">;
  default_date: string | null;
  /** The signed-in person's member id, for their own row. */
  viewer_member_id: string | null;
  days: TripDayChecklist[];
}
