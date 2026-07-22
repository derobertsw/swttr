import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { assertCanAccessTrip } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string }> };

// GET — unread nudges addressed to the current Clerk user on this trip.
// Joins the sender's display name so the toast can attribute the nudge.
export async function GET(_request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: me } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", id)
    .eq("user_id", userId)
    .neq("status", "left")
    .maybeSingle();
  if (!me) return NextResponse.json({ nudges: [] });

  const { data: nudges } = await supabase
    .from("trip_nudges")
    .select("*, sender:trip_members!sender_member_id(display_name)")
    .eq("trip_id", id)
    .eq("recipient_member_id", me.id)
    .is("read_at", null)
    .order("created_at", { ascending: true });

  const flattened = (nudges ?? []).map((n) => ({
    id: n.id,
    trip_id: n.trip_id,
    sender_member_id: n.sender_member_id,
    recipient_member_id: n.recipient_member_id,
    message: n.message,
    created_at: n.created_at,
    read_at: n.read_at,
    sender_display_name: n.sender?.display_name ?? null,
  }));

  return NextResponse.json({ nudges: flattened });
}

// POST — send a nudge. Body: { recipient_member_id, message? }
export async function POST(request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const { recipient_member_id, message } = (body ?? {}) as {
    recipient_member_id?: string;
    message?: string;
  };
  if (!recipient_member_id)
    return NextResponse.json({ error: "recipient_member_id required" }, { status: 400 });

  const { data: sender } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", id)
    .eq("user_id", userId)
    .neq("status", "left")
    .maybeSingle();
  if (!sender)
    return NextResponse.json({ error: "Not a member of this trip" }, { status: 403 });

  // Verify the recipient is also a member of the same trip.
  const { data: recipient } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", id)
    .eq("id", recipient_member_id)
    .neq("status", "left")
    .maybeSingle();
  if (!recipient)
    return NextResponse.json({ error: "Recipient not on trip" }, { status: 404 });

  if (recipient.id === sender.id)
    return NextResponse.json({ error: "Cannot nudge yourself" }, { status: 400 });

  const { data, error } = await supabase
    .from("trip_nudges")
    .insert({
      trip_id: id,
      sender_member_id: sender.id,
      recipient_member_id: recipient.id,
      message: typeof message === "string" && message.trim().length > 0 ? message.trim() : null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ nudge: data }, { status: 201 });
}
