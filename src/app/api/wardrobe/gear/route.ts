import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";

type ItemType = "garment" | "handwear" | "headwear" | "custom";

/**
 * GET /api/wardrobe/gear
 * Get user's wardrobe items with full details
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();

  if (!supabase) {
    return NextResponse.json({ items: [] });
  }

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 401 });
  }

  try {
    // Get user's wardrobe entries
    const { data: wardrobeItems, error } = await supabase
      .from("user_wardrobe")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch wardrobe:", error);
      return NextResponse.json(
        { error: "Failed to fetch wardrobe" },
        { status: 500 }
      );
    }

    // Fetch full details for each item
    const itemsWithDetails = await Promise.all(
      (wardrobeItems || []).map(async (entry) => {
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
        } else if (entry.item_type === "custom") {
          const { data } = await supabase
            .from("user_custom_items")
            .select("*")
            .eq("id", entry.item_id)
            .eq("user_id", userId)
            .single();

          itemDetails = data
            ? {
                brand: "Custom",
                model_name: data.custom_name,
                rcl_clo: data.rcl_clo,
                body_part: data.body_part,
                layer_type: data.layer_type,
                generic_option: data.generic_option,
                custom_name: data.custom_name,
              }
            : null;
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

    return NextResponse.json({ items: itemsWithDetails });
  } catch (err) {
    console.error("Database error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

/**
 * POST /api/wardrobe/gear
 * Add an item to user's wardrobe
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();

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
    const { item_type, item_id, nickname } = body as {
      item_type: ItemType;
      item_id: string;
      nickname?: string;
    };

    if (!item_type || !item_id) {
      return NextResponse.json(
        { error: "item_type and item_id are required" },
        { status: 400 }
      );
    }

    // Verify the item exists
    let itemExists = false;
    if (item_type === "garment") {
      const { data } = await supabase
        .from("garments")
        .select("id")
        .eq("id", item_id)
        .single();
      itemExists = !!data;
    } else if (item_type === "handwear") {
      const { data } = await supabase
        .from("handwear")
        .select("id")
        .eq("id", item_id)
        .single();
      itemExists = !!data;
    } else if (item_type === "headwear") {
      const { data } = await supabase
        .from("headwear")
        .select("id")
        .eq("id", item_id)
        .single();
      itemExists = !!data;
    } else if (item_type === "custom") {
      const { data } = await supabase
        .from("user_custom_items")
        .select("id")
        .eq("id", item_id)
        .eq("user_id", userId)
        .single();
      itemExists = !!data;
    }

    if (!itemExists) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("user_wardrobe")
      .insert({
        user_id: userId,
        item_type,
        item_id,
        nickname: nickname || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Item already in wardrobe" },
          { status: 409 }
        );
      }
      console.error("Failed to add item:", error);
      return NextResponse.json(
        { error: "Failed to add item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (err) {
    console.error("Error adding item:", err);
    return NextResponse.json({ error: "Failed to add item" }, { status: 500 });
  }
}

/**
 * PATCH /api/wardrobe/gear
 * Toggle disabled status for an item
 */
export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();

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
    const { id, disabled } = body as { id: string; disabled: boolean };

    if (!id || typeof disabled !== "boolean") {
      return NextResponse.json(
        { error: "id and disabled are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("user_wardrobe")
      .update({ disabled })
      .eq("id", id)
      .eq("user_id", userId)
      .select();

    if (error) {
      console.error("Failed to update item:", error);
      return NextResponse.json(
        { error: "Failed to update item" },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "Item not found or not owned by user" },
        { status: 404 }
      );
    }

    return NextResponse.json({ item: data[0] });
  } catch (err) {
    console.error("Error updating item:", err);
    return NextResponse.json(
      { error: "Failed to update item" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/wardrobe/gear
 * Remove an item from user's wardrobe
 */
export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  const userId = await getAuthUserId();

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
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("user_wardrobe")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to delete item:", error);
      return NextResponse.json(
        { error: "Failed to delete item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting item:", err);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 }
    );
  }
}
