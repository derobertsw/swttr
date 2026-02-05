import { SwipeableItem } from "@/components/SwipeableItem";
import type { WardrobeItem } from "@/types/wardrobe";
import { getItemIcon, formatCategory, getClo } from "./wardrobe-utils";

interface WardrobeItemCardProps {
  item: WardrobeItem;
  isDisabled: boolean;
  onDelete: () => void;
  onToggleDisabled: () => void;
  onClick?: () => void;
}

export function WardrobeItemCard({ item, isDisabled, onDelete, onToggleDisabled, onClick }: WardrobeItemCardProps) {
  const Icon = getItemIcon(item.item_type, item.details.garment_type, item.details.category);
  const category =
    item.details.category ||
    item.details.handwear_type ||
    item.details.headwear_type ||
    "";
  const clo = getClo(item);

  return (
    <SwipeableItem
      onDelete={onDelete}
      onClick={onClick}
      onToggleDisabled={onToggleDisabled}
      isDisabled={isDisabled}
    >
      <div className={`flex items-center gap-3 px-3 ${isDisabled ? "py-3 opacity-50 grayscale" : "py-4"}`}>
        <Icon className="size-5 text-white/60 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className={`font-medium truncate ${isDisabled ? "text-sm" : ""}`}>
            {item.details.brand} {item.details.model_name}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            <span>{formatCategory(category)}</span>
            {clo !== undefined && (
              <span className="font-mono text-[10px] opacity-55">{clo.toFixed(2)} clo</span>
            )}
          </div>
          {isDisabled && (
            <div className="text-[10px] text-white/40 mt-0.5">
              Excluded from recommendations
            </div>
          )}
        </div>
      </div>
    </SwipeableItem>
  );
}
