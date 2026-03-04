import { ChevronRight } from "lucide-react";
import { SwipeableItem } from "@/components/SwipeableItem";
import type { WardrobeItem } from "@/types/wardrobe";
import { cn } from "@/lib/utils";
import { formatCategory, getClo } from "./wardrobe-utils";

interface WardrobeItemCardProps {
  item: WardrobeItem;
  isDisabled: boolean;
  onDelete: () => void;
  onToggleDisabled: () => void;
  onClick?: () => void;
  showSwipeHint?: boolean;
  onDismissSwipeHint?: () => void;
}

export function WardrobeItemCard({
  item,
  isDisabled,
  onDelete,
  onToggleDisabled,
  onClick,
  showSwipeHint = false,
  onDismissSwipeHint,
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
  const brand = isCustom ? "Custom" : (item.details.brand || "Unknown brand");
  const handleCardClick = () => {
    if (showSwipeHint) {
      onDismissSwipeHint?.();
    }
    onClick?.();
  };

  return (
    <SwipeableItem
      onDelete={onDelete}
      onClick={onClick ? handleCardClick : undefined}
      onToggleDisabled={onToggleDisabled}
      isDisabled={isDisabled}
      onSwipeOpen={showSwipeHint ? onDismissSwipeHint : undefined}
    >
      <div className={cn("relative flex items-center gap-3 px-3", isDisabled ? "py-2.5 opacity-78" : "py-3")}>
        {showSwipeHint && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDismissSwipeHint?.();
            }}
            className="absolute right-7 top-1 rounded-full border border-slate-200/70 bg-white/88 px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur-sm"
            aria-label="Dismiss swipe hint"
          >
            Swipe left for actions
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "overflow-hidden text-ellipsis leading-[1.15] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]",
              isDisabled ? "text-[15px] font-medium text-slate-900/72" : "text-[15px] font-semibold text-slate-900"
            )}
          >
            {item.details.model_name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                isDisabled
                  ? "border-slate-300/60 bg-slate-100/60 text-slate-700/70"
                  : isCustom
                  ? "border-emerald-400/50 bg-emerald-200/60 text-emerald-900"
                  : "border-slate-400/50 bg-slate-200/60 text-slate-800"
              )}
            >
              {categoryLabel}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                isDisabled
                  ? "border-slate-300/60 bg-slate-100/60 text-slate-700/70"
                  : isCustom
                  ? "border-emerald-400/50 bg-emerald-200/60 text-emerald-900"
                  : "border-slate-400/50 bg-slate-200/60 text-slate-800"
              )}
            >
              {brand}
            </span>
          </div>
          {isDisabled && (
            <div className="mt-1.5 text-[10px] uppercase tracking-wide text-slate-600/80">
              Excluded from recommendations
            </div>
          )}
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-1.5">
          {clo !== undefined ? (
            <div
              className={cn(
                "flex h-8 w-16 flex-col items-center justify-center rounded-lg border px-1",
                isDisabled
                  ? "border-blue-300/50 bg-blue-50/50"
                  : "border-blue-400/60 bg-blue-100/70"
              )}
            >
              <div
                className={cn(
                  "font-mono text-[13px] font-bold leading-none",
                  isDisabled ? "text-blue-700/70" : "text-blue-800"
                )}
              >
                {clo.toFixed(2)}
              </div>
              <div
                className={cn(
                  "mt-0.5 text-[9px] font-medium uppercase tracking-wider",
                  isDisabled ? "text-blue-600/60" : "text-blue-700/75"
                )}
              >
                clo
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "flex h-8 w-16 items-center justify-center rounded-lg border px-1",
                isDisabled
                  ? "border-slate-300/60 bg-slate-100/60"
                  : "border-slate-400/50 bg-slate-200/60"
              )}
            >
              <div className="text-center text-[9px] font-medium text-slate-600/72">
                Pending
              </div>
            </div>
          )}
          {onClick && (
            <div className="text-slate-500/75">
              <ChevronRight className="size-4" />
            </div>
          )}
        </div>
      </div>
    </SwipeableItem>
  );
}
