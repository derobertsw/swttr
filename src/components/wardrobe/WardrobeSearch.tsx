import { Search, Plus, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FROSTED_INPUT_FULL, SUGGESTIONS_DROPDOWN } from "@/lib/styling";
import { cn } from "@/lib/utils";
import type { AvailableItem } from "@/types/wardrobe";
import { typeIcons, typeLabels, getItemIcon, formatCategory } from "./wardrobe-utils";

interface WardrobeSearchProps {
  search: string;
  onSearchChange: (value: string) => void;
  filteredItems: AvailableItem[];
  groupedItems: Record<string, AvailableItem[]>;
  adding: string | null;
  justAdded: string | null;
  onAddItem: (item: AvailableItem) => void;
  brandFilter: string | null;
  onBrandFilterChange: (brand: string | null) => void;
  availableBrands: string[];
}

export function WardrobeSearch({
  search,
  onSearchChange,
  filteredItems,
  groupedItems,
  adding,
  justAdded,
  onAddItem,
  brandFilter,
  onBrandFilterChange,
  availableBrands,
}: WardrobeSearchProps) {
  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/70" />
        <Input
          placeholder="Search gear to add..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`pl-10 h-12 ${FROSTED_INPUT_FULL}`}
        />
      </div>

      {availableBrands.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {brandFilter && (
            <button
              type="button"
              onClick={() => onBrandFilterChange(null)}
              className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/35"
            >
              {brandFilter}
              <X className="size-3" />
            </button>
          )}
          {!brandFilter &&
            availableBrands.map((brand) => (
              <button
                key={brand}
                type="button"
                onClick={() => onBrandFilterChange(brand)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-sm transition-colors",
                  "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                )}
              >
                {brand}
              </button>
            ))}
        </div>
      )}

      {search && (
        <div className={`absolute z-10 w-full mt-1.5 ${SUGGESTIONS_DROPDOWN} max-h-80 overflow-y-auto`}>
          {filteredItems.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No matching items found
            </div>
          ) : (
            Object.entries(groupedItems).map(([type, items]) => {
              if (items.length === 0) return null;
              const Icon = typeIcons[type as keyof typeof typeIcons];
              return (
                <div key={type}>
                  <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                    <Icon className="size-3 opacity-60" />
                    {typeLabels[type as keyof typeof typeLabels]}
                  </div>
                  {items.map((item) => {
                    const ItemIcon = getItemIcon(item.type, item.garment_type, item.category);
                    const isAdding = adding === item.id;
                    const wasJustAdded = justAdded === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onAddItem(item)}
                        disabled={isAdding || wasJustAdded}
                        className="w-full px-3 py-2.5 text-left hover:bg-muted/50 flex items-center gap-3 disabled:opacity-70 transition-colors"
                      >
                        <ItemIcon className="size-5 text-muted-foreground/60 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {item.brand} {item.model_name}
                          </div>
                          <div className="text-xs text-muted-foreground/65 mt-0.5">
                            {formatCategory(item.category)}
                            {item.rcl_clo && (
                              <span className="font-mono ml-1.5 opacity-80">· {item.rcl_clo.toFixed(2)} clo</span>
                            )}
                          </div>
                        </div>
                        <div className="size-8 flex items-center justify-center flex-shrink-0">
                          {wasJustAdded ? (
                            <Check
                              className="size-5 text-emerald-500"
                              style={{
                                animation: 'checkmark-pop 0.3s ease-out forwards'
                              }}
                            />
                          ) : (
                            <Plus className="size-4 text-muted-foreground/70 hover:text-muted-foreground transition-colors" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
