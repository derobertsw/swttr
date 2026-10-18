import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess, generateInviteToken } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string; memberId: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id, memberId } = await ctx.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const body = await readJson(request);
  if (body?.invite_action === "revoke" || body?.invite_action === "replace") {
    if (body.invite_token !== null && typeof body.invite_token !== "string") {
      return NextResponse.json({ error: "Refresh the crew and try again." }, { status: 400 });
    }
    const query = supabase.from("trip_members")
      .update({ invite_token: body.invite_action === "replace" ? generateInviteToken() : null })
      .eq("id", memberId).eq("trip_id", id).eq("status", "invited");
    const { data, error } = await (body.invite_token === null
      ? query.is("invite_token", null) : query.eq("invite_token", body.invite_token)).select("*").maybeSingle();
    if (error) return NextResponse.json({ error: "Couldn't change the invite link. Try again." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "This invitation changed or was already joined. Refresh the crew." }, { status: 409 });
    return NextResponse.json({ member: data });
  }
  // Membership and account claims may only change through invitation acceptance.
  if (typeof body?.display_name !== "string" || !body.display_name.trim() || "role" in body || "status" in body) {
    return NextResponse.json({ error: "Provide a display name. Membership changes require an invite link." }, { status: 400 });
  }
  const { data, error } = await supabase.from("trip_members")
    .update({ display_name: body.display_name.trim() }).eq("id", memberId).eq("trip_id", id)
    .select("*").maybeSingle();
  if (error) return NextResponse.json({ error: "Couldn't update this person. Try again." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ member: { ...data, invite_token: data.status === "invited" ? data.invite_token : null } });
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

  // The database trigger releases shared gear in the same transaction as removal.
  return NextResponse.json({ ok: true });
}
