import { ChevronRight } from "lucide-react";
import { SwipeableItem } from "@/components/SwipeableItem";
import type { WardrobeItem } from "@/types/wardrobe";
import { cn } from "@/lib/utils";
import { getItemIcon, formatCategory, getClo } from "./wardrobe-utils";
import {
  getBrandInitials,
  getWardrobeMediaRef,
  resolveBrandLogoUrl,
  resolveItemImageUrl,
  toCssBackgroundImage,
} from "./media";

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
  const Icon = getItemIcon(item.item_type, item.details.garment_type, item.details.category);
  const category =
    item.details.category ||
    item.details.handwear_type ||
    item.details.headwear_type ||
    "";
  const categoryLabel = category ? formatCategory(category) : "Uncategorized";
  const clo = getClo(item);
  const brand = item.details.brand || "Unknown brand";
  const media = getWardrobeMediaRef(item);
  const itemImageUrl = resolveItemImageUrl(media);
  const brandLogoUrl = resolveBrandLogoUrl(media);
  const cloLabel = clo !== undefined ? `${clo.toFixed(2)} clo` : null;

  return (
    <SwipeableItem
      onDelete={onDelete}
      onClick={onClick}
      onToggleDisabled={onToggleDisabled}
      isDisabled={isDisabled}
      onSwipeOpen={showSwipeHint ? onDismissSwipeHint : undefined}
    >
      <div className={cn("relative flex items-center gap-3 px-3", isDisabled ? "py-2 opacity-78" : "py-2.5")}>
        {showSwipeHint && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDismissSwipeHint?.();
            }}
            className="absolute -top-2 right-7 rounded-full border border-slate-200/70 bg-white/88 px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm backdrop-blur-sm"
            aria-label="Dismiss swipe hint"
          >
            Swipe left for actions
          </button>
        )}
        <div
          className={cn(
            "relative size-14 shrink-0 overflow-hidden rounded-lg border border-slate-300/40 bg-[linear-gradient(145deg,rgba(241,248,253,0.95),rgba(211,226,236,0.82))]",
            isDisabled && "saturate-50"
          )}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: toCssBackgroundImage(itemImageUrl) }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(165deg,rgba(255,255,255,0.28),rgba(15,23,42,0.12))]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-50 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.38),transparent_52%)]"
          />
          <Icon className="absolute bottom-1.5 right-1.5 size-4 text-slate-700/72" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "overflow-hidden text-ellipsis leading-[1.2] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]",
              isDisabled ? "text-[17px] font-medium text-slate-900/72" : "text-[17px] font-semibold text-slate-900"
            )}
          >
            {item.details.model_name}
          </p>
          <p
            className={cn(
              "mt-1 flex items-center gap-1 truncate text-[13px]",
              isDisabled ? "text-slate-600/76" : "text-slate-700/84"
            )}
          >
            <span className="truncate font-medium">{categoryLabel}</span>
            {cloLabel && <span className="font-medium text-slate-700/75">• {cloLabel}</span>}
            {!cloLabel && <span className="text-slate-600/72">• Thermal profile pending</span>}
          </p>
          {isDisabled && (
            <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-600/80">
              Excluded from recommendations
            </div>
          )}
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-1.5">
          <div
            className={cn(
              "relative flex h-8 w-16 items-center justify-center overflow-hidden rounded-lg border border-slate-300/35 bg-white/72 px-1 shadow-[0_1px_4px_rgba(15,23,42,0.12)]",
              isDisabled && "opacity-70"
            )}
            title={brand}
            aria-label={`${brand} logo`}
          >
            <span className="pointer-events-none text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700/72">
              {getBrandInitials(brand)}
            </span>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-contain bg-center bg-no-repeat p-1"
              style={{ backgroundImage: toCssBackgroundImage(brandLogoUrl) }}
            />
          </div>
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
