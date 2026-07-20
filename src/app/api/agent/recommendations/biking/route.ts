import { NextRequest } from 'next/server';
import { POST as bikingHandler } from '@/app/api/v1/recommendations/biking/route';
import { mppx } from '@/lib/payments/mpp';

/**
 * POST /api/agent/recommendations/biking
 *
 * Paid (MPP / HTTP 402) mirror of POST /api/v1/recommendations/biking.
 * The `/v1` route stays free for the Clerk-authenticated frontend; machine
 * callers (agents) pay per request here. Recommendation logic is reused from
 * the v1 handler — this file only adds the payment gate.
 */
export const POST = mppx.charge({ amount: process.env.MPP_PRICE_BIKING ?? '0.02' })(
  (request: Request) => bikingHandler(request as NextRequest),
);
