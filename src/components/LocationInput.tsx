"use client";

import { LocationSuggestion } from "@/types/recommendations";
import { RefObject } from "react";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";

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
    <div className="w-[300px]">
      <LocationAutocomplete
        label={`Where are you ${activityName}?`}
        location={location}
        locationQuery={locationQuery}
        suggestions={suggestions}
        showSuggestions={showSuggestions}
        selectedLocation={selectedLocation}
        suggestionRef={suggestionRef}
        onLocationInputChange={onLocationInputChange}
        onLocationFocus={onLocationFocus}
        onSelectLocation={onSelectLocation}
      />
    </div>
  );
}
