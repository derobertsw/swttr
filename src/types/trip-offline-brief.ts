/**
 * A dated trip brief saved for offline reference (#214): one member's view of
 * chosen trip days, built by the server and kept read-only on the device.
 * Every label is the server's. See docs/trip-offline-brief.md.
 */

/** A link out of the app. It needs a connection; the brief says so next to it. */
export interface OfflineBriefLink {
  label: string;
  url: string;
}

/** A place the crew confirmed (#208), with its coordinates written out. */
export interface OfflineBriefPlace {
  label: string;
  address: string | null;
  latitude: number;
  longitude: number;
  /** "44.528340, -72.781230" */
  coordinates: string;
  /** "Exact location", or "Approximate: a town or area" */
  precision_label: string;
  /** The data source's credit, kept with the place. */
  attribution: string | null;
}

/** The drive to the day's access point from where this member starts (#209, #333). */
export interface OfflineBriefDrive {
  from: string | null;
  to: string | null;
  /** "35 min · 14 mi by road", "40 min · the organizer's estimate", "No drive planned", "Drive time not available". */
  summary: string;
  /** "Calculated Fri Feb 12 · typical traffic, not live", or the organizer's note. */
  detail: string | null;
  /** The routing credit for a calculated estimate. */
  credit: string | null;
  /** Winter closures the estimate avoids. */
  closures: string[];
  directions: OfflineBriefLink[];
}

export interface OfflineBriefStay {
  name: string;
  /** "Fri Feb 12 → Sun Feb 14 · 2 nights" */
  dates_label: string | null;
  /** "Booked" or "Booking not confirmed". */
  booking_label: string;
  /** "Check-in from 16:00 · Check-out by 10:00 · property local time" */
  times_label: string | null;
  place: OfflineBriefPlace | null;
}

export interface OfflineBriefTourPlan {
  objective: string;
  /** "14.2 km · 1,200 m ascent · 6 h 30 min" with where the figures come from. */
  metrics: string | null;
  approach_notes: string | null;
  access_notes: string | null;
  backup_plan: string | null;
  /** "Back by 3:00 PM MST · Sat Feb 13" */
  return_label: string | null;
  checkin_notes: string | null;
  pickup_notes: string | null;
  /** Says whose clock the times use. */
  time_zone_label: string | null;
  /** "Updated Feb 10 by Organizer · revision 3" */
  updated_label: string;
  links: OfflineBriefLink[];
}

export interface OfflineBriefReview {
  /** "You", or the crew member's name. */
  who: string;
  /** "Reviewed 6:12 AM MST · Sat Feb 13" on the destination's clock. */
  label: string;
  note: string | null;
  /** "Reviewed before the plan changed: Route changed", when it was. */
  stale: string | null;
}

/** An official conditions source on the day (#211), with the crew's dated reviews. */
export interface OfflineBriefSource {
  /** "Avalanche forecast", "Mountain weather" or "Access and closures". */
  category_label: string;
  name: string;
  region: string | null;
  link: OfflineBriefLink;
  reviews: OfflineBriefReview[];
  /** "You haven't recorded a review." when the member hasn't. */
  your_review: string | null;
}

export interface OfflineBriefKitPart {
  /** "Outing", "Climb", "Descent" or "Day". */
  label: string;
  /** Each body area with what's worn there, as it was saved. */
  wear: Array<{ area: string; items: string[] }>;
  carry: string[];
}

/** This member's own kit for the day (#170, #177). Nobody else's is saved. */
export type OfflineBriefKit =
  | { kind: "outfit"; summary: string; parts: OfflineBriefKitPart[] }
  | { kind: "checklist"; summary: string; items: string[] }
  | { kind: "none"; summary: string };

export interface OfflineBriefEquipment {
  name: string;
  quantity: number;
  /** "Packed" or "Not packed yet", as the packing list was when saved. */
  status_label: string;
}

export interface OfflineBriefDayCheck {
  label: string;
  /** "Recorded 6:12 AM MST · Sat Feb 13", "Not recorded" or "Out of date: Backup plan changed". */
  status_label: string;
}

export interface OfflineBriefDay {
  date: string;
  /** "Sat Feb 13" */
  date_label: string;
  /** "Day 2 of 4" */
  position_label: string;
  activity_label: string | null;
  destination: string | null;
  /** "You're not taking part this day.", when they aren't. */
  participation_note: string | null;
  meet: { label: string; time_zone_label: string } | null;
  /** Where the crew meets: the day's access point. */
  meeting_point: OfflineBriefPlace | null;
  /** The organizer's notes for the day (#334). */
  notes: string | null;
  starting_from: { yours: string | null; crew: string | null } | null;
  getting_there: OfflineBriefDrive | null;
  tonight: { yours: string; crew: string | null; moving: string | null; stay: OfflineBriefStay | null } | null;
  tour_plan: OfflineBriefTourPlan | null;
  conditions: OfflineBriefSource[];
  kit: OfflineBriefKit | null;
  equipment: OfflineBriefEquipment[];
  day_checks: OfflineBriefDayCheck[];
  /** What this day doesn't have yet, e.g. "No kit saved", so the brief can't be read as complete. */
  missing: string[];
}

export interface OfflineBriefSharedItem {
  description: string;
  /** "You", their name, or "Unassigned". */
  assignee: string;
  /** "Awaiting acceptance", "Accepted · not packed", "Packed" or "Assigned". */
  status_label: string | null;
  mine: boolean;
}

export interface TripOfflineBrief {
  /** The snapshot format: a reader refuses one it doesn't know. */
  version: 1;
  kind: "swttr.trip-offline-brief";
  trip: { id: string; name: string; start_date: string; end_date: string; dates_label: string };
  /** Whose brief it is: the device keeps it for this account only. */
  viewer: { user_id: string; member_id: string | null };
  /** The trip days it covers, in date order. */
  covered: { dates: string[]; label: string };
  /** When the server built it. */
  saved_at: string;
  /** Changes when anything in the brief would; compared with the online trip's to say it changed. */
  revision: string;
  days: OfflineBriefDay[];
  /** Crew-visible shared gear and who's bringing it (#179). */
  shared_gear: OfflineBriefSharedItem[];
  /**
   * What the saved copy holds, what these days don't have yet, and what is
   * never saved offline: the lists shown before saving and in the copy.
   */
  contents: { included: string[]; absent: string[]; omitted: string[] };
}

/** GET /api/v1/trips/:id/brief?dates=…: the brief for those days, and the days to choose from. */
export interface TripOfflineBriefResponse {
  brief: TripOfflineBrief;
  /** Every trip day, for choosing which to save. */
  trip_days: Array<{ date: string; date_label: string; activity_label: string | null }>;
  /** The days saved without a choice: the trip's days from today at the destination on, or all of them. */
  default_dates: string[];
}
