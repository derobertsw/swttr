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

// ============================================
// DATABASE ROW TYPES
// ============================================

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

// ============================================
// CALCULATION TYPES
// ============================================

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
