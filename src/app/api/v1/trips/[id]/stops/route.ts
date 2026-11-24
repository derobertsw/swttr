import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";
import { withResortPoint } from "@/lib/locations/resort-places";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const body = await readJson(request);
  const { name, latitude, longitude, activities, resort_id } = (body ?? {}) as {
    name?: string;
    latitude?: number | null;
    longitude?: number | null;
    activities?: string[];
    resort_id?: unknown;
  };
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  // A resort stop saves the catalog's forecast point with it (#7).
  let resort = null;
  if (resort_id !== undefined && resort_id !== null) {
    resort = withResortPoint({ latitude: 0, longitude: 0, resort_id });
    if (!resort?.resort_id) return NextResponse.json({ error: "Select the resort again from the search results." }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("trip_stops")
    .select("position")
    .eq("trip_id", id)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition = ((existing?.[0]?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("trip_stops")
    .insert({
      trip_id: id,
      position: nextPosition,
      name,
      latitude: resort ? resort.latitude : latitude ?? null,
      longitude: resort ? resort.longitude : longitude ?? null,
      activities: activities ?? [],
      ...(resort ? {
        resort_id: resort.resort_id,
        forecast_elevation_m: resort.forecast_elevation_m,
        forecast_point_label: resort.forecast_point_label,
      } : {}),
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stop: data }, { status: 201 });
}
