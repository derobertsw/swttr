import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import type { BodyPart, LayerType } from "@/types/wardrobe";
import { getGenericLayerClo } from "@/data/genericLayerClo";
import { logError } from "@/lib/logger";

/**
 * POST /api/wardrobe/custom
 * Create a new custom item and add it to the wardrobe
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    const userId = await getAuthUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { body_part, layer_type, generic_option, custom_name } = body as {
      body_part: BodyPart;
      layer_type: LayerType;
      generic_option: string;
      custom_name: string;
    };

    // Validate inputs
    if (!body_part || !layer_type || !generic_option || !custom_name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (custom_name.trim().length === 0 || custom_name.length > 50) {
      return NextResponse.json(
        { error: "Custom name must be between 1 and 50 characters" },
        { status: 400 }
      );
    }

    // Look up CLO value from generic layer data
    const rcl_clo = getGenericLayerClo(body_part, layer_type, generic_option);

    if (rcl_clo === 0) {
      return NextResponse.json(
        { error: "Invalid generic option for this body part and layer type" },
        { status: 400 }
      );
    }

    // Insert into user_custom_items
    const { data: customItem, error: insertError } = await supabase
      .from("user_custom_items")
      .insert({
        user_id: userId,
        body_part,
        layer_type,
        generic_option,
        custom_name: custom_name.trim(),
        rcl_clo,
      })
      .select()
      .single();

    if (insertError) {
      // Check for duplicate constraint violation
      if (insertError.code === "23505") {
        return NextResponse.json(
          {
            error: `You already have a custom ${generic_option} ${layer_type} layer for ${body_part}`,
          },
          { status: 409 }
        );
      }
      logError("POST /api/wardrobe/custom - insert custom item", insertError);
      return NextResponse.json(
        { error: "Failed to create custom item" },
        { status: 500 }
      );
    }

    // Add to user_wardrobe
    const { error: wardrobeError } = await supabase
      .from("user_wardrobe")
      .insert({
        user_id: userId,
        item_type: "custom",
        item_id: customItem.id,
      });

    if (wardrobeError) {
      // If wardrobe insert fails, clean up the custom item
      await supabase.from("user_custom_items").delete().eq("id", customItem.id);
      logError("POST /api/wardrobe/custom - insert wardrobe", wardrobeError);
      return NextResponse.json(
        { error: "Failed to add item to wardrobe" },
        { status: 500 }
      );
    }

    return NextResponse.json({ item: customItem }, { status: 201 });
  } catch (error) {
    logError("POST /api/wardrobe/custom", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/wardrobe/custom
 * Update a custom item's name
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    const userId = await getAuthUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, custom_name } = body as { id: string; custom_name: string };

    if (!id || !custom_name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (custom_name.trim().length === 0 || custom_name.length > 50) {
      return NextResponse.json(
        { error: "Custom name must be between 1 and 50 characters" },
        { status: 400 }
      );
    }

    // Update the custom item (RLS ensures user can only update their own)
    const { data, error } = await supabase
      .from("user_custom_items")
      .update({ custom_name: custom_name.trim() })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      logError("PATCH /api/wardrobe/custom", error);
      return NextResponse.json(
        { error: "Failed to update custom item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    logError("PATCH /api/wardrobe/custom", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/wardrobe/custom?id=<custom_item_id>
 * Delete a custom item and remove from wardrobe
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    const userId = await getAuthUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing item id" }, { status: 400 });
    }

    // Delete from user_wardrobe first
    const { error: wardrobeDeleteError } = await supabase
      .from("user_wardrobe")
      .delete()
      .eq("item_type", "custom")
      .eq("item_id", id)
      .eq("user_id", userId);

    if (wardrobeDeleteError) {
      logError("DELETE /api/wardrobe/custom - wardrobe delete", wardrobeDeleteError);
      return NextResponse.json(
        { error: "Failed to remove item from wardrobe" },
        { status: 500 }
      );
    }

    // Delete from user_custom_items
    const { error } = await supabase
      .from("user_custom_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      logError("DELETE /api/wardrobe/custom", error);
      return NextResponse.json(
        { error: "Failed to delete custom item" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("DELETE /api/wardrobe/custom", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
