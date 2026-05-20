import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { assertCanAccessTrip } from "@/lib/trips";

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
  const { description, assignee_member_id } = (body ?? {}) as {
    description?: string;
    assignee_member_id?: string | null;
  };
  if (!description)
    return NextResponse.json({ error: "description required" }, { status: 400 });

  const { data: existing } = await supabase
    .from("trip_group_gear")
    .select("sort_order")
    .eq("trip_id", id)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("trip_group_gear")
    .insert({
      trip_id: id,
      description,
      assignee_member_id: assignee_member_id ?? null,
      sort_order: nextSort,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gear: data }, { status: 201 });
}
