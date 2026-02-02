// Biophysical Garment Types
// Based on USARIEM Technical Reports T21-03 and T18-02

// ============================================
// ENUM TYPES
// ============================================

export type GarmentCategory =
  | 'base_layer'
  | 'mid_layer_light'
  | 'mid_layer_heavy'
  | 'insulation_synthetic'
  | 'insulation_down'
  | 'soft_shell'
  | 'hard_shell'
  | 'outer_insulated';

export type GarmentType =
  | 'top_sleeveless'
  | 'top_short_sleeve'
  | 'top_long_sleeve'
  | 'jacket'
  | 'vest'
  | 'pants'
  | 'shorts'
  | 'bib'
  | 'one_piece';

export type HoodType = 'none' | 'attached' | 'removable' | 'helmet_compatible';

export type EstimationMethod =
  | 'lab_tested'
  | 'derived_from_similar'
  | 'calculated_from_materials';

export type WindproofRating = 'none' | 'wind_resistant' | 'windproof';

export type WaterproofRating = 'none' | 'DWR_only' | 'water_resistant' | 'waterproof';

export type SeamConstruction = 'sewn' | 'taped' | 'welded';

export type LayerPosition = 'outer' | 'membrane' | 'insulation' | 'lining';

export type MaterialCategory =
  | 'synthetic_woven'
  | 'synthetic_knit'
  | 'synthetic_fleece'
  | 'synthetic_insulation'
  | 'down_insulation'
  | 'membrane'
  | 'wool'
  | 'merino'
  | 'hybrid';

// ============================================
// DATABASE ROW TYPES
// ============================================

export interface Garment {
  id: string;
  brand: string;
  model_name: string;
  year_released?: number;
  msrp_usd?: number;
  category: GarmentCategory;
  garment_type: GarmentType;
  covers_torso: boolean;
  covers_arms: boolean;
  covers_legs: boolean;
  covers_head: boolean;
  hood_type: HoodType;
  weight_grams?: number;
  packed_volume_liters?: number;
  created_at: string;
  updated_at: string;
}

export interface GarmentThermalProperties {
  garment_id: string;
  // Thermal resistance (clo units)
  rcl_whole_body?: number;
  rcl_torso?: number;
  rcl_arms?: number;
  rcl_legs?: number;
  // Evaporative resistance (m²Pa/W)
  recl_whole_body?: number;
  recl_torso?: number;
  recl_arms?: number;
  recl_legs?: number;
  // Derived values
  im_whole_body?: number;      // permeability index (0-1)
  evap_potential?: number;     // im/clo ratio
  // Data quality
  estimation_method: EstimationMethod;
  confidence_score?: number;
  created_at: string;
  updated_at: string;
}

export interface GarmentProtection {
  garment_id: string;
  windproof_rating: WindproofRating;
  air_permeability_cfm?: number;
  waterproof_rating: WaterproofRating;
  waterproof_mm?: number;
  breathability_mvtr?: number;
  breathability_ret?: number;
  membrane_type?: string;
  seam_construction?: SeamConstruction;
  created_at: string;
  updated_at: string;
}

export interface GarmentVentilation {
  garment_id: string;
  has_pit_zips: boolean;
  pit_zip_length_cm?: number;
  has_side_vents: boolean;
  has_back_vent: boolean;
  has_thigh_vents: boolean;
  main_zip_two_way: boolean;
  mesh_lined_pockets: boolean;
  ventilation_factor: number;  // 0.3-1.0, lower = more effective venting
  created_at: string;
  updated_at: string;
}

export interface GarmentActivityRatings {
  garment_id: string;
  xc_skiing_score?: number;           // 1-10
  ski_touring_uphill_score?: number;  // 1-10
  ski_touring_downhill_score?: number; // 1-10
  alpine_skiing_score?: number;       // 1-10
  min_temp_active?: number;           // °C
  max_temp_active?: number;           // °C
  min_temp_static?: number;           // °C
  max_temp_static?: number;           // °C
  activity_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface GarmentMaterial {
  id: string;
  garment_id: string;
  layer_position: LayerPosition;
  material_type?: string;
  fabric_weight_gsm?: number;
  material_thermal_resistance?: number;
  material_evap_resistance?: number;
  material_air_permeability?: number;
  coverage_percent: number;
  created_at: string;
}

export interface MaterialReference {
  id: string;
  material_name: string;
  manufacturer?: string;
  thermal_resistance_per_mm?: number;
  base_evap_resistance?: number;
  material_category: MaterialCategory;
  fill_power?: number;
  clo_per_oz_sqyd?: number;
  created_at: string;
}

export interface CalibrationReference {
  id: string;
  source_report?: string;
  garment_description?: string;
  measured_rcl_torso?: number;
  measured_rcl_arm?: number;
  measured_rcl_leg?: number;
  measured_rcl_whole?: number;
  measured_recl_torso?: number;
  measured_recl_arm?: number;
  measured_recl_leg?: number;
  measured_recl_whole?: number;
  garment_category?: GarmentCategory;
  approximate_weight_grams?: number;
  primary_material?: string;
  created_at: string;
}

// ============================================
// JOINED/COMPOSITE TYPES
// ============================================

export interface GarmentWithDetails extends Garment {
  thermal_properties?: GarmentThermalProperties;
  protection?: GarmentProtection;
  ventilation?: GarmentVentilation;
  activity_ratings?: GarmentActivityRatings;
  materials?: GarmentMaterial[];
}

// ============================================
// INPUT TYPES (for creating/updating)
// ============================================

export interface CreateGarmentInput {
  brand: string;
  model_name: string;
  year_released?: number;
  msrp_usd?: number;
  category: GarmentCategory;
  garment_type: GarmentType;
  covers_torso?: boolean;
  covers_arms?: boolean;
  covers_legs?: boolean;
  covers_head?: boolean;
  hood_type?: HoodType;
  weight_grams?: number;
  packed_volume_liters?: number;
}

export interface CreateThermalPropertiesInput {
  garment_id: string;
  rcl_whole_body?: number;
  rcl_torso?: number;
  rcl_arms?: number;
  rcl_legs?: number;
  recl_whole_body?: number;
  recl_torso?: number;
  recl_arms?: number;
  recl_legs?: number;
  im_whole_body?: number;
  evap_potential?: number;
  estimation_method?: EstimationMethod;
  confidence_score?: number;
}

// ============================================
// CALCULATION TYPES
// ============================================

export interface ThermalProps {
  garmentId: string;
  name: string;
  category: GarmentCategory;
  // Thermal resistance (clo)
  rclTorso: number;
  rclArms: number;
  rclLegs: number;
  rclWholeBody?: number;
  // Evaporative resistance (m²Pa/W)
  reclTorso: number;
  reclArms: number;
  reclLegs: number;
  reclWholeBody?: number;
  // Coverage
  coversTorso: boolean;
  coversArms: boolean;
  coversLegs: boolean;
  // Weight
  weightGrams?: number;
}

export interface EnsemblePrediction {
  rcl: {
    torso: number;
    arm: number;
    leg: number;
    wholeBody: number;
  };
  recl: {
    torso: number;
    arm: number;
    leg: number;
    wholeBody: number;
  };
  evapPotential: number;
  im: number;
}

export interface IreqResult {
  ireqMin: number;      // Minimum clo to prevent cooling
  ireqNeutral: number;  // Clo for thermal comfort
  dleHours: number;     // Duration limited exposure
}

export interface EnsembleScore {
  totalScore: number;
  componentScores: {
    coldProtection: number;
    overheatPrevention: number;
    breathability: number;
    weatherProtection: number;
    weight: number;
  };
  ensembleProperties: {
    rclClo: number;
    recl: number;
    evapPotential: number;
    im: number;
  };
  ireq: {
    min: number;
    neutral: number;
  };
  warnings: string[];
  recommendations: string[];
}
