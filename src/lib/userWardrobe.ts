import type { SupabaseClient } from "@supabase/supabase-js";
import type { WardrobeItem } from "@/types/wardrobe";

// Loads every item the user has in their closet with the joined details
// (garment + thermal properties, or handwear/headwear). Disabled items are
// included — buildPackingListFromDays decides how to weight them.
//
// Detail rows are fetched in three batched queries (one per item_type) rather
// than per-entry to avoid N+1 fan-out on large wardrobes.
export async function fetchUserWardrobeItems(
  supabase: SupabaseClient,
  userId: string
): Promise<WardrobeItem[]> {
  const { data: entries, error } = await supabase
    .from("user_wardrobe")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !entries) return [];

  type DetailType = "garment" | "handwear" | "headwear";
  const idsByType: Record<DetailType, string[]> = {
    garment: [],
    handwear: [],
    headwear: [],
  };
  for (const e of entries as Array<{ item_type: string; item_id: string }>) {
    if (e.item_type === "garment" || e.item_type === "handwear" || e.item_type === "headwear") {
      idsByType[e.item_type as DetailType].push(e.item_id);
    }
  }

  const [garmentsRes, handwearRes, headwearRes] = await Promise.all([
    idsByType.garment.length > 0
      ? supabase
          .from("garments")
          .select("*, garment_thermal_properties(*)")
          .in("id", idsByType.garment)
      : Promise.resolve({ data: [] }),
    idsByType.handwear.length > 0
      ? supabase.from("handwear").select("*").in("id", idsByType.handwear)
      : Promise.resolve({ data: [] }),
    idsByType.headwear.length > 0
      ? supabase.from("headwear").select("*").in("id", idsByType.headwear)
      : Promise.resolve({ data: [] }),
  ]);

  const indexById = <T extends { id: string }>(rows: T[] | null) =>
    new Map<string, T>((rows ?? []).map((row) => [row.id, row]));

  const detailsByType = {
    garment: indexById((garmentsRes.data ?? []) as Array<{ id: string }>),
    handwear: indexById((handwearRes.data ?? []) as Array<{ id: string }>),
    headwear: indexById((headwearRes.data ?? []) as Array<{ id: string }>),
  };

  return entries.map((entry) => ({
    id: entry.id,
    item_type: entry.item_type,
    item_id: entry.item_id,
    nickname: entry.nickname ?? undefined,
    disabled: entry.disabled ?? false,
    created_at: entry.created_at,
    details:
      detailsByType[entry.item_type as keyof typeof detailsByType]?.get(entry.item_id) ?? null,
  })) as unknown as WardrobeItem[];
}
