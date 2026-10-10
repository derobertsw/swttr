/**
 * Save to trip (#170): an outing's outfit, kept on a trip day as it was shown.
 * See docs/trip-saved-kits.md.
 */
import type { ThermalDecision } from "@/types/biophysics";
import type { LaterTime, Outing, PersonalizationGap } from "@/types/outing";
import type { DailyLayerPlan, DaypartId, LayerChanges } from "@/types/plan";
import type { Recommendation } from "@/types/recommendations";
import type { Trip, TripMemberDayKit } from "@/types/trips";
import type { WeatherData, WeatherProvenance } from "@/types/weather";

/** A ski tour has a climb and a descent; every other outing has one outfit. */
export type SavedKitPhaseId = "outing" | "climb" | "descent";

export interface SavedKitPhase {
  id: SavedKitPhaseId;
  /** What's worn, by body area and layer, with the names that were shown. */
  wear: Recommendation;
  /** Carried rather than worn during this phase. */
  carry: string[];
  /** The comfort check of these layers when saved; null when there was none or it was out of date. */
  decision: ThermalDecision | null;
}

/**
 * Personalized layers, or general guidance with the reason they aren't
 * personalized: a multi-day plan's days always use the general guide.
 */
export type SavedKitAdvice =
  | { kind: "personalized" }
  | { kind: "general"; reason: PersonalizationGap | "multi_day" };

/** An outing's outfit as it was shown when saved. It changes only when it's replaced. */
export interface SavedOutfit {
  version: 1;
  /** Only a plan day has a kind. */
  kind?: undefined;
  /** The outing as submitted: activity, effort, place and time. */
  outing: Outing;
  /** The conditions the advice was built for, with their source. */
  weather: WeatherData;
  advice: SavedKitAdvice;
  phases: SavedKitPhase[];
  /** Whether the suggested layers were changed before saving. */
  edited: boolean;
}

/** A multi-day outing as submitted. */
export type MultiDayOuting = Outing & { when: LaterTime };

/**
 * A multi-day plan as it was shown, to save each day it has layers for as
 * that day's kit. Names are the wardrobe's, as shown.
 */
export interface SavedPlan {
  version: 1;
  kind: "plan";
  outing: MultiDayOuting;
  /** The forecast's source. */
  provenance?: WeatherProvenance;
  /** The hours each day's layers are for, local time; the first day starts at `firstDayStartHour`. */
  dayStartHour: number;
  dayEndHour: number;
  firstDayStartHour: number;
  /** The days with layers, in order. */
  days: DailyLayerPlan[];
}

/** One day of a multi-day plan, kept on its trip day as it was shown. It changes only when it's replaced. */
export interface SavedPlanDay {
  version: 1;
  kind: "plan_day";
  /** The whole multi-day outing this day was planned in. */
  outing: MultiDayOuting;
  provenance?: WeatherProvenance;
  /** The hours of the day the layers are for, local time. */
  startHour: number;
  endHour: number;
  /** The day's conditions, layers, changes through the day and what to carry. Changes from the day before aren't kept. */
  day: DailyLayerPlan;
}

/** What a member's kit for a trip day can hold besides its checklist. */
export type SavedKit = SavedOutfit | SavedPlanDay;

/** A new trip made by the save: just a name, everything else comes from the outing. */
export interface SaveKitNewTrip {
  /** Generated in the browser, so a retry finds the same trip. */
  id: string;
  name: string;
}

/** What the browser sends to POST /api/v1/trips/kits. */
export interface SaveKitRequest {
  /** Generated in the browser for this save; a retry with the same body returns the first answer. */
  save_id: string;
  target: { trip_id: string } | { new_trip: SaveKitNewTrip };
  /** A one-day outing's outfit, or each day of a multi-day plan: one or the other. */
  outfit?: SavedOutfit;
  plan?: SavedPlan;
  /** Kits to replace: each day's date → the `updated_at` of the kit that was shown for it. */
  replace?: Record<string, string>;
}

/**
 * A part of a kit that what changes is listed by: the outfit (a plan day's
 * for its coldest part), a ski tour's climb or descent, or a plan day's
 * morning, midday or evening.
 */
export type SaveKitChangePart = SavedKitPhaseId | DaypartId;

/** What changes in one part of the kit when a saved kit is replaced. */
export interface SaveKitPhaseChanges extends LayerChanges {
  phase: SaveKitChangePart;
}

/** A trip day that already has a kit, so saving stops for a decision. */
export interface SaveKitConflict {
  date: string;
  /** The kit saved there now. */
  kit: TripMemberDayKit;
  /** From that kit's outfit to the new one for the day, per phase; null when it's a category checklist. */
  changes: SaveKitPhaseChanges[] | null;
}

export type SaveKitResponse =
  | { status: "saved"; trip: Trip; created: boolean; kits: Array<TripMemberDayKit & { date: string }>; replayed?: boolean }
  | { status: "conflict"; trip: Trip; conflicts: SaveKitConflict[] };

/** What POST /api/v1/trips/kits/options says about where an outfit can be saved. */
export interface SaveKitOptions {
  /**
   * The trip dates the save makes kits for, on the destination's calendar:
   * an outing's date, or each plan day with layers.
   */
  dates: string[];
  /** A new trip's first and last dates: the outing's, every day of a plan included. */
  start_date: string;
  end_date: string;
  /** A name for a new trip made by the save. */
  suggested_name: string;
  /** What a new trip's destination will be called. */
  destination: string;
  /** The user's trips; `day_number` is the day of the first date, or null when a trip doesn't include every date. */
  trips: Array<{ id: string; name: string; start_date: string; end_date: string; member_count: number; day_number: number | null }>;
}
