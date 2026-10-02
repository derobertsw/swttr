import "server-only";
import { addDaysToDateString, FORECAST_DAYS } from "@/lib/forecastRange";
import { parseOpenMeteoHourly } from "@/lib/openMeteoHourly";
import { formatZonedTime, isTimeZone } from "@/lib/timeZones";
import type { ForecastHour } from "@/types/plan";
import type { TripDayForecastResponse } from "@/types/trip-coverage";
import type { TripDay, TripStop } from "@/types/trips";

type TripForecast = { hourly: ForecastHour[]; today: string; lastDate: string } | null;

export function resolveTripStop(day: Pick<TripDay, "stop_id">, stops: TripStop[]) {
  return stops.find((stop) => stop.id === day.stop_id) ?? stops[0];
}

export function hasTripCoordinates(stop: TripStop | undefined | null): stop is TripStop & { latitude: number; longitude: number } {
  return typeof stop?.latitude === "number" && Number.isFinite(stop.latitude) && Math.abs(stop.latitude) <= 90
    && typeof stop.longitude === "number" && Number.isFinite(stop.longitude) && Math.abs(stop.longitude) <= 180;
}

/** Fetch the supported window once per stop; an out-of-range trip date must not fail other days. */
export async function fetchTripForecast(stop: TripStop): Promise<TripForecast> {
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${stop.latitude}&longitude=${stop.longitude}&hourly=temperature_2m,wind_speed_10m,precipitation_probability&forecast_days=${FORECAST_DAYS}&timezone=auto&timeformat=unixtime&temperature_unit=fahrenheit&wind_speed_unit=mph`, {
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!isTimeZone(data?.timezone) || !["time", "temperature_2m", "wind_speed_10m", "precipitation_probability"]
      .every((key) => Array.isArray(data?.hourly?.[key]))) return null;
    const today = formatZonedTime(Date.now(), data.timezone).slice(0, 10);
    return {
      hourly: parseOpenMeteoHourly(data, data.timezone),
      today,
      lastDate: addDaysToDateString(today, FORECAST_DAYS - 1),
    };
  } catch {
    return null;
  }
}

// Without a destination time zone, its current date may be one day either
// side of UTC. Skip only dates outside every possible local forecast window.
export function tripForecastDateOutsideWindow(date: string): "past" | "outside_forecast" | undefined {
  const utcToday = new Date(Date.now()).toISOString().slice(0, 10);
  if (date < addDaysToDateString(utcToday, -1)) return "past";
  if (date > addDaysToDateString(utcToday, FORECAST_DAYS)) return "outside_forecast";
}

const UNREQUESTED_MESSAGES = {
  no_location: "Choose a location with coordinates to load weather.",
  not_needed: "Weather was not requested for automatic packing. Open this day to load its forecast.",
  past: "This day is in the past; live forecasts are unavailable. Review your kit manually.",
  outside_forecast: "Forecast not available yet. Check closer to this date or plan your kit manually.",
};

export function tripDayForecast(date: string, source: TripForecast | undefined,
  unrequestedReason: keyof typeof UNREQUESTED_MESSAGES = "no_location"): TripDayForecastResponse & { hours: ForecastHour[] } {
  const forecast: TripDayForecastResponse["forecast"] = {
    status: "unavailable", availableHours: 0, expectedHours: 16, message: "",
  };
  const empty = { forecast, weather: null, hours: [] };
  if (source === undefined) {
    forecast.status = unrequestedReason === "past" || unrequestedReason === "outside_forecast" ? "unavailable" : "not_requested";
    forecast.reason = unrequestedReason;
    forecast.message = UNREQUESTED_MESSAGES[unrequestedReason];
    return empty;
  }
  if (source === null) {
    forecast.status = "error";
    forecast.reason = "service_error";
    forecast.message = "Couldn't load the forecast. Retry weather or plan your kit manually.";
    return empty;
  }
  if (date < source.today || date > source.lastDate) {
    forecast.reason = date < source.today ? "past" : "outside_forecast";
    forecast.message = UNREQUESTED_MESSAGES[forecast.reason];
    return empty;
  }
  // Deduplicate local hours and require all three values. Missing values never become zero weather.
  const hours = [...new Map(source.hourly.filter((hour) => {
    const clockHour = Number(hour.time.slice(11, 13));
    return hour.time.slice(0, 10) === date && clockHour >= 6 && clockHour <= 21;
  }).map((hour) => [hour.time, hour])).values()];
  forecast.availableHours = hours.length;
  if (hours.length === 0) {
    forecast.reason = "no_daytime_hours";
    forecast.message = "Forecast unavailable for this day. Retry weather or plan your kit manually.";
    return empty;
  }
  forecast.status = hours.length < forecast.expectedHours ? "partial" : "available";
  forecast.message = hours.length < forecast.expectedHours
    ? `Partial forecast: ${hours.length} of 16 daytime hours available (6am–9pm). Review missing conditions before packing.`
    : "Forecast available for all 16 daytime hours (6am–9pm).";
  return {
    forecast,
    hours,
    weather: {
      tempF: Math.round(hours.reduce((sum, hour) => sum + hour.temperature, 0) / hours.length),
      wind: Math.max(...hours.map((hour) => hour.windSpeed)),
      precip: Math.max(...hours.map((hour) => hour.precipitationProbability)) / 100,
    },
  };
}
