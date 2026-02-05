/**
 * Shared route handler for recommendation API routes.
 * Extracts common boilerplate: validate, fetch wardrobe, fetch garments, fetch extremities.
 */
import { NextResponse } from 'next/server';
import type { ValidatedRequest } from './validation';
import type { GarmentRow, CategorizedGarments, HandwearRow, HeadwearRow } from './types';
import { getUserWardrobeGarmentIds, fetchGarmentsWithDetails, fetchUserHandwear, fetchUserHeadwear } from './database';
import { categorizeGarments } from './categorization';

export interface ActivityRouteConfig {
  activityFilter?: { field: string; minScore: number };
}

export interface PreparedRouteData {
  wardrobeIds: string[] | null;
  useWardrobe: boolean;
  allGarments: GarmentRow[];
  categorized: CategorizedGarments;
  userHandwear: HandwearRow[];
  userHeadwear: HeadwearRow[];
}

/**
 * Prepare common data for a recommendation route.
 * Returns PreparedRouteData on success, or NextResponse on error/empty results.
 */
export async function prepareRouteData(
  validated: ValidatedRequest,
  config: ActivityRouteConfig
): Promise<PreparedRouteData | NextResponse> {
  const { supabase, userId } = validated;

  // Check if user has wardrobe items
  const wardrobeIds = await getUserWardrobeGarmentIds(supabase, userId);
  const useWardrobe = wardrobeIds !== null && wardrobeIds.length > 0;

  // Fetch suitable garments
  const { data: allGarments, error } = await fetchGarmentsWithDetails(supabase, {
    wardrobeIds: useWardrobe ? wardrobeIds : null,
    activityFilter: useWardrobe ? undefined : config.activityFilter,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!allGarments || allGarments.length === 0) {
    return NextResponse.json({ allGarments: [] }, { status: 200 });
  }

  // Categorize and fetch extremities in parallel
  const categorized = categorizeGarments(allGarments);

  const [userHandwear, userHeadwear] = await Promise.all([
    fetchUserHandwear(supabase, userId),
    fetchUserHeadwear(supabase, userId),
  ]);

  return {
    wardrobeIds,
    useWardrobe,
    allGarments,
    categorized,
    userHandwear,
    userHeadwear,
  };
}

/**
 * Check if prepareRouteData returned an error response
 */
export function isPreparedData(result: PreparedRouteData | NextResponse): result is PreparedRouteData {
  return !(result instanceof NextResponse);
}
