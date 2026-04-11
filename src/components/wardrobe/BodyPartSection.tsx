import { ChevronDown, ChevronRight } from "lucide-react";
import type { WardrobeItem } from "@/types/wardrobe";
import { cn } from "@/lib/utils";
import { formatBodyPartLabel, getEmptyStateIcon } from "./wardrobe-utils";
import { WardrobeItemCard } from "./WardrobeItemCard";

interface BodyPartSectionProps {
  part: string;
  items: WardrobeItem[];
  disabledItems: WardrobeItem[];
  sectionId?: string;
  isFirst: boolean;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onRemoveItem: (id: string) => void;
  onToggleDisabled: (id: string, currentDisabled: boolean) => void;
  onItemClick?: (item: WardrobeItem) => void;
  showSwipeHintOnFirstItem?: boolean;
  onDismissSwipeHint?: () => void;
}

export function BodyPartSection({
  part,
  items,
  disabledItems,
  sectionId,
  isFirst,
  isCollapsed,
  onToggleCollapsed,
  onRemoveItem,
  onToggleDisabled,
  onItemClick,
  showSwipeHintOnFirstItem = false,
  onDismissSwipeHint,
}: BodyPartSectionProps) {
  const EmptyIcon = getEmptyStateIcon(part);
  const label = formatBodyPartLabel(part);
  const sectionCount = items.length + disabledItems.length;
  const pausedPanelId = `${sectionId ?? `paused-items-${part.replace(/[^a-z0-9]+/gi, "-")}`}-panel`;

  return (
    <section id={sectionId} className="flex scroll-mt-24 flex-col gap-2">
      <div className={cn("sticky top-0 z-10", !isFirst && "pt-1.5")}>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/12 bg-slate-950/26 px-3 py-2.5 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/8">
              <EmptyIcon className="size-4 text-white/74" />
            </div>
            <div className="min-w-0">
              <h4 className="truncate text-[12px] font-semibold uppercase tracking-[0.16em] text-white/88">
                {label}
              </h4>
              <p className="truncate text-[11px] text-white/56">
                {items.length > 0 ? `${items.length} active` : "No active gear"}
                {disabledItems.length > 0 ? ` · ${disabledItems.length} paused` : ""}
                {sectionCount === 0 ? " yet" : ""}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-[10px] font-medium text-white/65">
            {sectionCount}
          </span>
        </div>
      </div>
      {items.length === 0 && disabledItems.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/18 bg-white/[0.06] px-4 py-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/6">
            <EmptyIcon className="size-5 text-white/35" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white/74">No {label.toLowerCase()} gear yet</div>
            <div className="mt-1 text-xs leading-5 text-white/48">
              Add a piece here so recommendations can account for this zone.
            </div>
          </div>
        </div>
      ) : (
        <>
          {items.map((item) => (
            <WardrobeItemCard
              key={item.id}
              item={item}
              isDisabled={false}
              onDelete={() => onRemoveItem(item.id)}
              onToggleDisabled={() => onToggleDisabled(item.id, false)}
              onClick={onItemClick ? () => onItemClick(item) : undefined}
            />
          ))}

          {disabledItems.length > 0 && (
            <div className="mt-2 rounded-2xl border border-white/10 bg-black/10 p-2">
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-expanded={!isCollapsed}
                aria-controls={pausedPanelId}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-white/56 transition-colors hover:bg-white/6 hover:text-white/76"
              >
                <span className="flex items-center gap-1.5">
                  {isCollapsed ? (
                    <ChevronRight className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em]">
                    Paused For This Trip
                  </span>
                </span>
                <span className="rounded-full border border-white/12 bg-white/6 px-2 py-0.5 text-[10px]">
                  {disabledItems.length}
                </span>
              </button>
              <div
                id={pausedPanelId}
                hidden={isCollapsed}
                className="mt-2 flex flex-col gap-2 border-l border-dashed border-white/12 pl-2"
              >
                {!isCollapsed &&
                  disabledItems.map((item) => (
                    <WardrobeItemCard
                      key={item.id}
                      item={item}
                      isDisabled={true}
                      onDelete={() => onRemoveItem(item.id)}
                      onToggleDisabled={() => onToggleDisabled(item.id, true)}
                      onClick={onItemClick ? () => onItemClick(item) : undefined}
                    />
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
