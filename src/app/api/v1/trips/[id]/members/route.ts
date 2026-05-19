import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { assertCanAccessTrip, generateInviteToken } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const { display_name, kind } = (body ?? {}) as {
    display_name?: string;
    kind?: "invite" | "guest";
  };
  if (!display_name || !kind)
    return NextResponse.json(
      { error: "display_name and kind required" },
      { status: 400 }
    );

  const row =
    kind === "guest"
      ? {
          trip_id: id,
          user_id: null,
          display_name,
          role: "guest" as const,
          status: "guest" as const,
        }
      : {
          trip_id: id,
          user_id: null,
          display_name,
          role: "member" as const,
          status: "invited" as const,
          invite_token: generateInviteToken(),
        };

  const { data, error } = await supabase
    .from("trip_members")
    .insert(row)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data }, { status: 201 });
}
