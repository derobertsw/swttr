import { createRecommendationRoute } from '@/lib/recommendations/handler';
import { skiTouring } from '@/lib/recommendations/sports/ski-touring';

/**
 * POST /api/v1/recommendations/ski-touring
 *
 * Ski touring: a climbing ensemble plus pack items for the transition
 * and descent.
 */
export const POST = createRecommendationRoute(skiTouring);
