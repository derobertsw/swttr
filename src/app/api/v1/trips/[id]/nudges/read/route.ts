import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { assertCanAccessTrip } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string }> };

// POST — mark a batch of nudges as read. Body: { ids: string[] }
// Only allowed to mark nudges that were addressed to the current user.
export async function POST(request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const ids = (body?.ids ?? []) as string[];
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const { data: me } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!me) return NextResponse.json({ ok: true, updated: 0 });

  const { error, count } = await supabase
    .from("trip_nudges")
    .update({ read_at: new Date().toISOString() }, { count: "exact" })
    .in("id", ids)
    .eq("recipient_member_id", me.id)
    .is("read_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, updated: count ?? 0 });
}
