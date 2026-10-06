export type PrecipitationType = 'rain' | 'snow' | 'mixed';

/** Provider facts, separate from the requested outing and the device clock. */
export interface WeatherProvenance {
  provider: "Open-Meteo";
  /** Units requested by our API, before any display conversion. */
  units: { temperature: "fahrenheit"; windSpeed: "mph" };
  timeZone?: string;
  /** The provider's current-conditions timestamp; not a fetch or forecast issue time. */
  observedTime?: string;
  /** Bounds and count of usable hours; bounds alone do not promise gap-free coverage. */
  coverage?: { firstHour: string; lastHour: string; availableHours: number };
}

/** Where a weather reading applies, and for forecasts, the hour and time zone the weather API reported. */
export type WeatherContext = (
  | {
      source: "current";
      /** The place that was picked, e.g. "Stowe, Vermont, United States" or "Your location". */
      place?: string;
    }
  | {
      source: "forecast";
      place?: string;
      /** When the forecast hour starts, as ISO 8601 with the place's UTC offset then. */
      forecastTime: string;
      /** The place's IANA time zone, e.g. "America/New_York". */
      timeZone: string;
    }) & { provenance?: WeatherProvenance };

export interface WeatherData {
  temperature: number;
  windSpeed: number;
  precipitation?: boolean;
  precipitationType?: PrecipitationType;
  context?: WeatherContext;
}
