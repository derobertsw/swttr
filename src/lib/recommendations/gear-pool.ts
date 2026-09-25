/**
 * Loads the gear a recommendation can draw from: the signed-in user's
 * wardrobe when they have one, otherwise the catalog filtered for the sport.
 */
import type { GarmentActivityRatingProps, GarmentRow, CategorizedGarments, HandwearRow, HeadwearRow } from './types';
import type { RecommendationRequest } from './request';
import { getUserWardrobeGarmentIds, fetchGarmentsWithDetails, fetchUserHandwear, fetchUserHeadwear } from './database';
import { categorizeGarments } from './categorization';

/** How to narrow the catalog when the user has no wardrobe. */
export interface CatalogFilter {
  /** Minimum activity score, applied in the database query. */
  minScore?: { field: keyof GarmentActivityRatingProps; minScore: number };
  /** Applied to the fetched garments. */
  predicate?: (garment: GarmentRow) => boolean;
}

export interface GearPool {
  /** True when garments come from the user's wardrobe rather than the catalog. */
  usingWardrobe: boolean;
  categorized: CategorizedGarments;
  handwear: HandwearRow[];
  headwear: HeadwearRow[];
}

type GearPoolResult =
  | { status: 'ok'; pool: GearPool }
  | { status: 'empty' }
  | { status: 'error'; message: string };

export async function loadGearPool(
  { supabase, userId, useWardrobeOnly }: RecommendationRequest,
  catalog: CatalogFilter
): Promise<GearPoolResult> {
  const wardrobeIds = await getUserWardrobeGarmentIds(supabase, userId);
  const usingWardrobe = wardrobeIds !== null && wardrobeIds.length > 0;

  if (useWardrobeOnly && !usingWardrobe) {
    return { status: 'empty' };
  }

  const { data, error } = await fetchGarmentsWithDetails(supabase, {
    wardrobeIds: usingWardrobe ? wardrobeIds : null,
    activityFilter: usingWardrobe ? undefined : catalog.minScore,
  });
  if (error) {
    return { status: 'error', message: error.message };
  }

  const fetched = data ?? [];
  const garments = usingWardrobe || !catalog.predicate ? fetched : fetched.filter(catalog.predicate);
  if (garments.length === 0) {
    return { status: 'empty' };
  }

  const [handwear, headwear] = await Promise.all([
    fetchUserHandwear(supabase, userId),
    fetchUserHeadwear(supabase, userId),
  ]);

  return {
    status: 'ok',
    pool: {
      usingWardrobe,
      categorized: categorizeGarments(garments),
      handwear,
      headwear,
    },
  };
}
