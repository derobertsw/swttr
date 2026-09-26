import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const body = await readJson(request);
  const { name, latitude, longitude, activities } = (body ?? {}) as {
    name?: string;
    latitude?: number | null;
    longitude?: number | null;
    activities?: string[];
  };
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

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
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      activities: activities ?? [],
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stop: data }, { status: 201 });
}

export async function PUT(request: NextRequest, ctx: RouteContext) {
  // Reorder: body is { order: [stopId, stopId, ...] }
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const body = await readJson(request);
  const order = (body?.order ?? []) as string[];
  if (!Array.isArray(order))
    return NextResponse.json({ error: "order array required" }, { status: 400 });

  // Two-phase update to avoid the unique (trip_id, position) collision.
  for (let i = 0; i < order.length; i++) {
    await supabase
      .from("trip_stops")
      .update({ position: -(i + 1) })
      .eq("id", order[i])
      .eq("trip_id", id);
  }
  for (let i = 0; i < order.length; i++) {
    await supabase
      .from("trip_stops")
      .update({ position: i })
      .eq("id", order[i])
      .eq("trip_id", id);
  }
  return NextResponse.json({ ok: true });
}
