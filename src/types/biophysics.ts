/**
 * Types for biophysics API responses
 */

export interface IreqData {
  min: number;
  neutral: number;
  dle_hours?: number;
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

export interface IreqRange {
  skiing?: IreqData;
  chairlift?: IreqData;
  active?: IreqData;
  rest?: IreqData;
  uphill?: IreqData;
  downhill?: IreqData;
  dle_hours?: number;
  target_range: [number, number];
  regional?: RegionalIreqRange;
  extremity?: ExtremityIreqRange;
}

export interface ComponentScores {
  thermal: number;
  moisture: number;
  protection: number;
  weight: number;
  mobility: number;
}

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

export interface RecommendedGarment {
  id: string;
  name: string;
  category: string;
  rcl?: number;
  recl?: number;
  evap_potential?: number;
  covers_torso?: boolean;
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
  conditions: {
    temperature: string;
    wind_speed: string;
    precipitation: boolean;
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
}

/**
 * Activity ID to API endpoint mapping
 */
export const BIOPHYSICS_ENDPOINTS: Record<string, string> = {
  'running': '/api/v1/recommendations/running',
  'biking': '/api/v1/recommendations/biking',
  'alpine-skiing': '/api/v1/recommendations/alpine',
  'xc-skiing': '/api/v1/recommendations/xc',
  'backcountry-skiing': '/api/v1/recommendations/ski-touring',
};

/**
 * Check if an activity supports biophysics recommendations
 */
export function isBiophysicsSupported(activity: string): boolean {
  return activity in BIOPHYSICS_ENDPOINTS;
}
