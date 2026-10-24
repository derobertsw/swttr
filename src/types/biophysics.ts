/**
 * Response contract of the /api/v1/recommendations/* routes. The sport
 * recommenders are typed against these, so the client and server agree.
 */
import type { ExertionLevel } from "@/lib/biophysics/exertion";
import type { EnsembleScore, GarmentSemantics, ThermalProvenance } from "@/types/garments";
import type { SustainedSportPolicy } from '@/lib/biophysics/sport-policy';
import type { OutingPattern, XCExposure } from '@/types/xc';

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
  /** Running/XC upper comfort limits; hands may allow thin pole-grip gloves. */
  max?: ExtremityIreqData;
}

export interface AccessoryAssessment {
  state: 'selected' | 'not_needed' | 'missing' | 'unknown';
  purpose: 'thermal' | 'pole_grip' | 'thermal_and_pole_grip' | 'none';
  thermal_status: 'under' | 'in_range' | 'over';
  selected_ids: string[];
  clo: number;
  min: number;
  max: number;
  message: string;
}

export interface AccessoryAssessments {
  hands: AccessoryAssessment;
  head: AccessoryAssessment;
}

/**
 * Single-phase sports report `min`/`neutral` at the top level; alpine reports
 * `skiing`/`chairlift` and ski touring `uphill`/`downhill` phases instead.
 */
export interface IreqRange {
  policy?: SustainedSportPolicy;
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

export interface PackItemGarment extends GarmentSemantics {
  rcl_torso?: number;
  thermal_data_status?: 'known' | 'unknown';
  thermal_provenance?: ThermalProvenance;
  protection?: RecommendedGarment['protection'];
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

export interface RecommendedGarment extends GarmentSemantics {
  /** Missing regional data is unknown, never zero insulation. */
  thermal_data_status?: 'known' | 'unknown';
  thermal_provenance?: ThermalProvenance;
  protection?: { windproof_rating?: string; waterproof_rating?: string; waterproof_mm?: number; data_source?: string | null; generic_estimate?: boolean };
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

export type ClothingRequirementStatus = 'owned_match' | 'generic_suggestion' | 'missing' | 'not_needed' | 'unknown';

/** A suitable-clothing requirement, separate from any wardrobe item. Stable
 * `id` (`<activity>:<region>`) associates edits/explanations across calls. */
export interface ClothingRequirement {
  id: string;
  region: 'torso' | 'legs' | 'hands' | 'head';
  label: string;
  status: ClothingRequirementStatus;
  /** Ideal regional clo; a missing requirement is never scored as 0 clo worn. */
  target_clo?: number;
  matched_garment_id?: string;
  matched_garment_name?: string;
  matched_is_owned?: boolean;
  generic_suggestion?: { label: string; estimated_clo?: number; generic_estimate: true; owned: false };
  message: string;
}

export interface BiophysicsRecommendation {
  /** Requirement-first flow (running/XC only): what the activity needs,
   * before wardrobe matching. Absent for other sports. */
  requirements?: ClothingRequirement[];
  /** The request's conditions, echoed as sent (°F, mph). */
  conditions: {
    temperature: string;
    wind_speed: string;
    exertion: ExertionLevel;
    precipitation?: boolean;
    /** XC skiing only: exertion expressed as XC intensity. */
    intensity?: "easy" | "moderate" | "racing";
    outing_pattern?: OutingPattern;
    xc_exposure?: XCExposure;
  };
  ireq: IreqRange;
  recommendation: {
    accessories?: AccessoryAssessments;
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
  /** Generic carry advice, excluded from moving insulation and ownership. */
  carry_items?: Array<{ label: string; reason: string }>;
  transition_protocol?: TransitionProtocol;
}

// ============================================
// Layer evaluation: POST /api/v1/ensembles/evaluate
// ============================================

export type EvaluatedBodyPart = "torso" | "legs" | "hands" | "headNeck";

export interface ThermalDecision {
  riskType: "comfortable" | "cold" | "overheat";
  severity: "moderate" | "high";
  /** How far outside the target the clo is. */
  delta: number;
}

/** Metadata survives recommendation, picker and manual evaluation. Catalog
 * references are resolved on the server; client clo never overrides them. */
export interface EvaluationItem extends GarmentSemantics {
  sourceId?: string;
  item_type?: 'garment' | 'handwear' | 'headwear' | 'custom';
  rcl?: number | null;
  thermal_data_status?: 'known' | 'unknown';
  thermal_provenance?: ThermalProvenance;
  protection?: RecommendedGarment['protection'];
}

export interface PhaseEvaluationInput {
  /** Internal: resolved from the worn catalog garments on the server. */
  hoodClo?: number;
  /** Server-issued running/XC limits, forwarded unchanged for manual edits. */
  extremityMaxTargets?: Partial<Record<'hands' | 'headNeck', number>>;
  /** Null means unknown, while zero means known zero insulation. Legacy
   * numeric inputs remain supported; items, when sent, are authoritative. */
  itemClo?: Record<EvaluatedBodyPart, (number | null)[]>;
  items?: Record<EvaluatedBodyPart, EvaluationItem[]>;
  /** Neutral clo target per body part, when the recommendation has one. */
  targets: Partial<Record<EvaluatedBodyPart, number>>;
  /**
   * Minimum clo per body part: below it the part is short of insulation.
   * Parts without one are measured against their neutral target.
   */
  minTargets?: Partial<Record<EvaluatedBodyPart, number>>;
  /**
   * Arms aren't edited directly, so their clo comes from the recommendation.
   * `deficitClo` overrides `clo` for the arm deficit (the descent reports its
   * own arm clo); the whole-body total always uses `clo`.
   */
  arms?: { clo: number; target?: number; minTarget?: number; deficitClo?: number };
  targetRange?: [number, number];
}

export interface BodyPartEvaluation {
  clo?: number;
  thermal_data_status?: 'unknown';
  target?: number;
  /** target - clo: positive when more insulation is needed. */
  delta?: number;
  /** Under its minimum, over its neutral target, or in between. */
  status?: "under" | "over" | "in_range";
}

export interface PhaseEvaluation {
  thermal_data_status?: 'known' | 'unknown';
  items?: Record<EvaluatedBodyPart, EvaluationItem[]>;
  bodyParts: Record<EvaluatedBodyPart, BodyPartEvaluation>;
  /** Regional clo weighted by each region's share of the body. */
  breakdown?: {
    regions: { region: "torso" | "arms" | "legs"; clo: number; weight: number; contribution: number }[];
    total: number;
  };
  totalClo?: number;
  maxRegionalDeficit: number | null;
  maxExtremityDeficit: number | null;
  hasRegionalGap: boolean | null;
  hasExtremityGap: boolean | null;
  decision: ThermalDecision | null;
  comfortScore: number | null;
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

/**
 * Whether a biophysics recommendation came back, and if not, why:
 * - `unsupported`: the activity has no biophysics model
 * - `auth_required`: the API needs a signed-in user
 * - `no_gear`: the API returned targets only, with no usable gear to recommend
 * - `unavailable`: the request failed or the response was unusable
 */
export type BiophysicsStatus = "ok" | "unsupported" | "auth_required" | "no_gear" | "unavailable";

export type BiophysicsOutcome =
  | { status: "ok"; data: BiophysicsRecommendation }
  | { status: Exclude<BiophysicsStatus, "ok">; data: null };
