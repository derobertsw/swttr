import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError, readJson, requireUser } from "@/lib/api";

type ItemType = "garment" | "handwear" | "headwear" | "custom";
type Row = Record<string, unknown> & { id: string };

/** Where each wardrobe item type's details live. */
const ITEM_TABLES: Record<ItemType, { table: string; select: string; ownedByUser: boolean }> = {
  garment: { table: "garments", select: "*, garment_thermal_properties(*)", ownedByUser: false },
  handwear: { table: "handwear", select: "*", ownedByUser: false },
  headwear: { table: "headwear", select: "*", ownedByUser: false },
  custom: { table: "user_custom_items", select: "*", ownedByUser: true },
};

function isItemType(value: unknown): value is ItemType {
  return typeof value === "string" && value in ITEM_TABLES;
}

/** Fetch one item type's rows for the given ids, keyed by id. */
async function fetchDetails(
  supabase: SupabaseClient,
  userId: string,
  itemType: ItemType,
  ids: string[]
): Promise<Map<string, Row>> {
  if (ids.length === 0) return new Map();
  const { table, select, ownedByUser } = ITEM_TABLES[itemType];
  let query = supabase.from(table).select(select).in("id", ids);
  if (ownedByUser) query = query.eq("user_id", userId);
  const { data } = await query;
  return new Map(((data ?? []) as unknown as Row[]).map((row) => [row.id, row]));
}

function customItemDetails(row: Row) {
  return {
    brand: "Custom",
    model_name: row.custom_name,
    rcl_clo: row.rcl_clo,
    body_part: row.body_part,
    layer_type: row.layer_type,
    generic_option: row.generic_option,
    custom_name: row.custom_name,
  };
}

/**
 * GET /api/wardrobe/gear
 * Get user's wardrobe items with full details
 */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  try {
    const { data: wardrobeItems, error } = await supabase
      .from("user_wardrobe")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch wardrobe:", error);
      return jsonError("Failed to fetch wardrobe", 500);
    }

    const entries = wardrobeItems ?? [];
    const itemTypes = Object.keys(ITEM_TABLES) as ItemType[];
    const detailsByType = new Map(
      await Promise.all(
        itemTypes.map(async (itemType) => {
          const ids = entries.filter((e) => e.item_type === itemType).map((e) => e.item_id);
          return [itemType, await fetchDetails(supabase, userId, itemType, ids)] as const;
        })
      )
    );

    const items = entries.map((entry) => {
      const row = isItemType(entry.item_type)
        ? detailsByType.get(entry.item_type)?.get(entry.item_id)
        : undefined;
      const details = row ? (entry.item_type === "custom" ? customItemDetails(row) : row) : null;

      return {
        id: entry.id,
        item_type: entry.item_type,
        item_id: entry.item_id,
        nickname: entry.nickname,
        disabled: entry.disabled ?? false,
        created_at: entry.created_at,
        details,
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    console.error("Database error:", err);
    return jsonError("Database error", 500);
  }
}

/**
 * POST /api/wardrobe/gear
 * Add an item to user's wardrobe
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const { item_type, item_id, nickname } = ((await readJson(request)) ?? {}) as {
    item_type?: ItemType;
    item_id?: string;
    nickname?: string;
  };

  if (!item_type || !item_id) {
    return jsonError("item_type and item_id are required", 400);
  }

  try {
    // Verify the item exists (custom items must also belong to the user)
    const existing = isItemType(item_type)
      ? await fetchDetails(supabase, userId, item_type, [item_id])
      : new Map();
    if (!existing.has(item_id)) {
      return jsonError("Item not found", 404);
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
        return jsonError("Item already in wardrobe", 409);
      }
      console.error("Failed to add item:", error);
      return jsonError("Failed to add item", 500);
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (err) {
    console.error("Error adding item:", err);
    return jsonError("Failed to add item", 500);
  }
}

/**
 * PATCH /api/wardrobe/gear
 * Toggle disabled status for an item
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const { id, disabled } = ((await readJson(request)) ?? {}) as { id?: string; disabled?: unknown };

  if (!id || typeof disabled !== "boolean") {
    return jsonError("id and disabled are required", 400);
  }

  try {
    const { data, error } = await supabase
      .from("user_wardrobe")
      .update({ disabled })
      .eq("id", id)
      .eq("user_id", userId)
      .select();

    if (error) {
      console.error("Failed to update item:", error);
      return jsonError("Failed to update item", 500);
    }

    if (!data || data.length === 0) {
      return jsonError("Item not found or not owned by user", 404);
    }

    return NextResponse.json({ item: data[0] });
  } catch (err) {
    console.error("Error updating item:", err);
    return jsonError("Failed to update item", 500);
  }
}

/**
 * DELETE /api/wardrobe/gear?id=<wardrobe entry id>
 * Remove an item from user's wardrobe
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return jsonError("id query parameter required", 400);
  }

  try {
    const { error } = await supabase
      .from("user_wardrobe")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to delete item:", error);
      return jsonError("Failed to delete item", 500);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting item:", err);
    return jsonError("Failed to delete item", 500);
  }
}
