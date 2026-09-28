"use client";

import { formatLocationName } from "@/hooks/useLocationSearch";
import type { LocationSuggestion } from "@/types/recommendations";
import type { WeatherData } from "@/types/weather";

function parseWeatherResponse(data: Record<string, unknown>, place: string): WeatherData {
  return {
    temperature: data.temperature as number,
    windSpeed: data.windSpeed as number,
    precipitation: data.precipitation as boolean | undefined,
    precipitationType: data.precipitationType as WeatherData["precipitationType"],
    context:
      typeof data.forecastTime === "string" && typeof data.timeZone === "string"
        ? { source: "forecast", place, forecastTime: data.forecastTime, timeZone: data.timeZone }
        : { source: "current", place },
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

  try {
    const response = await fetch(
      localDateTime ? `/api/weather?${query}&datetime=${localDateTime}` : `/api/weather?${query}`
    );
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok && body) {
      return { data: parseWeatherResponse(body, formatLocationName(location)) };
    }
    // Requests the API turns down, like a date past the end of the forecast, say what to change.
    const canBeFixed = response.status >= 400 && response.status < 500 && typeof body?.error === "string";
    return { data: null, error: canBeFixed ? String(body?.error) : fallbackError };
  } catch {
    return { data: null, error: fallbackError };
  }
}
