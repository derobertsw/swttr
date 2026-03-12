export type PrecipitationType = 'rain' | 'snow' | 'mixed';

export interface WeatherData {
  temperature: number;
  windSpeed: number;
  precipitation?: boolean;
  precipitationType?: PrecipitationType;
}

export interface WeatherResult {
  data: WeatherData | null;
  locationDenied: boolean;
}
