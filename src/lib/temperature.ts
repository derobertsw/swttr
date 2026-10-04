import type { TemperatureUnit } from "@/types/preferences";

/** US locales default to Fahrenheit; other locales default to Celsius. */
export function defaultTemperatureUnit(locale: string): TemperatureUnit {
  try {
    return new Intl.Locale(locale).maximize().region === "US" ? "F" : "C";
  } catch {
    return "F";
  }
}

/** API and saved outing temperatures stay in Fahrenheit. Round only for display. */
export function formatTemperature(fahrenheit: number, unit: TemperatureUnit, precision = 0): string {
  const value = unit === "C" ? (fahrenheit - 32) * 5 / 9 : fahrenheit;
  const scale = 10 ** precision;
  const rounded = Math.round(value * scale) / scale;
  return `${Object.is(rounded, -0) ? 0 : rounded}°${unit}`;
}

export function formatTemperatureRange(minF: number, maxF: number, unit: TemperatureUnit): string {
  return `${formatTemperature(minF, unit)} – ${formatTemperature(maxF, unit)}`;
}
