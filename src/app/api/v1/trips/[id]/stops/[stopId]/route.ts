import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string; stopId: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id, stopId } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase, trip } = auth;

  const body = await readJson(request);
  if (body?.day_dates !== undefined && (!Array.isArray(body.day_dates) || body.day_dates.some((date: unknown) => typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < trip.start_date || date > trip.end_date))) {
    return NextResponse.json({ error: "Choose days within this trip." }, { status: 400 });
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

  // Allow assigning days to this stop in the same call.
  if (Array.isArray(body?.day_dates)) {
    const dates = [...new Set(body.day_dates as string[])];
    if (dates.length > 0) {
      const { data: assignedDays, error: assignmentError } = await supabase
        .from("trip_days")
        .update({ stop_id: stopId })
        .eq("trip_id", id)
        .in("date", dates)
        .select("date");
      if (assignmentError) return NextResponse.json({ error: "Stop details saved, but day assignments failed. Retry to assign the selected days." }, { status: 500 });
      const assignedDates = new Set((assignedDays ?? []).map((day) => day.date));
      if (dates.some((date) => !assignedDates.has(date))) {
        return NextResponse.json({ error: "Stop details saved, but some selected days are missing and could not be assigned. Reload the trip and try again." }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ stop: data });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id, stopId } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const { error } = await supabase
    .from("trip_stops")
    .delete()
    .eq("id", stopId)
    .eq("trip_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
