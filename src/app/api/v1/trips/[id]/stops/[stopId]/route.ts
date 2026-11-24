import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";
import { NO_RESORT, withResortPoint } from "@/lib/locations/resort-places";

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
  // A new place is a resort with the catalog's point, or a general place
  // without the old resort's point (#7).
  if (body?.resort_id !== undefined && body.resort_id !== null) {
    const resort = withResortPoint({ latitude: 0, longitude: 0, resort_id: body.resort_id });
    if (!resort?.resort_id) return NextResponse.json({ error: "Select the resort again from the search results." }, { status: 400 });
    Object.assign(update, resort);
  } else if (update.latitude !== undefined || update.longitude !== undefined || body?.resort_id === null) {
    Object.assign(update, NO_RESORT);
  }

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
