/**
 * The fixed scenario grid wardrobe coverage is measured on (#93).
 *
 * Every supported activity at its own temperature bands, each in two kinds of
 * weather, at the default (moderate) effort, standard body metrics and
 * neutral targets (no Run Warm/Run Cold), so a wardrobe's score depends only
 * on its contents:
 *
 * | Activity            | Temperatures (°F)  |
 * |---------------------|--------------------|
 * | Running, biking     | 70, 50, 30, 10     |
 * | XC, alpine, touring | 35, 15, -5         |
 *
 * Weather: calm and dry (5 mph, 50% humidity) or windy and wet (15 mph, 90%
 * humidity, rain above 32°F and snow at or below it). That's 34 scenarios.
 * Change GRID_VERSION with the grid, so cached results don't outlive it.
 */
import type { WeatherInput } from '@/lib/recommendations/request';
import type { CoverageActivity, CoverageWeather } from '@/types/wardrobe-coverage';

export const GRID_VERSION = '1';

/** The grid in a phrase, for the Wardrobe section. */
export const GRID_DESCRIPTION = '5 activities from 70°F to −5°F, each in calm, dry weather and in wind with rain or snow';

export const COVERAGE_ACTIVITIES: { activity: CoverageActivity; label: string; temperaturesF: number[] }[] = [
  { activity: 'running', label: 'Running', temperaturesF: [70, 50, 30, 10] },
  { activity: 'biking', label: 'Biking', temperaturesF: [70, 50, 30, 10] },
  { activity: 'xc_skiing', label: 'XC skiing', temperaturesF: [35, 15, -5] },
  { activity: 'alpine_skiing', label: 'Alpine skiing', temperaturesF: [35, 15, -5] },
  { activity: 'backcountry_skiing', label: 'Backcountry skiing', temperaturesF: [35, 15, -5] },
];

const WEATHER: Record<CoverageWeather, (temperatureF: number) => WeatherInput> = {
  calm_dry: (temperature) => ({ temperature, wind_speed: 5, humidity: 50, precipitation: false }),
  windy_wet: (temperature) => ({
    temperature, wind_speed: 15, humidity: 90, precipitation: true,
    precipitation_type: temperature <= 32 ? 'snow' : 'rain',
  }),
};

export interface CoverageScenario {
  id: string;
  activity: CoverageActivity;
  temperatureF: number;
  weather: CoverageWeather;
  input: WeatherInput;
}

export const COVERAGE_GRID: CoverageScenario[] = COVERAGE_ACTIVITIES.flatMap(({ activity, temperaturesF }) =>
  temperaturesF.flatMap((temperatureF) => (Object.keys(WEATHER) as CoverageWeather[]).map((weather) => ({
    id: `${activity}:${temperatureF}:${weather}`,
    activity,
    temperatureF,
    weather,
    input: WEATHER[weather](temperatureF),
  }))));
