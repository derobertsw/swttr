import { ChevronRight } from "lucide-react";
import { SwipeableItem } from "@/components/SwipeableItem";
import type { WardrobeItem } from "@/types/wardrobe";
import { cn } from "@/lib/utils";
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
  const categoryLabel = category ? formatCategory(category) : "Uncategorized";
  const clo = getClo(item);
  const metadataLine = [
    item.details.brand || "Unknown brand",
    categoryLabel,
    clo !== undefined ? `${clo.toFixed(2)} clo` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <SwipeableItem
      onDelete={onDelete}
      onClick={onClick}
      onToggleDisabled={onToggleDisabled}
      isDisabled={isDisabled}
    >
      <div className={cn("flex items-start gap-3 px-3", isDisabled ? "py-2 opacity-78" : "py-2.5")}>
        <Icon className="mt-0.5 size-5 text-slate-500/90 shrink-0" />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate leading-tight",
              isDisabled ? "text-[16px] font-medium text-slate-900/70" : "text-[16px] font-semibold text-slate-900"
            )}
          >
            {item.details.model_name}
          </p>
          <p
            className={cn(
              "mt-1 truncate text-[13px]",
              isDisabled ? "text-slate-600/75" : "text-slate-700/82"
            )}
          >
            {metadataLine}
          </p>
          {isDisabled && (
            <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-600/80">
              Excluded from recommendations
            </div>
          )}
        </div>
        {onClick && (
          <div className="ml-2 mt-0.5 shrink-0 text-slate-500/75">
            <ChevronRight className="size-4" />
          </div>
        )}
      </div>
    </SwipeableItem>
  );
}
