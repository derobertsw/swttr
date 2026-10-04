import { Recommendation } from "@/types/recommendations";
import type { BodyPart, LayerType } from "@/types/wardrobe";

export type DaypartId = "morning" | "midday" | "evening";

export interface ForecastHour {
  time: string;
  temperature: number;
  windSpeed: number;
  precipitationProbability: number;
}

/** One worn item in a layer recommendation. */
export interface PlanLayerItem {
  bodyPart: BodyPart;
  layerType: LayerType;
  name: string;
}

/** What to put on and take off to go from one layer recommendation to another. */
export interface LayerChanges {
  add: PlanLayerItem[];
  remove: PlanLayerItem[];
}

export interface DaypartLayerPlan {
  id: DaypartId;
  label: string;
  timeRangeLabel: string;
  minTemp: number;
  maxTemp: number;
  maxWindSpeed: number;
  maxPrecipProbability: number;
  effectiveTemperature: number;
  recommendation: Recommendation | null;
  /**
   * From the previous daypart's layers (the day's, for the first) to this
   * one's; null when either has none.
   */
  changes: LayerChanges | null;
}

export interface DailyBaselinePlan {
  minTemp: number;
  maxTemp: number;
  maxWindSpeed: number;
  maxPrecipProbability: number;
  effectiveTemperature: number;
  /** For the day's coldest conditions. */
  recommendation: Recommendation | null;
}

export interface DailyLayerPlan {
  date: string;
  label: string;
  baseline: DailyBaselinePlan;
  /**
   * From the previous day in `days` to this one; null for the first day, and
   * when either day has no layers.
   */
  changesFromPreviousDay: LayerChanges | null;
  dayparts: DaypartLayerPlan[];
  carryItems: string[];
}

/** A date in the plan's range that has no daytime forecast hours, so it isn't in `days`. */
export interface UncoveredPlanDay {
  date: string;
  label: string;
  /**
   * "afterStartTime": the first day's daytime hours all come before the start time.
   * "noForecast": the forecast has no daytime hours for the date.
   */
  reason: "afterStartTime" | "noForecast";
}

export interface MultiDayLayerPlan {
  startDate: string;
  endDate: string;
  durationDays: number;
  dayStartHour: number;
  dayEndHour: number;
  /** The first day starts at the later of the start time and `dayStartHour`. */
  firstDayStartHour: number;
  days: DailyLayerPlan[];
  uncoveredDays: UncoveredPlanDay[];
}
