import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { assertCanAccessTrip } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string; gearId: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id, gearId } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const update: Record<string, unknown> = {};
  if (typeof body?.description === "string") update.description = body.description;
  if (body?.assignee_member_id !== undefined)
    update.assignee_member_id = body.assignee_member_id;

  const { data, error } = await supabase
    .from("trip_group_gear")
    .update(update)
    .eq("id", gearId)
    .eq("trip_id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gear: data });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id, gearId } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("trip_group_gear")
    .delete()
    .eq("id", gearId)
    .eq("trip_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
