export type PrecipitationType = 'rain' | 'snow' | 'mixed';

/** Where a weather reading applies, and for forecasts, the hour and time zone the weather API reported. */
export type WeatherContext =
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
    };

export interface WeatherData {
  temperature: number;
  windSpeed: number;
  precipitation?: boolean;
  precipitationType?: PrecipitationType;
  context?: WeatherContext;
}
