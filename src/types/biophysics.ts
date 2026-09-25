/**
 * Response contract of the /api/v1/recommendations/* routes. The sport
 * recommenders are typed against these, so the client and server agree.
 */
import type { ExertionLevel } from "@/lib/biophysics/exertion";
import type { EnsembleScore } from "@/types/garments";

export interface IreqData {
  min: number;
  neutral: number;
  dle_hours?: number;
  dle_method?: string;
}

export interface RegionalIreqData {
  torso: number;
  arms: number;
  legs: number;
}

export interface RegionalIreqRange {
  min: RegionalIreqData;
  neutral: RegionalIreqData;
}

export interface ExtremityIreqData {
  hands: number;
  head: number;
}

export interface ExtremityIreqRange {
  min: ExtremityIreqData;
  neutral: ExtremityIreqData;
}

/**
 * Single-phase sports report `min`/`neutral` at the top level; alpine reports
 * `skiing`/`chairlift` and ski touring `uphill`/`downhill` phases instead.
 */
export interface IreqRange {
  min?: number;
  neutral?: number;
  skiing?: IreqData;
  chairlift?: IreqData;
  uphill?: IreqData;
  downhill?: IreqData;
  downhill_target_range?: [number, number];
  dle_hours?: number;
  dle_method?: string;
  target_range: [number, number];
  regional?: RegionalIreqRange;
  extremity?: ExtremityIreqRange;
  validation_buffer_clo?: {
    whole_body?: number;
    cold_risk?: number;
    extremity?: number;
    context?: "rest" | "exercise";
    uphill?: {
      whole_body: number;
      cold_risk: number;
      extremity: number;
      context: "rest" | "exercise";
    };
    downhill?: {
      whole_body: number;
      cold_risk: number;
      extremity: number;
      context: "rest" | "exercise";
    };
  };
  validation_source?: string;
}

/** Per-dimension ensemble scores, as returned by scoreEnsemble. */
export type ComponentScores = EnsembleScore["componentScores"];

export interface RegionalClo {
  torso: number;
  arms: number;
  legs: number;
}

export interface EnsembleProperties {
  total_clo: number;
  regional_clo?: RegionalClo;
  evap_potential: number;
  permeability_index: number;
}

export interface PackItemGarment {
  id: string;
  name: string;
  weight_g?: number;
  rcl_clo?: number;
}

export interface PackItems {
  garments: PackItemGarment[];
  total_weight_g: number;
}

export interface TransitionProtocol {
  priority: "urgent" | "quick" | "normal";
  time_limit_minutes: number | null;
  steps: string[];
  warnings: string[];
}

export interface RecommendedGarment {
  id: string;
  name: string;
  category: string;
  rcl?: number;
  rcl_torso?: number;
  rcl_arms?: number;
  rcl_legs?: number;
  recl?: number;
  evap_potential?: number;
  covers_torso?: boolean;
  covers_arms?: boolean;
  covers_legs?: boolean;
}

export interface RecommendedHandwear {
  id: string;
  name: string;
  type: string;
  rcl: number;
  dexterity?: number;
}

export interface RecommendedHeadwearItem {
  id: string;
  name: string;
  type: string;
  rcl: number;
  covers_ears?: boolean;
  covers_neck?: boolean;
}

export interface RecommendedHeadwear {
  helmet: RecommendedHeadwearItem | null;
  head_warmth: RecommendedHeadwearItem | null;
  neck_warmth: RecommendedHeadwearItem | null;
}

export interface BiophysicsRecommendation {
  /** The request's conditions, echoed as sent (°F, mph). */
  conditions: {
    temperature: string;
    wind_speed: string;
    exertion: ExertionLevel;
    precipitation?: boolean;
    /** XC skiing only: exertion expressed as XC intensity. */
    intensity?: "easy" | "moderate" | "racing";
  };
  ireq: IreqRange;
  recommendation: {
    garments: RecommendedGarment[];
    handwear?: RecommendedHandwear | null;
    headwear?: RecommendedHeadwear | null;
    ensemble_properties: EnsembleProperties;
    score: number;
    thermal_comfort_score?: number;
    component_scores: ComponentScores;
  };
  warnings: string[];
  guidance: string[];
  descent_headwear?: RecommendedHeadwear | null;
  descent_handwear?: RecommendedHandwear | null;
  descent_breakdown?: {
    total_clo: number;
    regional_clo: RegionalClo;
    regional_ireq: RegionalIreqRange;
    extremity_ireq: ExtremityIreqRange;
  };
  pack_items?: PackItems;
  transition_protocol?: TransitionProtocol;
}

/**
 * Activity ID to API endpoint mapping
 */
export const BIOPHYSICS_ENDPOINTS: Record<string, string> = {
  'running': '/api/v1/recommendations/running',
  'biking': '/api/v1/recommendations/biking',
  'alpine_skiing': '/api/v1/recommendations/alpine',
  'xc_skiing': '/api/v1/recommendations/xc',
  'backcountry_skiing': '/api/v1/recommendations/ski-touring',
};

/**
 * Check if an activity supports biophysics recommendations
 */
export function isBiophysicsSupported(activity: string): boolean {
  return activity in BIOPHYSICS_ENDPOINTS;
}
