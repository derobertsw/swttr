import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import type { WardrobeItem } from "@/types/wardrobe";
import { cn } from "@/lib/utils";
import { getEmptyStateIcon } from "./wardrobe-utils";
import { WardrobeItemCard } from "./WardrobeItemCard";

interface BodyPartSectionProps {
  part: string;
  items: WardrobeItem[];
  disabledItems: WardrobeItem[];
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
  const sectionCount = items.length + disabledItems.length;

  return (
    <section className="flex flex-col gap-1.5 scroll-mt-20">
      <div className={cn("sticky top-0 z-10", !isFirst && "pt-1")}>
        <h4 className="flex items-center justify-between rounded-md border border-white/12 bg-slate-900/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/84 backdrop-blur-md">
          <span>{part}</span>
          <span className="rounded-full border border-white/20 bg-white/10 px-1.5 py-[1px] text-[10px] text-white/65">
            {sectionCount}
          </span>
        </h4>
      </div>
      {items.length === 0 && disabledItems.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-white/20 bg-white/5 px-3 py-3.5">
          <EmptyIcon className="size-5 text-white/30 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white/55">No {part} gear yet</div>
            <div className="text-xs text-white/42">Add from search to improve recommendations</div>
          </div>
          <Plus className="size-4 text-white/30 flex-shrink-0" />
        </div>
      ) : (
        <>
          {items.map((item, index) => (
            <WardrobeItemCard
              key={item.id}
              item={item}
              isDisabled={false}
              onDelete={() => onRemoveItem(item.id)}
              onToggleDisabled={() => onToggleDisabled(item.id, false)}
              onClick={onItemClick ? () => onItemClick(item) : undefined}
              showSwipeHint={showSwipeHintOnFirstItem && index === 0}
              onDismissSwipeHint={onDismissSwipeHint}
            />
          ))}

          {disabledItems.length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              <button
                onClick={onToggleCollapsed}
                className="flex items-center gap-1.5 px-2 py-1.5 text-white/50 hover:text-white/70 transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
                <span className="text-[10px] font-medium uppercase tracking-wider">
                  Not on this trip ({disabledItems.length})
                </span>
              </button>
              {!isCollapsed && (
                <div className="flex flex-col gap-2 pl-2 border-l border-dashed border-white/15">
                  {disabledItems.map((item) => (
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
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
