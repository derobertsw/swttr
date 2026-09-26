import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string; date: string }> };

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
