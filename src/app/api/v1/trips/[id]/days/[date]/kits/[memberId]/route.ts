import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { canEditMemberKit } from "@/lib/trip-permissions";
import { requireTripAccess } from "@/lib/trips";
import type { TripEffort, TripKitState, TripMember } from "@/types/trips";

type RouteContext = { params: Promise<{ id: string; date: string; memberId: string }> };

const EFFORTS: TripEffort[] = ["easy", "steady", "hard"];
const STATES: TripKitState[] = ["ok", "warn", "missing"];

/**
 * Saves a member's day checklist: effort, category items, note and flag. A
 * member edits only their own; the organizer also edits the guests they
 * manage. A saved outfit on the kit (#170) is left as it is.
 */
export async function PUT(request: NextRequest, ctx: RouteContext) {
  const { id, date, memberId } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase, trip, userId } = auth;

  const body = await readJson(request);
  const { items, effort, note, state } = (body ?? {}) as {
    items?: unknown;
    effort?: unknown;
    note?: unknown;
    state?: unknown;
  };
  if ((items !== undefined && (!Array.isArray(items) || !items.every((item) => typeof item === "string" && item.length <= 40) || items.length > 20))
    || (effort !== undefined && !EFFORTS.includes(effort as TripEffort))
    || (state !== undefined && !STATES.includes(state as TripKitState))
    || (note !== undefined && note !== null && (typeof note !== "string" || note.length > 2000))) {
    return jsonError("Invalid kit", 400);
  }

  const { data: member } = await supabase
    .from("trip_members")
    .select("id, user_id, status")
    .eq("trip_id", id)
    .eq("id", memberId)
    .maybeSingle();
  if (!member || member.status === "left") return jsonError("Crew member not found", 404);
  if (!canEditMemberKit(trip, member as Pick<TripMember, "user_id">, userId)) {
    return jsonError("You can change only your own kit", 403);
  }

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
