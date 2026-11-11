import type { Outing } from "@/types/outing";
import type { TripDayParticipation } from "@/types/trips";

/**
 * A trip day as Gear up planned layers for it (#335). The save sends it back,
 * so a change to the day since is caught before the layers are attached.
 */
export interface TripDayPlanned {
  day_id: string;
  /** The day's activity as the day shows it: its own, or its stop's first. */
  activity: string | null;
  /** The stop the day's forecast is for, and where it was. */
  stop: { id: string; latitude: number; longitude: number } | null;
  participation: TripDayParticipation;
}

/** The trip day, and whose kit on it, that Gear up is planning layers for. */
export interface TripDayContext {
  trip_id: string;
  trip_name: string;
  /** "yyyy-MM-dd", on the destination's calendar. */
  date: string;
  /** Day N of `day_count`. */
  day_number: number;
  day_count: number;
  /** The signed-in person's member row, whose kit the layers are for. */
  member_id: string;
  planned: TripDayPlanned;
}

/**
 * Whether layers can be planned for the day in Gear up: `ready`, or why not.
 * Each reason that isn't `ready` leaves planning the kit by hand.
 */
export type TripDayOutingStatus =
  | "ready"
  | "no_activity"
  | "no_clothing"
  | "not_taking_part"
  | "no_destination"
  | "unsupported"
  | "past"
  | "outside_forecast";

/** GET /api/v1/trips/:id/days/:date/outing: the signed-in person's outing for the day. */
export interface TripDayOuting {
  status: TripDayOutingStatus;
  /** Why layers can't be planned here, for the day page; empty when they can. */
  message: string;
  /** For `outside_forecast`, the first date the forecast reaches the day. */
  opens_on?: string;
  /** The outing Gear up asks for, when `ready`. */
  outing: Outing | null;
  context: TripDayContext;
}

/** The trip day a save is for, when Gear up planned for one: POST /api/v1/trips/kits's `trip_day`. */
export interface SaveKitTripDay {
  date: string;
  planned: TripDayPlanned;
}

/**
 * The trip day Gear up is planning for, with the outing it asked for for it:
 * its results are for that day only while they're for that outing's
 * activity, place and date.
 */
export interface GearUpTripDay {
  context: TripDayContext;
  outing: Outing;
}
