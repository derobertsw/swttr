import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { buildPackingListFromDays } from "@/lib/packingList";
import type { DailyLayerPlan } from "@/types/plan";
import type { WardrobeItem } from "@/types/wardrobe";

async function fetchUserWardrobeItems(userId: string): Promise<WardrobeItem[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: wardrobeEntries, error } = await supabase
    .from("user_wardrobe")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !wardrobeEntries) return [];

  const itemsWithDetails = await Promise.all(
    wardrobeEntries.map(async (entry) => {
      let itemDetails = null;

      if (entry.item_type === "garment") {
        const { data } = await supabase
          .from("garments")
          .select("*, garment_thermal_properties(*)")
          .eq("id", entry.item_id)
          .single();
        itemDetails = data;
      } else if (entry.item_type === "handwear") {
        const { data } = await supabase
          .from("handwear")
          .select("*")
          .eq("id", entry.item_id)
          .single();
        itemDetails = data;
      } else if (entry.item_type === "headwear") {
        const { data } = await supabase
          .from("headwear")
          .select("*")
          .eq("id", entry.item_id)
          .single();
        itemDetails = data;
      }

      return {
        id: entry.id,
        item_type: entry.item_type,
        item_id: entry.item_id,
        nickname: entry.nickname,
        disabled: entry.disabled ?? false,
        created_at: entry.created_at,
        details: itemDetails,
      };
    })
  );

  return itemsWithDetails;
}

export async function POST(request: NextRequest) {
  let body: {
    days: DailyLayerPlan[];
    itemMappings?: Record<string, string>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { days, itemMappings: rawMappings } = body;

  if (!Array.isArray(days) || days.length === 0) {
    return NextResponse.json(
      { error: "days array is required and must not be empty" },
      { status: 400 }
    );
  }

  const itemMappings = new Map(Object.entries(rawMappings ?? {}));

  // Fetch wardrobe if user is authenticated
  let wardrobeItems: WardrobeItem[] = [];
  try {
    const userId = await getAuthUserId();
    if (userId) {
      wardrobeItems = await fetchUserWardrobeItems(userId);
    }
  } catch {
    // Continue without wardrobe data
  }

  const packingList = buildPackingListFromDays(days, itemMappings, wardrobeItems);
  const dailyPackingLists = days.map((day) => ({
    day,
    packing: buildPackingListFromDays([day], itemMappings, wardrobeItems),
  }));

  return NextResponse.json({ packingList, dailyPackingLists });
}
