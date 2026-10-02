import { ChevronRight } from "lucide-react";
import { SwipeableItem } from "@/components/SwipeableItem";
import { Badge } from "@/components/ui/badge";
import type { WardrobeItem } from "@/types/wardrobe";
import { cn } from "@/lib/utils";
import { formatCategory, getClo, ItemIcon } from "./wardrobe-utils";

interface WardrobeItemCardProps {
  item: WardrobeItem;
  isDisabled: boolean;
  onDelete: () => void;
  onToggleDisabled: () => void;
  onClick?: () => void;
}

export function WardrobeItemCard({
  item,
  isDisabled,
  onDelete,
  onToggleDisabled,
  onClick,
}: WardrobeItemCardProps) {
  const isCustom = item.item_type === "custom";

  const category =
    item.details.category ||
    item.details.handwear_type ||
    item.details.headwear_type ||
    "";
  const categoryLabel = isCustom
    ? `${item.details.generic_option ?? ""} ${item.details.layer_type ?? ""}`.trim() || "Custom"
    : category
    ? formatCategory(category)
    : "Uncategorized";
  const clo = getClo(item);
  const brandLabel = isCustom ? "Generic custom item" : (item.details.brand || "Unknown brand");

  return (
    <SwipeableItem
      onDelete={onDelete}
      onClick={onClick}
      onToggleDisabled={onToggleDisabled}
      isDisabled={isDisabled}
    >
      <div className={cn("flex items-start gap-3 px-3.5", isDisabled ? "py-3" : "py-3.5")}>
        <div
          className={cn(
            "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-control",
            isDisabled
              ? "bg-muted text-muted-foreground"
              : isCustom
              ? "bg-primary-soft text-foreground"
              : "bg-muted text-foreground"
          )}
        >
          <ItemIcon
            itemType={item.item_type}
            garmentType={item.details.garment_type}
            category={item.details.category}
            className="size-[18px]"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "line-clamp-2 text-base leading-tight",
              isDisabled ? "font-medium text-muted-foreground" : "font-semibold text-foreground"
            )}
          >
            {item.details.model_name}
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {brandLabel}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge size="sm" variant={isDisabled ? "outline" : isCustom ? "primary" : "neutral"}>
              {categoryLabel}
            </Badge>
          </div>
          {isDisabled && (
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              Paused for this trip
            </p>
          )}
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-1.5">
          <div className="flex h-10 w-[4.25rem] flex-col items-center justify-center rounded-control bg-muted px-1">
            {clo !== undefined ? (
              <>
                <div
                  className={cn(
                    "font-mono text-sm font-bold leading-none",
                    isDisabled ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {clo.toFixed(2)}
                </div>
                <div className="mt-0.5 text-xs leading-none text-muted-foreground">clo</div>
              </>
            ) : (
              <div className="text-center text-xs text-muted-foreground">Pending</div>
            )}
          </div>
          {onClick && <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />}
        </div>
      </div>
    </SwipeableItem>
  );
}
