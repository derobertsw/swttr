import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";

type RouteContext = { params: Promise<{ token: string }> };
const unavailable = () => NextResponse.json({ state: "unavailable", error: "This invitation is unavailable. Ask the organizer for a new link, or check My trips." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
const failed = () => NextResponse.json({ error: "Couldn't load the invitation. Try again." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });

// Pending links permit a limited public preview. A claimed link resolves only
// for its accepting account; everyone else sees the same response as a bad token.
export async function GET(_request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  if (!supabase) return failed();
  const { token } = await ctx.params;
  const { data: member, error } = await supabase
    .from("trip_members")
    .select("id, trip_id, display_name, status, user_id")
    .eq("invite_token", token)
    .maybeSingle();
  if (error) return failed();
  if (!member) return unavailable();

  const userId = await getAuthUserId();
  const joined = member.status === "joined" && member.user_id === userId && !!userId;
  if (!joined && (member.status !== "invited" || member.user_id)) return unavailable();

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id, name, start_date, end_date")
    .eq("id", member.trip_id)
    .maybeSingle();
  if (tripError) return failed();
  if (!trip) return unavailable();

  const { data: organizer, error: organizerError } = await supabase
    .from("trip_members")
    .select("display_name")
    .eq("trip_id", trip.id)
    .eq("role", "organizer")
    .maybeSingle();
  if (organizerError) return failed();

  return NextResponse.json({
    state: joined ? "joined" : "available",
    invite: { display_name: member.display_name, status: member.status },
    trip: { id: trip.id, name: trip.name, start_date: trip.start_date, end_date: trip.end_date },
    organizer_name: organizer?.display_name ?? null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(_request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase) return failed();
  if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { token } = await ctx.params;
  const { data: member, error } = await supabase
    .from("trip_members")
    .select("id, trip_id, status, user_id")
    .eq("invite_token", token)
    .maybeSingle();
  if (error) return failed();
  if (!member) return unavailable();
  if (member.status === "joined" && member.user_id === userId) {
    return NextResponse.json({ trip_id: member.trip_id, already_joined: true });
  }
  if (member.status !== "invited" || member.user_id) return unavailable();

  const existingMembership = () => supabase.from("trip_members")
    .select("id").eq("trip_id", member.trip_id).eq("user_id", userId).eq("status", "joined").maybeSingle();
  const { data: existing, error: existingError } = await existingMembership();
  if (existingError) return failed();
  // Never delete another person's pending invitation (or their prepared kits).
  if (existing) return NextResponse.json({ trip_id: member.trip_id, already_joined: true });

  // Keep the token as a recovery handle, but only pending rows can be claimed.
  // These predicates also serialize a claim against revoke/replace operations.
  const { data: accepted, error: claimError } = await supabase
    .from("trip_members")
    .update({ user_id: userId, status: "joined" })
    .eq("id", member.id).eq("invite_token", token).eq("status", "invited")
    .select("trip_id").maybeSingle();
  if (claimError && claimError.code !== "23505") return failed();
  if (!accepted) {
    // Lost response, simultaneous retries, or another invitation claimed by
    // this account: the trip/user unique index prevents duplicate membership.
    const { data: recovered, error: recoveryError } = await existingMembership();
    if (recoveryError) return failed();
    if (recovered) return NextResponse.json({ trip_id: member.trip_id, already_joined: true });
    return unavailable();
  }
  return NextResponse.json({ trip_id: accepted.trip_id, already_joined: false });
}
