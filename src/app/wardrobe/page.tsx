"use client";

import { useMemo, useState } from "react";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { CreateCustomItemDialog } from "@/components/wardrobe/CreateCustomItemDialog";
import { buildWardrobeOverview } from "@/components/wardrobe/wardrobe-overview";
import { BODY_PART_ORDER, ItemIcon, formatCategory, getClo } from "@/components/wardrobe/wardrobe-utils";
import type { BodyPart } from "@/types/wardrobe";

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
  const [showSearch, setShowSearch] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customDialogBodyPart, setCustomDialogBodyPart] = useState<string | undefined>(undefined);
  const overview = useMemo(
    () =>
      buildWardrobeOverview({
        wardrobeItems,
        groupedWardrobeItems,
        disabledItemsByPart,
      }),
    [wardrobeItems, groupedWardrobeItems, disabledItemsByPart]
  );
  const wardrobeSectionIds = useMemo(
    () =>
      Object.fromEntries(
        BODY_PART_ORDER.map((part) => [part, `wardrobe-section-${part.replace(/[^a-z0-9]+/gi, "-")}`])
      ) as Record<string, string>,
    []
  );

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-3xl flex-col gap-4">
        {loading ? (
          <div className="flex flex-col gap-4 py-2">
            <Skeleton className="h-72 w-full rounded-card" />
            <Skeleton className="h-14 w-full rounded-card" />
            <Skeleton className="h-28 w-full rounded-card" />
            <Skeleton className="h-28 w-full rounded-card" />
          </div>
        ) : (
          <>
            <header>
              <p className="text-sm font-medium text-muted-foreground">Wardrobe</p>
              <h1 className="mt-1 text-title font-semibold text-foreground md:text-title-lg">
                My gear
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {overview.headline}
                <span aria-hidden="true"> · </span>
                {overview.activeItems} {overview.activeItems === 1 ? "item is" : "items are"} shaping recommendations
                {overview.totalDisabledItems > 0 ? ` · ${overview.totalDisabledItems} paused for this trip` : ""}
              </p>
            </header>

            <section className="grid grid-cols-3 gap-2">
              {[
                { label: "Items", value: overview.totalItems },
                { label: "Active", value: overview.activeItems },
                { label: "Paused", value: overview.totalDisabledItems },
              ].map((stat) => (
                <Card key={stat.label} variant="muted" className="px-3 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-xl font-semibold leading-none tabular-nums text-foreground">
                    {stat.value}
                  </p>
                </Card>
              ))}
            </section>

            <div className="grid grid-cols-2 gap-2">
              <Card asChild interactive padding="none" className="flex items-center gap-3 px-3.5 py-3 text-left">
                <button type="button" onClick={() => setShowSearch(true)}>
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-soft">
                    <Search className="size-[18px] text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Browse catalog</p>
                    <p className="truncate text-xs text-muted-foreground">{totalAvailableCount} items available</p>
                  </div>
                </button>
              </Card>

              <Card asChild interactive padding="none" className="flex items-center gap-3 px-3.5 py-3 text-left">
                <button
                  type="button"
                  onClick={() => {
                    setCustomDialogBodyPart(undefined);
                    setShowCustomDialog(true);
                  }}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-soft">
                    <Sparkles className="size-[18px] text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Custom item</p>
                    <p className="text-xs text-muted-foreground">Create a stand-in piece</p>
                  </div>
                </button>
              </Card>
            </div>

            <div className="pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
              <div className="mt-0.5 flex flex-col gap-4">
                {wardrobeItems.length === 0 ? (
                  <div className="rounded-card border border-dashed border-border px-5 py-5">
                    <p className="text-base font-semibold text-foreground">No gear added yet</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Start with the pieces you use most often. Even a few key layers make recommendations far more useful.
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Tip: use Browse catalog or Custom item above to add your first piece.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">
                    {BODY_PART_ORDER.map((part, index) => (
                      <BodyPartSection
                        key={part}
                        part={part}
                        sectionId={wardrobeSectionIds[part]}
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
                <Card padding="sm" className="mt-6 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">
                      Recently removed ({recentlyRemoved.length})
                    </h2>
                    <Button variant="ghost" size="sm" onClick={clearRecentlyRemoved}>
                      <X />
                      Dismiss
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">Items can be restored while this page is open.</p>

                  <div className="flex flex-col divide-y divide-border">
                    {recentlyRemoved.map((item) => {
                      const category =
                        item.details.category ||
                        item.details.handwear_type ||
                        item.details.headwear_type ||
                        "";
                      const clo = getClo(item);

                      return (
                        <div key={item.item_id} className="flex items-center gap-3 py-3">
                          <ItemIcon itemType={item.item_type} garmentType={item.details.garment_type} category={item.details.category} className="size-5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-foreground">
                              {item.details.brand} {item.details.model_name}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>{formatCategory(category)}</span>
                              {clo !== undefined && (
                                <span className="font-mono text-xs">{clo.toFixed(2)} clo</span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => restoreItem(item)}
                            disabled={adding === item.item_id}
                          >
                            <RotateCcw />
                            Restore
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </Card>
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

      <CreateCustomItemDialog
        open={showCustomDialog}
        onOpenChange={setShowCustomDialog}
        bodyPart={customDialogBodyPart as BodyPart | undefined}
        onItemCreated={async () => {
          setShowCustomDialog(false);
          // Refresh wardrobe by reloading data
          window.location.reload();
        }}
      />

      {/* Browse Catalog Modal */}
      {isMobile ? (
        <Drawer open={showSearch} onOpenChange={(open) => { setShowSearch(open); if (!open) { clearSearchFilters(); setSearch(""); } }}>
          <DrawerContent showCloseButton className="h-[95dvh]">
            <div className="flex min-h-0 w-full flex-1 flex-col">
              <DrawerHeader className="flex-none pr-14 pb-3">
                <DrawerTitle>Browse catalog</DrawerTitle>
                <DrawerDescription>
                  {totalAvailableCount} items available
                </DrawerDescription>
              </DrawerHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
          <DialogContent className="flex h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="flex-none border-b border-border px-6 py-4">
              <DialogTitle>Browse catalog</DialogTitle>
              <DialogDescription>
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
