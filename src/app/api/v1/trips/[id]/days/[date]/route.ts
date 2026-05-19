import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { assertCanAccessTrip } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string; date: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id, date } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
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
