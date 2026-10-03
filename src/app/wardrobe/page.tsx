"use client";

import { useMemo, useRef, useState } from "react";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, RotateCcw, RotateCw, Search, X } from "lucide-react";
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
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWardrobe } from "@/hooks/useWardrobe";
import { WardrobeSearch } from "@/components/wardrobe/WardrobeSearch";
import { BodyPartSection, sectionHeadingId } from "@/components/wardrobe/BodyPartSection";
import { BodyAreaChips } from "@/components/wardrobe/BodyAreaChips";
import { ItemDetailCard } from "@/components/wardrobe";
import { ItemThumbnail } from "@/components/wardrobe/ItemThumbnail";
import { WardrobeItemRow, rowActionsId, rowButtonId } from "@/components/wardrobe/WardrobeItemRow";
import { CreateCustomItemDialog } from "@/components/wardrobe/CreateCustomItemDialog";
import { buildWardrobeOverview } from "@/components/wardrobe/wardrobe-overview";
import {
  BODY_AREAS,
  formatBodyPartLabel,
  getItemBodyArea,
  getItemCategoryLabel,
} from "@/components/wardrobe/wardrobe-utils";
import type { BodyPart, WardrobeItem } from "@/types/wardrobe";

const ADD_GEAR_ID = "wardrobe-add-gear";
const ADD_FIRST_ID = "wardrobe-add-first";

/** The page's add action: Add gear, or Add your first item when the wardrobe is empty. */
function addAction() {
  return document.getElementById(ADD_GEAR_ID) ?? document.getElementById(ADD_FIRST_ID);
}

/** Focuses an element once the next render has settled, if it still exists. */
function focusLater(getTarget: () => HTMLElement | null) {
  requestAnimationFrame(() => getTarget()?.focus());
}

/**
 * Radix returns focus only to a DialogTrigger, and these overlays open from
 * code. Each remembers the control that opened it and returns focus there,
 * or to a fallback when a tap didn't focus it.
 */
function useReturnFocus() {
  const opener = useRef<{ element: HTMLElement | null; fallback: () => HTMLElement | null } | null>(null);

  const remember = (fallback: () => HTMLElement | null) => {
    const active = document.activeElement;
    opener.current = {
      element: active instanceof HTMLElement && active !== document.body ? active : null,
      fallback,
    };
  };

  const restore = (event: Event) => {
    event.preventDefault();
    const saved = opener.current;
    opener.current = null;
    if (!saved) return;
    if (saved.element?.isConnected) {
      saved.element.focus();
    } else {
      // A tap leaves nothing focused, or the opener went away; don't scroll
      // the list to the fallback.
      saved.fallback()?.focus({ preventScroll: true });
    }
  };

  const forget = () => {
    opener.current = null;
  };

  return { remember, restore, forget };
}

export default function Wardrobe() {
  const isMobile = useIsMobile();
  const {
    wardrobeStatus,
    retryWardrobe,
    wardrobeItems,
    ownedSearch,
    setOwnedSearch,
    ownedBodyArea,
    setOwnedBodyArea,
    clearOwnedFilters,
    ownedMatchCount,
    ownedGroups,
    selectedItem,
    setSelectedItemId,
    rowStates,
    retryRow,
    dismissRowError,
    removeItem,
    setExcluded,
    recentlyRemoved,
    restoreItem,
    clearRecentlyRemoved,
    addCreatedItem,
    announcement,
    catalogStatus,
    retryCatalog,
    catalogStates,
    totalAvailableCount,
    search,
    setSearch,
    filteredItems,
    totalMatches,
    shownMatches,
    groupedItems,
    wardrobeItemIds,
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
    removeByItemId,
  } = useWardrobe();
  const [catalogOpen, setCatalogOpen] = useState(false);
  // The details keep their item while they close, so they can animate out.
  const [detailOpen, setDetailOpen] = useState(false);
  // Add gear and the custom item form it hands over to return focus to
  // whatever opened Add gear.
  const addFocus = useReturnFocus();
  const detailFocus = useReturnFocus();
  // Set while the catalog hands over to the custom item form, which then owns focus.
  const handingOffToCustomForm = useRef(false);
  // A new key per opening starts the custom item form fresh.
  const [customForm, setCustomForm] = useState<{
    open: boolean;
    key: number;
    defaults?: { bodyPart?: BodyPart; name?: string };
  }>({ open: false, key: 0 });
  // Set when the custom item form created a row, which then takes focus.
  const createdRowId = useRef<string | null>(null);

  const overview = useMemo(() => buildWardrobeOverview(wardrobeItems), [wardrobeItems]);
  const isReady = wardrobeStatus === "ready";
  // An empty wardrobe has its own call to add the first item.
  const isEmpty = isReady && overview.totalItems === 0;
  const isFiltering = ownedSearch.trim() !== "" || ownedBodyArea !== "all";

  const openCatalog = (options?: { bodyArea?: BodyPart; query?: string }) => {
    addFocus.remember(addAction);
    clearSearchFilters();
    setSearchBodyPartFilter(options?.bodyArea ?? "all");
    setSearch(options?.query ?? "");
    setCatalogOpen(true);
  };

  const openCustomForm = (defaults?: { bodyPart?: BodyPart; name?: string }) =>
    setCustomForm((prev) => ({ open: true, key: prev.key + 1, defaults }));

  // The catalog closes without returning focus; the form returns it later.
  const addSimilarFromCatalog = () => {
    handingOffToCustomForm.current = true;
    setCatalogOpen(false);
    openCustomForm({
      bodyPart: searchBodyPartFilter === "all" ? undefined : searchBodyPartFilter,
      name: search.trim() || undefined,
    });
  };

  const handleItemCreated = (item: WardrobeItem) => {
    addCreatedItem(item);
    // Show the whole wardrobe so the new row is there to take focus.
    clearOwnedFilters();
    createdRowId.current = rowButtonId(item.id);
    setCustomForm((prev) => ({ ...prev, open: false }));
  };

  const handleCustomCloseAutoFocus = (event: Event) => {
    const rowId = createdRowId.current;
    createdRowId.current = null;
    if (!rowId) {
      addFocus.restore(event);
      return;
    }
    event.preventDefault();
    addFocus.forget();
    (document.getElementById(rowId) ?? addAction())?.focus();
  };

  const handleCatalogCloseAutoFocus = (event: Event) => {
    if (handingOffToCustomForm.current) {
      handingOffToCustomForm.current = false;
      event.preventDefault();
      return;
    }
    addFocus.restore(event);
  };

  const openDetails = (item: WardrobeItem) => {
    detailFocus.remember(() => document.getElementById(rowButtonId(item.id)));
    setSelectedItemId(item.id);
    setDetailOpen(true);
  };

  /** `fromDetails`: the details dialog was open, so focus always moves on. */
  const handleRemove = async (item: WardrobeItem, { fromDetails = false } = {}) => {
    const order = ownedGroups.flatMap((group) => group.items.map((i) => i.id));
    const index = order.indexOf(item.id);
    const neighborId = order[index + 1] ?? order[index - 1];
    const removed = await removeItem(item.id);
    if (!removed) return;
    // The removed row took focus with it. Move to the next row, else the
    // section heading, unless the user has already moved on.
    focusLater(() => {
      const focusLost = !document.activeElement || document.activeElement === document.body;
      if (!fromDetails && !focusLost) return null;
      return (
        (neighborId ? document.getElementById(rowActionsId(neighborId)) : null) ??
        document.getElementById(sectionHeadingId(getItemBodyArea(item))) ??
        addAction()
      );
    });
  };

  const handleRestore = async (item: WardrobeItem) => {
    const restored = await restoreItem(item);
    if (!restored) return;
    focusLater(
      () => document.getElementById(rowButtonId(restored.id)) ?? addAction()
    );
  };

  const catalog = (
    <WardrobeSearch
      status={catalogStatus}
      onRetry={retryCatalog}
      search={search}
      onSearchChange={setSearch}
      filteredItems={filteredItems}
      totalMatches={totalMatches}
      shownMatches={shownMatches}
      groupedItems={groupedItems}
      catalogStates={catalogStates}
      onAddItem={(item) => void addItem(item)}
      onRemoveItem={(itemId) => void removeByItemId(itemId)}
      onAddSimilar={addSimilarFromCatalog}
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
  );
  const catalogDescription =
    catalogStatus === "ready"
      ? `Search ${totalAvailableCount} catalog items for gear you own.`
      : "Search the catalog for gear you own.";
  const addSimilarPrompt = (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p className="text-sm text-muted-foreground">Can&apos;t find it?</p>
      <Button type="button" variant="outline" size="sm" onClick={addSimilarFromCatalog}>
        <Plus />
        Add a similar item
      </Button>
    </div>
  );

  return (
    <PageLayout chromeVariant="compact">
      <div className="flex w-full max-w-3xl flex-col gap-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-title font-semibold text-foreground md:text-title-lg">Wardrobe</h1>
            {isReady && !isEmpty && <p className="mt-1 text-sm text-muted-foreground">{overview.countLine}</p>}
          </div>
          {!isEmpty && (
            <Button id={ADD_GEAR_ID} type="button" disabled={!isReady} onClick={() => openCatalog()}>
              <Plus />
              Add gear
            </Button>
          )}
        </header>

        <p role="status" className="sr-only">
          {announcement}
        </p>

        {wardrobeStatus === "loading" && (
          <div aria-busy="true" aria-label="Loading your wardrobe" className="flex flex-col gap-3 py-2">
            <Skeleton className="h-11 w-full rounded-control" />
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-20 w-full rounded-card" />
          </div>
        )}

        {wardrobeStatus === "error" && (
          <Card role="alert" className="flex flex-col items-start gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Couldn&apos;t load your wardrobe</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Check your connection and try again. Nothing in your wardrobe was changed.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={retryWardrobe}>
              <RotateCw />
              Retry
            </Button>
          </Card>
        )}

        {isEmpty && (
          <section aria-labelledby="wardrobe-empty" className="rounded-card border border-dashed border-border p-5">
            <h2 id="wardrobe-empty" className="text-base font-semibold text-foreground">
              Add the gear you own
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Recommendations use the gear in your wardrobe, so start with the pieces you wear most. You can add more
              anytime.
            </p>
            <Button id={ADD_FIRST_ID} type="button" className="mt-4" onClick={() => openCatalog()}>
              <Plus />
              Add your first item
            </Button>
            <p className="mt-5 text-sm font-medium text-foreground">Or start with</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BODY_AREAS.map((area) => (
                <Button
                  key={area}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openCatalog({ bodyArea: area })}
                >
                  {formatBodyPartLabel(area)}
                </Button>
              ))}
            </div>
          </section>
        )}

        {isReady && overview.totalItems > 0 && (
          <>
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Search my gear"
                  placeholder="Search my gear"
                  value={ownedSearch}
                  onChange={(event) => setOwnedSearch(event.target.value)}
                  className="pr-11 pl-10"
                />
                {ownedSearch && (
                  // 36px, 44px on phones and touch, where it fills the field's height.
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setOwnedSearch("")}
                    className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground max-md:right-0 pointer-coarse:right-0"
                    aria-label="Clear search"
                  >
                    <X />
                  </Button>
                )}
              </div>
              <BodyAreaChips value={ownedBodyArea} onChange={setOwnedBodyArea} />
            </div>

            {overview.allExcluded && !isFiltering && (
              <Card variant="muted" padding="sm">
                <p className="text-sm text-foreground">
                  Every item is excluded, so recommendations can&apos;t use any of your gear. Use an item&apos;s
                  menu to include it again.
                </p>
              </Card>
            )}

            {isFiltering && ownedMatchCount === 0 ? (
              <div className="rounded-card border border-dashed border-border p-5 text-center">
                <p className="font-medium text-foreground">
                  {ownedSearch.trim()
                    ? `None of your gear matches “${ownedSearch.trim()}”`
                    : `No ${formatBodyPartLabel(ownedBodyArea as BodyPart).toLowerCase()} gear in your wardrobe`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">This searches only gear you&apos;ve added.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={clearOwnedFilters}>
                    Show all my gear
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openCatalog({
                        query: ownedSearch.trim(),
                        bodyArea: ownedBodyArea === "all" ? undefined : ownedBodyArea,
                      })
                    }
                  >
                    <Search />
                    Search the catalog
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {ownedGroups
                  .filter((group) => !isFiltering || group.items.length > 0)
                  .map((group) => (
                    <BodyPartSection
                      key={group.area}
                      area={group.area}
                      itemCount={group.items.length}
                      onAddGear={() => openCatalog({ bodyArea: group.area })}
                    >
                      {group.items.map((item) => (
                        <WardrobeItemRow
                          key={item.id}
                          item={item}
                          state={rowStates[item.id]}
                          onOpen={() => openDetails(item)}
                          onSetExcluded={(excluded) => void setExcluded(item.id, excluded)}
                          onRemove={() => void handleRemove(item)}
                          onRetry={() => retryRow(item.id)}
                          onDismissError={() => dismissRowError(item.id)}
                        />
                      ))}
                    </BodyPartSection>
                  ))}
              </div>
            )}
          </>
        )}

        {recentlyRemoved.length > 0 && (
          <section aria-labelledby="recently-removed" className="mt-2 rounded-card border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 id="recently-removed" className="text-sm font-semibold text-foreground">
                Recently removed
              </h2>
              <Button type="button" variant="ghost" size="sm" onClick={clearRecentlyRemoved}>
                <X />
                Dismiss
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">You can restore these until you leave or reload this page.</p>
            <ul className="mt-2 flex flex-col divide-y divide-border">
              {recentlyRemoved.map((item) => {
                const state = catalogStates[item.item_id];
                return (
                  <li key={item.item_id} className="flex items-center gap-3 py-2">
                    <ItemThumbnail item={item} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{item.details.model_name}</p>
                      <p className="truncate text-sm text-muted-foreground">{getItemCategoryLabel(item)}</p>
                      {state?.failed && (
                        <p role="alert" className="text-sm font-medium text-destructive">
                          Couldn&apos;t restore it. Try again.
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      loading={state !== undefined && !state.failed}
                      onClick={() => void handleRestore(item)}
                      aria-label={`Restore ${item.details.model_name}`}
                    >
                      <RotateCcw />
                      Restore
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <ItemDetailCard
        item={selectedItem}
        state={selectedItem ? rowStates[selectedItem.id] : undefined}
        open={detailOpen && selectedItem !== null}
        onOpenChange={setDetailOpen}
        onSetExcluded={(excluded) => {
          if (selectedItem) void setExcluded(selectedItem.id, excluded);
        }}
        onRemove={() => {
          if (!selectedItem) return;
          setDetailOpen(false);
          void handleRemove(selectedItem, { fromDetails: true });
        }}
        onRetry={() => {
          if (selectedItem) retryRow(selectedItem.id);
        }}
        onCloseAutoFocus={detailFocus.restore}
      />

      <CreateCustomItemDialog
        key={customForm.key}
        open={customForm.open}
        onOpenChange={(open) => setCustomForm((prev) => ({ ...prev, open }))}
        defaults={customForm.defaults}
        onItemCreated={handleItemCreated}
        onCloseAutoFocus={handleCustomCloseAutoFocus}
      />

      {isMobile ? (
        <Drawer open={catalogOpen} onOpenChange={setCatalogOpen}>
          <DrawerContent showCloseButton className="h-[95dvh]" onCloseAutoFocus={handleCatalogCloseAutoFocus}>
            <div className="flex min-h-0 w-full flex-1 flex-col">
              <DrawerHeader className="flex-none pr-14 pb-3">
                <DrawerTitle>Add gear</DrawerTitle>
                <DrawerDescription>{catalogDescription}</DrawerDescription>
              </DrawerHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{catalog}</div>
              <DrawerFooter className="flex-none py-3">{addSimilarPrompt}</DrawerFooter>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
          <DialogContent
            className="flex h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
            onCloseAutoFocus={handleCatalogCloseAutoFocus}
          >
            <DialogHeader className="flex-none border-b border-border px-6 py-4">
              <DialogTitle>Add gear</DialogTitle>
              <DialogDescription>{catalogDescription}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{catalog}</div>
            <div className="flex-none border-t border-border px-6 py-3">{addSimilarPrompt}</div>
          </DialogContent>
        </Dialog>
      )}
    </PageLayout>
  );
}
