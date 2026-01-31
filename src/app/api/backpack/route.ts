import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function getUserId(request: NextRequest): string | null {
  return request.headers.get("x-user-id");
}

interface BackpackRow {
  id: string;
  user_id: string;
  activity: string;
  temp_range: string;
  item_name: string;
  is_custom: boolean;
  is_hidden: boolean;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const userId = getUserId(request);

  const { searchParams } = new URL(request.url);
  const activity = searchParams.get("activity");
  const tempRange = searchParams.get("tempRange");

  if (!activity || !tempRange) {
    return NextResponse.json(
      { error: "activity and tempRange are required" },
      { status: 400 }
    );
  }

  if (!supabase) {
    return NextResponse.json({ items: [], hiddenDefaults: [] });
  }

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from("user_backpack_items")
      .select("*")
      .eq("user_id", userId)
      .eq("activity", activity)
      .eq("temp_range", tempRange);

    if (error) {
      console.error("Failed to fetch backpack items:", error);
      return NextResponse.json(
        { error: "Failed to fetch backpack items" },
        { status: 500 }
      );
    }

    const rows = (data || []) as BackpackRow[];
    const customItems = rows
      .filter((r) => r.is_custom)
      .map((r) => r.item_name);
    const hiddenDefaults = rows
      .filter((r) => !r.is_custom && r.is_hidden)
      .map((r) => r.item_name);

    return NextResponse.json({ items: customItems, hiddenDefaults });
  } catch (err) {
    console.error("Database error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const userId = getUserId(request);

  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { activity, tempRange, itemName } = body as {
      activity: string;
      tempRange: string;
      itemName: string;
    };

    if (!activity || !tempRange || !itemName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("user_backpack_items").upsert(
      {
        user_id: userId,
        activity,
        temp_range: tempRange,
        item_name: itemName,
        is_custom: true,
        is_hidden: false,
      },
      {
        onConflict: "user_id,activity,temp_range,item_name",
      }
    );

    if (error) {
      console.error("Failed to add backpack item:", error);
      return NextResponse.json(
        { error: "Failed to add item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error adding backpack item:", err);
    return NextResponse.json({ error: "Failed to add item" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  const userId = getUserId(request);

  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const activity = searchParams.get("activity");
    const tempRange = searchParams.get("tempRange");
    const itemName = searchParams.get("itemName");
    const isDefault = searchParams.get("isDefault") === "true";

    if (!activity || !tempRange || !itemName) {
      return NextResponse.json(
        { error: "Missing required query parameters" },
        { status: 400 }
      );
    }

    if (isDefault) {
      // Hide a default item by upserting with is_hidden=true
      const { error } = await supabase.from("user_backpack_items").upsert(
        {
          user_id: userId,
          activity,
          temp_range: tempRange,
          item_name: itemName,
          is_custom: false,
          is_hidden: true,
        },
        {
          onConflict: "user_id,activity,temp_range,item_name",
        }
      );

      if (error) {
        console.error("Failed to hide default item:", error);
        return NextResponse.json(
          { error: "Failed to hide item" },
          { status: 500 }
        );
      }
    } else {
      // Remove a custom item
      const { error } = await supabase
        .from("user_backpack_items")
        .delete()
        .eq("user_id", userId)
        .eq("activity", activity)
        .eq("temp_range", tempRange)
        .eq("item_name", itemName);

      if (error) {
        console.error("Failed to delete backpack item:", error);
        return NextResponse.json(
          { error: "Failed to delete item" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting backpack item:", err);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 }
    );
  }
}
