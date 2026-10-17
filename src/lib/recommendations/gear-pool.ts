/**
 * Loads the gear a recommendation can draw from: the signed-in user's
 * wardrobe when they have one, otherwise the catalog filtered for the sport.
 */
import type { GarmentActivityRatingProps, GarmentRow, CategorizedGarments, HandwearRow, HeadwearRow } from './types';
import type { RecommendationRequest } from './request';
import { getUserWardrobeGarmentIds, getUserWardrobeItemIds, fetchGarmentsWithDetails, fetchUserHandwear, fetchUserHeadwear } from './database';
import { categorizeGarments } from './categorization';
import { hasUsableThermalData } from './garment-semantics';

/** How to narrow the catalog when the user has no wardrobe. */
export interface CatalogFilter {
  activity?: string;
  /** Minimum activity score, applied in the database query. */
  minScore?: { field: keyof GarmentActivityRatingProps; minScore: number };
  /** Applied to the fetched garments. */
  predicate?: (garment: GarmentRow) => boolean;
}

export interface GearPool {
  /** True when garments come from the user's wardrobe rather than the catalog. */
  usingWardrobe: boolean;
  garments?: GarmentRow[];
  categorized: CategorizedGarments;
  handwear: HandwearRow[];
  headwear: HeadwearRow[];
  /** Whether handwear/headwear came from the user's wardrobe (tracked per kind). */
  handwearOwned?: boolean;
  headwearOwned?: boolean;
}

type GearPoolResult =
  | { status: 'ok'; pool: GearPool }
  | { status: 'empty' }
  | { status: 'error'; message: string };

/** Load usable wardrobe/catalog gear, applying activity eligibility before categorization. */
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
  const eligible = usingWardrobe || !catalog.predicate ? fetched : fetched.filter(catalog.predicate);
  const garments = eligible.filter(g => hasUsableThermalData(g)
    && (!catalog.activity || !g.suitable_activities?.length || g.suitable_activities.includes(catalog.activity)));
  if (garments.length === 0) {
    return { status: 'empty' };
  }

  const [handwear, headwear, handwearIds, headwearIds] = await Promise.all([
    fetchUserHandwear(supabase, userId),
    fetchUserHeadwear(supabase, userId),
    getUserWardrobeItemIds(supabase, userId, 'handwear'),
    getUserWardrobeItemIds(supabase, userId, 'headwear'),
  ]);

  return {
    status: 'ok',
    pool: {
      usingWardrobe,
      garments,
      categorized: categorizeGarments(garments),
      handwear,
      headwear,
      handwearOwned: Boolean(handwearIds?.length),
      headwearOwned: Boolean(headwearIds?.length),
    },
  };
}
