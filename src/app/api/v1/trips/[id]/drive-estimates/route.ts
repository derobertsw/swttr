import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { allowRequest } from "@/lib/rate-limit";
import { supabaseDriveStore, tripDriveEstimates } from "@/lib/trip-drive-estimates";
import { loadTripFull, requireTripAccess } from "@/lib/trips";

type Context = { params: Promise<{ id: string }> };

const REQUESTS_PER_MINUTE = 30;

/**
 * GET — every day's drive from its morning stay to its access point, and
 * each stay's departures (#209). The whole crew reads the same estimates.
 * A provider failure is a state on the affected days, not an error here, so
 * the rest of the plan still shows.
 */
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  if (!allowRequest(`drive-estimates:${auth.userId}`, REQUESTS_PER_MINUTE, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Wait a minute, then try again.", code: "rate_limited" }, { status: 429 });
  }
  try {
    const full = await loadTripFull(auth.supabase, auth.trip);
    if (!full) return jsonError("Not found", 404);
    return NextResponse.json(await tripDriveEstimates(full, supabaseDriveStore(auth.supabase, id)));
  } catch {
    return jsonError("Couldn't load drive times. Try again.", 500);
  }
}
