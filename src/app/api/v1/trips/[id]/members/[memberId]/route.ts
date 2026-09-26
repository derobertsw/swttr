import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string; memberId: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id, memberId } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const body = await readJson(request);
  const update: Record<string, unknown> = {};
  if (typeof body?.display_name === "string") update.display_name = body.display_name;
  if (typeof body?.role === "string") update.role = body.role;
  if (typeof body?.status === "string") update.status = body.status;

  const { data, error } = await supabase
    .from("trip_members")
    .update(update)
    .eq("id", memberId)
    .eq("trip_id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id, memberId } = await ctx.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const { data: target } = await supabase
    .from("trip_members")
    .select("role")
    .eq("id", memberId)
    .eq("trip_id", id)
    .maybeSingle();
  if (target?.role === "organizer")
    return NextResponse.json({ error: "Cannot remove organizer" }, { status: 400 });

  const { error } = await supabase
    .from("trip_members")
    .delete()
    .eq("id", memberId)
    .eq("trip_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Unassign any group gear held by this member.
  await supabase
    .from("trip_group_gear")
    .update({ assignee_member_id: null })
    .eq("trip_id", id)
    .eq("assignee_member_id", memberId);

  return NextResponse.json({ ok: true });
}
