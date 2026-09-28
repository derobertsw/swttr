"use client";

import { LocationSuggestion } from "@/types/recommendations";
import { Ref, RefObject } from "react";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { DeviceLocationButton } from "@/components/DeviceLocationButton";
import type { DeviceLocationStatus } from "@/hooks/useDeviceLocation";

interface LocationInputProps {
  activityName: string;
  location: string;
  locationQuery: string;
  suggestions: LocationSuggestion[];
  showSuggestions: boolean;
  selectedLocation: LocationSuggestion | null;
  isSearching?: boolean;
  /** Says a place is needed while none is picked; set after Gear Up is pressed without one. */
  showErrors?: boolean;
  /** Where the request for the device's location stands. */
  locationStatus: DeviceLocationStatus;
  /** Disables Use my location while layers load. */
  loading?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  suggestionRef: RefObject<HTMLDivElement | null>;
  onLocationInputChange: (value: string) => void;
  onLocationFocus: () => void;
  onSelectLocation: (suggestion: LocationSuggestion) => void;
  onDismiss?: () => void;
  onUseMyLocation: () => void;
  onCancelLocating: () => void;
}

/** Where the outing is: a place to search for, or the device's location when asked for it. */
export function LocationInput({
  activityName,
  location,
  locationQuery,
  suggestions,
  showSuggestions,
  selectedLocation,
  isSearching,
  showErrors = false,
  locationStatus,
  loading = false,
  inputRef,
  suggestionRef,
  onLocationInputChange,
  onLocationFocus,
  onSelectLocation,
  onDismiss,
  onUseMyLocation,
  onCancelLocating,
}: LocationInputProps) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <LocationAutocomplete
        label={`Where are you ${activityName}?`}
        location={location}
        locationQuery={locationQuery}
        suggestions={suggestions}
        showSuggestions={showSuggestions}
        selectedLocation={selectedLocation}
        isSearching={isSearching}
        error={showErrors && !selectedLocation ? "Search for a place, or use your location." : undefined}
        inputRef={inputRef}
        suggestionRef={suggestionRef}
        onLocationInputChange={onLocationInputChange}
        onLocationFocus={onLocationFocus}
        onSelectLocation={onSelectLocation}
        onDismiss={onDismiss}
      />
      <DeviceLocationButton
        label="Use my location"
        status={locationStatus}
        disabled={loading}
        onLocate={onUseMyLocation}
        onCancel={onCancelLocating}
      />
    </div>
  );
}
