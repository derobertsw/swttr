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

function calculateConvectiveCoefficient(
  airSpeedMs: number,
  clothingSurfaceTempC: number,
  airTempC: number
): number {
  const v = Math.max(0.05, airSpeedMs);
  const forced = 8.3 * Math.pow(v, 0.6);
  const natural = 2.38 * Math.pow(Math.max(0.1, Math.abs(clothingSurfaceTempC - airTempC)), 0.25);
  return Math.max(3.0, forced, natural);
}

function calculateRadiativeCoefficient(
  clothingSurfaceTempC: number,
  meanRadiantTempC: number
): number {
  const sigma = 5.670374419e-8; // Stefan-Boltzmann constant
  const emissivity = 0.95;
  const tClK = clothingSurfaceTempC + 273.15;
  const tRadK = meanRadiantTempC + 273.15;
  const avgK = Math.max(150, (tClK + tRadK) / 2);
  const hR = emissivity * 4 * sigma * Math.pow(avgK, 3);
  return Math.max(3.0, Math.min(7.0, hR));
}

function calculateOperativeTemperature(
  airTempC: number,
  meanRadiantTempC: number,
  hC: number,
  hR: number
): number {
  return ((hC * airTempC) + (hR * meanRadiantTempC)) / (hC + hR);
}

function calculateClothingAreaFactor(iClM2kw: number): number {
  // ISO-style clothing area factor formulation
  if (iClM2kw <= 0.078) {
    return 1 + (1.29 * iClM2kw);
  }
  return 1.05 + (0.645 * iClM2kw);
}

function calculateRequiredInsulation(
  tSk: number,
  airTempC: number,
  meanRadiantTempC: number,
  windSpeedMs: number,
  availableHeatFlux: number
): number {
  if (availableHeatFlux <= 0) {
    return Infinity;
  }

  let iClM2kw = 0.08;
  let clothingSurfaceTempC = tSk - 2;

  for (let i = 0; i < 12; i += 1) {
    const hC = calculateConvectiveCoefficient(windSpeedMs, clothingSurfaceTempC, airTempC);
    const hR = calculateRadiativeCoefficient(clothingSurfaceTempC, meanRadiantTempC);
    const hTotal = hC + hR;

    const iA = 1 / hTotal;
    const tO = calculateOperativeTemperature(airTempC, meanRadiantTempC, hC, hR);
    const iTotalRequired = (tSk - tO) / availableHeatFlux;
    const fCl = calculateClothingAreaFactor(iClM2kw);

    const nextIcl = Math.max(0, iTotalRequired - (iA / fCl));
    const smoothedIcl = (iClM2kw * 0.4) + (nextIcl * 0.6);

    clothingSurfaceTempC = tSk - (availableHeatFlux * smoothedIcl);
    if (Math.abs(smoothedIcl - iClM2kw) < 1e-4) {
      iClM2kw = smoothedIcl;
      break;
    }

    iClM2kw = smoothedIcl;
  }

  return iClM2kw;
}

function estimateDleHours(
  ireqMin: number,
  ireqNeutral: number,
  airTempC: number,
  windSpeedMs: number,
  metabolicRate: number
): number {
  // DLE proxy based on environmental strain and physiological buffer.
  // Intended as a bounded planning estimate (0.5h to 8h).
  if (ireqMin <= 0) {
    return 8;
  }

  const comfortBand = Math.max(0, ireqNeutral - ireqMin);
  const coldStress = Math.max(0, -airTempC) / 20;
  const windStress = Math.max(0, windSpeedMs - 1) / 6;
  const metabolicBuffer = Math.max(0, (metabolicRate - 58.2) / 250);

  const rawHours = 8
    - (comfortBand * 2.2)
    - (coldStress * 1.3)
    - (windStress * 0.9)
    + (metabolicBuffer * 0.8);

  return Math.max(0.5, Math.min(8, rawHours));
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
  const boundedRh = Math.max(0, Math.min(100, relativeHumidity));
  const pA = calculateVaporPressure(airTemp, boundedRh);
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
    const iCl = calculateRequiredInsulation(
      tSk,
      airTemp,
      meanRadiantTemp,
      windSpeed,
      H
    );

    // Convert to clo
    const rClClo = iCl / CLO_TO_M2KW;

    results[key] = Math.max(0, rClClo);
  }

  return {
    ireqMin: Math.round(results.ireqMin * 100) / 100,
    ireqNeutral: Math.round(results.ireqNeutral * 100) / 100,
    dleHours: Math.round(
      estimateDleHours(results.ireqMin, results.ireqNeutral, airTemp, windSpeed, metabolicRate) * 100
    ) / 100,
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
