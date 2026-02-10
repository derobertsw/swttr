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

  return (
    <SwipeableItem
      onDelete={onDelete}
      onClick={onClick}
      onToggleDisabled={onToggleDisabled}
      isDisabled={isDisabled}
    >
      <div className={cn("flex items-start gap-3 px-3", isDisabled ? "py-3 opacity-70" : "py-3.5")}>
        <Icon className="mt-0.5 size-5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "truncate leading-tight",
              isDisabled
                ? "text-[15px] font-medium text-card-foreground/65"
                : "text-[17px] font-semibold text-card-foreground"
            )}
          >
            {item.details.model_name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                isDisabled
                  ? "border-border/60 bg-muted/35 text-muted-foreground/70"
                  : "border-border bg-muted/60 text-muted-foreground"
              )}
            >
              {item.details.brand || "Unknown brand"}
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                isDisabled
                  ? "border-border/50 bg-muted/25 text-muted-foreground/65"
                  : "border-border/80 bg-muted/40 text-muted-foreground"
              )}
            >
              {categoryLabel}
            </span>
            {clo !== undefined && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[11px]",
                  isDisabled
                    ? "border-border/50 bg-muted/25 text-muted-foreground/65"
                    : "border-border/80 bg-muted/45 text-muted-foreground"
                )}
              >
                {clo.toFixed(2)} clo
              </span>
            )}
          </div>
          {isDisabled && (
            <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
              Excluded from recommendations
            </div>
          )}
        </div>
      </div>
    </SwipeableItem>
  );
}
