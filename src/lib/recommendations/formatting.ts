/**
 * Response formatting helpers for recommendation API routes
 */
import { garmentToThermalProps } from '@/lib/biophysics/ensemble';
import type { GarmentWithProtection } from '@/lib/biophysics/scorer';
import type { GarmentRow, HandwearRow, HeadwearRow } from './types';

/**
 * Format garment for API response
 */
export function formatGarmentResponse(garment: GarmentRow): {
  id: string;
  name: string;
  category: string;
  rcl?: number;
  recl?: number;
  evap_potential?: number;
  covers_torso: boolean;
  covers_legs: boolean;
} {
  return {
    id: garment.id,
    name: `${garment.brand} ${garment.model_name}`,
    category: garment.category,
    rcl: garment.garment_thermal_properties?.rcl_whole_body,
    recl: garment.garment_thermal_properties?.recl_whole_body,
    evap_potential: garment.garment_thermal_properties?.evap_potential,
    covers_torso: garment.covers_torso,
    covers_legs: garment.covers_legs,
  };
}

/**
 * Convert an ensemble of garments to thermal garments with protection data
 * for use with scoring functions
 */
export function ensembleToThermalGarments(ensemble: GarmentRow[]): GarmentWithProtection[] {
  return ensemble.map((g) => {
    const baseProps = garmentToThermalProps(g, g.garment_thermal_properties ?? {});
    return {
      ...baseProps,
      category: g.category,
      windproofRating: (g.garment_protection?.windproof_rating ?? 'none') as GarmentWithProtection['windproofRating'],
      waterproofRating: (g.garment_protection?.waterproof_rating ?? 'none') as GarmentWithProtection['waterproofRating'],
      waterproofMm: g.garment_protection?.waterproof_mm,
    };
  });
}

/**
 * Format handwear for API response
 */
export function formatHandwearResponse(handwear: HandwearRow) {
  return {
    id: handwear.id,
    name: `${handwear.brand} ${handwear.model_name}`,
    type: handwear.handwear_type,
    rcl: handwear.rcl_clo,
    dexterity: handwear.dexterity_score,
  };
}

/**
 * Format headwear for API response
 */
export function formatHeadwearResponse(headwear: HeadwearRow) {
  return {
    id: headwear.id,
    name: `${headwear.brand} ${headwear.model_name}`,
    type: headwear.headwear_type,
    rcl: headwear.rcl_clo,
    covers_ears: headwear.covers_ears,
    covers_neck: headwear.covers_neck,
  };
}
