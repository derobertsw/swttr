import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { touringDates } from "@/lib/trip-member-packing";
import { addSharedTouringItems, buildSharedTouringTemplate, isSharedTouringId, SHARED_TOURING_ITEMS } from "@/lib/trip-shared-touring";
import type { SharedTouringTemplate } from "@/types/trip-packing";

type RouteContext = { params: Promise<{ id: string }> };

/** The shared touring items template as the trip's shared gear stands (#212), for the organizer. */
export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;

  const full = await loadTripFull(auth.supabase, auth.trip);
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ dates: touringDates(full), template: buildSharedTouringTemplate(id, full.gear) } satisfies SharedTouringTemplate,
    { headers: { "Cache-Control": "private, no-store" } });
}

/** Adds the chosen template items that aren't in shared gear yet, unassigned: `{ids}`. */
export async function POST(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;

  const ids = (await readJson(request))?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > SHARED_TOURING_ITEMS.length
    || !ids.every(isSharedTouringId) || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Choose the shared touring items to add." }, { status: 400 });
  }
  return addSharedTouringItems(auth.supabase, id, auth.userId, ids);
}
