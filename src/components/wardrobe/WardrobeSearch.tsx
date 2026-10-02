import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, X, Minus, SlidersHorizontal, ChevronDown, ChevronUp, ExternalLink, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { chipClassName } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AvailableItem } from "@/types/wardrobe";
import { typeIcons, typeLabels, formatCategory } from "./wardrobe-utils";

interface WardrobeSearchProps {
  search: string;
  onSearchChange: (value: string) => void;
  filteredItems: AvailableItem[];
  totalMatches: number;
  shownMatches: number;
  groupedItems: Record<string, AvailableItem[]>;
  adding: string | null;
  justAdded: string | null;
  onAddItem: (item: AvailableItem) => void;
  onRemoveItem: (itemId: string) => void;
  wardrobeItemIds: Set<string>;
  brandFilter: string | null;
  onBrandFilterChange: (brand: string | null) => void;
  searchBodyPartFilter: "all" | "torso" | "legs" | "hands" | "headNeck";
  onSearchBodyPartFilterChange: (value: "all" | "torso" | "legs" | "hands" | "headNeck") => void;
  searchLayerFilter: "all" | "base" | "mid" | "outer";
  onSearchLayerFilterChange: (value: "all" | "base" | "mid" | "outer") => void;
  searchSort: "bestMatch" | "alpha" | "clo";
  onSearchSortChange: (value: "bestMatch" | "alpha" | "clo") => void;
  onClearFilters: () => void;
  availableBrands: string[];
}

const BODY_AREA_OPTIONS: { value: WardrobeSearchProps["searchBodyPartFilter"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "torso", label: "Torso" },
  { value: "legs", label: "Legs" },
  { value: "hands", label: "Hands" },
  { value: "headNeck", label: "Head/Neck" },
];

const LAYER_LABELS: Record<WardrobeSearchProps["searchLayerFilter"], string> = {
  all: "All layers",
  base: "Base",
  mid: "Mid",
  outer: "Outer",
};

const SORT_LABELS: Record<WardrobeSearchProps["searchSort"], string> = {
  bestMatch: "Best match",
  alpha: "A-Z",
  clo: "Highest clo",
};

// Two rows of chips. If even this doesn't fit beside the other controls, the
// whole catalog scrolls instead.
const MIN_FILTER_PANEL_HEIGHT = 120;


export function WardrobeSearch({
  search,
  onSearchChange,
  filteredItems,
  totalMatches,
  shownMatches,
  groupedItems,
  adding,
  justAdded,
  onAddItem,
  onRemoveItem,
  wardrobeItemIds,
  brandFilter,
  onBrandFilterChange,
  searchBodyPartFilter,
  onSearchBodyPartFilterChange,
  searchLayerFilter,
  onSearchLayerFilterChange,
  searchSort,
  onSearchSortChange,
  onClearFilters,
  availableBrands,
}: WardrobeSearchProps) {
  const hasSearch = search.trim().length > 0;
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [popoverId, setPopoverId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // ResizeObserver for Safari-safe scroll
  const controlsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [resultsMaxHeight, setResultsMaxHeight] = useState<number | null>(null);
  const [filterPanelMaxHeight, setFilterPanelMaxHeight] = useState<number | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    const container = containerRef.current;
    if (!controls || !container) return;

    const update = () => {
      const containerHeight = container.clientHeight;
      const controlsHeight = controls.offsetHeight;
      // On short screens the open filter panel can outgrow the catalog, so it
      // scrolls within the room the other controls leave. The 14px is the
      // results list's top margin and border.
      const filterPanel = filterPanelRef.current;
      if (filterPanel) {
        const otherControlsHeight = controlsHeight - filterPanel.offsetHeight;
        setFilterPanelMaxHeight(Math.max(MIN_FILTER_PANEL_HEIGHT, containerHeight - otherControlsHeight - 14));
      }
      setResultsMaxHeight(Math.max(0, containerHeight - controlsHeight - 12));
    };

    const observer = new ResizeObserver(update);
    observer.observe(controls);
    observer.observe(container);
    update();

    return () => observer.disconnect();
  }, []);


  // Close popover on click outside
  useEffect(() => {
    if (!popoverId) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverId(null);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [popoverId]);

  const hasActiveFilters =
    brandFilter !== null ||
    searchLayerFilter !== "all" ||
    searchSort !== "bestMatch";
  const activeFilters = useMemo(
    () => [
      brandFilter
        ? {
            key: `brand-${brandFilter}`,
            label: `Brand: ${brandFilter}`,
            onClear: () => onBrandFilterChange(null),
          }
        : null,
      searchLayerFilter !== "all"
        ? {
            key: `layer-${searchLayerFilter}`,
            label: `Layer: ${LAYER_LABELS[searchLayerFilter]}`,
            onClear: () => onSearchLayerFilterChange("all"),
          }
        : null,
      searchSort !== "bestMatch"
        ? {
            key: `sort-${searchSort}`,
            label: `Sort: ${SORT_LABELS[searchSort]}`,
            onClear: () => onSearchSortChange("bestMatch"),
          }
        : null,
    ].filter((filter): filter is { key: string; label: string; onClear: () => void } => Boolean(filter)),
    [
      brandFilter,
      searchLayerFilter,
      searchSort,
      onBrandFilterChange,
      onSearchLayerFilterChange,
      onSearchSortChange,
    ]
  );
  const filterSummary = useMemo(
    () => {
      if (!hasActiveFilters) {
        return "All gear · Best match";
      }

      const summaryParts: string[] = [];
      if (brandFilter) summaryParts.push(brandFilter);
      if (searchLayerFilter !== "all") summaryParts.push(LAYER_LABELS[searchLayerFilter]);
      if (searchSort !== "bestMatch") summaryParts.push(SORT_LABELS[searchSort]);
      return summaryParts.join(" · ");
    },
    [hasActiveFilters, brandFilter, searchLayerFilter, searchSort]
  );

  return (
    <div ref={containerRef} className="h-full overflow-y-auto">
      <div ref={controlsRef}>
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search the catalog"
            placeholder="Search by brand, model, or category..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-11"
          />
          {hasSearch && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Body Part Pills */}
        <div role="group" aria-label="Body area" className="mt-3 flex flex-wrap gap-2">
          {BODY_AREA_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={searchBodyPartFilter === option.value}
              onClick={() => onSearchBodyPartFilterChange(option.value)}
              className={chipClassName}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Filter toggle bar */}
        <button
          type="button"
          aria-expanded={filtersExpanded}
          aria-controls="wardrobe-filter-panel"
          onClick={() => setFiltersExpanded((current) => !current)}
          className="mt-3 flex w-full items-center justify-between gap-2 rounded-control border border-input bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
        >
          <div className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Filters</p>
              <p className="truncate text-sm text-muted-foreground">{filterSummary}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeFilters.length > 0 && (
              <Badge size="sm" variant="primary" className="tabular-nums">
                {activeFilters.length}
              </Badge>
            )}
            {filtersExpanded ? (
              <ChevronUp aria-hidden="true" className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {activeFilters.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={filter.onClear}
                aria-label={`Clear ${filter.label}`}
                className={chipClassName}
              >
                {filter.label}
                <X aria-hidden="true" />
              </button>
            ))}
            <Button type="button" variant="link" size="sm" onClick={onClearFilters}>
              Clear all
            </Button>
          </div>
        )}

        {filtersExpanded && (
          <div
            ref={filterPanelRef}
            id="wardrobe-filter-panel"
            className="mt-2 space-y-3 overflow-y-auto rounded-control bg-muted p-3"
            style={filterPanelMaxHeight !== null ? { maxHeight: filterPanelMaxHeight } : undefined}
          >
            {/* Layer */}
            <div role="group" aria-labelledby="wardrobe-filter-layer">
              <p id="wardrobe-filter-layer" className="mb-1.5 text-sm font-medium text-foreground">Layer</p>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "base", "mid", "outer"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={searchLayerFilter === v}
                    onClick={() => { onSearchLayerFilterChange(v); setFiltersExpanded(false); }}
                    className={chipClassName}
                  >
                    {LAYER_LABELS[v]}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div role="group" aria-labelledby="wardrobe-filter-sort">
              <p id="wardrobe-filter-sort" className="mb-1.5 text-sm font-medium text-foreground">Sort</p>
              <div className="flex flex-wrap gap-1.5">
                {(["bestMatch", "alpha", "clo"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={searchSort === v}
                    onClick={() => { onSearchSortChange(v); setFiltersExpanded(false); }}
                    className={chipClassName}
                  >
                    {SORT_LABELS[v]}
                  </button>
                ))}
              </div>
            </div>

            {/* Brand */}
            <div role="group" aria-labelledby="wardrobe-filter-brand">
              <p id="wardrobe-filter-brand" className="mb-1.5 text-sm font-medium text-foreground">Brand</p>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                <button
                  type="button"
                  aria-pressed={brandFilter === null}
                  onClick={() => { onBrandFilterChange(null); setFiltersExpanded(false); }}
                  className={chipClassName}
                >
                  All brands
                </button>
                {availableBrands.map((brand) => (
                  <button
                    key={brand}
                    type="button"
                    aria-pressed={brandFilter === brand}
                    onClick={() => { onBrandFilterChange(brand); setFiltersExpanded(false); }}
                    className={chipClassName}
                  >
                    {brand}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results List */}
      <div
        className="mt-3 overflow-y-auto rounded-card border border-border bg-card"
        style={resultsMaxHeight !== null ? { maxHeight: resultsMaxHeight } : undefined}
      >
        {filteredItems.length > 0 && (
          <div className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">
              {hasSearch ? (
                <>{shownMatches}{totalMatches > shownMatches ? ` of ${totalMatches}` : ""} results</>
              ) : (
                <>All available items ({shownMatches})</>
              )}
            </p>
            <p className="text-xs text-muted-foreground">Tap an item for options</p>
          </div>
        )}
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-foreground">
              {hasSearch ? "No items found" : "No items available"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasSearch
                ? "Try adjusting your filters or search query"
                : "Select a body part filter to browse by category"
              }
            </p>
          </div>
        ) : (
          Object.entries(groupedItems).map(([type, items]) => {
              if (items.length === 0) return null;
              const Icon = typeIcons[type as keyof typeof typeIcons];
              return (
                <div key={type}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    <Icon aria-hidden="true" className="size-3.5" />
                    {typeLabels[type as keyof typeof typeLabels]}
                  </div>
                  {items.map((item) => {
                    const isAdding = adding === item.id;
                    const wasJustAdded = justAdded === item.id;
                    const isInWardrobe = wardrobeItemIds.has(item.id);
                    const isPopoverOpen = popoverId === item.id;
                    const buyUrl = `https://www.google.com/search?q=${encodeURIComponent(`buy ${item.brand} ${item.model_name}`)}`;

                    return (
                      <div key={item.id} className="relative">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-expanded={isPopoverOpen}
                          aria-haspopup="dialog"
                          onClick={() => setPopoverId(isPopoverOpen ? null : item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setPopoverId(isPopoverOpen ? null : item.id);
                            }
                          }}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-2.5 py-2.5 text-left transition-colors",
                            isPopoverOpen
                              ? "border-l-[3px] border-l-primary bg-primary-soft pl-[9px] pr-3"
                              : "px-3 hover:bg-accent"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="truncate text-sm font-semibold leading-tight text-foreground">
                              {item.model_name}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {item.brand}
                              {item.category && (
                                <span className="ml-1.5">· {formatCategory(item.category)}</span>
                              )}
                              {typeof item.rcl_clo === "number" && (
                                <span className="ml-1.5 font-medium">· {item.rcl_clo.toFixed(2)} clo</span>
                              )}
                            </div>
                          </div>

                          {(isInWardrobe || wasJustAdded) && (
                            <Badge size="sm" variant="success">
                              <Check aria-hidden="true" />
                              Added
                            </Badge>
                          )}
                        </div>

                        {/* Popover */}
                        {isPopoverOpen && (
                          <div
                            ref={popoverRef}
                            className="absolute right-3 z-20 mt-[-4px] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2 rounded-card border border-border bg-popover px-2 py-1.5 text-popover-foreground shadow-lg"
                          >
                            {isAdding ? (
                              <span role="status" className="px-1 text-sm text-muted-foreground">Adding...</span>
                            ) : isInWardrobe || wasJustAdded ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveItem(item.id);
                                }}
                                className="hover:border-destructive hover:bg-destructive-soft hover:text-destructive"
                              >
                                <Minus />
                                Remove from wardrobe
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddItem(item);
                                }}
                              >
                                <Plus />
                                Add to wardrobe
                              </Button>
                            )}
                            <Button asChild variant="outline" size="sm">
                              <a
                                href={buyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink />
                                Buy it
                              </a>
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
          })
        )}
        {hasSearch && totalMatches > shownMatches && (
          <div className="border-t border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground">
            Showing the top {shownMatches} matches. Keep typing to narrow results.
          </div>
        )}
      </div>
    </div>
  );
}
