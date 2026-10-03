import type { WardrobeItem } from "@/types/wardrobe";

interface WardrobeOverview {
  totalItems: number;
  excludedItems: number;
  /** Every item is excluded, so recommendations use none of them. */
  allExcluded: boolean;
  /** A quiet summary for the page header, e.g. "12 items · 3 excluded from recommendations". */
  countLine: string;
}

export function buildWardrobeOverview(wardrobeItems: WardrobeItem[]): WardrobeOverview {
  const totalItems = wardrobeItems.length;
  const excludedItems = wardrobeItems.filter((item) => item.disabled).length;
  const itemCount = `${totalItems} ${totalItems === 1 ? "item" : "items"}`;

  return {
    totalItems,
    excludedItems,
    allExcluded: totalItems > 0 && excludedItems === totalItems,
    countLine: excludedItems > 0 ? `${itemCount} · ${excludedItems} excluded from recommendations` : itemCount,
  };
}
