import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Validate the wire format; the atomic database function enforces actor permissions. */
export async function changeSharedGear(supabase: SupabaseClient, tripId: string, userId: string, gearId: unknown, body: unknown) {
  if (typeof gearId !== "string" || !UUID.test(gearId) || !body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Reload shared gear and try again." }, { status: 400 });
  }
  const change = body as Record<string, unknown>;
  const actions = ["create", "assign", "accept", "decline", "pack", "unpack", "delete"];
  if (!actions.includes(change.action as string)
    || (change.action !== "create" && (typeof change.expected_revision !== "string" || !UUID.test(change.expected_revision)))
    || (["create", "assign"].includes(change.action as string) && change.assignee_member_id !== null
      && (typeof change.assignee_member_id !== "string" || !UUID.test(change.assignee_member_id)))
    || (change.action === "create" && (typeof change.description !== "string" || !change.description.trim() || change.description.trim().length > 200))) {
    return NextResponse.json({ error: "Review the item and reload shared gear before trying again." }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("update_trip_shared_gear", {
    p_trip: tripId, p_user: userId, p_id: gearId, p_change: change,
  });
  if (error) {
    const status = ({ P0409: 409, P0002: 404, "42501": 403, "22023": 400, "22P02": 400 } as Record<string, number>)[error.code] ?? 500;
    return NextResponse.json({ error: status === 500 ? "Couldn't save shared gear. Reload to check whether it saved, then try again." : error.message }, { status });
  }
  return NextResponse.json({ gear: data }, { status: change.action === "create" ? 201 : 200 });
}
