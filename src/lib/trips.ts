import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import type {
  Trip,
  TripDay,
  TripFull,
  TripGroupGear,
  TripMember,
  TripMemberDayKit,
  TripStop,
  TripSummary,
} from "@/types/trips";

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function enumerateDates(startISO: string, endISO: string): string[] {
  const start = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  const out: string[] = [];
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function assertCanAccessTrip(
  supabase: SupabaseClient,
  tripId: string,
  userId: string
): Promise<Trip | null> {
  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return null;
  if (trip.owner_user_id === userId) return trip as Trip;

  const { data: membership } = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .neq("status", "left")
    .maybeSingle();
  return membership ? (trip as Trip) : null;
}

export async function listTripsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<TripSummary[]> {
  const { data: owned } = await supabase
    .from("trips")
    .select("*")
    .eq("owner_user_id", userId);

  const { data: memberships } = await supabase
    .from("trip_members")
    .select("trip_id")
    .eq("user_id", userId)
    .neq("status", "left");

  const memberTripIds = (memberships ?? []).map((m) => m.trip_id);
  const ownedIds = new Set((owned ?? []).map((t) => t.id));
  const extraTripIds = memberTripIds.filter((id) => !ownedIds.has(id));

  let extras: Trip[] = [];
  if (extraTripIds.length > 0) {
    const { data } = await supabase
      .from("trips")
      .select("*")
      .in("id", extraTripIds);
    extras = (data ?? []) as Trip[];
  }

  const all = [...(owned ?? []), ...extras] as Trip[];

  if (all.length === 0) return [];

  const ids = all.map((t) => t.id);
  const [{ data: stops }, { data: members }] = await Promise.all([
    supabase.from("trip_stops").select("trip_id").in("trip_id", ids),
    supabase
      .from("trip_members")
      .select("trip_id, status")
      .in("trip_id", ids)
      .neq("status", "left"),
  ]);

  const stopCount = new Map<string, number>();
  for (const s of stops ?? []) {
    stopCount.set(s.trip_id, (stopCount.get(s.trip_id) ?? 0) + 1);
  }
  const memberCount = new Map<string, number>();
  for (const m of members ?? []) {
    memberCount.set(m.trip_id, (memberCount.get(m.trip_id) ?? 0) + 1);
  }

  return all
    .map((t) => ({
      ...t,
      stop_count: stopCount.get(t.id) ?? 0,
      member_count: memberCount.get(t.id) ?? 0,
    }))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

export async function loadTripFull(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripFull | null> {
  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return null;

  const [stopsRes, membersRes, daysRes, gearRes] = await Promise.all([
    supabase.from("trip_stops").select("*").eq("trip_id", tripId).order("position"),
    supabase.from("trip_members").select("*").eq("trip_id", tripId),
    supabase.from("trip_days").select("*").eq("trip_id", tripId).order("date"),
    supabase
      .from("trip_group_gear")
      .select("*")
      .eq("trip_id", tripId)
      .order("sort_order"),
  ]);

  const days = (daysRes.data ?? []) as TripDay[];
  let kits: TripMemberDayKit[] = [];
  if (days.length > 0) {
    const { data } = await supabase
      .from("trip_member_day_kits")
      .select("*")
      .in(
        "trip_day_id",
        days.map((d) => d.id)
      );
    kits = (data ?? []) as TripMemberDayKit[];
  }

  return {
    trip: trip as Trip,
    stops: (stopsRes.data ?? []) as TripStop[],
    members: (membersRes.data ?? []) as TripMember[],
    days,
    kits,
    gear: (gearRes.data ?? []) as TripGroupGear[],
  };
}

export function classifyTripStatus(
  startISO: string,
  endISO: string,
  todayISO = new Date().toISOString().slice(0, 10)
): "planning" | "next_up" | "live" | "past" {
  if (endISO < todayISO) return "past";
  if (startISO <= todayISO && todayISO <= endISO) return "live";
  const start = new Date(`${startISO}T00:00:00Z`).getTime();
  const today = new Date(`${todayISO}T00:00:00Z`).getTime();
  const days = Math.round((start - today) / 86400000);
  return days <= 14 ? "next_up" : "planning";
}
