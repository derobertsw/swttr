import { createRecommendationRoute } from '@/lib/recommendations/handler';
import { alpine } from '@/lib/recommendations/sports/alpine';

/**
 * POST /api/v1/recommendations/alpine
 *
 * Alpine/resort skiing, accounting for static chairlift time with a
 * blended skiing + chairlift metabolic model.
 */
export const POST = createRecommendationRoute(alpine);
