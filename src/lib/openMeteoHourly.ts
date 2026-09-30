import { formatZonedTime } from "@/lib/timeZones";
import type { ForecastHour } from "@/types/plan";

/**
 * Hourly forecast from an Open-Meteo response requested with
 * `hourly=temperature_2m,wind_speed_10m,precipitation_probability` and
 * `timeformat=unixtime`.
 *
 * Near the end of its forecast window Open-Meteo returns null for some hours.
 * Those hours are left out rather than read as 0°F, 0 mph or 0% rain, which
 * would add warm layers or drop the waterproof shell.
 *
 * Each hour is labelled by the local clock at that instant. Open-Meteo's own
 * labels use today's UTC offset, which is an hour out after a DST change.
 */
export function parseOpenMeteoHourly(data: unknown, timeZone: string): ForecastHour[] {
  const hourly = (data as { hourly?: Record<string, unknown> } | null)?.hourly;
  const series = (key: string): unknown[] => {
    const values = hourly?.[key];
    return Array.isArray(values) ? values : [];
  };
  const times = series("time");
  const temps = series("temperature_2m");
  const winds = series("wind_speed_10m");
  const precip = series("precipitation_probability");

  return times.flatMap((time, index) => {
    const temperature = temps[index];
    const windSpeed = winds[index];
    const precipitationProbability = precip[index];
    if (
      !isFiniteNumber(time) ||
      !isFiniteNumber(temperature) ||
      !isFiniteNumber(windSpeed) ||
      !isFiniteNumber(precipitationProbability)
    ) {
      return [];
    }
    return [{
      time: formatZonedTime(time * 1000, timeZone),
      temperature: Math.round(temperature),
      windSpeed: Math.round(windSpeed),
      precipitationProbability: Math.round(precipitationProbability),
    }];
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
