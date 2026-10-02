"use client";

import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";
import { LocationSuggestion } from "@/types/recommendations";
import { Ref, RefObject, useEffect, useRef, useState } from "react";
import { FieldError } from "@/components/FieldError";
import { cn } from "@/lib/utils";

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
}

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
}: LocationAutocompleteProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [flipUp, setFlipUp] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const open = showSuggestions && suggestions.length > 0;
  const listboxId = `${id}-listbox`;
  const errorId = `${id}-error`;
  const optionId = (i: number) => `${id}-option-${i}`;

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
    if (!open) {
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        e.preventDefault();
        onLocationFocus();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev <= 0 ? suggestions.length - 1 : prev - 1
        );
        break;
      case "Enter":
        if (activeIndex >= 0) {
          e.preventDefault();
          onSelectLocation(suggestions[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setActiveIndex(-1);
        onDismiss?.();
        break;
      case "Tab":
        if (activeIndex >= 0) {
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
          aria-describedby={error ? errorId : undefined}
          placeholder={placeholder}
          value={selectedLocation ? location : locationQuery}
          onChange={(e) => onLocationInputChange(e.target.value)}
          onFocus={onLocationFocus}
          onKeyDown={handleKeyDown}
          className="h-12 pl-10"
          autoComplete="off"
        />
        {open && (
          <ul
            id={listboxId}
            role="listbox"
            ref={listRef}
            className={cn(
              "absolute inset-x-0 z-50 max-h-60 overflow-auto rounded-control border border-border bg-popover p-1 text-popover-foreground shadow-lg",
              flipUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
            )}
          >
            {suggestions.map((suggestion, i) => (
              <li
                key={suggestion.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                className={cn(
                  "flex min-h-11 w-full cursor-pointer items-center rounded-[calc(var(--radius)-4px)] px-3 py-2 text-left text-base transition-colors hover:bg-accent md:min-h-9 md:text-sm pointer-coarse:min-h-11",
                  i === activeIndex && "bg-accent text-accent-foreground"
                )}
                onClick={() => onSelectLocation(suggestion)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span>
                  <span className="font-medium">{suggestion.name}</span>
                  <span className="text-muted-foreground">
                    {suggestion.region ? `, ${suggestion.region}` : ""}, {suggestion.country}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <FieldError id={errorId}>
          {error}
        </FieldError>
      )}
    </div>
  );
}
