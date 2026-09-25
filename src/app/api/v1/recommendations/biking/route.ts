import { createRecommendationRoute } from '@/lib/recommendations/handler';
import { biking } from '@/lib/recommendations/sports/biking';

/**
 * POST /api/v1/recommendations/biking
 *
 * Biking, prioritizing breathability with a wind shell.
 */
export const POST = createRecommendationRoute(biking);
