import { NextRequest } from 'next/server';
import { POST as alpineHandler } from '@/app/api/v1/recommendations/alpine/route';
import { paidRecommendationRoute } from '@/lib/payments/mpp';

/**
 * POST /api/agent/recommendations/alpine
 *
 * Paid (MPP / HTTP 402) mirror of POST /api/v1/recommendations/alpine.
 * The `/v1` route stays free for the Clerk-authenticated frontend; machine
 * callers (agents) pay per request here. Recommendation logic is reused from
 * the v1 handler — this file only adds the payment gate plus pre-charge
 * body validation so agents aren't charged for guaranteed 400s.
 */
export const POST = paidRecommendationRoute(
  process.env.MPP_PRICE_ALPINE ?? '0.02',
  (request: Request) => alpineHandler(request as NextRequest),
);
