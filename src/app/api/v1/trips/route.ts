import { randomUUID } from "crypto";
import { parseTripCreation } from "@/lib/trip-creation";
import { NextRequest, NextResponse } from "next/server";
import { readJson, requireUser } from "@/lib/api";
import {
  classifyTripStatus,
  listTripsForUser,
} from "@/lib/trips";

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const trips = await listTripsForUser(supabase, userId);
  return NextResponse.json({ trips });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;
  const input = parseTripCreation(await readJson(request));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });

  const { data, error } = await supabase.rpc("create_trip_draft", {
    p_trip_id: input.creation_id ?? randomUUID(),
    p_owner_user_id: userId,
    p_name: input.name,
    p_start_date: input.start_date,
    p_end_date: input.end_date,
    p_status: classifyTripStatus(input.start_date, input.end_date),
    p_destination: input.destination ?? null,
    p_activity: input.activity ?? null,
  });
  if (error || !data?.trip) {
    return NextResponse.json(
      { error: error?.code === "42501" ? "Draft identity unavailable. Start a new draft." : "Couldn't save the trip. Retry with the same draft." },
      { status: error?.code === "42501" ? 409 : 500 }
    );
  }
  return NextResponse.json(data, { status: data.created ? 201 : 200 });
}
