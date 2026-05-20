import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { buildPackingListFromDays } from "@/lib/packingList";
import { fetchUserWardrobeItems } from "@/lib/userWardrobe";
import type { DailyLayerPlan } from "@/types/plan";
import type { WardrobeItem } from "@/types/wardrobe";

export async function POST(request: NextRequest) {
  let body: {
    days: DailyLayerPlan[];
    itemMappings?: Record<string, string>;
  };

  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
    }
    body = parsed;
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
    const supabase = getSupabase();
    if (userId && supabase) {
      wardrobeItems = await fetchUserWardrobeItems(supabase, userId);
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
