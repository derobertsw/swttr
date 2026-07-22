/**
 * Database helpers for recommendation API routes
 */
import { getSupabase } from '@/lib/supabase';
import type { GarmentRow, HandwearRow, HeadwearRow } from './types';

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
    .eq('item_type', 'garment')
    .eq('disabled', false);

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
  const useActivityFilter =
    !(options?.wardrobeIds && options.wardrobeIds.length > 0) && Boolean(options?.activityFilter);

  // `!inner` is required for the .gte() below to drop garments under the score
  // threshold — without it PostgREST only nulls the embed and returns every row.
  let query = supabase
    .from('garments')
    .select(`
      *,
      garment_thermal_properties (*),
      garment_protection (*),
      ${useActivityFilter ? 'garment_activity_ratings!inner (*)' : 'garment_activity_ratings (*)'}
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
    .eq('item_type', itemType)
    .eq('disabled', false);

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
  // Anonymous callers (agent API) have no wardrobe — select from the full catalog.
  if (!userId) {
    const { data } = await supabase.from('handwear').select('*');
    return (data as HandwearRow[]) || [];
  }

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
  // Anonymous callers (agent API) have no wardrobe — select from the full catalog.
  if (!userId) {
    const { data } = await supabase.from('headwear').select('*');
    return (data as HeadwearRow[]) || [];
  }

  const ids = await getUserWardrobeItemIds(supabase, userId, 'headwear');
  if (!ids || ids.length === 0) return [];

  const { data } = await supabase
    .from('headwear')
    .select('*')
    .in('id', ids);

  return (data as HeadwearRow[]) || [];
}
