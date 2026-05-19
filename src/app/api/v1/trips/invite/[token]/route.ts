import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";

type RouteContext = { params: Promise<{ token: string }> };

// GET — public preview of an invite. Returns trip name/dates so the landing
// page can render before the user signs in.
export async function GET(_request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  if (!supabase)
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { token } = await ctx.params;
  const { data: member } = await supabase
    .from("trip_members")
    .select("id, trip_id, display_name, status, role")
    .eq("invite_token", token)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  const { data: trip } = await supabase
    .from("trips")
    .select("id, name, start_date, end_date")
    .eq("id", member.trip_id)
    .maybeSingle();
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });

  const { data: organizer } = await supabase
    .from("trip_members")
    .select("display_name")
    .eq("trip_id", trip.id)
    .eq("role", "organizer")
    .maybeSingle();

  return NextResponse.json({
    invite: {
      display_name: member.display_name,
      status: member.status,
    },
    trip: {
      id: trip.id,
      name: trip.name,
      start_date: trip.start_date,
      end_date: trip.end_date,
    },
    organizer_name: organizer?.display_name ?? null,
  });
}

// POST — accept the invite. Requires a signed-in Clerk user.
export async function POST(_request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase)
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  if (!userId)
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { token } = await ctx.params;

  const { data: member } = await supabase
    .from("trip_members")
    .select("id, trip_id, status, user_id")
    .eq("invite_token", token)
    .maybeSingle();
  if (!member)
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (member.status === "joined" && member.user_id === userId) {
    return NextResponse.json({ trip_id: member.trip_id, already_joined: true });
  }

  // If this Clerk user is already on the trip via another row, don't dupe.
  const { data: existing } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", member.trip_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    // Best-effort: clear the dangling invite row so the token can't be reused.
    await supabase.from("trip_members").delete().eq("id", member.id);
    return NextResponse.json({ trip_id: member.trip_id, already_joined: true });
  }

  const { error } = await supabase
    .from("trip_members")
    .update({
      user_id: userId,
      status: "joined",
      invite_token: null,
    })
    .eq("id", member.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ trip_id: member.trip_id, already_joined: false });
}
