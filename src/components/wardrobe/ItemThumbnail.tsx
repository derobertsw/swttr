import type { WardrobeItem } from "@/types/wardrobe";
import { cn } from "@/lib/utils";
import { ItemImage } from "./ItemImage";
import { ItemIcon } from "./wardrobe-utils";

/**
 * A small product photo (or category silhouette), or an icon for a custom
 * item. Catalog photos have white backgrounds, so their well stays white in
 * both appearances.
 */
export function ItemThumbnail({ item, className }: { item: WardrobeItem; className?: string }) {
  if (item.item_type === "custom") {
    return (
      <div
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-control bg-primary-soft text-foreground",
          className
        )}
      >
        <ItemIcon itemType="custom" aria-hidden="true" className="size-5" />
      </div>
    );
  }

  return (
    <ItemImage
      item={item}
      className={cn(
        "size-12 shrink-0 overflow-hidden rounded-control border border-border bg-white",
        className
      )}
    />
  );
}
