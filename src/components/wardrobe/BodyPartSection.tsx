import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import type { WardrobeItem } from "@/types/wardrobe";
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
}: BodyPartSectionProps) {
  const EmptyIcon = getEmptyStateIcon(part);

  return (
    <div className="flex flex-col gap-3">
      <h4 className={`text-xs font-semibold text-white/80 uppercase tracking-wider px-1 pb-1.5 border-b border-white/15 ${isFirst ? '' : 'mt-4'}`}>
        {part}
      </h4>
      {items.length === 0 && disabledItems.length === 0 ? (
        <div className="flex items-center gap-3 px-3 py-4 border border-dashed border-white/20 rounded-lg">
          <EmptyIcon className="size-5 text-white/30 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white/50">
              No {part} items yet
            </div>
            <div className="text-xs text-white/40">
              Add gear to improve recommendations
            </div>
          </div>
          <Plus className="size-4 text-white/30 flex-shrink-0" />
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
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
