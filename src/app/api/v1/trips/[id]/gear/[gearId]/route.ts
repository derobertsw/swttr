import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string; gearId: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id, gearId } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const body = await readJson(request);
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
  const { id, gearId } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const { error } = await supabase
    .from("trip_group_gear")
    .delete()
    .eq("id", gearId)
    .eq("trip_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
