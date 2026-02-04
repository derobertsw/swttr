// Ensemble Scoring Function
// Scores ensembles for given weather conditions and activities

import { calculateIreq, fahrenheitToCelsius, mphToMs } from './ireq';
import { predictEnsembleThermal } from './ensemble';
import { ACTIVITY_WEIGHTS, type ActivityType } from './constants';
import type { EnsembleScore } from '@/types/garments';

export interface WeatherConditions {
  temperature: number;       // °C
  windSpeed: number;         // m/s
  humidity: number;          // %
  precipitation: boolean;
  precipitationType?: 'rain' | 'snow' | 'mixed';
}

export interface ActivityProfile {
  name: string;
  metabolicRate: number;          // W/m²
  hasStaticPeriods: boolean;
  staticMetabolicRate?: number;   // W/m² when stopped
  windExposure: 'sheltered' | 'normal' | 'exposed';
}

export interface GarmentWithProtection {
  garmentId: string;
  name: string;
  category: string;
  rclTorso: number;
  rclArms: number;
  rclLegs: number;
  rclWholeBody?: number;
  reclTorso: number;
  reclArms: number;
  reclLegs: number;
  reclWholeBody?: number;
  coversTorso: boolean;
  coversArms: boolean;
  coversLegs: boolean;
  weightGrams?: number;
  windproofRating?: 'none' | 'wind_resistant' | 'windproof';
  waterproofRating?: 'none' | 'DWR_only' | 'water_resistant' | 'waterproof';
  waterproofMm?: number;
}

/**
 * Score an ensemble for given conditions.
 */
export function scoreEnsemble(
  garments: GarmentWithProtection[],
  weather: WeatherConditions,
  activity: ActivityProfile,
  activityType: ActivityType
): EnsembleScore {
  // Get predicted ensemble properties
  const ensemble = predictEnsembleThermal(garments);

  // Calculate effective wind based on exposure
  const windFactor = {
    sheltered: 0.5,
    normal: 1.0,
    exposed: 1.5,
  };
  const effectiveWind = weather.windSpeed * windFactor[activity.windExposure];

  // Calculate required insulation
  const ireq = calculateIreq({
    airTemp: weather.temperature,
    windSpeed: effectiveWind,
    relativeHumidity: weather.humidity,
    metabolicRate: activity.metabolicRate,
  });

  // Get scoring weights for activity
  const weights = ACTIVITY_WEIGHTS[activityType];

  const scores: Record<string, number> = {};
  const warnings: string[] = [];
  const recommendations: string[] = [];

  const rcl = ensemble.rcl.wholeBody;

  // Small tolerance for floating-point comparisons
  const EPSILON = 0.01;

  // 1. Cold Protection Score (are you warm enough?)
  if (rcl >= ireq.ireqNeutral - EPSILON) {
    scores.coldProtection = 100;
  } else if (rcl >= ireq.ireqMin - EPSILON) {
    // Linear scale between min and neutral
    const rangeSize = ireq.ireqNeutral - ireq.ireqMin;
    const position = rcl - ireq.ireqMin;
    scores.coldProtection = rangeSize > 0
      ? 50 + 50 * (position / rangeSize)
      : 75;
  } else {
    // Below minimum - significant penalty
    const deficit = ireq.ireqMin - rcl;
    scores.coldProtection = Math.max(0, 50 - deficit * 20);
    warnings.push(
      `Insufficient overall insulation: ${rcl.toFixed(1)} clo vs ${ireq.ireqMin.toFixed(1)} clo required`
    );
  }

  // 2. Overheat Prevention Score (are you too warm?)
  const excessInsulation = rcl - ireq.ireqNeutral;
  if (excessInsulation <= 0) {
    scores.overheatPrevention = 100;
  } else if (excessInsulation < 1.0) {
    scores.overheatPrevention = 100 - excessInsulation * 30;
  } else {
    scores.overheatPrevention = Math.max(0, 70 - excessInsulation * 20);
    if (activity.metabolicRate > 200) {
      // High exertion
      warnings.push('Risk of overheating during high exertion');
      recommendations.push('Consider more breathable layers or adding vents');
    }
  }

  // 3. Breathability Score
  const evapPotential = ensemble.evapPotential;
  // Targets vary by activity intensity
  let targetEp: number;
  if (activity.metabolicRate > 250) {
    // High intensity (XC skiing)
    targetEp = 0.30;
  } else if (activity.metabolicRate > 150) {
    // Moderate (touring uphill)
    targetEp = 0.22;
  } else {
    // Low intensity
    targetEp = 0.15;
  }

  if (evapPotential >= targetEp) {
    scores.breathability = 100;
  } else {
    const ratio = evapPotential / targetEp;
    scores.breathability = ratio * 100;
    if (ratio < 0.7) {
      warnings.push('Limited breathability may cause moisture buildup');
    }
  }

  // 4. Weather Protection Score
  scores.weatherProtection = calculateWeatherScore(garments, weather);

  // 5. Weight Score (lighter = better, especially for touring)
  const totalWeight = garments.reduce(
    (sum, g) => sum + (g.weightGrams ?? 0),
    0
  );
  // Baseline: 1500g for full system is reasonable
  if (totalWeight <= 1000) {
    scores.weight = 100;
  } else if (totalWeight <= 2000) {
    scores.weight = 100 - (totalWeight - 1000) * 0.05;
  } else {
    scores.weight = Math.max(0, 50 - (totalWeight - 2000) * 0.02);
  }

  // Calculate weighted total
  const totalScore =
    scores.coldProtection * weights.coldProtection +
    scores.overheatPrevention * weights.overheatPrevention +
    scores.breathability * weights.breathability +
    scores.weatherProtection * weights.weatherProtection +
    scores.weight * weights.weight;

  return {
    totalScore: Math.round(totalScore * 10) / 10,
    componentScores: {
      coldProtection: Math.round(scores.coldProtection * 10) / 10,
      overheatPrevention: Math.round(scores.overheatPrevention * 10) / 10,
      breathability: Math.round(scores.breathability * 10) / 10,
      weatherProtection: Math.round(scores.weatherProtection * 10) / 10,
      weight: Math.round(scores.weight * 10) / 10,
    },
    ensembleProperties: {
      rclClo: Math.round(rcl * 100) / 100,
      recl: Math.round(ensemble.recl.wholeBody * 10) / 10,
      evapPotential: Math.round(evapPotential * 1000) / 1000,
      im: ensemble.im,
    },
    ireq: {
      min: ireq.ireqMin,
      neutral: ireq.ireqNeutral,
    },
    warnings,
    recommendations,
  };
}

/**
 * Calculate weather protection subscore
 */
function calculateWeatherScore(
  garments: GarmentWithProtection[],
  weather: WeatherConditions
): number {
  let score = 100;

  // Check for shell layer
  const shells = garments.filter(
    (g) => g.category === 'hard_shell' || g.category === 'soft_shell'
  );

  if (weather.precipitation) {
    if (shells.length === 0) {
      score -= 40;
    } else {
      // Check waterproofing level
      const bestShell = shells.reduce((best, s) => {
        const wpMm = s.waterproofMm ?? 0;
        return wpMm > (best.waterproofMm ?? 0) ? s : best;
      }, shells[0]);

      const wp = bestShell.waterproofRating ?? 'none';
      if (wp === 'none') {
        score -= 35;
      } else if (wp === 'DWR_only') {
        score -= 25;
      } else if (wp === 'water_resistant') {
        score -= 10;
      }
      // 'waterproof' = no deduction
    }
  }

  if (weather.windSpeed > 8) {
    // Significant wind
    if (shells.length === 0) {
      score -= 30;
    } else {
      const wind = shells[0].windproofRating ?? 'none';
      if (wind === 'none') {
        score -= 25;
      } else if (wind === 'wind_resistant') {
        score -= 10;
      }
    }
  }

  return Math.max(0, score);
}

/**
 * Helper to convert weather from imperial to metric
 */
export function convertWeatherToMetric(imperial: {
  temperatureF: number;
  windSpeedMph: number;
  humidity: number;
  precipitation: boolean;
  precipitationType?: 'rain' | 'snow' | 'mixed';
}): WeatherConditions {
  return {
    temperature: fahrenheitToCelsius(imperial.temperatureF),
    windSpeed: mphToMs(imperial.windSpeedMph),
    humidity: imperial.humidity,
    precipitation: imperial.precipitation,
    precipitationType: imperial.precipitationType,
  };
}
