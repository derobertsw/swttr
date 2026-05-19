import type { SupabaseClient } from "@supabase/supabase-js";
import type { WardrobeItem } from "@/types/wardrobe";

// Loads every item the user has in their closet with the joined details
// (garment + thermal properties, or handwear/headwear). Disabled items are
// included — buildPackingListFromDays decides how to weight them.
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

  return Promise.all(
    entries.map(async (entry) => {
      let details = null;
      if (entry.item_type === "garment") {
        const { data } = await supabase
          .from("garments")
          .select("*, garment_thermal_properties(*)")
          .eq("id", entry.item_id)
          .single();
        details = data;
      } else if (entry.item_type === "handwear") {
        const { data } = await supabase
          .from("handwear")
          .select("*")
          .eq("id", entry.item_id)
          .single();
        details = data;
      } else if (entry.item_type === "headwear") {
        const { data } = await supabase
          .from("headwear")
          .select("*")
          .eq("id", entry.item_id)
          .single();
        details = data;
      }
      return {
        id: entry.id,
        item_type: entry.item_type,
        item_id: entry.item_id,
        nickname: entry.nickname,
        disabled: entry.disabled ?? false,
        created_at: entry.created_at,
        details,
      };
    })
  );
}
