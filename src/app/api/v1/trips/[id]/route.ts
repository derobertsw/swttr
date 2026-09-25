import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
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

  const full = await loadTripFull(supabase, id);
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(full);
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
  if (nextStart > nextEnd) {
    return NextResponse.json(
      { error: "start_date must be on or before end_date" },
      { status: 400 }
    );
  }
  update.status = classifyTripStatus(nextStart, nextEnd);

  const { data, error } = await supabase
    .from("trips")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
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
