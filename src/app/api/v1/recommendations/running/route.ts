import { createRecommendationRoute } from '@/lib/recommendations/handler';
import { running } from '@/lib/recommendations/sports/running';

/**
 * POST /api/v1/recommendations/running
 *
 * Running, prioritizing breathability; shells only when cold or wet.
 */
export const POST = createRecommendationRoute(running);
