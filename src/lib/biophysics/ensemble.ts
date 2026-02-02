// Ensemble Thermal Property Predictor
// Based on USARIEM regression equations from T21-03

import {
  CLO_TO_M2KW,
  REGIONAL_WEIGHTS,
  ENSEMBLE_REGRESSION,
} from './constants';
import type { EnsemblePrediction } from '@/types/garments';

export interface ThermalGarment {
  rclTorso: number;
  rclArms: number;
  rclLegs: number;
  reclTorso: number;
  reclArms: number;
  reclLegs: number;
  coversTorso: boolean;
  coversArms: boolean;
  coversLegs: boolean;
}

/**
 * Predict ensemble thermal properties from individual garments.
 * Uses USARIEM regression equations for more accurate predictions
 * than simple summation (accounts for air layer compression, etc.)
 */
export function predictEnsembleThermal(garments: ThermalGarment[]): EnsemblePrediction {
  // Sum individual garment values by region
  const sums = {
    rcl: { torso: 0, arm: 0, leg: 0 },
    recl: { torso: 0, arm: 0, leg: 0 },
  };

  for (const g of garments) {
    if (g.coversTorso) {
      sums.rcl.torso += g.rclTorso;
      sums.recl.torso += g.reclTorso;
    }
    if (g.coversArms) {
      sums.rcl.arm += g.rclArms;
      sums.recl.arm += g.reclArms;
    }
    if (g.coversLegs) {
      sums.rcl.leg += g.rclLegs;
      sums.recl.leg += g.reclLegs;
    }
  }

  // Apply regression equations to predict actual ensemble values
  const predicted = {
    rcl: {
      torso: sums.rcl.torso * ENSEMBLE_REGRESSION.thermal.torso.coef,
      arm: sums.rcl.arm * ENSEMBLE_REGRESSION.thermal.arm.coef,
      leg: sums.rcl.leg * ENSEMBLE_REGRESSION.thermal.leg.coef,
      wholeBody: 0,
    },
    recl: {
      torso: sums.recl.torso * ENSEMBLE_REGRESSION.evaporative.torso.coef,
      arm: sums.recl.arm * ENSEMBLE_REGRESSION.evaporative.arm.coef,
      leg: sums.recl.leg * ENSEMBLE_REGRESSION.evaporative.leg.coef,
      wholeBody: 0,
    },
  };

  // Calculate whole-body values using parallel weighted average
  predicted.rcl.wholeBody = calculateWeightedAverage(predicted.rcl);
  predicted.recl.wholeBody = calculateWeightedAverage(predicted.recl);

  // Calculate derived metrics
  const evapPotential = calculateEvapPotential(
    predicted.rcl.wholeBody,
    predicted.recl.wholeBody
  );

  const im = calculatePermeabilityIndex(
    predicted.rcl.wholeBody,
    predicted.recl.wholeBody
  );

  return {
    rcl: predicted.rcl,
    recl: predicted.recl,
    evapPotential: Math.round(evapPotential * 1000) / 1000,
    im: Math.round(im * 100) / 100,
  };
}

/**
 * Calculate weighted average from regional values
 */
function calculateWeightedAverage(regionalValues: {
  torso: number;
  arm: number;
  leg: number;
}): number {
  return (
    regionalValues.torso * REGIONAL_WEIGHTS.torso +
    regionalValues.arm * REGIONAL_WEIGHTS.arm +
    regionalValues.leg * REGIONAL_WEIGHTS.leg
  );
}

/**
 * Calculate evaporative potential (im/clo ratio).
 * Higher = better moisture transfer per unit insulation.
 */
function calculateEvapPotential(rclClo: number, recl: number): number {
  if (rclClo === 0) {
    return 0;
  }

  const im = calculatePermeabilityIndex(rclClo, recl);
  return im / rclClo;
}

/**
 * Calculate moisture permeability index (im).
 * Range 0-1, where 1 = perfectly permeable.
 */
function calculatePermeabilityIndex(rclClo: number, recl: number): number {
  if (recl === 0) {
    return 1.0;
  }

  // im = 60.6515 * Rcl / Recl (from ISO 9920)
  // where Rcl in m²K/W and Recl in m²Pa/W
  const rclM2kw = rclClo * CLO_TO_M2KW;
  const im = (60.6515 * rclM2kw) / recl;

  return Math.min(1.0, im); // Cap at 1.0
}

export interface GarmentThermalData extends ThermalGarment {
  garmentId: string;
  name: string;
  category: string;
  rclWholeBody?: number;
  reclWholeBody?: number;
  weightGrams?: number;
}

/**
 * Convert a database garment with thermal properties to thermal data format
 */
export function garmentToThermalProps(
  garment: {
    id: string;
    brand: string;
    model_name: string;
    category: string;
    covers_torso: boolean;
    covers_arms: boolean;
    covers_legs: boolean;
    weight_grams?: number | null;
  },
  thermalProps: {
    rcl_torso?: number | null;
    rcl_arms?: number | null;
    rcl_legs?: number | null;
    rcl_whole_body?: number | null;
    recl_torso?: number | null;
    recl_arms?: number | null;
    recl_legs?: number | null;
    recl_whole_body?: number | null;
  }
): GarmentThermalData {
  return {
    garmentId: garment.id,
    name: `${garment.brand} ${garment.model_name}`,
    category: garment.category,
    rclTorso: thermalProps.rcl_torso ?? 0,
    rclArms: thermalProps.rcl_arms ?? 0,
    rclLegs: thermalProps.rcl_legs ?? 0,
    rclWholeBody: thermalProps.rcl_whole_body ?? undefined,
    reclTorso: thermalProps.recl_torso ?? 0,
    reclArms: thermalProps.recl_arms ?? 0,
    reclLegs: thermalProps.recl_legs ?? 0,
    reclWholeBody: thermalProps.recl_whole_body ?? undefined,
    coversTorso: garment.covers_torso,
    coversArms: garment.covers_arms,
    coversLegs: garment.covers_legs,
    weightGrams: garment.weight_grams ?? undefined,
  };
}
