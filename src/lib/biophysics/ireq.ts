// IREQ (Required Insulation) Calculator
// A simplified ISO 11079 heat balance: fixed skin temperatures and no skin
// evaporation term. docs/algorithm-review.md compares it with the standard;
// docs/exposure-limits.md covers the heat-storage rate and DLE built on it.

import {
  CLO_TO_M2KW,
  SKIN_TEMP_NEUTRAL,
  SKIN_TEMP_MINIMUM,
  EXTREMITY_IREQ_MULTIPLIERS,
  DEFAULT_EXTREMITY_MULTIPLIERS,
  type ExtremityIreqActivity,
} from './constants';
import type { IreqResult } from '@/types/garments';

interface IreqInput {
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

/**
 * Respiratory heat losses and the heat left for the skin to lose, in W/m².
 * The same terms feed IREQ and the heat-storage rate, so an ensemble at IREQ
 * is in heat balance.
 */
function availableSkinHeatFlux(
  airTempC: number,
  relativeHumidity: number,
  metabolicRate: number,
  workRate: number
): number {
  const M = metabolicRate;
  // Convective respiratory heat loss
  const cRes = 0.0014 * M * (34 - airTempC);
  // Evaporative respiratory heat loss
  const boundedRh = Math.max(0, Math.min(100, relativeHumidity));
  const pA = calculateVaporPressure(airTempC, boundedRh);
  const eRes = 0.0173 * M * (5.87 - pA / 1000);
  return M - workRate - cRes - eRes;
}

/**
 * Dry heat loss (R + C) through a clothing ensemble of resultant insulation
 * `iClM2kw`, at skin temperature `tSk`, in W/m². It uses the coefficients and
 * clothing area factor the IREQ solver uses, iterating on the clothing
 * surface temperature.
 */
function calculateDryHeatLoss(
  tSk: number,
  iClM2kw: number,
  airTempC: number,
  meanRadiantTempC: number,
  windSpeedMs: number
): number {
  const fCl = calculateClothingAreaFactor(iClM2kw);
  let clothingSurfaceTempC = tSk - 2;
  let dry = 0;
  for (let i = 0; i < 50; i += 1) {
    const hC = calculateConvectiveCoefficient(windSpeedMs, clothingSurfaceTempC, airTempC);
    const hR = calculateRadiativeCoefficient(clothingSurfaceTempC, meanRadiantTempC);
    const tO = calculateOperativeTemperature(airTempC, meanRadiantTempC, hC, hR);
    dry = (tSk - tO) / (iClM2kw + 1 / ((hC + hR) * fCl));
    const next = tSk - dry * iClM2kw;
    if (Math.abs(next - clothingSurfaceTempC) < 1e-6) break;
    clothingSurfaceTempC = (clothingSurfaceTempC * 0.4) + (next * 0.6);
  }
  return dry;
}

interface HeatStorageInput extends IreqInput {
  /** Resultant (wind- and motion-corrected) clothing insulation, in clo. */
  resultantClo: number;
  /** Skin temperature the balance is held at, in °C. */
  skinTemp: number;
}

/**
 * Body heat-storage rate S, in W/m², for an ensemble of known resultant
 * insulation: the heat available to the skin minus the dry heat the ensemble
 * lets through, with the skin held at `skinTemp` (ISO 11079 6.2's DLE
 * balance, simplified like `calculateIreq`). Negative S is a heat debt
 * building up; zero or positive S means no net whole-body cooling.
 */
export function calculateHeatStorageRate(input: HeatStorageInput): number {
  const {
    airTemp,
    meanRadiantTemp = airTemp,
    windSpeed,
    relativeHumidity,
    metabolicRate,
    workRate = 0,
    resultantClo,
    skinTemp,
  } = input;
  const available = availableSkinHeatFlux(airTemp, relativeHumidity, metabolicRate, workRate);
  const dry = calculateDryHeatLoss(
    skinTemp,
    Math.max(0, resultantClo) * CLO_TO_M2KW,
    airTemp,
    meanRadiantTemp,
    windSpeed
  );
  return available - dry;
}

/**
 * Bounded 0.5–8 h planning heuristic that only widens target ranges
 * (`calculateActivityTargetRange`). It ignores clothing, so it is not a
 * duration-limited exposure; `calculateExposureLimit` computes that for the
 * selected ensemble.
 */
function estimateExposureHeuristicHours(
  ireqMin: number,
  ireqNeutral: number,
  airTempC: number,
  windSpeedMs: number,
  metabolicRate: number
): number {
  // A target-range heuristic, not an ISO DLE derivation; bounded so edge
  // conditions can't produce extreme target ranges.
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
 * Calculate required clothing insulation with a simplified ISO 11079 heat balance.
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

  // Heat available for skin heat loss, after respiration
  const H = availableSkinHeatFlux(airTemp, relativeHumidity, metabolicRate, workRate);

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
    heuristicExposureHours: Math.round(
      estimateExposureHeuristicHours(
        results.ireqMin,
        results.ireqNeutral,
        airTemp,
        windSpeed,
        metabolicRate
      ) * 100
    ) / 100,
  };
}

/** Wind, body motion and outer-fabric air permeability for one activity phase. */
export interface DynamicExposure {
  /** Relative air speed at the body, in m/s. */
  relativeAirSpeedMs: number;
  /** Walking (or equivalent limb-motion) speed, in m/s. */
  walkingSpeedMs: number;
  /** Air permeability of the outer fabric, in l/(m²·s). */
  airPermeability: number;
}

/** Still-air insulation of the boundary layer in ISO 11079 Annex A, in m²K/W. */
const STATIC_AIR_INSULATION = 0.085;

/**
 * ISO 11079's walking speed when none is given: 0.0052 × (M − 58) m/s,
 * capped at 0.7 m/s for an inferred movement speed. Explicit walking
 * speeds have a separate 1.2 m/s validity limit in the correction.
 */
export function walkingSpeedFromMetabolicRate(metabolicRate: number): number {
  return Math.max(0, Math.min(0.7, 0.0052 * (metabolicRate - 58)));
}

/**
 * Basic (static manikin) clothing insulation that delivers a resultant
 * insulation in wind and motion, in clo: ISO 11079 Annex A's ICL from IREQ,
 * with ISO 9920's correction for relative air speed, walking speed and the
 * outer fabric's air permeability. Catalog garments are rated in basic clo
 * (USARIEM T21-03 measured them standing, at 0.4 m/s), IREQ is resultant.
 *
 * `fclReferenceClo` sets the clothing area factor, so regional targets can
 * share the whole-body one. Never returns less than `resultantClo`: for a few
 * hundredths of a clo in light wind the formula falls below it (the static
 * air layer clothing carries outweighs the requirement), and a positive
 * heat-balance minimum must stay positive.
 */
export function requiredBasicInsulation(
  resultantClo: number,
  { relativeAirSpeedMs, walkingSpeedMs, airPermeability }: DynamicExposure,
  fclReferenceClo: number = resultantClo,
): number {
  // ISO 11079 Annex A validity: 0.4–18 m/s relative air speed, ≤ 1.2 m/s walking.
  const v = Math.max(0.4, Math.min(18, relativeAirSpeedMs));
  const w = Math.max(0, Math.min(1.2, walkingSpeedMs));
  const p = Math.max(1, Math.min(1000, airPermeability));
  const motion = Math.exp(-0.15 * v - 0.22 * w);
  const resultantAir = 0.092 * motion - 0.0045;
  // Resultant over static total insulation.
  const correction = 0.54 * motion * Math.pow(p, 0.075) - 0.06 * Math.log(p) + 0.5;
  const fcl = 1 + 1.197 * Math.max(0, fclReferenceClo) * CLO_TO_M2KW;
  const basic = (resultantClo * CLO_TO_M2KW + resultantAir / fcl) / correction - STATIC_AIR_INSULATION / fcl;
  return Math.max(resultantClo, basic / CLO_TO_M2KW);
}

/**
 * Resultant insulation of an ensemble rated in basic (static manikin) clo, in
 * the wind, motion and outer-fabric air permeability of `exposure`: ISO
 * 11079 Annex A's ICLR from ICL, the direction the standard uses for DLE.
 * It inverts `requiredBasicInsulation` (including its floor, so it never
 * returns more than `basicClo`), iterating because the clothing area factor
 * follows the resultant value.
 */
export function resultantInsulationFromBasic(
  basicClo: number,
  { relativeAirSpeedMs, walkingSpeedMs, airPermeability }: DynamicExposure,
): number {
  const basic = Math.max(0, basicClo);
  const v = Math.max(0.4, Math.min(18, relativeAirSpeedMs));
  const w = Math.max(0, Math.min(1.2, walkingSpeedMs));
  const p = Math.max(1, Math.min(1000, airPermeability));
  const motion = Math.exp(-0.15 * v - 0.22 * w);
  const resultantAir = 0.092 * motion - 0.0045;
  const correction = 0.54 * motion * Math.pow(p, 0.075) - 0.06 * Math.log(p) + 0.5;
  let resultant = basic;
  for (let i = 0; i < 30; i += 1) {
    const fcl = 1 + 1.197 * Math.max(0, resultant) * CLO_TO_M2KW;
    const next = ((basic * CLO_TO_M2KW + STATIC_AIR_INSULATION / fcl) * correction - resultantAir / fcl) / CLO_TO_M2KW;
    if (Math.abs(next - resultant) < 1e-9) {
      resultant = next;
      break;
    }
    resultant = next;
  }
  return Math.max(0, Math.min(basic, resultant));
}

interface ExtremityIreq {
  hands: number;
  head: number;
}

interface ExtremityIreqResult {
  min: ExtremityIreq;
  neutral: ExtremityIreq;
}

/**
 * Calculate IREQ targets for extremities (hands, head) from the whole-body
 * IREQ of the phase they follow.
 *
 * ISO 11079 gives no method for local required insulation. Milder air lowers
 * the targets, but colder air doesn't raise them past the whole-body IREQ,
 * which already rises with the cold: at -30.6°C, with the whole body in heat
 * balance, gloves about as warm as the whole-body ensemble kept fingers at
 * 33°C (Gao et al. 2016).
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

  // Temperature factor: 0.8 at 0°C and above, rising 2% per degree to 1 at -10°C
  const tempFactor = Math.max(0.8, Math.min(1.0, 1.0 + (-airTempC - 10) * 0.02));

  // Wind factor: hands and head are small, so wind strips more of their
  // surface air layer. Increases 3% per m/s of wind
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
