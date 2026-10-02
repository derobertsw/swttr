/**
 * The Gear up outing contract: what a person asked for layers for, and the
 * result that came back for exactly that request. See docs/outing-contract.md.
 */
import type { ExertionLevel } from "@/lib/biophysics/exertion";
import type { BiophysicsRecommendation, BiophysicsStatus } from "@/types/biophysics";
import type { MultiDayLayerPlan } from "@/types/plan";
import type { LocationSuggestion, Recommendation } from "@/types/recommendations";
import type { WeatherData } from "@/types/weather";

/**
 * When an outing happens. A later date ("yyyy-MM-dd") and time ("HH:mm") are
 * on the destination's clock, wherever the device is.
 */
export type OutingTime =
  | { mode: "now" }
  | { mode: "later"; date: string; time: string; durationDays: number };

export type LaterTime = Extract<OutingTime, { mode: "later" }>;

/** An outing as submitted. Every request reads its inputs from one of these. */
export interface Outing {
  /** An activity ID from src/data/activities.ts. */
  activity: string;
  exertion: ExertionLevel;
  place: LocationSuggestion;
  when: OutingTime;
}

/** Why there's no personalized recommendation. */
export type PersonalizationGap = Exclude<BiophysicsStatus, "ok">;

/**
 * What kind of advice a one-day result has. General and missing advice keep
 * the reason personalization didn't happen.
 */
export type Advice =
  | { kind: "personalized"; recommendation: BiophysicsRecommendation }
  | { kind: "general"; layers: Recommendation; reason: PersonalizationGap }
  | { kind: "none"; reason: PersonalizationGap };

/** A result, tied to the outing it was requested for. */
export type OutingResult =
  | { kind: "layers"; outing: Outing; weather: WeatherData; advice: Advice }
  | { kind: "plan"; outing: Outing; plan: MultiDayLayerPlan };

export type LayersResult = Extract<OutingResult, { kind: "layers" }>;
export type PlanResult = Extract<OutingResult, { kind: "plan" }>;
