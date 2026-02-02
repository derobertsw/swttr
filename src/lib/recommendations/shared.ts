/**
 * Shared utilities for recommendation API routes
 */
import { getSupabase } from '@/lib/supabase';

// ============================================
// TYPES
// ============================================

export interface GarmentThermalProps {
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

export interface GarmentRow {
  id: string;
  brand: string;
  model_name: string;
  category: string;
  covers_torso: boolean;
  covers_arms: boolean;
  covers_legs: boolean;
  weight_grams?: number;
  garment_thermal_properties?: GarmentThermalProps;
  garment_protection?: GarmentProtectionProps;
  garment_activity_ratings?: GarmentActivityRatingProps;
}

export interface CategorizedGarments {
  baseLayers: GarmentRow[];
  midLayers: GarmentRow[];
  insulation: GarmentRow[];
  shells: GarmentRow[];
}

// ============================================
// DATABASE HELPERS
// ============================================

/**
 * Get user's wardrobe garment IDs from the database
 */
export async function getUserWardrobeGarmentIds(
  supabase: ReturnType<typeof getSupabase>,
  userId: string | null
): Promise<string[] | null> {
  if (!supabase || !userId) return null;

  const { data } = await supabase
    .from('user_wardrobe')
    .select('item_id')
    .eq('user_id', userId)
    .eq('item_type', 'garment');

  if (!data || data.length === 0) return null;
  return data.map((d) => d.item_id);
}

/**
 * Fetch garments with all related data
 */
export async function fetchGarmentsWithDetails(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  options?: {
    wardrobeIds?: string[] | null;
    activityFilter?: {
      field: string;
      minScore: number;
    };
  }
): Promise<{ data: GarmentRow[] | null; error: Error | null }> {
  let query = supabase
    .from('garments')
    .select(`
      *,
      garment_thermal_properties (*),
      garment_protection (*),
      garment_activity_ratings (*)
    `);

  if (options?.wardrobeIds && options.wardrobeIds.length > 0) {
    query = query.in('id', options.wardrobeIds);
  } else if (options?.activityFilter) {
    query = query.gte(
      `garment_activity_ratings.${options.activityFilter.field}`,
      options.activityFilter.minScore
    );
  }

  const { data, error } = await query;

  return {
    data: data as GarmentRow[] | null,
    error: error ? new Error(error.message) : null,
  };
}

// ============================================
// GARMENT CATEGORIZATION
// ============================================

const BASE_LAYER_CATEGORIES = ['base_layer'];
const MID_LAYER_CATEGORIES = ['mid_layer_light', 'mid_layer_heavy'];
const INSULATION_CATEGORIES = ['insulation_synthetic', 'insulation_down'];
const SHELL_CATEGORIES = ['soft_shell', 'hard_shell', 'windbreaker'];

/**
 * Categorize garments by layer type
 */
export function categorizeGarments(garments: GarmentRow[]): CategorizedGarments {
  return {
    baseLayers: garments.filter((g) => BASE_LAYER_CATEGORIES.includes(g.category)),
    midLayers: garments.filter((g) => MID_LAYER_CATEGORIES.includes(g.category)),
    insulation: garments.filter((g) => INSULATION_CATEGORIES.includes(g.category)),
    shells: garments.filter((g) => SHELL_CATEGORIES.includes(g.category)),
  };
}

// ============================================
// ENSEMBLE BUILDING HELPERS
// ============================================

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

// ============================================
// FORMATTING HELPERS
// ============================================

/**
 * Format garment for API response
 */
export function formatGarmentResponse(garment: GarmentRow): {
  id: string;
  name: string;
  category: string;
  rcl?: number;
  evap_potential?: number;
  covers_torso: boolean;
  covers_legs: boolean;
} {
  return {
    id: garment.id,
    name: `${garment.brand} ${garment.model_name}`,
    category: garment.category,
    rcl: garment.garment_thermal_properties?.rcl_whole_body,
    evap_potential: garment.garment_thermal_properties?.evap_potential,
    covers_torso: garment.covers_torso,
    covers_legs: garment.covers_legs,
  };
}
