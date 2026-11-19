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
}

/**
 * Server-issued conditions of one phase's heat balance, echoed back with
 * manual edits so `POST /api/v1/ensembles/evaluate` can compute the edited
 * outfit's exposure limit. The same values as the phase's IREQ and its
 * basic-clo conversion: air temperature, humidity, metabolic rate, relative
 * air speed, walking speed and the assumed outer-fabric air permeability.
 */
export interface ExposureConditions {
  airTempC: number;
  relativeHumidity: number;
  /** W/m². */
  metabolicRate: number;
  /** m/s, including movement through the air. */
  relativeAirSpeedMs: number;
  /** m/s. */
  walkingSpeedMs: number;
  /** l/(m²·s). */
  airPermeability: number;
}

/** Whole-body heat debt at one ISO 11079 strain criterion. */
export interface ExposureCriterion {
  /** Skin temperature the balance is held at, in °C. */
  skin_temp_c: number;
  /** Heat-storage rate S, in W/m²; negative is a heat debt building up. */
  heat_storage_w_m2: number;
  /**
   * - `limited`: S < 0 and the heat-debt limit is reached within 8 h.
   * - `more_than_8_hours`: S < 0, but the limit takes longer than 8 h (ISO
   *   11079 reports these as "more than 8 h").
   * - `no_heat_debt`: S ≥ 0, so whole-body cooling does not limit the
   *   exposure; there is no finite duration.
   */
  status: 'limited' | 'more_than_8_hours' | 'no_heat_debt';
  /** Heat-debt limit ÷ |S|, in hours; null without a heat debt. */
  dle_hours: number | null;
}

/**
 * Duration-limited exposure (ISO 11079 DLE) of the evaluated ensemble: the
 * time until the whole body has lost the standard's allowed heat debt, with
 * the ensemble's actual insulation. It is not a time to a core temperature,
 * frostbite or hand/foot injury. See docs/exposure-limits.md.
 */
export interface ExposureLimit {
  method: 'iso11079_dle_selected_ensemble_v1';
  /** The evaluated outfit's whole-body (torso, arms, legs) basic clo. */
  basic_clo: number;
  /** That clo corrected for the phase's wind, motion and outer fabric. */
  resultant_clo: number;
  /** ISO 11079's allowed heat debt Qlim, in kJ/m² (40 Wh/m²). */
  heat_debt_limit_kj_m2: number;
  /** ISO 11079's DLEmin criterion: skin at the minimal-strain temperature. */
  minimal: ExposureCriterion;
  /** DLEneutral: skin at the neutral (comfort) temperature. */
  neutral: ExposureCriterion;
  /** Inputs outside ISO 11079's stated range (metabolic rate 58–400 W/m²,
   * air at 10°C or below, air speed 0.4–18 m/s); empty when within it. */
  outside_iso_range: Array<'metabolic_rate' | 'air_temperature' | 'air_speed'>;
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
  /** Upper local limits the accessories were chosen and are judged against:
   * hands may allow thin kept or pole-grip gloves, and the head a required
   * helmet or the lightest item rated for deep cold. */
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
  /** Outfit checks manual edits repeat for a sport without a sustained policy (cycling). */
  outfit_checks?: {
    require_standalone: boolean;
    protection: SustainedSportPolicy['protection'];
  };
  min?: number;
  neutral?: number;
  skiing?: IreqData;
  chairlift?: IreqData;
  uphill?: IreqData;
  downhill?: IreqData;
  downhill_target_range?: [number, number];
  /** Heat-balance conditions of the phase `recommendation.evaluation` judges,
   * for manual edits to forward (touring's descent: `descent_breakdown`). */
  exposure_conditions?: ExposureConditions;
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
  rcl_legs?: number;
  /** Where the layer goes on at the transition. Absent on older responses: torso. */
  covers_torso?: boolean;
  covers_arms?: boolean;
  covers_legs?: boolean;
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
 * `id` (`<activity>:<region>`, or `<activity>:helmet` for a required helmet)
 * associates edits/explanations across calls. */
export interface ClothingRequirement {
  id: string;
  region: 'torso' | 'legs' | 'hands' | 'head';
  /** Nonthermal protection (a helmet): required whatever the thermal demand,
   * so it has no clo target and is never `not_needed`. */
  kind?: 'protection';
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

/** Adjustable vents a catalog garment can list. Back vents and mesh pockets
 * aren't treated as adjustable without supporting metadata. */
export type VentType = 'pit_zips' | 'side_vents' | 'thigh_vents' | 'two_way_zip';

/** Alpine: skiing and chairlift. Ski touring: climb, transition and descent. */
export type VentPhase = 'skiing' | 'chairlift' | 'climb' | 'transition' | 'descent';

/** A suggested vent setting for one vent of a selected garment in one phase. */
export interface VentAdvice {
  garment_id: string;
  garment_name: string;
  vent: VentType;
  /** Body region the vent opens, so it sits beside the garment there. */
  region: 'torso' | 'legs';
  phase: VentPhase;
  setting: 'open' | 'closed';
  /**
   * What the setting follows: the phase alone (rest and descent), the weather
   * (wind or precipitation), or the modeled outfit (its breathability and
   * thermal decision). Outfit-based advice is for the recommended outfit only.
   */
  basis: 'phase' | 'weather' | 'outfit';
  /** Short instruction, e.g. "Open pit zips while skiing". */
  message: string;
  reason: string;
  /** True only when an open-state breathability estimate includes this vent's garment. */
  effect_estimated: boolean;
}

/**
 * Estimated breathability with the advised vents open. Every warmth metric,
 * the comfort decision and `ensemble_properties` stay on the closed outfit.
 */
export interface VentOpenEstimate {
  phase: 'skiing' | 'climb';
  /** Garments whose ventilation_factor was applied, once, to their Recl in the vented regions. */
  garment_ids: string[];
  closed_evap_potential: number;
  open_evap_potential: number;
  breathability_target: number;
  basis: 'estimate';
}

export interface VentilationAdvice {
  advice: VentAdvice[];
  estimates: VentOpenEstimate[];
}

/**
 * What Run Warm or Run Cold did to a personalized response (#251). Absent for
 * neutral, which uses the standard targets.
 */
export interface RecommendationPreference {
  /** `hot` is Run Warm. */
  sensitivity: 'hot' | 'cold';
  /** Sent with the request, or the signed-in user's saved setting. */
  source: 'request' | 'saved';
  /**
   * - `not_supported`: this sport's targets don't take the setting yet.
   * - `no_change`: the setting can't narrow the bands in these conditions.
   * - `targets_only`: narrowed targets, with no gear to choose from.
   * - `same_layers`: narrowed targets; the standard layers still fit best.
   * - `changed_layers`: narrowed targets chose other layers.
   * - `standard_layers_kept`: other layers would fall short of minimum warmth
   *   (Run Warm) or go past the upper limit (Run Cold), so the standard ones stay.
   */
  effect: 'not_supported' | 'no_change' | 'targets_only' | 'same_layers' | 'changed_layers' | 'standard_layers_kept';
  /** Whether the response's targets (and so its scoring and manual edits) are narrowed for the setting. */
  targets_adjusted: boolean;
  /** The whole-body band the standard targets use, when the targets are adjusted. */
  standard_target_range?: [number, number];
  message: string;
}

export interface BiophysicsRecommendation {
  /** Run Warm/Run Cold and its effect; absent for neutral. */
  preference?: RecommendationPreference;
  /** What the activity needs, before wardrobe matching: running/XC clothing
   * (requirement-first flow), and the helmet alpine, cycling and the touring
   * descent require. Absent when a sport has neither. */
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
    /** Assessment of the actual worn outfit, using the same contract as edits. */
    evaluation?: PhaseEvaluation;
    component_scores: ComponentScores;
  };
  warnings: string[];
  guidance: string[];
  descent_evaluation?: PhaseEvaluation;
  descent_headwear?: RecommendedHeadwear | null;
  descent_handwear?: RecommendedHandwear | null;
  descent_breakdown?: {
    total_clo: number;
    regional_clo: RegionalClo;
    regional_ireq: RegionalIreqRange;
    extremity_ireq: ExtremityIreqRange;
    exposure_conditions?: ExposureConditions;
  };
  pack_items?: PackItems;
  /** Generic carry advice, excluded from moving insulation and ownership. */
  carry_items?: Array<{ label: string; reason: string }>;
  transition_protocol?: TransitionProtocol;
  /** Alpine and ski touring: vent settings for selected garments with known vents. */
  ventilation?: VentilationAdvice;
}

// ============================================
// Layer evaluation: POST /api/v1/ensembles/evaluate
// ============================================

export type EvaluatedBodyPart = "torso" | "legs" | "hands" | "headNeck";

export interface ThermalDecision {
  /** Comfort guidance is distinct from significant thermal mismatch warnings. */
  status?: 'near_target' | 'warmer' | 'cooler' | 'mixed' | 'incomplete';
  summary?: string;
  reasons?: string[];
  warnings?: string[];
  riskType: "comfortable" | "cold" | "overheat";
  severity: "moderate" | "high";
  /** How far outside the target the clo is. */
  delta: number;
}

/** Metadata survives recommendation, picker and manual evaluation. Catalog
 * references are resolved on the server; client clo never overrides them. */
export interface EvaluationItem extends GarmentSemantics {
  /** Resolved server-side, never accepted as catalog authority from clients. */
  name?: string;
  sourceId?: string;
  item_type?: 'garment' | 'handwear' | 'headwear' | 'custom';
  rcl?: number | null;
  thermal_data_status?: 'known' | 'unknown';
  thermal_provenance?: ThermalProvenance;
  protection?: RecommendedGarment['protection'];
}

export interface PhaseEvaluationInput {
  /** Run Warm/Run Cold when the targets were narrowed for it; explains them, never changes them. */
  sensitivity?: 'hot' | 'cold';
  requireStandalone?: boolean;
  protectionNeeds?: { wind: boolean; wet: boolean; poleGrip: boolean };
  /** Server-issued moisture heuristic threshold, forwarded with phase targets. */
  breathabilityTarget?: number;
  /** Internal: calculated from resolved worn garments, never trusted from clients. */
  armClo?: number | null;
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
   * Catalog requests recompute arms from the current worn garments. These
   * values are a fallback for legacy numeric requests; `deficitClo` is a
   * legacy phase override used consistently for the total and local deficit.
   */
  arms?: { clo: number; target?: number; minTarget?: number; deficitClo?: number };
  targetRange?: [number, number];
  /** Server-issued phase conditions, forwarded unchanged; with them the
   * evaluation includes the outfit's `exposure` limit. */
  exposureConditions?: ExposureConditions;
  /** Internal: existing evaporative-potential heuristic, independent of insulation. */
  breathability?: { evapPotential: number; target: number };
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
  breathabilityTarget?: number;
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
  /** The evaluated outfit's duration-limited exposure, when the phase's
   * conditions were sent and its whole-body clo is known. */
  exposure?: ExposureLimit;
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
