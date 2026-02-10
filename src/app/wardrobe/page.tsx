"use client";

import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { RotateCcw, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWardrobe } from "@/hooks/useWardrobe";
import { WardrobeSearch } from "@/components/wardrobe/WardrobeSearch";
import { BodyPartSection } from "@/components/wardrobe/BodyPartSection";
import { ItemDetailCard } from "@/components/wardrobe";
import { BODY_PART_ORDER, getItemIcon, formatCategory, getClo } from "@/components/wardrobe/wardrobe-utils";

export default function Wardrobe() {
  const {
    loading,
    search,
    setSearch,
    adding,
    justAdded,
    wardrobeItems,
    filteredItems,
    groupedItems,
    groupedWardrobeItems,
    disabledItemsByPart,
    disabledCollapsed,
    selectedItem,
    setSelectedItem,
    recentlyRemoved,
    brandFilter,
    setBrandFilter,
    availableBrands,
    addItem,
    removeItem,
    restoreItem,
    clearRecentlyRemoved,
    toggleDisabled,
    toggleDisabledCollapsed,
  } = useWardrobe();

  return (
    <PageLayout>
      <div className="flex flex-col gap-6 w-full max-w-2xl">
        <header>
          <h2 className="text-2xl font-semibold text-white/90 tracking-wide">My Gear</h2>
          <p className="text-[13px] text-white/55 mt-1">
            Your gear powers your thermal recommendations.
          </p>
        </header>

        {loading ? (
          <div className="flex flex-col gap-4 py-2">
            <Skeleton className="h-12 w-full rounded-xl bg-white/25" />
            <Skeleton className="h-24 w-full rounded-xl bg-white/20" />
            <Skeleton className="h-24 w-full rounded-xl bg-white/20" />
            <Skeleton className="h-24 w-full rounded-xl bg-white/20" />
          </div>
        ) : (
          <>
            <WardrobeSearch
              search={search}
              onSearchChange={setSearch}
              filteredItems={filteredItems}
              groupedItems={groupedItems}
              adding={adding}
              justAdded={justAdded}
              onAddItem={addItem}
              brandFilter={brandFilter}
              onBrandFilterChange={setBrandFilter}
              availableBrands={availableBrands}
            />

            <div className="flex flex-col gap-4 mt-2">
              <h3 className="font-medium text-sm text-white/80 mb-1">
                My Wardrobe ({wardrobeItems.length} items)
              </h3>

              {wardrobeItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/40 bg-white/10 px-4 py-5">
                  <p className="text-sm font-semibold text-white/90">No gear added yet</p>
                  <p className="mt-1 text-sm text-white/70">
                    Search above to add your first item and unlock gear-aware recommendations.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {BODY_PART_ORDER.map((part, index) => (
                    <BodyPartSection
                      key={part}
                      part={part}
                      items={groupedWardrobeItems[part]}
                      disabledItems={disabledItemsByPart[part]}
                      isFirst={index === 0}
                      isCollapsed={disabledCollapsed[part] ?? true}
                      onToggleCollapsed={() => toggleDisabledCollapsed(part)}
                      onRemoveItem={removeItem}
                      onToggleDisabled={toggleDisabled}
                      onItemClick={setSelectedItem}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Recently removed items */}
            {recentlyRemoved.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-white/25 bg-white/10 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-white/90">
                    Recently Removed ({recentlyRemoved.length})
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-white/70 h-7 hover:text-white"
                    onClick={clearRecentlyRemoved}
                  >
                    <X className="size-3 mr-1" />
                    Dismiss
                  </Button>
                </div>
                <p className="text-[11px] text-white/60">Items can be restored while this page is open.</p>

                <div className="flex flex-col gap-1">
                  {recentlyRemoved.map((item) => {
                    const Icon = getItemIcon(item.item_type, item.details.garment_type, item.details.category);
                    const category =
                      item.details.category ||
                      item.details.handwear_type ||
                      item.details.headwear_type ||
                      "";
                    const clo = getClo(item);

                    return (
                      <div
                        key={item.item_id}
                        className="flex items-center gap-3 p-3 border border-white/30 rounded-lg bg-white/5"
                      >
                        <Icon className="size-5 text-white/65 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-white/85">
                            {item.details.brand} {item.details.model_name}
                          </div>
                          <div className="text-xs text-white/65 flex items-center gap-2">
                            <span>{formatCategory(category)}</span>
                            {clo !== undefined && (
                              <span className="font-mono text-[10px]">{clo.toFixed(2)} clo</span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-shrink-0 text-xs border-white/30 bg-white/10 text-white/90 hover:bg-white/20"
                          onClick={() => restoreItem(item)}
                          disabled={adding === item.item_id}
                        >
                          <RotateCcw className="size-3 mr-1" />
                          Restore
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ItemDetailCard
        item={selectedItem}
        open={selectedItem !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null);
        }}
      />
    </PageLayout>
  );
}
