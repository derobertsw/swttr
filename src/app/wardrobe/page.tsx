"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { RotateCcw, X, Search, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWardrobe } from "@/hooks/useWardrobe";
import { WardrobeSearch } from "@/components/wardrobe/WardrobeSearch";
import { BodyPartSection } from "@/components/wardrobe/BodyPartSection";
import { ItemDetailCard } from "@/components/wardrobe";
import { BodyPartPickerDrawer } from "@/components/wardrobe/BodyPartPickerDrawer";
import { CreateCustomItemDialog } from "@/components/wardrobe/CreateCustomItemDialog";
import { BODY_PART_ORDER, getItemIcon, formatCategory, bodyPartToFilterKey, getClo } from "@/components/wardrobe/wardrobe-utils";
import type { BodyPart } from "@/types/wardrobe";

const SWIPE_HINT_STORAGE_KEY = "swttr-wardrobe-swipe-hint-dismissed-v1";

export default function Wardrobe() {
  const isMobile = useIsMobile();
  const {
    loading,
    search,
    setSearch,
    adding,
    justAdded,
    wardrobeItems,
    totalAvailableCount,
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
    wardrobeItemIds,
    clearSearchFilters,
    addItem,
    removeItem,
    removeItemByItemId,
    restoreItem,
    clearRecentlyRemoved,
    toggleDisabled,
    toggleDisabledCollapsed,
  } = useWardrobe();
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [pickerBodyPart, setPickerBodyPart] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);



  useEffect(() => {
    if (typeof window === "undefined") return;
    if (wardrobeItems.length === 0) {
      setShowSwipeHint(false);
      return;
    }

    const dismissed = window.localStorage.getItem(SWIPE_HINT_STORAGE_KEY) === "1";
    setShowSwipeHint(!dismissed);
  }, [wardrobeItems.length]);

  const dismissSwipeHint = useCallback(() => {
    setShowSwipeHint(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SWIPE_HINT_STORAGE_KEY, "1");
    }
  }, []);

  return (
    <PageLayout>
      <div className="flex w-full max-w-2xl flex-col gap-4">
        {loading ? (
          <div className="flex flex-col gap-4 py-2">
            <Skeleton className="h-12 w-full rounded-xl bg-white/25" />
            <Skeleton className="h-24 w-full rounded-xl bg-white/20" />
            <Skeleton className="h-24 w-full rounded-xl bg-white/20" />
            <Skeleton className="h-24 w-full rounded-xl bg-white/20" />
          </div>
        ) : (
          <>
            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowSearch(true)}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-blue-300/60 bg-blue-50/90 px-4 py-6 transition-all hover:bg-blue-100/90 hover:border-blue-400/70 active:scale-[0.98]"
              >
                <Search className="size-8 text-blue-600" />
                <div className="text-center">
                  <p className="text-base font-semibold text-blue-900">Browse Catalog</p>
                  <p className="text-xs text-blue-700/80">{totalAvailableCount} items available</p>
                </div>
              </button>

              <button
                onClick={() => setShowCustomDialog(true)}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-emerald-300/60 bg-emerald-50/90 px-4 py-6 transition-all hover:bg-emerald-100/90 hover:border-emerald-400/70 active:scale-[0.98]"
              >
                <Sparkles className="size-8 text-emerald-600" />
                <div className="text-center">
                  <p className="text-base font-semibold text-emerald-900">Add Custom Item</p>
                  <p className="text-xs text-emerald-700/80">Add generic gear</p>
                </div>
              </button>
            </div>

            <header>
              <h2 className="text-2xl font-semibold leading-tight tracking-wide text-white/90">My Gear</h2>
              <p className="mt-1 text-[13px] text-white/55">
                Used in your thermal recommendations.
              </p>
              <p className="mt-1.5 text-sm font-semibold text-white/80">
                {wardrobeItems.length} items
              </p>
            </header>

            <div className="pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
              <div className="mt-0.5 flex flex-col gap-3.5">

                {wardrobeItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/40 bg-white/10 px-4 py-5">
                    <p className="text-sm font-semibold text-white/90">No gear added yet</p>
                    <p className="mt-1 text-sm text-white/70">
                      Search above to add your first item and unlock gear-aware recommendations.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">
                    {(() => {
                      let swipeHintAssigned = false;
                      return BODY_PART_ORDER.map((part, index) => {
                        const activeItems = groupedWardrobeItems[part];
                        const shouldShowSwipeHint =
                          showSwipeHint && !swipeHintAssigned && activeItems.length > 0;
                        if (shouldShowSwipeHint) {
                          swipeHintAssigned = true;
                        }

                        return (
                          <BodyPartSection
                            key={part}
                            part={part}
                            items={activeItems}
                            disabledItems={disabledItemsByPart[part]}
                            isFirst={index === 0}
                            isCollapsed={disabledCollapsed[part] ?? true}
                            onToggleCollapsed={() => toggleDisabledCollapsed(part)}
                            onRemoveItem={removeItem}
                            onToggleDisabled={toggleDisabled}
                            onItemClick={setSelectedItem}
                            showSwipeHintOnFirstItem={shouldShowSwipeHint}
                            onDismissSwipeHint={dismissSwipeHint}
                            onHeadingClick={() => setPickerBodyPart(part)}
                          />
                        );
                      });
                    })()}
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
        onRemove={(wardrobeId) => {
          removeItem(wardrobeId);
          setSelectedItem(null);
        }}
      />

      {pickerBodyPart && (
        <BodyPartPickerDrawer
          open={true}
          onOpenChange={(open) => {
            if (!open) setPickerBodyPart(null);
          }}
          bodyPart={pickerBodyPart}
          availableItems={filteredItems}
          wardrobeItemIds={wardrobeItemIds}
          adding={adding}
          justAdded={justAdded}
          onAddItem={addItem}
          onCreateCustom={() => {
            setPickerBodyPart(null);
            setShowCustomDialog(true);
          }}
        />
      )}

      <CreateCustomItemDialog
        open={showCustomDialog}
        onOpenChange={setShowCustomDialog}
        bodyPart={pickerBodyPart ? bodyPartToFilterKey(pickerBodyPart) : undefined}
        onItemCreated={async () => {
          setShowCustomDialog(false);
          // Refresh wardrobe by reloading data
          window.location.reload();
        }}
      />

      {/* Browse Catalog Modal */}
      {isMobile ? (
        <Drawer open={showSearch} onOpenChange={(open) => { setShowSearch(open); if (!open) { clearSearchFilters(); setSearch(""); } }}>
          <DrawerContent className="h-[95vh] rounded-t-2xl border-t-border/60 bg-background">
            <div className="flex h-full w-full flex-col">
              <DrawerHeader className="flex-none px-4 pb-3 pt-3">
                <DrawerTitle className="text-xl font-semibold">Browse Catalog</DrawerTitle>
                <DrawerDescription className="text-sm text-muted-foreground">
                  {totalAvailableCount} items available
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-safe">
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
                  onRemoveItem={removeItemByItemId}
                  wardrobeItemIds={wardrobeItemIds}
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
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showSearch} onOpenChange={(open) => { setShowSearch(open); if (!open) { clearSearchFilters(); setSearch(""); } }}>
          <DialogContent className="flex h-[90vh] max-w-4xl flex-col overflow-hidden border-border/60 bg-background p-0">
            <DialogHeader className="flex-none border-b border-border/60 px-6 py-4">
              <DialogTitle className="text-xl font-semibold">Browse Catalog</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {totalAvailableCount} items available
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
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
                onRemoveItem={removeItemByItemId}
                wardrobeItemIds={wardrobeItemIds}
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
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageLayout>
  );
}
