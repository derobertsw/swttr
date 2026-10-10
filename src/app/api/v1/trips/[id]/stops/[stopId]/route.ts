import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string; stopId: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id, stopId } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const body = await readJson(request);
  // Days move between stops only through a reviewed itinerary change (#176).
  if (body?.day_dates !== undefined) {
    return NextResponse.json({ error: "Days are changed through the itinerary review. Reload the page and try again." }, { status: 400 });
  }
  const update: Record<string, unknown> = {};
  if (typeof body?.name === "string") update.name = body.name;
  if (body?.latitude !== undefined) update.latitude = body.latitude;
  if (body?.longitude !== undefined) update.longitude = body.longitude;
  if (Array.isArray(body?.activities)) update.activities = body.activities;

  const { data, error } = await supabase
    .from("trip_stops")
    .update(update)
    .eq("id", stopId)
    .eq("trip_id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stop: data });
}
