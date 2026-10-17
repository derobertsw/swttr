import { NextRequest, NextResponse } from "next/server";
import { requireTripAccess, loadTripFull } from "@/lib/trips";
import { readManualItems, readPackingChecks } from "@/lib/trip-packing";
import {
  itemsFromKits, mappedNames, myKits, myMemberOf, readMappings, readMemberPacking, touringDates, type MappingRow,
} from "@/lib/trip-member-packing";
import { buildTouringEquipment, readEquipment } from "@/lib/touring-equipment";
import type { TripEquipmentResponse } from "@/types/trip-packing";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The signed-in member's touring equipment (#212) and its packing checks, for
 * a trip day: the part of GET /pack a day shows, without its forecasts.
 */
export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const full = await loadTripFull(supabase, auth.trip);
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const myMember = myMemberOf(full, userId);
  const [packing, mappings] = await Promise.all([
    myMember ? readMemberPacking(supabase, myMember.id) : { saved: null, readable: false, equipment: false },
    readMappings(supabase, userId),
  ]);
  const manual = readManualItems(packing.saved?.items);
  const derived = itemsFromKits(myKits(full, myMember?.id), mappedNames((mappings.data ?? []) as MappingRow[]));
  const equipment = buildTouringEquipment({
    dates: touringDates(full),
    saved: readEquipment(packing.saved?.equipment),
    names: [...derived.map((item) => item.name), ...manual.map((item) => item.name)],
    editable: packing.readable && packing.equipment,
  });
  const keys = new Set(equipment.items.map((item) => item.key));
  const checks = Object.fromEntries(Object.entries(readPackingChecks(packing.saved?.checks)).filter(([key]) => keys.has(key)));

  return NextResponse.json({ equipment, checks } satisfies TripEquipmentResponse,
    { headers: { "Cache-Control": "private, no-store" } });
}
