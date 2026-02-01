"use client";

import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { LocationSuggestion } from "@/types/recommendations";
import { RefObject } from "react";

interface LocationInputProps {
  activityName: string;
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

export function LocationInput({
  activityName,
  location,
  locationQuery,
  suggestions,
  showSuggestions,
  selectedLocation,
  suggestionRef,
  onLocationInputChange,
  onLocationFocus,
  onSelectLocation,
}: LocationInputProps) {
  return (
    <div className="flex flex-col gap-2 w-[300px]">
      <label htmlFor="location" className="text-sm font-medium">
        Where are you {activityName}?
      </label>
      <div className="relative" ref={suggestionRef}>
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
        <Input
          id="location"
          placeholder="Search for a city..."
          value={selectedLocation ? location : locationQuery}
          onChange={(e) => onLocationInputChange(e.target.value)}
          onFocus={onLocationFocus}
          className="pl-10"
          autoComplete="off"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-60 overflow-auto">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm"
                onClick={() => onSelectLocation(suggestion)}
              >
                <span className="font-medium">{suggestion.name}</span>
                <span className="text-gray-500">
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
