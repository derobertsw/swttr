import type { WeatherProvenance } from "@/types/weather";
import { isLocalDateTime, isTimeZone } from "@/lib/timeZones";

/** API-side metadata for Open-Meteo requests made in Fahrenheit and mph. */
export function openMeteoProvenance(timeZone?: string, hours: string[] = [], observedTime?: string): WeatherProvenance {
  return {
    provider: "Open-Meteo",
    units: { temperature: "fahrenheit", windSpeed: "mph" },
    ...(timeZone && { timeZone }),
    ...(observedTime && { observedTime }),
    ...(hours.length > 0 && {
      coverage: { firstHour: hours[0], lastHour: hours[hours.length - 1], availableHours: hours.length },
    }),
  };
}

/** Read optional source facts without making malformed metadata break a result. */
export function readWeatherProvenance(value: unknown): WeatherProvenance | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<WeatherProvenance>;
  if (source.provider !== "Open-Meteo" || source.units?.temperature !== "fahrenheit" || source.units?.windSpeed !== "mph") return undefined;
  const validTime = (time: unknown): time is string => typeof time === "string"
    && isLocalDateTime(time.slice(0, 16))
    && (time.length === 16 || /^(Z|[+-]\d{2}:\d{2})$/.test(time.slice(16)))
    && Number.isFinite(Date.parse(time));
  const { coverage } = source;
  return {
    provider: source.provider,
    units: { temperature: "fahrenheit", windSpeed: "mph" },
    ...(isTimeZone(source.timeZone) && { timeZone: source.timeZone }),
    ...(validTime(source.observedTime) && { observedTime: source.observedTime }),
    ...(coverage && validTime(coverage.firstHour) && validTime(coverage.lastHour)
      && Number.isInteger(coverage.availableHours) && coverage.availableHours > 0
      && { coverage }),
  };
}
