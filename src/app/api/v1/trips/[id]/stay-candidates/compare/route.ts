import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { allowRequest } from "@/lib/rate-limit";
import { loadStayCandidates } from "@/lib/trip-stay-candidates";
import { compareStays, parseComparisonRequest, supabaseComparisonStore } from "@/lib/trip-stay-comparison";
import { loadTripFull, requireTripAccess } from "@/lib/trips";

type Context = { params: Promise<{ id: string }> };

const REQUESTS_PER_MINUTE = 30;

/**
 * GET ?options=stay:<id>,candidate:<id>[,…]&first_night=&checkout= — two or
 * three of the trip's stays or options over the same nights, by the drives
 * on the mornings after them (#213). Anyone on the trip can compare; nothing
 * about the trip's plan changes. A provider failure is a drive's state, not
 * an error here.
 */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const parsed = parseComparisonRequest(new URL(request.url).searchParams, auth.trip);
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });
  if (!allowRequest(`stay-comparison:${auth.userId}`, REQUESTS_PER_MINUTE, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Wait a minute, then try again.", code: "rate_limited" }, { status: 429 });
  }
  try {
    const [full, { candidates }] = await Promise.all([loadTripFull(auth.supabase, auth.trip), loadStayCandidates(auth.supabase, auth.trip)]);
    if (!full) return jsonError("Not found", 404);
    const comparison = await compareStays(full, candidates, parsed, supabaseComparisonStore(auth.supabase, id));
    return "error" in comparison ? jsonError(comparison.error, comparison.status) : NextResponse.json(comparison);
  } catch {
    return jsonError("Couldn't compare these stays. Try again.", 500);
  }
}
