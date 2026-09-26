import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { requireTripAccess, generateInviteToken } from "@/lib/trips";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const body = await readJson(request);
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
