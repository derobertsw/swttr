export interface TripForecastCoverage {
  status: "not_requested" | "available" | "partial" | "unavailable" | "error";
  availableHours: number;
  expectedHours: number;
  reason?: "no_location" | "not_needed" | "past" | "outside_forecast" | "no_daytime_hours" | "service_error";
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
  /** "saved": the person saved an outfit for the day; "manual": an older category checklist. */
  advice: "saved" | "available" | "manual" | "rest" | "missing_inputs" | "unsupported" | "unavailable";
  reason?: string;
  message: string;
  action: "set_location" | "set_activity" | "plan_manually" | "retry_weather" | "check_later" | "review_day";
  approximation?: string;
  /** Where a saved outfit doesn't fit the day: another place, date or activity. */
  notes?: string[];
}
