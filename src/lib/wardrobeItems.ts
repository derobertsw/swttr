type Row = Record<string, unknown> & { id: string };

interface WardrobeEntry {
  id: string;
  item_type: string;
  item_id: string;
  nickname?: string | null;
  disabled?: boolean | null;
  created_at?: string;
}

/** A custom item's row, in the shape the wardrobe shows catalog items in. */
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
 * One wardrobe entry joined with its item's details, as the wardrobe API
 * returns it. `details` is null when the item no longer exists.
 */
export function toWardrobeItem(entry: WardrobeEntry, row: Row | undefined) {
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
}
