"use client";

import { useState, useEffect, useRef } from "react";
import { LocationSuggestion } from "@/types/recommendations";
import { logWarn } from "@/lib/logger";

export function useLocationSearch() {
  const [location, setLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (locationQuery.length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(locationQuery)}`);
        const data = await response.json();
        setSuggestions(data.results || []);
        setShowSuggestions(true);
      } catch (error) {
        logWarn("useLocationSearch", error);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [locationQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectLocation = (suggestion: LocationSuggestion) => {
    setSelectedLocation(suggestion);
    setLocation(
      suggestion.region
        ? `${suggestion.name}, ${suggestion.region}, ${suggestion.country}`
        : `${suggestion.name}, ${suggestion.country}`
    );
    setLocationQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleLocationInputChange = (value: string) => {
    if (selectedLocation) {
      setSelectedLocation(null);
      setLocation("");
    }
    setLocationQuery(value);
  };

  const reset = () => {
    setLocation("");
    setLocationQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedLocation(null);
  };

  return {
    location,
    locationQuery,
    suggestions,
    showSuggestions,
    selectedLocation,
    suggestionRef,
    setShowSuggestions,
    handleSelectLocation,
    handleLocationInputChange,
    reset,
  };
}
