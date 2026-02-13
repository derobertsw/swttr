"use client";

import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { CircleHelp, RotateCcw, X } from "lucide-react";
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
    totalMatches,
    shownMatches,
    groupedItems,
    groupedWardrobeItems,
    disabledItemsByPart,
    disabledCollapsed,
    selectedItem,
    setSelectedItem,
    recentlyRemoved,
    brandFilter,
    setBrandFilter,
    searchBodyPartFilter,
    setSearchBodyPartFilter,
    searchLayerFilter,
    setSearchLayerFilter,
    searchSort,
    setSearchSort,
    availableBrands,
    clearSearchFilters,
    addItem,
    removeItem,
    restoreItem,
    clearRecentlyRemoved,
    toggleDisabled,
    toggleDisabledCollapsed,
  } = useWardrobe();

  return (
    <PageLayout>
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <header>
          <h2 className="text-2xl font-semibold leading-tight tracking-wide text-white/90">My Gear</h2>
          <p className="mt-1 text-[13px] text-white/55">
            Used in your thermal recommendations.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-white/65">
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5">
              {wardrobeItems.length} owned
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
              {filteredItems.length} addable
            </span>
          </div>
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
              totalMatches={totalMatches}
              shownMatches={shownMatches}
              groupedItems={groupedItems}
              adding={adding}
              justAdded={justAdded}
              onAddItem={addItem}
              brandFilter={brandFilter}
              onBrandFilterChange={setBrandFilter}
              searchBodyPartFilter={searchBodyPartFilter}
              onSearchBodyPartFilterChange={setSearchBodyPartFilter}
              searchLayerFilter={searchLayerFilter}
              onSearchLayerFilterChange={setSearchLayerFilter}
              searchSort={searchSort}
              onSearchSortChange={setSearchSort}
              onClearFilters={clearSearchFilters}
              availableBrands={availableBrands}
            />

            <div className="pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
              <div className="mt-0.5 flex flex-col gap-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-white/80">
                    My Wardrobe ({wardrobeItems.length} items)
                  </h3>
                  {wardrobeItems.length > 0 && (
                    <button
                      type="button"
                      className="inline-flex items-center rounded-full border border-white/25 bg-white/10 p-1 text-white/65 transition-colors hover:text-white"
                      aria-label="How to interact with wardrobe cards"
                      title="Tap a card for details. Swipe left to disable or remove."
                    >
                      <CircleHelp className="size-3.5" />
                    </button>
                  )}
                </div>

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
                <div className="mt-6 flex flex-col gap-2 rounded-xl border border-white/25 bg-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white/90">
                      Recently Removed ({recentlyRemoved.length})
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-white/70 hover:text-white"
                      onClick={clearRecentlyRemoved}
                    >
                      <X className="mr-1 size-3" />
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
                          className="flex items-center gap-3 rounded-lg border border-white/30 bg-white/5 p-3"
                        >
                          <Icon className="size-5 flex-shrink-0 text-white/65" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-white/85">
                              {item.details.brand} {item.details.model_name}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-white/65">
                              <span>{formatCategory(category)}</span>
                              {clo !== undefined && (
                                <span className="font-mono text-[10px]">{clo.toFixed(2)} clo</span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-shrink-0 border-white/30 bg-white/10 text-xs text-white/90 hover:bg-white/20"
                            onClick={() => restoreItem(item)}
                            disabled={adding === item.item_id}
                          >
                            <RotateCcw className="mr-1 size-3" />
                            Restore
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
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
