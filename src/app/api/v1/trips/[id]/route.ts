import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { buildLodging, isCalendarDate, loadLodging } from "@/lib/trip-lodging";
import {
  requireTripAccess,
  classifyTripStatus,
  enumerateDates,
  loadTripFull,
} from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  try {
    const full = await loadTripFull(supabase, id);
    if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(full);
  } catch {
    return NextResponse.json({ error: "Couldn't load the trip. Try again." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const { supabase, trip } = auth;

  const body = await readJson(request);
  const update: Record<string, unknown> = {};
  if (typeof body?.name === "string") update.name = body.name;
  if (typeof body?.start_date === "string") update.start_date = body.start_date;
  if (typeof body?.end_date === "string") update.end_date = body.end_date;

  const nextStart = (update.start_date as string | undefined) ?? trip.start_date;
  const nextEnd = (update.end_date as string | undefined) ?? trip.end_date;
  if (!isCalendarDate(nextStart) || !isCalendarDate(nextEnd) || nextStart > nextEnd) {
    return NextResponse.json(
      { error: "start_date must be on or before end_date" },
      { status: 400 }
    );
  }
  const datesMoved = nextStart !== trip.start_date || nextEnd !== trip.end_date;
  if (datesMoved || body?.preview_lodging === true) {
    try {
      const lodging = await loadLodging(supabase, trip);
      const after = buildLodging({ ...trip, start_date: nextStart, end_date: nextEnd }, lodging.stays, lodging.assignments);
      if (body?.preview_lodging === true) return NextResponse.json({ lodging_after: after, lodging_revision: lodging.revision });
      if ((lodging.stays.length > 0 || lodging.assignments.length > 0) && body?.lodging_revision !== lodging.revision) {
        return NextResponse.json({ error: "Review the stay dates and morning origins before changing trip dates. Stays and bookings will be kept.", lodging_after: after, lodging_revision: lodging.revision }, { status: 409 });
      }
    } catch {
      return NextResponse.json({ error: "Couldn't preview accommodation changes. Try again." }, { status: 500 });
    }
  }
  update.status = classifyTripStatus(nextStart, nextEnd);

  let query = supabase
    .from("trips")
    .update(update)
    .eq("id", id);
  if (datesMoved) query = query.eq("lodging_revision", trip.lodging_revision ?? 0);
  const { data, error } = await query
    .select("*")
    .single();
  if (error?.code === "PGRST116") return NextResponse.json({ error: "The trip changed. Review the saved plan before retrying." }, { status: 409 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If dates moved, reconcile trip_days: add new dates, drop dropped ones.
  if (update.start_date || update.end_date) {
    const want = new Set(enumerateDates(nextStart, nextEnd));
    const { data: existing } = await supabase
      .from("trip_days")
      .select("id, date")
      .eq("trip_id", id);
    const have = new Set((existing ?? []).map((d) => d.date));
    const toInsert = [...want]
      .filter((d) => !have.has(d))
      .map((d) => ({ trip_id: id, date: d }));
    const toDeleteIds = (existing ?? [])
      .filter((d) => !want.has(d.date))
      .map((d) => d.id);
    if (toInsert.length > 0) await supabase.from("trip_days").insert(toInsert);
    if (toDeleteIds.length > 0)
      await supabase.from("trip_days").delete().in("id", toDeleteIds);
  }

  return NextResponse.json({ trip: data });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
