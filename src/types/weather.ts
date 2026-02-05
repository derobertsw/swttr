export interface WeatherData {
  temperature: number;
  windSpeed: number;
}

export interface WeatherResult {
  data: WeatherData | null;
  locationDenied: boolean;
}
