"use client";

import { useState, useEffect, useRef } from "react";
import { LocationSuggestion } from "@/types/recommendations";
import { logWarn } from "@/lib/logger";
import { pickedPlace, type LocationSearchKind } from "@/lib/locationSuggestion";

const MIN_QUERY_LENGTH = 2;

/** A place as shown once it's picked, e.g. "Stowe, Vermont, United States". */
export function formatLocationName(suggestion: LocationSuggestion): string {
  return [suggestion.name, suggestion.region, suggestion.country].filter(Boolean).join(", ");
}

/** Where a search is: typing, answered with places, answered with none, or failed. */
export type LocationSearchStatus = "idle" | "loading" | "results" | "empty" | "error";

interface LocationSearchOptions {
  /**
   * "resort" searches ski resorts only, with a Search all places fallback;
   * "all" searches resorts and places; undefined runs the general search.
   */
  kind?: LocationSearchKind;
}

export function useLocationSearch({ kind }: LocationSearchOptions = {}) {
  const [location, setLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState<LocationSearchStatus>("idle");
  const [placesUnavailable, setPlacesUnavailable] = useState(false);
  // "Search all places", chosen while the activity searches resorts. A new
  // activity starts from its own kind of search again.
  const [allPlaces, setAllPlaces] = useState(false);
  const [lastKind, setLastKind] = useState(kind);
  if (kind !== lastKind) {
    setLastKind(kind);
    setAllPlaces(false);
  }
  const searchKind: LocationSearchKind | undefined = kind === "resort" && allPlaces ? "all" : kind;
  const suggestionRef = useRef<HTMLDivElement>(null);

  // A new query or a new kind of search asks again; an answer to an older one is dropped.
  useEffect(() => {
    if (locationQuery.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();
    const fetchSuggestions = async () => {
      setIsSearching(true);
      setStatus("loading");
      try {
        const params = new URLSearchParams({ q: locationQuery, ...(searchKind ? { kind: searchKind } : {}) });
        const response = await fetch(`/api/geocode?${params}`, { signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok || !Array.isArray(data?.results)) {
          setSuggestions([]);
          setStatus("error");
        } else {
          setSuggestions(data.results);
          setStatus(data.results.length ? "results" : "empty");
        }
        setPlacesUnavailable(data?.placesUnavailable === true);
        setShowSuggestions(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        logWarn("useLocationSearch", error);
        setSuggestions([]);
        setStatus("error");
        setShowSuggestions(true);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => {
      controller.abort();
      clearTimeout(debounce);
    };
  }, [locationQuery, searchKind]);

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
    const place = pickedPlace(suggestion);
    setSelectedLocation(place);
    setLocation(formatLocationName(place));
    setLocationQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    setIsSearching(false);
    setStatus("idle");
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
      setStatus("idle");
    } else {
      setIsSearching(true);
      setStatus("loading");
    }
  };

  /** Widen a resort search to every place; the typed query searches again. */
  const searchAllPlaces = () => {
    setAllPlaces(true);
    if (locationQuery.length >= MIN_QUERY_LENGTH) {
      setIsSearching(true);
      setStatus("loading");
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
    setStatus("idle");
    setAllPlaces(false);
  };

  return {
    location,
    locationQuery,
    suggestions,
    showSuggestions,
    selectedLocation,
    isSearching,
    status,
    placesUnavailable,
    /** The search being run: "resort", "all", or undefined for the general search. */
    searchKind,
    /** Whether Search all places is on offer: a resort-only search. */
    canSearchAllPlaces: searchKind === "resort",
    suggestionRef,
    setShowSuggestions,
    handleSelectLocation,
    handleLocationInputChange,
    searchAllPlaces,
    dismiss,
    reset,
  };
}
