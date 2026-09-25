/**
 * Shared POST handler for the sport recommendation routes.
 *
 * Every sport runs the same pipeline: parse the request, compute thermal
 * targets, load the gear pool (wardrobe or filtered catalog), then either
 * build a recommendation or, when there is no usable gear, return the targets
 * alone. The sport-specific steps live in a SportRecommender.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { BiophysicsRecommendation } from '@/types/biophysics';
import { parseRecommendationRequest, type RecommendationRequest } from './request';
import { loadGearPool, type CatalogFilter, type GearPool } from './gear-pool';

export interface SportRecommender<Targets> {
  /** Narrows the catalog when the user has no wardrobe. */
  catalog: CatalogFilter;
  computeTargets(request: RecommendationRequest): Targets;
  /** Response body (besides the message) when there is no usable gear. */
  emptyResponse(request: RecommendationRequest, targets: Targets): object;
  recommend(request: RecommendationRequest, targets: Targets, pool: GearPool): BiophysicsRecommendation;
}

const NO_GARMENTS_MESSAGE = 'No suitable garments found in database';

export function createRecommendationRoute<Targets>(sport: SportRecommender<Targets>) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    const parsed = await parseRecommendationRequest(request);
    if (parsed instanceof NextResponse) return parsed;

    const targets = sport.computeTargets(parsed);
    const gear = await loadGearPool(parsed, sport.catalog);

    if (gear.status === 'error') {
      return NextResponse.json({ error: gear.message }, { status: 500 });
    }
    if (gear.status === 'empty') {
      return NextResponse.json({
        message: NO_GARMENTS_MESSAGE,
        ...sport.emptyResponse(parsed, targets),
      });
    }
    return NextResponse.json(sport.recommend(parsed, targets, gear.pool));
  };
}
