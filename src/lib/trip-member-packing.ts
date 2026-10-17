import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enumerateDates } from "@/lib/trips";
import { TOUR_ACTIVITY } from "@/lib/trip-activities";
import { resolveTripStop } from "@/lib/trip-forecast";
import { packingFromOutfits, type DayOutfit } from "@/lib/trip-packing";
import type { TripFull } from "@/types/trips";

/**
 * Reading a member's own packing list (#177, #171, #212) for the pack routes:
 * their kits, item names and saved choices.
 */

/** The member's own row on the trip, which their packing list belongs to. */
export function myMemberOf(full: TripFull, userId: string) {
  return full.members.find((member) => member.user_id === userId && member.status !== "left");
}

/** The member's kits on the trip's days, each with its date. */
export function myKits(full: TripFull, memberId: string | undefined) {
  const dates = new Set(enumerateDates(full.trip.start_date, full.trip.end_date));
  return full.kits.flatMap((kit) => {
    const day = full.days.find((candidate) => candidate.id === kit.trip_day_id);
    return memberId && kit.trip_member_id === memberId && day && dates.has(day.date) ? [{ date: day.date, kit }] : [];
  });
}

export type MappingRow = { body_part: string; layer_type: string; standard_option: string; custom_name: string };

export function readMappings(supabase: SupabaseClient, userId: string) {
  return supabase
    .from("user_item_mappings")
    .select("body_part, layer_type, standard_option, custom_name")
    .eq("user_id", userId);
}

/** "bodyPart:layerType:name" for each name the user gave one of their own items. */
export function mappedNames(rows: MappingRow[]): Set<string> {
  return new Set(rows.map((row) => `${row.body_part}:${row.layer_type}:${String(row.custom_name).trim()}`));
}

/** The member's outfits as packing items, with the person's own item names. */
export function itemsFromKits(kits: ReturnType<typeof myKits>, mapped: Set<string>) {
  const outfits: DayOutfit[] = kits.flatMap(({ date, kit }) => kit.outfit ? [{ date, outfit: kit.outfit, savedAt: kit.outfit_saved_at ?? null }] : []);
  return packingFromOutfits(outfits, mapped);
}

/** Calls update_trip_packing, which applies one change to the member's own list. */
export function updatePacking(supabase: SupabaseClient, tripId: string, userId: string, op: Record<string, unknown>) {
  return supabase.rpc("update_trip_packing", { p_trip_id: tripId, p_user_id: userId, p_op: op });
}

/**
 * The trip's Backcountry days, which touring equipment is for: each day's own
 * activity, or its stop's first, as the day page shows it.
 */
export function touringDates(full: Pick<TripFull, "trip" | "days" | "stops">): string[] {
  return enumerateDates(full.trip.start_date, full.trip.end_date).filter((date) => {
    const day = full.days.find((candidate) => candidate.date === date);
    return !!day && (day.activity || resolveTripStop(day, full.stops)?.activities[0]) === TOUR_ACTIVITY;
  });
}

type SavedPacking = { items?: unknown; quantities?: unknown; seen?: unknown; checks?: unknown; equipment?: unknown };

/**
 * The member's saved choices. `readable` is false when they can't be read, so
 * the list can't be changed either; `equipment` is false before migration 032,
 * when everything else still reads and saves.
 */
export async function readMemberPacking(supabase: SupabaseClient, memberId: string): Promise<{
  saved: SavedPacking | null;
  readable: boolean;
  equipment: boolean;
}> {
  const read = (columns: string) => supabase.from("trip_member_packing").select(columns).eq("trip_member_id", memberId).maybeSingle();
  const withEquipment = await read("items, quantities, seen, checks, equipment");
  if (!withEquipment.error) return { saved: withEquipment.data as SavedPacking | null, readable: true, equipment: true };
  if (withEquipment.error.code !== "42703") return { saved: null, readable: false, equipment: false };
  const without = await read("items, quantities, seen, checks");
  return without.error
    ? { saved: null, readable: false, equipment: false }
    : { saved: without.data as SavedPacking | null, readable: true, equipment: false };
}
