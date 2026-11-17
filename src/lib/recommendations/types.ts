/**
 * Shared types for recommendation API routes
 */

import type { GarmentSemantics, ThermalProvenance } from '@/types/garments';

export interface GarmentThermalProps extends ThermalProvenance {
  rcl_torso?: number;
  rcl_arms?: number;
  rcl_legs?: number;
  rcl_whole_body?: number;
  recl_torso?: number;
  recl_arms?: number;
  recl_legs?: number;
  recl_whole_body?: number;
  evap_potential?: number;
}

export interface GarmentProtectionProps {
  data_source?: string | null;
  generic_estimate?: boolean;
  windproof_rating?: string;
  waterproof_rating?: string;
  waterproof_mm?: number;
}

export interface GarmentActivityRatingProps {
  xc_skiing_score?: number;
  ski_touring_uphill_score?: number;
  ski_touring_downhill_score?: number;
  alpine_skiing_score?: number;
}

/**
 * Catalog `garment_ventilation` row. `ventilation_factor` is an estimated
 * multiplier on the garment's evaporative resistance (Recl) with its vents
 * open; it never changes dry insulation (clo).
 */
export interface GarmentVentilationProps {
  has_pit_zips?: boolean | null;
  pit_zip_length_cm?: number | null;
  has_side_vents?: boolean | null;
  has_back_vent?: boolean | null;
  has_thigh_vents?: boolean | null;
  main_zip_two_way?: boolean | null;
  mesh_lined_pockets?: boolean | null;
  /** PostgREST returns numeric columns as numbers; tolerate strings too. */
  ventilation_factor?: number | string | null;
}

export interface GarmentRow extends GarmentSemantics {
  id: string;
  brand: string;
  model_name: string;
  category: string;
  covers_torso: boolean;
  covers_arms: boolean;
  covers_legs: boolean;
  hood_type?: string;
  weight_grams?: number;
  garment_thermal_properties?: GarmentThermalProps;
  garment_protection?: GarmentProtectionProps;
  garment_activity_ratings?: GarmentActivityRatingProps;
  /** Missing (null) means the garment's vents are unknown, not that it has none. */
  garment_ventilation?: GarmentVentilationProps | GarmentVentilationProps[] | null;
}

export interface CategorizedGarments {
  baseLayers: GarmentRow[];
  midLayers: GarmentRow[];
  insulation: GarmentRow[];
  shells: GarmentRow[];
}

export interface HandwearRow {
  id: string;
  brand: string;
  model_name: string;
  handwear_type: string;
  rcl_clo: number;
  dexterity_score?: number;
  waterproof?: boolean;
  windproof?: boolean;
  min_temp_active?: number;
  min_temp_static?: number;
}

export interface HeadwearRow {
  id: string;
  brand: string;
  model_name: string;
  headwear_type: string;
  rcl_clo: number;
  covers_ears?: boolean;
  covers_neck?: boolean;
  covers_face?: boolean;
  min_temp_active?: number;
  min_temp_static?: number;
}

export interface HeadwearRecommendations {
  helmet: HeadwearRow | null;
  headWarmth: HeadwearRow | null;
  neckWarmth: HeadwearRow | null;
}
