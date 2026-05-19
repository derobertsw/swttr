import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { assertCanAccessTrip } from "@/lib/trips";
import type { TripEffort, TripKitState } from "@/types/trips";

type RouteContext = { params: Promise<{ id: string; date: string; memberId: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase || !userId)
    return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const { id, date, memberId } = await ctx.params;
  const access = await assertCanAccessTrip(supabase, id, userId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const { items, effort, note, state } = (body ?? {}) as {
    items?: string[];
    effort?: TripEffort;
    note?: string | null;
    state?: TripKitState;
  };

  const { data: day } = await supabase
    .from("trip_days")
    .select("id")
    .eq("trip_id", id)
    .eq("date", date)
    .maybeSingle();
  if (!day) return NextResponse.json({ error: "Day not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("trip_member_day_kits")
    .upsert(
      {
        trip_day_id: day.id,
        trip_member_id: memberId,
        items: items ?? [],
        effort: effort ?? "steady",
        note: note ?? null,
        state: state ?? "ok",
      },
      { onConflict: "trip_day_id,trip_member_id" }
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kit: data });
}
