import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import {
  classifyTripStatus,
  enumerateDates,
  listTripsForUser,
} from "@/lib/trips";

export async function GET() {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase) return NextResponse.json({ trips: [] });
  if (!userId) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const trips = await listTripsForUser(supabase, userId);
  return NextResponse.json({ trips });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();
  if (!supabase)
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  if (!userId) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { name, start_date, end_date } = (body ?? {}) as {
    name?: string;
    start_date?: string;
    end_date?: string;
  };

  if (!name || !start_date || !end_date) {
    return NextResponse.json(
      { error: "name, start_date, end_date required" },
      { status: 400 }
    );
  }
  if (start_date > end_date) {
    return NextResponse.json(
      { error: "start_date must be on or before end_date" },
      { status: 400 }
    );
  }

  const status = classifyTripStatus(start_date, end_date);

  const { data: trip, error } = await supabase
    .from("trips")
    .insert({
      owner_user_id: userId,
      name,
      start_date,
      end_date,
      status,
    })
    .select("*")
    .single();

  if (error || !trip) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create trip" },
      { status: 500 }
    );
  }

  // Seed the day rows up front so day-detail joins are simple.
  const dates = enumerateDates(start_date, end_date);
  if (dates.length > 0) {
    await supabase
      .from("trip_days")
      .insert(dates.map((d) => ({ trip_id: trip.id, date: d })));
  }

  // Organizer is the first member.
  await supabase.from("trip_members").insert({
    trip_id: trip.id,
    user_id: userId,
    display_name: "You",
    role: "organizer",
    status: "joined",
  });

  return NextResponse.json({ trip }, { status: 201 });
}
