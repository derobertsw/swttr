import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import {
  assertCanAccessTrip,
  classifyTripStatus,
  enumerateDates,
  loadTripFull,
} from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const full = await loadTripFull(supabase, id);
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(full);
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (access.owner_user_id !== userId)
    return NextResponse.json({ error: "Organizer only" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const update: Record<string, unknown> = {};
  if (typeof body?.name === "string") update.name = body.name;
  if (typeof body?.start_date === "string") update.start_date = body.start_date;
  if (typeof body?.end_date === "string") update.end_date = body.end_date;

  const nextStart = (update.start_date as string | undefined) ?? access.start_date;
  const nextEnd = (update.end_date as string | undefined) ?? access.end_date;
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
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (access.owner_user_id !== userId)
    return NextResponse.json({ error: "Organizer only" }, { status: 403 });

  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
