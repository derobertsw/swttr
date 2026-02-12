import { Recommendation } from "@/types/recommendations";

export type DaypartId = "morning" | "midday" | "evening";

export interface ForecastHour {
  time: string;
  temperature: number;
  windSpeed: number;
  precipitationProbability: number;
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
  adjustment: string;
}

export interface DailyBaselinePlan {
  minTemp: number;
  maxTemp: number;
  maxWindSpeed: number;
  maxPrecipProbability: number;
  effectiveTemperature: number;
  recommendation: Recommendation | null;
  summary: string;
}

export interface DailyLayerPlan {
  date: string;
  label: string;
  baseline: DailyBaselinePlan;
  dayparts: DaypartLayerPlan[];
  carryItems: string[];
}

export interface MultiDayLayerPlan {
  startDate: string;
  endDate: string;
  durationDays: number;
  dayStartHour: number;
  dayEndHour: number;
  days: DailyLayerPlan[];
}
