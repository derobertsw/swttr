import { NextRequest, NextResponse } from "next/server";
import { buildDayChecklists } from "@/lib/trip-checklist";
import { loadTripFull, requireTripAccess, tripFullFor } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string }> };

/** Every trip day's checklist (#336), for anyone on the trip: see docs/trip-crew-checklist.md. */
export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  try {
    const full = await loadTripFull(auth.supabase, auth.trip);
    if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(buildDayChecklists(tripFullFor(full, auth.userId), auth.userId), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load the day checklist. Try again." }, { status: 500 });
  }
}
