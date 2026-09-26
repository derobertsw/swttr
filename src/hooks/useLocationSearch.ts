"use client";

import { useState, useEffect, useRef } from "react";
import { LocationSuggestion } from "@/types/recommendations";
import { logWarn } from "@/lib/logger";

const MIN_QUERY_LENGTH = 2;

export function useLocationSearch() {
  const [location, setLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (locationQuery.length < MIN_QUERY_LENGTH) return;

    let cancelled = false;
    const fetchSuggestions = async () => {
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(locationQuery)}`);
        const data = await response.json();
        if (cancelled) return;
        setSuggestions(data.results || []);
        setShowSuggestions(true);
      } catch (error) {
        logWarn("useLocationSearch", error);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
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
    setIsSearching(false);
  };

  const handleLocationInputChange = (value: string) => {
    if (selectedLocation) {
      setSelectedLocation(null);
      setLocation("");
    }
    setLocationQuery(value);
    if (value.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsSearching(false);
    } else {
      setIsSearching(true);
    }
  };

  const dismiss = () => setShowSuggestions(false);

  const reset = () => {
    setLocation("");
    setLocationQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedLocation(null);
    setIsSearching(false);
  };

  return {
    location,
    locationQuery,
    suggestions,
    showSuggestions,
    selectedLocation,
    isSearching,
    suggestionRef,
    setShowSuggestions,
    handleSelectLocation,
    handleLocationInputChange,
    dismiss,
    reset,
  };
}
