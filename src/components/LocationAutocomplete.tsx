"use client";

import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Mountain, Search } from "lucide-react";
import { LocationSuggestion } from "@/types/recommendations";
import { Ref, RefObject, useEffect, useRef, useState } from "react";
import { FieldError } from "@/components/FieldError";
import { cn } from "@/lib/utils";
import { forecastPointText, placeKey } from "@/lib/locationSuggestion";
import type { LocationSearchStatus } from "@/hooks/useLocationSearch";

interface LocationAutocompleteProps {
  id?: string;
  label?: string;
  placeholder?: string;
  location: string;
  locationQuery: string;
  suggestions: LocationSuggestion[];
  showSuggestions: boolean;
  selectedLocation: LocationSuggestion | null;
  isSearching?: boolean;
  /** Validation message to show under the field; marks the input invalid. */
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
  suggestionRef: RefObject<HTMLDivElement | null>;
  onLocationInputChange: (value: string) => void;
  onLocationFocus: () => void;
  onSelectLocation: (suggestion: LocationSuggestion) => void;
  onDismiss?: () => void;
  /** Where the search is (useLocationSearch's `status`); shows empty and failed searches. */
  status?: LocationSearchStatus;
  /** A resort-only search offers Search all places for a resort the catalog misses. */
  canSearchAllPlaces?: boolean;
  onSearchAllPlaces?: () => void;
  /** All places searched, but only resorts came back: the place search failed. */
  placesUnavailable?: boolean;
}

/** The search-state props a picker takes from useLocationSearch. */
export type LocationSearchStateProps = Pick<LocationAutocompleteProps, "status" | "canSearchAllPlaces" | "onSearchAllPlaces" | "placesUnavailable">;

export function searchStateProps(search: {
  status: LocationSearchStatus; canSearchAllPlaces: boolean; searchAllPlaces: () => void; placesUnavailable: boolean;
}): LocationSearchStateProps {
  return {
    status: search.status, canSearchAllPlaces: search.canSearchAllPlaces,
    onSearchAllPlaces: search.searchAllPlaces, placesUnavailable: search.placesUnavailable,
  };
}

/** "Ski resort · Vermont, United States". */
function placeDetail(suggestion: LocationSuggestion): string {
  const where = [suggestion.region, suggestion.country].filter(Boolean).join(", ");
  return suggestion.kind === "resort" ? ["Ski resort", where].filter(Boolean).join(" · ") : where;
}

const RESORT_CREDIT = (
  <>
    Resort data ©{" "}
    <a className="underline" href="https://openskimap.org/" target="_blank" rel="noreferrer">OpenSkiMap</a>
    {" "}and{" "}
    <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
    {" "}contributors
  </>
);

export function LocationAutocomplete({
  id = "location",
  label,
  placeholder = "Search for a city...",
  location,
  locationQuery,
  suggestions,
  showSuggestions,
  selectedLocation,
  isSearching = false,
  error,
  inputRef,
  suggestionRef,
  onLocationInputChange,
  onLocationFocus,
  onSelectLocation,
  onDismiss,
  status,
  canSearchAllPlaces = false,
  onSearchAllPlaces,
  placesUnavailable = false,
}: LocationAutocompleteProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [flipUp, setFlipUp] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const answered = status === "results" || status === "empty" || status === "error";
  // Search all places is the last option, after any resorts, so the keyboard reaches it.
  const offerAllPlaces = canSearchAllPlaces && !!onSearchAllPlaces && answered && locationQuery.length >= 2;
  const optionCount = suggestions.length + (offerAllPlaces ? 1 : 0);
  const showMessage = !selectedLocation && (status === "empty" || status === "error");
  const open = showSuggestions && (optionCount > 0 || showMessage);
  const listboxId = `${id}-listbox`;
  const errorId = `${id}-error`;
  const pointId = `${id}-point`;
  const optionId = (i: number) => `${id}-option-${i}`;
  const hasResorts = suggestions.some((suggestion) => suggestion.kind === "resort");
  const picked = selectedLocation ? forecastPointText(selectedLocation) : null;
  const describedBy = [error ? errorId : null, picked ? pointId : null].filter(Boolean).join(" ") || undefined;

  const choose = (index: number) => {
    if (index < suggestions.length) onSelectLocation(suggestions[index]);
    else if (offerAllPlaces) onSearchAllPlaces?.();
  };

  // What a screen reader hears once a search answers.
  const announcement = !showSuggestions || !answered ? ""
    : status === "error" ? "Couldn't search locations. Try again."
    : status === "empty" ? (canSearchAllPlaces ? "No ski resorts match. Search all places is available." : "No places match.")
    : `${suggestions.length} ${suggestions.length === 1 ? "result" : "results"}${suggestions[0]?.match === "typo" ? `. Did you mean ${suggestions[0].name}?` : ""}`;

  // Reset activeIndex when suggestions change
  const [prevSuggestions, setPrevSuggestions] = useState(suggestions);
  if (suggestions !== prevSuggestions) {
    setPrevSuggestions(suggestions);
    setActiveIndex(-1);
  }

  // Flip dropdown upward if there isn't enough space below (e.g. mobile nav bar)
  useEffect(() => {
    if (!open || !suggestionRef.current) return;
    const rect = suggestionRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    // 240px = max-h-60, 80px buffer for mobile nav bar
    setFlipUp(spaceBelow < 240 + 80);
  }, [open, suggestionRef]);

  // Scroll active option into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined;
      activeEl?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || optionCount === 0) {
      if (open && e.key === "Escape") {
        e.preventDefault();
        onDismiss?.();
        return;
      }
      if (e.key === "ArrowDown" && optionCount > 0) {
        e.preventDefault();
        onLocationFocus();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < optionCount - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev <= 0 ? optionCount - 1 : prev - 1
        );
        break;
      case "Enter":
        if (activeIndex >= 0) {
          e.preventDefault();
          choose(activeIndex);
        }
        break;
      case "Escape":
        e.preventDefault();
        setActiveIndex(-1);
        onDismiss?.();
        break;
      case "Tab":
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          onSelectLocation(suggestions[activeIndex]);
        } else {
          onDismiss?.();
        }
        break;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <div className="relative" ref={suggestionRef}>
        {isSearching ? (
          <Loader2 className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <MapPin className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          placeholder={placeholder}
          value={selectedLocation ? location : locationQuery}
          onChange={(e) => onLocationInputChange(e.target.value)}
          onFocus={onLocationFocus}
          onKeyDown={handleKeyDown}
          className="h-12 pl-10"
          autoComplete="off"
        />
        {open && (
          <div
            className={cn(
              "absolute inset-x-0 z-50 rounded-control border border-border bg-popover p-1 text-popover-foreground shadow-lg",
              flipUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
            )}
          >
            {showMessage && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {status === "error"
                  ? "Couldn't search locations. Try again."
                  : canSearchAllPlaces ? "No ski resorts match." : "No places match."}
              </p>
            )}
            {optionCount > 0 && (
              <ul id={listboxId} role="listbox" ref={listRef} aria-label="Locations" className="max-h-60 overflow-auto">
                {suggestions.map((suggestion, i) => (
                  <li
                    key={placeKey(suggestion)}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={cn(
                      "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[calc(var(--radius)-4px)] px-3 py-2 text-left text-base transition-colors hover:bg-accent md:min-h-9 md:text-sm pointer-coarse:min-h-11",
                      i === activeIndex && "bg-accent text-accent-foreground"
                    )}
                    onClick={() => onSelectLocation(suggestion)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    {suggestion.kind === "resort" && <Mountain className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    <span>
                      {suggestion.match === "typo" && <span className="text-muted-foreground">Did you mean </span>}
                      <span className="font-medium">{suggestion.name}</span>
                      {suggestion.match === "typo" && <span className="text-muted-foreground">?</span>}
                      <span className="text-muted-foreground">{suggestion.kind === "resort" ? " · " : ", "}{placeDetail(suggestion)}</span>
                    </span>
                  </li>
                ))}
                {offerAllPlaces && (
                  <li
                    id={optionId(suggestions.length)}
                    role="option"
                    aria-selected={activeIndex === suggestions.length}
                    className={cn(
                      "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[calc(var(--radius)-4px)] px-3 py-2 text-left text-base font-medium text-primary transition-colors hover:bg-accent md:min-h-9 md:text-sm pointer-coarse:min-h-11",
                      activeIndex === suggestions.length && "bg-accent"
                    )}
                    onClick={() => onSearchAllPlaces?.()}
                    onMouseEnter={() => setActiveIndex(suggestions.length)}
                  >
                    <Search className="size-4 shrink-0" aria-hidden />
                    Search all places
                  </li>
                )}
              </ul>
            )}
            {placesUnavailable && (
              <p className="px-3 pt-1 text-xs text-muted-foreground">Other places couldn&apos;t be searched. Showing ski resorts only.</p>
            )}
            {hasResorts && <p className="px-3 pb-1 pt-1 text-xs text-muted-foreground">{RESORT_CREDIT}</p>}
          </div>
        )}
        <span className="sr-only" aria-live="polite" aria-atomic="true" data-testid={`${id}-announcement`}>{announcement}</span>
      </div>
      {picked && (
        <p id={pointId} className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Mountain className="size-4 shrink-0" aria-hidden />
          Ski resort · {picked}
        </p>
      )}
      {error && (
        <FieldError id={errorId}>
          {error}
        </FieldError>
      )}
    </div>
  );
}
