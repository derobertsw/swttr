import { NextRequest, NextResponse } from "next/server";
import { allowRequest } from "@/lib/rate-limit";
import { loadTripFull, requireTripAccess, tripFullFor } from "@/lib/trips";
import { briefChoices, buildOfflineBrief, parseBriefDates } from "@/lib/trip-offline-brief";
import { supabaseDriveStore, tripDriveEstimates } from "@/lib/trip-drive-estimates";
import { myMemberOf, readMemberPacking, touringDates } from "@/lib/trip-member-packing";
import { readPackingChecks } from "@/lib/trip-packing";
import { buildTouringEquipment, readEquipment } from "@/lib/touring-equipment";
import type { TripOfflineBriefResponse } from "@/types/trip-offline-brief";

type RouteContext = { params: Promise<{ id: string }> };

const REQUESTS_PER_MINUTE = 30;
// A person's own trip data: never kept by a browser, CDN or service worker
// cache. The device copy is an explicit save in the browser's own storage.
const PRIVATE = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: PRIVATE });

/**
 * GET — the signed-in member's brief of chosen trip days, to save on their
 * device for offline reference (#214): `?dates=2027-02-13,2027-02-14`, or
 * without it the default days. Membership is checked as for every trip read,
 * and the brief is built from the same reads as the trip pages, as this
 * person sees them. Drive times are the stored ones; nothing calls a provider.
 */
export async function GET(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) {
    for (const [name, value] of Object.entries(PRIVATE)) auth.headers.set(name, value);
    return auth;
  }
  const { supabase, userId } = auth;
  if (!allowRequest(`trip-brief:${userId}`, REQUESTS_PER_MINUTE, 60_000)) {
    return error("Too many requests. Wait a minute, then try again.", 429);
  }
  const asked = parseBriefDates(request.nextUrl.searchParams.get("dates"));
  if (asked === null) return error("Choose the trip days to save.", 400);

  try {
    const full = await loadTripFull(supabase, auth.trip);
    if (!full) return error("Not found", 404);
    const now = Date.now();
    const viewed = tripFullFor(full, userId);
    const choices = briefChoices(viewed, now);
    const dates = asked.length > 0 ? asked : choices.default_dates;
    if (dates.length === 0) return error("This trip has no days to save yet.", 409);

    const me = myMemberOf(full, userId);
    const [drive, packing] = await Promise.all([
      tripDriveEstimates(full, supabaseDriveStore(supabase, id), { now, refresh: false }).catch(() => null),
      // Without a member row there's no packing list, so no equipment to save.
      me ? readMemberPacking(supabase, me.id).catch(() => null) : Promise.resolve({ saved: null, readable: true, equipment: true }),
    ]);
    const equipment = packing?.readable ? (() => {
      const touring = buildTouringEquipment({ dates: touringDates(full), saved: readEquipment(packing.saved?.equipment), names: [], editable: false });
      return { items: touring.items, dates: touring.dates, checks: readPackingChecks(packing.saved?.checks) };
    })() : null;

    const brief = buildOfflineBrief({ full: viewed, userId, dates, drive, equipment, now });
    if (brief.days.length === 0) return error("None of these days are on the trip any more. Choose the days to save again.", 409);
    return NextResponse.json({ brief, ...choices } satisfies TripOfflineBriefResponse, { headers: PRIVATE });
  } catch {
    return error("Couldn't build the trip brief. Try again.", 500);
  }
}
