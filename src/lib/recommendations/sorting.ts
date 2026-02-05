/**
 * Garment sorting and ensemble calculation utilities
 */
import type { GarmentRow } from './types';

/**
 * Sort garments by evaporative potential (breathability)
 */
export function sortByBreathability(garments: GarmentRow[], descending = true): GarmentRow[] {
  return [...garments].sort((a, b) => {
    const epA = a.garment_thermal_properties?.evap_potential ?? 0;
    const epB = b.garment_thermal_properties?.evap_potential ?? 0;
    return descending ? epB - epA : epA - epB;
  });
}

/**
 * Sort garments by thermal insulation (clo)
 */
export function sortByInsulation(garments: GarmentRow[], descending = true): GarmentRow[] {
  return [...garments].sort((a, b) => {
    const cloA = a.garment_thermal_properties?.rcl_whole_body ?? 0;
    const cloB = b.garment_thermal_properties?.rcl_whole_body ?? 0;
    return descending ? cloB - cloA : cloA - cloB;
  });
}

/**
 * Sort garments by waterproof rating
 */
export function sortByWaterproofness(garments: GarmentRow[]): GarmentRow[] {
  return [...garments].sort((a, b) => {
    const wpA = a.garment_protection?.waterproof_mm ?? 0;
    const wpB = b.garment_protection?.waterproof_mm ?? 0;
    return wpB - wpA;
  });
}

/**
 * Get total clo value for an ensemble
 */
export function getEnsembleClo(ensemble: GarmentRow[]): number {
  return ensemble.reduce(
    (sum, g) => sum + (g.garment_thermal_properties?.rcl_whole_body ?? 0),
    0
  );
}

/**
 * Find a garment meeting minimum breathability threshold
 */
export function findBreathableGarment(
  garments: GarmentRow[],
  minEvapPotential: number
): GarmentRow | undefined {
  const sorted = sortByBreathability(garments);
  return sorted.find(
    (g) => (g.garment_thermal_properties?.evap_potential ?? 0) >= minEvapPotential
  );
}
