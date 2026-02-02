// IREQ (Required Insulation) Calculator
// Based on ISO 11079 standard

import {
  CLO_TO_M2KW,
  SKIN_TEMP_NEUTRAL,
  SKIN_TEMP_MINIMUM,
  REGIONAL_IREQ_MULTIPLIERS,
  DEFAULT_REGIONAL_MULTIPLIERS,
  EXTREMITY_IREQ_MULTIPLIERS,
  DEFAULT_EXTREMITY_MULTIPLIERS,
  type RegionalIreqActivity,
  type ExtremityIreqActivity,
} from './constants';
import type { IreqResult } from '@/types/garments';

export interface IreqInput {
  airTemp: number;           // °C
  meanRadiantTemp?: number;  // °C (defaults to airTemp outdoors)
  windSpeed: number;         // m/s
  relativeHumidity: number;  // 0-100
  metabolicRate: number;     // W/m²
  workRate?: number;         // W/m² (external work, usually 0)
}

/**
 * Calculate water vapor pressure (Pa) from temperature and relative humidity
 */
function calculateVaporPressure(tempC: number, rh: number): number {
  // Saturation vapor pressure (Magnus formula)
  const pSat = 610.78 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  return pSat * (rh / 100);
}

/**
 * Calculate required clothing insulation using ISO 11079 method.
 */
export function calculateIreq(input: IreqInput): IreqResult {
  const {
    airTemp,
    meanRadiantTemp = airTemp,
    windSpeed,
    relativeHumidity,
    metabolicRate,
    workRate = 0,
  } = input;

  const M = metabolicRate;
  const W = workRate;

  // Respiratory heat losses
  // Convective respiratory heat loss
  const cRes = 0.0014 * M * (34 - airTemp);

  // Evaporative respiratory heat loss
  const pA = calculateVaporPressure(airTemp, relativeHumidity);
  const eRes = 0.0173 * M * (5.87 - pA / 1000);

  // Available heat for skin heat loss
  const H = M - W - cRes - eRes;

  // Calculate for both neutral and minimum skin temperatures
  const results: { ireqMin: number; ireqNeutral: number } = {
    ireqMin: 0,
    ireqNeutral: 0,
  };

  for (const [key, tSk] of [
    ['ireqNeutral', SKIN_TEMP_NEUTRAL],
    ['ireqMin', SKIN_TEMP_MINIMUM],
  ] as const) {
    // Operative temperature (simplified for outdoors)
    const tO = (airTemp + meanRadiantTemp) / 2;

    // Convective heat transfer coefficient
    // ISO 11079 equation for walking/standing outdoors
    const hC = windSpeed > 0.5 ? 8.7 * Math.sqrt(windSpeed) : 3.5;

    // Radiative heat transfer coefficient (linearized)
    const hR = 4.0; // Simplified, approximately 4 W/m²K

    // Combined heat transfer coefficient
    const h = hC + hR;

    // Required total insulation (m²K/W)
    // Based on heat balance: H = (t_sk - t_o) / I_total
    let iTotalRequired: number;
    if (H > 0) {
      iTotalRequired = (tSk - tO) / H;
    } else {
      iTotalRequired = Infinity;
    }

    // Boundary air layer resistance
    const iA = 1 / h;

    // Required clothing insulation
    const iCl = iTotalRequired - iA;

    // Convert to clo
    const rClClo = iCl / CLO_TO_M2KW;

    results[key] = Math.max(0, rClClo);
  }

  return {
    ireqMin: Math.round(results.ireqMin * 100) / 100,
    ireqNeutral: Math.round(results.ireqNeutral * 100) / 100,
    dleHours: Infinity, // DLE depends on actual clothing; use ensemble analysis for specific values
  };
}

export interface RegionalIreq {
  torso: number;
  arms: number;
  legs: number;
}

export interface RegionalIreqResult {
  min: RegionalIreq;
  neutral: RegionalIreq;
}

/**
 * Convert whole-body IREQ to regional targets based on activity.
 * Different activities have different heat distribution patterns.
 */
export function calculateRegionalIreq(
  baseIreq: IreqResult,
  activity: RegionalIreqActivity | string
): RegionalIreqResult {
  const multipliers = activity in REGIONAL_IREQ_MULTIPLIERS
    ? REGIONAL_IREQ_MULTIPLIERS[activity as RegionalIreqActivity]
    : DEFAULT_REGIONAL_MULTIPLIERS;

  return {
    min: {
      torso: Math.round(baseIreq.ireqMin * multipliers.torso * 100) / 100,
      arms: Math.round(baseIreq.ireqMin * multipliers.arms * 100) / 100,
      legs: Math.round(baseIreq.ireqMin * multipliers.legs * 100) / 100,
    },
    neutral: {
      torso: Math.round(baseIreq.ireqNeutral * multipliers.torso * 100) / 100,
      arms: Math.round(baseIreq.ireqNeutral * multipliers.arms * 100) / 100,
      legs: Math.round(baseIreq.ireqNeutral * multipliers.legs * 100) / 100,
    },
  };
}

export interface ExtremityIreq {
  hands: number;
  head: number;
}

export interface ExtremityIreqResult {
  min: ExtremityIreq;
  neutral: ExtremityIreq;
}

/**
 * Calculate IREQ targets for extremities (hands, head).
 * Extremities need proportionally more insulation due to:
 * - Higher surface-area-to-volume ratios
 * - Reduced local metabolic heat production
 * - Vasoconstriction in cold conditions
 *
 * @param baseIreq - The whole-body IREQ result
 * @param activity - The activity type
 * @param airTempC - Air temperature in Celsius (for scaling)
 * @param windSpeedMs - Wind speed in m/s (for scaling)
 */
export function calculateExtremityIreq(
  baseIreq: IreqResult,
  activity: ExtremityIreqActivity | string,
  airTempC: number = -10,
  windSpeedMs: number = 3,
): ExtremityIreqResult {
  const activityMultipliers = activity in EXTREMITY_IREQ_MULTIPLIERS
    ? EXTREMITY_IREQ_MULTIPLIERS[activity as ExtremityIreqActivity]
    : DEFAULT_EXTREMITY_MULTIPLIERS;

  // Temperature factor: colder = proportionally more insulation needed
  // Increases 2% per degree below -10°C, decreases above
  const tempFactor = Math.max(0.8, Math.min(1.5, 1.0 + (-airTempC - 10) * 0.02));

  // Wind factor: extremities more exposed to wind
  // Increases 3% per m/s of wind
  const windFactor = 1.0 + (windSpeedMs * 0.03);

  // Calculate final multipliers
  const handMult = activityMultipliers.hands * tempFactor * windFactor;
  const headMult = activityMultipliers.head * tempFactor * windFactor;

  return {
    min: {
      hands: Math.round(baseIreq.ireqMin * handMult * 100) / 100,
      head: Math.round(baseIreq.ireqMin * headMult * 100) / 100,
    },
    neutral: {
      hands: Math.round(baseIreq.ireqNeutral * handMult * 100) / 100,
      head: Math.round(baseIreq.ireqNeutral * headMult * 100) / 100,
    },
  };
}

/**
 * Estimate duration limited exposure (hours).
 * Simplified model based on USARIEM research.
 *
 * @param ireqMin - The minimum required insulation in clo
 * @param availableClo - The available clothing insulation in clo
 */
function calculateDle(
  ireqMin: number,
  availableClo: number
): number {
  const cloDeficit = ireqMin - availableClo;

  if (cloDeficit <= 0) {
    return Infinity; // No time limit
  }

  // Rough approximation: every 0.5 clo deficit = ~1 hour less exposure
  // at moderate activity in cold conditions
  const baseHours = 8.0;
  const dle = baseHours - cloDeficit * 2;

  return Math.max(0.5, dle); // Minimum 30 minutes
}

/**
 * Convert Fahrenheit to Celsius
 */
export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * (5 / 9);
}

/**
 * Convert Celsius to Fahrenheit
 */
export function celsiusToFahrenheit(c: number): number {
  return c * (9 / 5) + 32;
}

/**
 * Convert mph to m/s
 */
export function mphToMs(mph: number): number {
  return mph * 0.44704;
}

/**
 * Convert m/s to mph
 */
export function msToMph(ms: number): number {
  return ms / 0.44704;
}
