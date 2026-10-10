// Biophysical Garment Types
// Based on USARIEM Technical Reports T21-03 and T18-02

// ============================================
// ENUM TYPES
// ============================================

export type EstimationMethod =
  | 'lab_tested'
  | 'derived_from_similar'
  | 'calculated_from_materials';

/** Coverage is a fraction of each region, separate from its insulation.
 * Regional rcl/recl values are averages over the ENTIRE region (including
 * exposed skin). Never multiply these values by coverage fractions again.
 * Null/absent usage and coverage mean unreviewed legacy data.
 */
export interface GarmentSemantics {
  garment_type?: string;
  usage?: 'standalone' | 'underlayer' | 'either' | 'unknown' | null;
  coverage_torso?: number | null;
  coverage_arms?: number | null;
  coverage_legs?: number | null;
  suitable_activities?: string[] | null;
}

export interface ThermalProvenance {
  estimation_method?: EstimationMethod;
  confidence_score?: number | null;
  data_source?: string | null;
  /** Broad engineering uncertainty in regional clo, not a confidence interval. */
  uncertainty_clo?: number | null;
  generic_estimate?: boolean;
}

// ============================================
// DATABASE ROW TYPES
// ============================================

export interface GarmentThermalProperties extends ThermalProvenance {
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
