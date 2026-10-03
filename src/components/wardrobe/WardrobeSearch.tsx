import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, X, SlidersHorizontal, ChevronDown, ChevronUp, Check, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { chipClassName } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { AvailableItem } from "@/types/wardrobe";
import type { ActionState, BodyAreaFilter, CatalogAction, LoadStatus } from "@/hooks/useWardrobe";
import { getCatalogHeights } from "./catalog-layout";
import { BodyAreaChips } from "./BodyAreaChips";
import { typeIcons, typeLabels, formatCategory } from "./wardrobe-utils";

interface WardrobeSearchProps {
  status: LoadStatus;
  onRetry: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  filteredItems: AvailableItem[];
  totalMatches: number;
  shownMatches: number;
  groupedItems: Record<string, AvailableItem[]>;
  catalogStates: Record<string, ActionState<CatalogAction>>;
  onAddItem: (item: AvailableItem) => void;
  onRemoveItem: (itemId: string) => void;
  /** Opens the custom item form, for gear the catalog doesn't have. */
  onAddSimilar: () => void;
  wardrobeItemIds: Set<string>;
  brandFilter: string | null;
  onBrandFilterChange: (brand: string | null) => void;
  searchBodyPartFilter: BodyAreaFilter;
  onSearchBodyPartFilterChange: (value: BodyAreaFilter) => void;
  searchLayerFilter: "all" | "base" | "mid" | "outer";
  onSearchLayerFilterChange: (value: "all" | "base" | "mid" | "outer") => void;
  searchSort: "bestMatch" | "alpha" | "clo";
  onSearchSortChange: (value: "bestMatch" | "alpha" | "clo") => void;
  onClearFilters: () => void;
  availableBrands: string[];
}

const FAILED_LABELS: Record<CatalogAction, string> = {
  add: "Couldn't add this item. Try again.",
  remove: "Couldn't remove this item. Try again.",
};

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


export function WardrobeSearch({
  status,
  onRetry,
  search,
  onSearchChange,
  filteredItems,
  totalMatches,
  shownMatches,
  groupedItems,
  catalogStates,
  onAddItem,
  onRemoveItem,
  onAddSimilar,
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
      const heights = getCatalogHeights({
        containerHeight: container.clientHeight,
        controlsHeight: controls.offsetHeight,
        filterPanelHeight: filterPanelRef.current?.offsetHeight ?? null,
      });
      setFilterPanelMaxHeight(heights.filterPanelMaxHeight);
      setResultsMaxHeight(heights.resultsMaxHeight);
    };

    const observer = new ResizeObserver(update);
    observer.observe(controls);
    observer.observe(container);
    update();

    return () => observer.disconnect();
  }, []);

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
            aria-label="Search catalog"
            placeholder="Search catalog by brand, model or type"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-11"
          />
          {hasSearch && (
            // 36px, 44px on phones and touch, where it fills the field's height.
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onSearchChange("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground max-md:right-0 pointer-coarse:right-0"
              aria-label="Clear search"
            >
              <X />
            </Button>
          )}
        </div>

        <BodyAreaChips value={searchBodyPartFilter} onChange={onSearchBodyPartFilterChange} className="mt-3" />

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
        {status === "loading" ? (
          <div aria-busy="true" aria-label="Loading the catalog" className="flex flex-col gap-2 p-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : status === "error" ? (
          <div role="alert" className="flex flex-col items-center gap-3 p-8 text-center">
            <div>
              <p className="text-sm font-medium text-foreground">Couldn&apos;t load the catalog</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check your connection and try again, or add a similar item yourself.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RotateCw />
              Retry
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <div>
              <p className="text-sm font-medium text-foreground">
                {hasSearch ? "No catalog items match" : "No catalog items for these filters"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try other words or filters, or add a similar item with estimated warmth.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onAddSimilar}>
              <Plus />
              Add a similar item
            </Button>
          </div>
        ) : (
          <>
            <p className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground">
              {hasSearch ? (
                <>{shownMatches}{totalMatches > shownMatches ? ` of ${totalMatches}` : ""} results</>
              ) : (
                <>All catalog items ({shownMatches})</>
              )}
            </p>
            {Object.entries(groupedItems).map(([type, items]) => {
              if (items.length === 0) return null;
              const Icon = typeIcons[type as keyof typeof typeIcons];
              const headingId = `catalog-group-${type}`;
              return (
                <div key={type} role="group" aria-labelledby={headingId}>
                  <p id={headingId} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    <Icon aria-hidden="true" className="size-3.5" />
                    {typeLabels[type as keyof typeof typeLabels]}
                  </p>
                  <ul>
                    {items.map((item) => (
                      <CatalogRow
                        key={item.id}
                        item={item}
                        owned={wardrobeItemIds.has(item.id)}
                        state={catalogStates[item.id]}
                        onAdd={() => onAddItem(item)}
                        onRemove={() => onRemoveItem(item.id)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
            {hasSearch && totalMatches > shownMatches && (
              <p className="border-t border-border bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                Showing the top {shownMatches} matches. Keep typing to narrow results.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface CatalogRowProps {
  item: AvailableItem;
  owned: boolean;
  state?: ActionState<CatalogAction>;
  onAdd: () => void;
  onRemove: () => void;
}

/** One catalog item, with Add, or In wardrobe and Remove once it's owned. */
function CatalogRow({ item, owned, state, onAdd, onRemove }: CatalogRowProps) {
  const pending = state && !state.failed ? state.action : null;
  const name = `${item.brand} ${item.model_name}`;

  return (
    <li className="flex items-center gap-2 py-2 pr-2 pl-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">{item.model_name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.brand}
          {item.category && <span className="ml-1.5">· {formatCategory(item.category)}</span>}
          {typeof item.rcl_clo === "number" && (
            <span className="ml-1.5 font-medium">· {item.rcl_clo.toFixed(2)} clo</span>
          )}
        </p>
        {state?.failed && (
          <p role="alert" className="mt-1 text-xs font-medium text-destructive">
            {FAILED_LABELS[state.action]}
          </p>
        )}
      </div>

      {owned ? (
        <>
          <Badge size="sm" variant="success" className="shrink-0">
            <Check aria-hidden="true" />
            In wardrobe
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={pending === "remove"}
            onClick={onRemove}
            aria-label={`Remove ${name} from wardrobe`}
            className="shrink-0"
          >
            Remove
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={pending === "add"}
          onClick={onAdd}
          aria-label={`Add ${name} to wardrobe`}
          className="shrink-0"
        >
          <Plus />
          Add
        </Button>
      )}
    </li>
  );
}
