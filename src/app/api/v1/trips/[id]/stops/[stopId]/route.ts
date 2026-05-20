import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { assertCanAccessTrip } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string; stopId: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id, stopId } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
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

  // Allow assigning days to this stop in the same call.
  if (Array.isArray(body?.day_dates)) {
    const dates = body.day_dates as string[];
    if (dates.length > 0) {
      await supabase
        .from("trip_days")
        .update({ stop_id: stopId })
        .eq("trip_id", id)
        .in("date", dates);
    }
  }

  return NextResponse.json({ stop: data });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id, stopId } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("trip_stops")
    .delete()
    .eq("id", stopId)
    .eq("trip_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
