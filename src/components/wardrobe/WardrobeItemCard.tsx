import { ChevronRight } from "lucide-react";
import { SwipeableItem } from "@/components/SwipeableItem";
import type { WardrobeItem } from "@/types/wardrobe";
import { cn } from "@/lib/utils";
import { formatCategory, getClo, getItemIcon } from "./wardrobe-utils";

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
  const Icon = getItemIcon(item.item_type, item.details.garment_type, item.details.category);

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
      <div className={cn("flex items-start gap-3 px-3.5", isDisabled ? "py-3 opacity-80" : "py-3.5")}>
        <div
          className={cn(
            "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl border",
            isDisabled
              ? "border-slate-300/70 bg-white/55 text-slate-500"
              : isCustom
              ? "border-emerald-300/70 bg-emerald-100/70 text-emerald-800"
              : "border-slate-300/80 bg-white/75 text-slate-700"
          )}
        >
          <Icon className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "overflow-hidden text-ellipsis text-[15px] leading-[1.15] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]",
              isDisabled ? "font-medium text-slate-900/72" : "font-semibold text-slate-900"
            )}
          >
            {item.details.model_name}
          </p>
          <p className={cn("mt-1 truncate text-[12px]", isDisabled ? "text-slate-600/72" : "text-slate-700/78")}>
            {brandLabel}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                isDisabled
                  ? "border-slate-300/70 bg-slate-100/65 text-slate-700/70"
                  : isCustom
                  ? "border-emerald-400/55 bg-emerald-200/65 text-emerald-900"
                  : "border-slate-400/55 bg-slate-200/65 text-slate-800"
              )}
            >
              {categoryLabel}
            </span>
          </div>
          {isDisabled && (
            <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600/75">
              Paused for this trip
            </div>
          )}
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-1.5">
          {clo !== undefined ? (
            <div
              className={cn(
                "flex h-10 w-[4.25rem] flex-col items-center justify-center rounded-xl border px-1",
                isDisabled
                  ? "border-blue-300/50 bg-blue-50/55"
                  : "border-blue-400/60 bg-blue-100/75"
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
                "flex h-10 w-[4.25rem] items-center justify-center rounded-xl border px-1",
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
