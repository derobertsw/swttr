import { useMemo, useState } from "react";
import { Search, Plus, Check, X, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FROSTED_INPUT_FULL, SUGGESTIONS_DROPDOWN } from "@/lib/styling";
import type { AvailableItem } from "@/types/wardrobe";
import { typeIcons, typeLabels, getItemIcon, formatCategory } from "./wardrobe-utils";

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

const BODY_AREA_LABELS: Record<WardrobeSearchProps["searchBodyPartFilter"], string> = {
  all: "All areas",
  torso: "Torso",
  legs: "Legs",
  hands: "Hands",
  headNeck: "Head/Neck",
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
  search,
  onSearchChange,
  filteredItems,
  totalMatches,
  shownMatches,
  groupedItems,
  adding,
  justAdded,
  onAddItem,
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
  const hasActiveFilters =
    brandFilter !== null ||
    searchBodyPartFilter !== "all" ||
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
      searchBodyPartFilter !== "all"
        ? {
            key: `area-${searchBodyPartFilter}`,
            label: BODY_AREA_LABELS[searchBodyPartFilter],
            onClear: () => onSearchBodyPartFilterChange("all"),
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
      searchBodyPartFilter,
      searchLayerFilter,
      searchSort,
      onBrandFilterChange,
      onSearchBodyPartFilterChange,
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
      if (searchBodyPartFilter !== "all") summaryParts.push(BODY_AREA_LABELS[searchBodyPartFilter]);
      if (searchLayerFilter !== "all") summaryParts.push(LAYER_LABELS[searchLayerFilter]);
      if (searchSort !== "bestMatch") summaryParts.push(SORT_LABELS[searchSort]);
      return summaryParts.join(" · ");
    },
    [hasActiveFilters, brandFilter, searchBodyPartFilter, searchLayerFilter, searchSort]
  );

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/70" />
        <Input
          placeholder="Search by brand, model, or category..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`pl-10 pr-10 h-11 ${FROSTED_INPUT_FULL}`}
        />
        {hasSearch && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/75 hover:bg-white/15 hover:text-white transition-colors"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setFiltersExpanded((current) => !current)}
        className="mt-1.5 flex w-full items-center justify-between rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-left transition-colors hover:border-white/30 hover:bg-white/12 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/35"
        aria-expanded={filtersExpanded}
        aria-controls="wardrobe-filter-panel"
      >
        <div className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal className="size-4 text-white/65" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-white/60">Filters</p>
            <p className="truncate text-xs text-white/78">{filterSummary}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeFilters.length > 0 && (
            <span className="rounded-full border border-white/25 bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white/85">
              {activeFilters.length}
            </span>
          )}
          {filtersExpanded ? (
            <ChevronUp className="size-4 text-white/70" />
          ) : (
            <ChevronDown className="size-4 text-white/70" />
          )}
        </div>
      </button>

      {activeFilters.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={filter.onClear}
              className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/12 px-2.5 py-1 text-[11px] text-white/85 hover:bg-white/20"
            >
              {filter.label}
              <X className="size-3" />
            </button>
          ))}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-[11px] font-medium text-white/75 hover:text-white"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {filtersExpanded && (
        <div
          id="wardrobe-filter-panel"
          className="mt-1.5 rounded-lg border border-white/20 bg-white/10 p-1.5"
        >
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-white/60">Brand</span>
              <select
                value={brandFilter ?? "all"}
                onChange={(event) => onBrandFilterChange(event.target.value === "all" ? null : event.target.value)}
                className="h-8 rounded-md border border-white/25 bg-white/15 px-2 text-xs text-white outline-none focus:border-white/45"
              >
                <option value="all" className="text-slate-900">All brands</option>
                {availableBrands.map((brand) => (
                  <option key={brand} value={brand} className="text-slate-900">
                    {brand}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-white/60">Body area</span>
              <select
                value={searchBodyPartFilter}
                onChange={(event) => onSearchBodyPartFilterChange(event.target.value as "all" | "torso" | "legs" | "hands" | "headNeck")}
                className="h-8 rounded-md border border-white/25 bg-white/15 px-2 text-xs text-white outline-none focus:border-white/45"
              >
                <option value="all" className="text-slate-900">All areas</option>
                <option value="torso" className="text-slate-900">Torso</option>
                <option value="legs" className="text-slate-900">Legs</option>
                <option value="hands" className="text-slate-900">Hands</option>
                <option value="headNeck" className="text-slate-900">Head/Neck</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-white/60">Layer</span>
              <select
                value={searchLayerFilter}
                onChange={(event) => onSearchLayerFilterChange(event.target.value as "all" | "base" | "mid" | "outer")}
                className="h-8 rounded-md border border-white/25 bg-white/15 px-2 text-xs text-white outline-none focus:border-white/45"
              >
                <option value="all" className="text-slate-900">All layers</option>
                <option value="base" className="text-slate-900">Base</option>
                <option value="mid" className="text-slate-900">Mid</option>
                <option value="outer" className="text-slate-900">Outer</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-white/60">Sort</span>
              <select
                value={searchSort}
                onChange={(event) => onSearchSortChange(event.target.value as "bestMatch" | "alpha" | "clo")}
                className="h-8 rounded-md border border-white/25 bg-white/15 px-2 text-xs text-white outline-none focus:border-white/45"
              >
                <option value="bestMatch" className="text-slate-900">Best match</option>
                <option value="alpha" className="text-slate-900">A-Z</option>
                <option value="clo" className="text-slate-900">Highest clo</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {hasSearch && (
        <div className={`absolute z-20 w-full mt-1.5 ${SUGGESTIONS_DROPDOWN} max-h-[55vh] overflow-y-auto`}>
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-md">
            <p className="text-xs font-medium text-slate-700">
              {shownMatches}
              {totalMatches > shownMatches ? ` of ${totalMatches}` : ""} results
            </p>
            <p className="text-[11px] text-slate-500">Tap + to add an item to your wardrobe</p>
          </div>
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
                    const disableAdd = isAdding || wasJustAdded;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onAddItem(item)}
                        disabled={disableAdd}
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
                              style={{ animation: "checkmark-pop 0.3s ease-out forwards" }}
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
          {totalMatches > shownMatches && (
            <div className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">
              Showing the top {shownMatches} matches. Keep typing to narrow results.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
