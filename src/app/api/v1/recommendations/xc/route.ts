import { createRecommendationRoute } from '@/lib/recommendations/handler';
import { xc } from '@/lib/recommendations/sports/xc';

/**
 * POST /api/v1/recommendations/xc
 *
 * XC skiing, prioritizing breathability (evap_potential >= 0.25) with
 * separate torso and legs clo budgets.
 */
export const POST = createRecommendationRoute(xc);
