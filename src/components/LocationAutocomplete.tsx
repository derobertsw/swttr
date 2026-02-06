"use client";

import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { LocationSuggestion } from "@/types/recommendations";
import { RefObject, useEffect, useRef, useState } from "react";
import { FROSTED_INPUT_FULL, SUGGESTIONS_DROPDOWN } from "@/lib/styling";

interface LocationAutocompleteProps {
  id?: string;
  label?: string;
  placeholder?: string;
  location: string;
  locationQuery: string;
  suggestions: LocationSuggestion[];
  showSuggestions: boolean;
  selectedLocation: LocationSuggestion | null;
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
  suggestionRef,
  onLocationInputChange,
  onLocationFocus,
  onSelectLocation,
  onDismiss,
}: LocationAutocompleteProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const open = showSuggestions && suggestions.length > 0;
  const listboxId = `${id}-listbox`;
  const optionId = (i: number) => `${id}-option-${i}`;

  // Reset activeIndex when suggestions change
  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

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
        <label htmlFor={id} className="text-sm font-medium text-white/80">
          {label}
        </label>
      )}
      <div className="relative" ref={suggestionRef}>
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/75 z-10" />
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={selectedLocation ? location : locationQuery}
          onChange={(e) => onLocationInputChange(e.target.value)}
          onFocus={onLocationFocus}
          onKeyDown={handleKeyDown}
          className={`pl-10 h-12 ${FROSTED_INPUT_FULL}`}
          autoComplete="off"
        />
        {open && (
          <ul
            id={listboxId}
            role="listbox"
            ref={listRef}
            className={`absolute top-full left-0 right-0 mt-1.5 ${SUGGESTIONS_DROPDOWN} z-50 max-h-60 overflow-auto`}
          >
            {suggestions.map((suggestion, i) => (
              <li
                key={suggestion.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors cursor-pointer hover:bg-muted/50 ${
                  i === activeIndex ? "bg-muted/50" : ""
                }`}
                onClick={() => onSelectLocation(suggestion)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="font-medium">{suggestion.name}</span>
                <span className="text-muted-foreground/65">
                  {suggestion.region ? `, ${suggestion.region}` : ""}, {suggestion.country}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
