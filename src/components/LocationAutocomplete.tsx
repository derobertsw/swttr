"use client";

import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { LocationSuggestion } from "@/types/recommendations";
import { RefObject } from "react";
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
}: LocationAutocompleteProps) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-white/80">
          {label}
        </label>
      )}
      <div className="relative" ref={suggestionRef}>
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
        <Input
          id={id}
          placeholder={placeholder}
          value={selectedLocation ? location : locationQuery}
          onChange={(e) => onLocationInputChange(e.target.value)}
          onFocus={onLocationFocus}
          className={`pl-10 h-12 ${FROSTED_INPUT_FULL}`}
          autoComplete="off"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className={`absolute top-full left-0 right-0 mt-1.5 ${SUGGESTIONS_DROPDOWN} z-50 max-h-60 overflow-auto`}>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="w-full px-4 py-2.5 text-left hover:bg-muted/50 text-sm transition-colors"
                onClick={() => onSelectLocation(suggestion)}
              >
                <span className="font-medium">{suggestion.name}</span>
                <span className="text-muted-foreground/65">
                  {suggestion.region ? `, ${suggestion.region}` : ""}, {suggestion.country}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
