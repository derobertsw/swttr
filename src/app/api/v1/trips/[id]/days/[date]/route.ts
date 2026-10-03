import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { enumerateDates, requireTripAccess } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string; date: string }> };

// Restoring a missing day is idempotent: an existing activity or destination
// survives retries and concurrent requests. The route accepts no day fields;
// the existing controls edit the restored row afterward.
export async function POST(_request: NextRequest, ctx: RouteContext) {
  const { id, date } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase, trip } = auth;
  if (!enumerateDates(trip.start_date, trip.end_date).includes(date)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: insertError } = await supabase.from("trip_days")
    .upsert({ trip_id: id, date }, { onConflict: "trip_id,date", ignoreDuplicates: true });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  const { data, error } = await supabase.from("trip_days")
    .select("*").eq("trip_id", id).eq("date", date).single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't load the day plan" }, { status: 500 });
  return NextResponse.json({ day: data });
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id, date } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const body = await readJson(request);
  const update: Record<string, unknown> = {};
  if (body?.stop_id !== undefined) update.stop_id = body.stop_id;
  if (typeof body?.activity === "string" || body?.activity === null)
    update.activity = body.activity;

  const { data, error } = await supabase
    .from("trip_days")
    .update(update)
    .eq("trip_id", id)
    .eq("date", date)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ day: data });
}
