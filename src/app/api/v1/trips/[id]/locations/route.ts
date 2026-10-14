import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";
import { allowRequest } from "@/lib/rate-limit";
import { isUsableCoordinate } from "@/lib/trip-location";
import { searchLocations } from "@/lib/locations/provider";

type Context = { params: Promise<{ id: string }> };

const SEARCHES_PER_MINUTE = 30;

/**
 * GET ?q= — places for a trip's logistics, nearest its destinations first.
 * Organizer only, like every logistics edit. 200 with no results means no
 * matches; 503 means search is unavailable and manual entry still works.
 */
export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 3 || query.length > 200) return jsonError("Enter 3 to 200 characters to search.", 400);
  if (!allowRequest(`location-search:${auth.userId}`, SEARCHES_PER_MINUTE, 60_000)) {
    return NextResponse.json({ error: "Too many searches. Wait a minute, then try again.", code: "rate_limited" }, { status: 429 });
  }
  const { data: stops } = await auth.supabase.from("trip_stops").select("latitude, longitude").eq("trip_id", id);
  const near = (stops ?? []).filter((stop) => isUsableCoordinate(stop.latitude, stop.longitude))
    .map((stop) => ({ latitude: stop.latitude as number, longitude: stop.longitude as number }));
  try {
    return NextResponse.json({ results: await searchLocations(query, near) });
  } catch {
    return NextResponse.json({ error: "Location search isn't available right now.", code: "unavailable" }, { status: 503 });
  }
}
