"use client";

import { useMemo, useState } from "react";
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
import { buildWardrobeOverview } from "@/components/wardrobe/wardrobe-overview";
import { BODY_PART_ORDER, getItemIcon, formatCategory, bodyPartToFilterKey, getClo } from "@/components/wardrobe/wardrobe-utils";
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
    availableItems,
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
  const [pickerBodyPart, setPickerBodyPart] = useState<string | null>(null);
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
            <Skeleton className="h-72 w-full rounded-[28px] bg-white/18" />
            <Skeleton className="h-14 w-full rounded-2xl bg-white/15" />
            <Skeleton className="h-28 w-full rounded-2xl bg-white/15" />
            <Skeleton className="h-28 w-full rounded-2xl bg-white/15" />
          </div>
        ) : (
          <>
            <header>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">
                Wardrobe
              </p>
              <h1 className="mt-1 text-[2.25rem] font-semibold leading-tight tracking-[-0.04em] text-white/94">
                My Gear
              </h1>
              <p className="mt-1 text-sm text-white/62">
                {overview.headline}
                <span className="text-white/42"> · </span>
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
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/10 bg-slate-950/18 px-3 py-2.5 backdrop-blur-sm"
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/44">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold leading-none text-white">
                    {stat.value}
                  </p>
                </div>
              ))}
            </section>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="flex items-center gap-3 rounded-2xl border border-white/14 bg-white/[0.08] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.12]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/14 bg-cyan-200/12">
                  <Search className="size-[18px] text-cyan-50" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Browse catalog</p>
                  <p className="truncate text-xs text-white/58">{totalAvailableCount} items available</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCustomDialogBodyPart(undefined);
                  setShowCustomDialog(true);
                }}
                className="flex items-center gap-3 rounded-2xl border border-white/14 bg-white/[0.08] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.12]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/14 bg-emerald-200/12">
                  <Sparkles className="size-[18px] text-emerald-50" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Custom item</p>
                  <p className="text-xs text-white/58">Create a stand-in piece</p>
                </div>
              </button>
            </div>

            <div className="pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
              <div className="mt-0.5 flex flex-col gap-4">
                {wardrobeItems.length === 0 ? (
                  <div className="rounded-[26px] border border-dashed border-white/22 bg-white/[0.08] px-5 py-5 backdrop-blur-sm">
                    <p className="text-base font-semibold text-white/92">No gear added yet</p>
                    <p className="mt-2 text-sm leading-6 text-white/66">
                      Start with the pieces you use most often. Even a few key layers make recommendations far more useful.
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/42">
                      Tip: tap a zone above to jump straight into that part of the catalog.
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
                        onHeadingClick={() => setPickerBodyPart(part)}
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
          availableItems={availableItems}
          wardrobeItemIds={wardrobeItemIds}
          adding={adding}
          justAdded={justAdded}
          onAddItem={addItem}
          onCreateCustom={() => {
            setCustomDialogBodyPart(pickerBodyPart ? bodyPartToFilterKey(pickerBodyPart) : undefined);
            setPickerBodyPart(null);
            setShowCustomDialog(true);
          }}
        />
      )}

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
