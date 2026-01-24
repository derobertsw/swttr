export interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
}

export interface ClothingRecommendation {
  layers: string[];
  accessories: string[];
  footwear: string;
  notes: string[];
}
