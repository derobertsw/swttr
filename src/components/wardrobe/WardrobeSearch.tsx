import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, X, Minus, SlidersHorizontal, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  const [resultsMaxHeight, setResultsMaxHeight] = useState<number | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    const container = containerRef.current;
    if (!controls || !container) return;

    const update = () => {
      const containerHeight = container.clientHeight;
      const controlsHeight = controls.offsetHeight;
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
    <div ref={containerRef} className="h-full overflow-hidden">
      <div ref={controlsRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            placeholder="Search by brand, model, or category..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 border-slate-300 bg-white pl-10 pr-10 text-slate-900 placeholder:text-slate-400"
          />
          {hasSearch && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Body Part Pills */}
        <div className="mt-3 flex flex-wrap gap-2">
          {BODY_AREA_OPTIONS.map((option) => (
            <div
              key={option.value}
              role="button"
              tabIndex={0}
              aria-pressed={searchBodyPartFilter === option.value}
              onClick={() => onSearchBodyPartFilterChange(option.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSearchBodyPartFilterChange(option.value);
                }
              }}
              className={`select-none rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer ${
                searchBodyPartFilter === option.value
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {option.label}
            </div>
          ))}
        </div>

        {/* Filter toggle bar */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={filtersExpanded}
          aria-controls="wardrobe-filter-panel"
          onClick={() => setFiltersExpanded((current) => !current)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFiltersExpanded((current) => !current);
            }
          }}
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left cursor-pointer select-none hover:border-slate-300 hover:bg-slate-100"
        >
          <div className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="size-4 text-slate-500" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Filters</p>
              <p className="truncate text-xs text-slate-700">{filterSummary}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeFilters.length > 0 && (
              <span className="rounded-full border border-blue-300 bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                {activeFilters.length}
              </span>
            )}
            {filtersExpanded ? (
              <ChevronUp className="size-4 text-slate-500" />
            ) : (
              <ChevronDown className="size-4 text-slate-500" />
            )}
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {activeFilters.map((filter) => (
              <div
                key={filter.key}
                role="button"
                tabIndex={0}
                onClick={filter.onClear}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); filter.onClear(); }
                }}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] text-slate-700 cursor-pointer select-none hover:bg-slate-200"
              >
                {filter.label}
                <X className="size-3" />
              </div>
            ))}
            <div
              role="button"
              tabIndex={0}
              onClick={onClearFilters}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClearFilters(); }
              }}
              className="text-[11px] font-medium text-slate-600 cursor-pointer select-none hover:text-slate-900"
            >
              Clear all
            </div>
          </div>
        )}

        {filtersExpanded && (
          <div
            id="wardrobe-filter-panel"
            className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3"
          >
            {/* Layer */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">Layer</p>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "base", "mid", "outer"] as const).map((v) => (
                  <div
                    key={v}
                    role="button"
                    tabIndex={0}
                    onClick={() => { onSearchLayerFilterChange(v); setFiltersExpanded(false); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSearchLayerFilterChange(v); setFiltersExpanded(false); }
                    }}
                    className={`select-none rounded-full px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                      searchLayerFilter === v
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {LAYER_LABELS[v]}
                  </div>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">Sort</p>
              <div className="flex flex-wrap gap-1.5">
                {(["bestMatch", "alpha", "clo"] as const).map((v) => (
                  <div
                    key={v}
                    role="button"
                    tabIndex={0}
                    onClick={() => { onSearchSortChange(v); setFiltersExpanded(false); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSearchSortChange(v); setFiltersExpanded(false); }
                    }}
                    className={`select-none rounded-full px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                      searchSort === v
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {SORT_LABELS[v]}
                  </div>
                ))}
              </div>
            </div>

            {/* Brand */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1.5">Brand</p>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { onBrandFilterChange(null); setFiltersExpanded(false); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBrandFilterChange(null); setFiltersExpanded(false); }
                  }}
                  className={`select-none rounded-full px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                    brandFilter === null
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  All brands
                </div>
                {availableBrands.map((brand) => (
                  <div
                    key={brand}
                    role="button"
                    tabIndex={0}
                    onClick={() => { onBrandFilterChange(brand); setFiltersExpanded(false); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBrandFilterChange(brand); setFiltersExpanded(false); }
                    }}
                    className={`select-none rounded-full px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                      brandFilter === brand
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {brand}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results List */}
      <div
        className="mt-3 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm"
        style={resultsMaxHeight !== null ? { maxHeight: resultsMaxHeight } : undefined}
      >
        {filteredItems.length > 0 && (
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-3 py-2.5">
            <p className="text-xs font-medium text-slate-700">
              {hasSearch ? (
                <>{shownMatches}{totalMatches > shownMatches ? ` of ${totalMatches}` : ""} results</>
              ) : (
                <>All available items ({shownMatches})</>
              )}
            </p>
            <p className="text-[11px] text-slate-500">Tap an item for options</p>
          </div>
        )}
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              {hasSearch ? "No items found" : "No items available"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
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
                  <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                    <Icon className="size-3 opacity-60" />
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
                          className={`flex w-full items-center gap-2.5 py-2.5 text-left cursor-pointer hover:bg-slate-50/80 ${isPopoverOpen ? "bg-blue-50 border-l-[3px] border-l-blue-500 pl-[9px] pr-3" : "px-3"}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="truncate text-[14px] font-semibold leading-tight text-slate-900">
                              {item.model_name}
                            </div>
                            <div className="mt-0.5 truncate text-[12px] text-slate-700/76">
                              {item.brand}
                              {item.category && (
                                <span className="ml-1.5">· {formatCategory(item.category)}</span>
                              )}
                              {typeof item.rcl_clo === "number" && (
                                <span className="ml-1.5 font-medium opacity-80">· {item.rcl_clo.toFixed(2)} clo</span>
                              )}
                            </div>
                          </div>

                          {(isInWardrobe || wasJustAdded) && (
                            <span className="shrink-0 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              Added
                            </span>
                          )}
                        </div>

                        {/* Popover */}
                        {isPopoverOpen && (
                          <div
                            ref={popoverRef}
                            className="absolute right-3 z-20 mt-[-4px] flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-lg"
                          >
                            {isAdding ? (
                              <span className="text-xs text-slate-500 px-1">Adding...</span>
                            ) : isInWardrobe || wasJustAdded ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveItem(item.id);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                              >
                                <Minus className="size-3.5" />
                                Remove from wardrobe
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddItem(item);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                              >
                                <Plus className="size-3.5" />
                                Add to wardrobe
                              </button>
                            )}
                            <a
                              href={buyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/60 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100/80"
                            >
                              <ExternalLink className="size-3.5" />
                              Buy it
                            </a>
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
          <div className="border-t border-slate-200 px-3 py-2.5 text-[11px] text-slate-500 bg-slate-50">
            Showing the top {shownMatches} matches. Keep typing to narrow results.
          </div>
        )}
      </div>
    </div>
  );
}
