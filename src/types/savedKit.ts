/**
 * Save to trip (#170): an outing's outfit, kept on a trip day as it was shown.
 * See docs/trip-saved-kits.md.
 */
import type { ThermalDecision } from "@/types/biophysics";
import type { Outing, PersonalizationGap } from "@/types/outing";
import type { LayerChanges } from "@/types/plan";
import type { Recommendation } from "@/types/recommendations";
import type { Trip, TripMemberDayKit } from "@/types/trips";
import type { WeatherData } from "@/types/weather";

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

/** Personalized layers, or general guidance with the reason they aren't personalized. */
export type SavedKitAdvice =
  | { kind: "personalized" }
  | { kind: "general"; reason: PersonalizationGap };

/** An outing's outfit as it was shown when saved. It changes only when it's replaced. */
export interface SavedOutfit {
  version: 1;
  /** The outing as submitted: activity, effort, place and time. */
  outing: Outing;
  /** The conditions the advice was built for, with their source. */
  weather: WeatherData;
  advice: SavedKitAdvice;
  phases: SavedKitPhase[];
  /** Whether the suggested layers were changed before saving. */
  edited: boolean;
}

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
  outfit: SavedOutfit;
  /** Kits to replace: each day's date → the `updated_at` of the kit that was shown for it. */
  replace?: Record<string, string>;
}

/** A trip day that already has a kit, so saving stops for a decision. */
export interface SaveKitConflict {
  date: string;
  /** The kit saved there now. */
  kit: TripMemberDayKit;
  /** From that kit's outfit to the new one; null when it's a category checklist. */
  changes: LayerChanges | null;
}

export type SaveKitResponse =
  | { status: "saved"; trip: Trip; created: boolean; kits: Array<TripMemberDayKit & { date: string }>; replayed?: boolean }
  | { status: "conflict"; trip: Trip; conflicts: SaveKitConflict[] };

/** What POST /api/v1/trips/kits/options says about where an outfit can be saved. */
export interface SaveKitOptions {
  /** The trip date the outfit is for, on the destination's calendar. */
  date: string;
  /** A name for a new trip made by the save. */
  suggested_name: string;
  /** What a new trip's destination will be called. */
  destination: string;
  /** The user's trips; `day_number` is null when a trip doesn't include `date`. */
  trips: Array<{ id: string; name: string; start_date: string; end_date: string; member_count: number; day_number: number | null }>;
}
