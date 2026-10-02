import type { PackingListData } from "@/lib/packingList";

export interface TripForecastCoverage {
  status: "not_requested" | "available" | "partial" | "unavailable" | "error";
  availableHours: number;
  expectedHours: number;
  reason?: "no_location" | "past" | "outside_forecast" | "no_daytime_hours" | "service_error";
  message: string;
}

export interface TripDayWeather {
  tempF: number;
  wind: number;
  precip: number;
}

export interface TripDayForecastResponse {
  forecast: TripForecastCoverage;
  weather: TripDayWeather | null;
}

export interface TripDayCoverage {
  date: string;
  activity: string | null;
  stopName: string | null;
  forecast: TripForecastCoverage;
  advice: "available" | "manual" | "rest" | "missing_inputs" | "unsupported" | "unavailable";
  reason?: string;
  message: string;
  action: "set_location" | "set_activity" | "plan_manually" | "retry_weather" | "check_later" | "review_day";
  approximation?: string;
}

export interface TripPackResponse {
  trip: { id: string; name: string; start_date: string; end_date: string };
  coveredDays: number;
  totalDays: number;
  coverage: TripDayCoverage[];
  skipped: { date: string; reason: string }[];
  packingList: PackingListData;
  groupGear: string[];
}
