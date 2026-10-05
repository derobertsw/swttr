"use client";

import { formatLocationName } from "@/hooks/useLocationSearch";
import type { LocationSuggestion } from "@/types/recommendations";
import type { WeatherData } from "@/types/weather";
import { isLocalDateTime, isTimeZone } from "@/lib/timeZones";
import { readWeatherProvenance } from "@/lib/weatherProvenance";

function parseWeatherResponse(data: Record<string, unknown>, place: string, forecast: boolean): WeatherData | null {
  if (typeof data.temperature !== "number" || !Number.isFinite(data.temperature)
    || typeof data.windSpeed !== "number" || !Number.isFinite(data.windSpeed)) return null;
  // Missing forecast metadata must never turn a Later request into current conditions.
  if (forecast && (typeof data.forecastTime !== "string" || !Number.isFinite(Date.parse(data.forecastTime))
    || !/(Z|[+-]\d{2}:\d{2})$/.test(data.forecastTime)
    || !isTimeZone(data.timeZone) || data.isForecast === false)) return null;
  if (!forecast && data.isForecast === true) return null;
  const provenance = readWeatherProvenance(data.provenance);
  const source = provenance ? { provenance } : {};
  return {
    temperature: data.temperature,
    windSpeed: data.windSpeed,
    precipitation: typeof data.precipitation === "boolean" ? data.precipitation : undefined,
    precipitationType: data.precipitationType === "rain" || data.precipitationType === "snow" || data.precipitationType === "mixed"
      ? data.precipitationType : undefined,
    context: forecast
      ? { source: "forecast", place, forecastTime: data.forecastTime as string, timeZone: data.timeZone as string, ...source }
      : { source: "current", place, ...source },
  };
}

/** Weather for a place, or the message to show when there is none. */
type PlaceWeatherResult =
  | { data: WeatherData; error?: undefined }
  | { data: null; error: string };

/**
 * Current weather at a place, or its forecast for a local date and time there
 * ("2026-10-15T14:00"). The time is read on the place's clock, whatever time
 * zone the device is in. A forecast that fails is never swapped for current weather.
 */
export async function fetchWeatherAt(
  location: LocationSuggestion,
  localDateTime?: string
): Promise<PlaceWeatherResult> {
  const fallbackError = localDateTime
    ? "Couldn't get the forecast for this place. Try again."
    : "Could not get weather for this location.";
  const query = `lat=${location.latitude}&lon=${location.longitude}`;
  if (localDateTime !== undefined && !isLocalDateTime(localDateTime)) {
    return { data: null, error: "Choose a valid date and time for the forecast." };
  }

  try {
    const response = await fetch(
      localDateTime ? `/api/weather?${query}&datetime=${localDateTime}` : `/api/weather?${query}`
    );
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok && body) {
      const data = parseWeatherResponse(body, formatLocationName(location), localDateTime !== undefined);
      return data ? { data } : { data: null, error: fallbackError };
    }
    // Requests the API turns down, like a date past the end of the forecast, say what to change.
    const canBeFixed = response.status >= 400 && response.status < 500 && typeof body?.error === "string";
    return { data: null, error: canBeFixed ? String(body?.error) : fallbackError };
  } catch {
    return { data: null, error: fallbackError };
  }
}
