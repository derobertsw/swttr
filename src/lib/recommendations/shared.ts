/**
 * Shared utilities for recommendation API routes
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { garmentToThermalProps } from '@/lib/biophysics/ensemble';
import { fahrenheitToCelsius, mphToMs } from '@/lib/biophysics/ireq';
import type { GarmentWithProtection } from '@/lib/biophysics/scorer';

// ============================================
// REQUEST VALIDATION
// ============================================

export interface WeatherInput {
  temperature: number;
  wind_speed: number;
  humidity?: number;
  precipitation?: boolean;
  precipitation_type?: 'rain' | 'snow' | 'mixed';
}

export interface ValidatedRequest {
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
  userId: string | null;
  weather: WeatherInput;
  tempC: number;
  windMs: number;
  body: Record<string, unknown>;
}

/**
 * Validate common request fields for recommendation endpoints
 * Returns ValidatedRequest on success, NextResponse on error
 */
export async function validateRecommendationRequest(
  request: NextRequest
): Promise<ValidatedRequest | NextResponse> {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const userId = request.headers.get('x-user-id');
  const body = await request.json();

  if (!body.weather?.temperature || body.weather?.wind_speed === undefined) {
    return NextResponse.json(
      { error: 'weather.temperature and weather.wind_speed are required' },
      { status: 400 }
    );
  }

  return {
    supabase,
    userId,
    weather: body.weather,
    tempC: fahrenheitToCelsius(body.weather.temperature),
    windMs: mphToMs(body.weather.wind_speed),
    body,
  };
}

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

// ============================================
// THERMAL CONVERSION HELPERS
// ============================================

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
      windproofRating: g.garment_protection?.windproof_rating as GarmentWithProtection['windproofRating'],
      waterproofRating: g.garment_protection?.waterproof_rating as GarmentWithProtection['waterproofRating'],
      waterproofMm: g.garment_protection?.waterproof_mm,
    };
  });
}

// ============================================
// EXTREMITY GEAR TYPES
// ============================================

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

// ============================================
// EXTREMITY GEAR FETCHING
// ============================================

/**
 * Get user's wardrobe item IDs by type
 */
export async function getUserWardrobeItemIds(
  supabase: ReturnType<typeof getSupabase>,
  userId: string | null,
  itemType: 'garment' | 'handwear' | 'headwear'
): Promise<string[] | null> {
  if (!supabase || !userId) return null;

  const { data } = await supabase
    .from('user_wardrobe')
    .select('item_id')
    .eq('user_id', userId)
    .eq('item_type', itemType);

  if (!data || data.length === 0) return null;
  return data.map((d) => d.item_id);
}

/**
 * Fetch user's handwear from wardrobe
 */
export async function fetchUserHandwear(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string | null
): Promise<HandwearRow[]> {
  const ids = await getUserWardrobeItemIds(supabase, userId, 'handwear');
  if (!ids || ids.length === 0) return [];

  const { data } = await supabase
    .from('handwear')
    .select('*')
    .in('id', ids);

  return (data as HandwearRow[]) || [];
}

/**
 * Fetch user's headwear from wardrobe
 */
export async function fetchUserHeadwear(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string | null
): Promise<HeadwearRow[]> {
  const ids = await getUserWardrobeItemIds(supabase, userId, 'headwear');
  if (!ids || ids.length === 0) return [];

  const { data } = await supabase
    .from('headwear')
    .select('*')
    .in('id', ids);

  return (data as HeadwearRow[]) || [];
}

/**
 * Select best handwear based on temperature
 */
export function selectHandwear(
  handwear: HandwearRow[],
  tempC: number,
  isActive: boolean
): HandwearRow | null {
  if (handwear.length === 0) return null;

  // Filter by temperature suitability
  const suitable = handwear.filter((h) => {
    const minTemp = isActive ? h.min_temp_active : h.min_temp_static;
    return minTemp === undefined || minTemp === null || tempC >= minTemp;
  });

  // Sort by clo (warmest first for cold, lightest first for warm)
  const sorted = [...(suitable.length > 0 ? suitable : handwear)].sort((a, b) => {
    if (tempC < -10) return b.rcl_clo - a.rcl_clo; // Cold: prefer warmer
    if (tempC > 0) return a.rcl_clo - b.rcl_clo;   // Warm: prefer lighter
    return b.rcl_clo - a.rcl_clo; // Default: prefer warmer
  });

  return sorted[0] || null;
}

/**
 * Select best headwear based on temperature (legacy - single item)
 */
export function selectHeadwear(
  headwear: HeadwearRow[],
  tempC: number,
  isActive: boolean
): HeadwearRow | null {
  if (headwear.length === 0) return null;

  // Filter by temperature suitability
  const suitable = headwear.filter((h) => {
    const minTemp = isActive ? h.min_temp_active : h.min_temp_static;
    return minTemp === undefined || minTemp === null || tempC >= minTemp;
  });

  // Sort by clo (warmest first for cold, lightest first for warm)
  const sorted = [...(suitable.length > 0 ? suitable : headwear)].sort((a, b) => {
    if (tempC < -10) return b.rcl_clo - a.rcl_clo; // Cold: prefer warmer
    if (tempC > 0) return a.rcl_clo - b.rcl_clo;   // Warm: prefer lighter
    return b.rcl_clo - a.rcl_clo; // Default: prefer warmer
  });

  return sorted[0] || null;
}

// Headwear type categories
const HELMET_TYPES = ['ski_helmet'];
const HEAD_WARMTH_TYPES = ['liner_beanie', 'midweight_beanie', 'heavy_beanie', 'balaclava_light', 'balaclava_heavy', 'headband'];
const NECK_WARMTH_TYPES = ['buff_thin', 'buff_heavy', 'facemask'];

export interface HeadwearRecommendations {
  helmet: HeadwearRow | null;
  headWarmth: HeadwearRow | null;
  neckWarmth: HeadwearRow | null;
}

/**
 * Select headwear by category - returns helmet, head warmth, and neck warmth separately
 */
export function selectHeadwearByCategory(
  headwear: HeadwearRow[],
  tempC: number,
  isActive: boolean
): HeadwearRecommendations {
  const helmets = headwear.filter((h) => HELMET_TYPES.includes(h.headwear_type));
  const headWarmthItems = headwear.filter((h) => HEAD_WARMTH_TYPES.includes(h.headwear_type));
  const neckWarmthItems = headwear.filter((h) => NECK_WARMTH_TYPES.includes(h.headwear_type));

  // Select best helmet (prefer warmer for cold, but helmets have similar warmth)
  const helmet = selectBestFromCategory(helmets, tempC, isActive);

  // Select best head warmth layer based on temperature
  const headWarmth = selectBestFromCategory(headWarmthItems, tempC, isActive);

  // Select neck warmth if cold enough (below 0°C / 32°F)
  const neckWarmth = tempC < 0 ? selectBestFromCategory(neckWarmthItems, tempC, isActive) : null;

  return { helmet, headWarmth, neckWarmth };
}

/**
 * Select best item from a category based on temperature
 */
function selectBestFromCategory(
  items: HeadwearRow[],
  tempC: number,
  isActive: boolean
): HeadwearRow | null {
  if (items.length === 0) return null;

  // Filter by temperature suitability
  const suitable = items.filter((h) => {
    const minTemp = isActive ? h.min_temp_active : h.min_temp_static;
    return minTemp === undefined || minTemp === null || tempC >= minTemp;
  });

  // Sort by clo (warmest first for cold, lightest first for warm)
  const sorted = [...(suitable.length > 0 ? suitable : items)].sort((a, b) => {
    if (tempC < -10) return b.rcl_clo - a.rcl_clo; // Cold: prefer warmer
    if (tempC > 0) return a.rcl_clo - b.rcl_clo;   // Warm: prefer lighter
    return b.rcl_clo - a.rcl_clo; // Default: prefer warmer
  });

  return sorted[0] || null;
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
