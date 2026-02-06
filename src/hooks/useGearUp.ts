"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import layerRecommendations from "@/data/layerRecommendations.json";
import { Recommendation } from "@/types/recommendations";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { convertLegacyRecommendation, type LegacyRecommendation } from "@/lib/layers";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { usePreferences } from "@/hooks/usePreferences";
import { useBiophysicsRecommendation } from "@/hooks/useBiophysicsRecommendation";
import { fetchCurrentWeather, fetchWeatherByCoords } from "@/hooks/useCurrentWeather";
import { BiophysicsRecommendation } from "@/types/biophysics";
import { ACTIVITIES, DEFAULT_ACTIVITY } from "@/data/activities";
import { STORAGE_KEYS } from "@/lib/storage";

type InputMode = "manual" | "planAhead";

export function useGearUp() {
  const searchParams = useSearchParams();
  const { sensitivity, defaultActivity } = usePreferences();

  const [activity, setActivity] = useState(DEFAULT_ACTIVITY);
  const [hasSetInitialActivity, setHasSetInitialActivity] = useState(false);
  const [temperature, setTemperature] = useState(50);
  const [windspeed, setWindspeed] = useState(10);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showSliders, setShowSliders] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>(() =>
    searchParams.get("mode") === "planAhead" ? "planAhead" : "manual"
  );
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("12:00");
  const [loading, setLoading] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [biophysicsData, setBiophysicsData] = useState<BiophysicsRecommendation | null>(null);

  const locationSearch = useLocationSearch();
  const biophysics = useBiophysicsRecommendation();
  const didAutoGearUp = useRef(false);

  // Set initial activity from preferences when it loads
  useEffect(() => {
    if (!hasSetInitialActivity && defaultActivity) {
      setActivity(defaultActivity);
      setHasSetInitialActivity(true);
    }
  }, [defaultActivity, hasSetInitialActivity]);

  // Update input mode when URL param changes
  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "planAhead") {
      setInputMode("planAhead");
    }
  }, [searchParams]);

  const getRecommendation = useCallback((temp: number): Recommendation | null => {
    const tempRange = getAdjustedTempRange(temp, sensitivity);
    const activityData =
      layerRecommendations[activity as keyof typeof layerRecommendations];

    if (activityData) {
      const legacyRec = activityData[tempRange as keyof typeof activityData];
      if (legacyRec) {
        return convertLegacyRecommendation(legacyRec as LegacyRecommendation);
      }
    }
    return null;
  }, [activity, sensitivity]);

  const resetToInitialState = useCallback(() => {
    setActivity(defaultActivity);
    setTemperature(50);
    setWindspeed(10);
    setRecommendation(null);
    setShowResults(false);
    setShowSliders(false);
    setInputMode("manual");
    setDate(undefined);
    setTime("12:00");
    setLocationDenied(false);
    locationSearch.reset();
    biophysics.reset();
    setBiophysicsData(null);
  }, [locationSearch, defaultActivity, biophysics]);

  const handleSubmit = useCallback(async () => {
    if (!activity) {
      toast.error("Please select an activity");
      return;
    }

    if (inputMode === "planAhead") {
      if (!locationSearch.selectedLocation) {
        toast.error("Please select a location");
        return;
      }
      if (!date) {
        toast.error("Please select a date");
        return;
      }

      setLoading(true);
      try {
        const dateStr = format(date, "yyyy-MM-dd");
        const dateTime = `${dateStr}T${time}`;
        const { selectedLocation } = locationSearch;

        const response = await fetch(
          `/api/weather?lat=${selectedLocation.latitude}&lon=${selectedLocation.longitude}&datetime=${dateTime}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch forecast");
        }

        const data = await response.json();
        const layers = getRecommendation(data.temperature);

        setTemperature(data.temperature);
        setWindspeed(data.windSpeed);
        setRecommendation(layers);

        const bioData = await biophysics.fetch(activity, { temperature: data.temperature, windSpeed: data.windSpeed });
        setBiophysicsData(bioData);
        setShowResults(true);
      } catch (error) {
        toast.error("Failed to fetch weather forecast");
        console.error(error);
      } finally {
        setLoading(false);
      }
    } else if (showSliders) {
      setLoading(true);
      const layers = getRecommendation(temperature);
      setRecommendation(layers);

      const bioData = await biophysics.fetch(activity, { temperature, windSpeed: windspeed });
      setBiophysicsData(bioData);
      setShowResults(true);
      setLoading(false);
    } else if (locationDenied) {
      if (!locationSearch.selectedLocation) {
        toast.error("Please enter a location");
        return;
      }

      setLoading(true);
      const { selectedLocation } = locationSearch;
      const weather = await fetchWeatherByCoords(
        selectedLocation.latitude,
        selectedLocation.longitude
      );

      if (weather) {
        setTemperature(weather.temperature);
        setWindspeed(weather.windSpeed);
        const layers = getRecommendation(weather.temperature);
        setRecommendation(layers);

        const bioData = await biophysics.fetch(activity, { temperature: weather.temperature, windSpeed: weather.windSpeed });
        setBiophysicsData(bioData);
        setShowResults(true);
      } else {
        toast.error("Could not get weather for this location.");
      }
      setLoading(false);
    } else {
      setLoading(true);
      const result = await fetchCurrentWeather();

      if (result.data) {
        setTemperature(result.data.temperature);
        setWindspeed(result.data.windSpeed);
        const layers = getRecommendation(result.data.temperature);
        setRecommendation(layers);

        const bioData = await biophysics.fetch(activity, { temperature: result.data.temperature, windSpeed: result.data.windSpeed });
        setBiophysicsData(bioData);
        setShowResults(true);
      } else if (result.locationDenied) {
        toast.error("Location access denied. Please enter your location manually.");
        setLocationDenied(true);
      } else {
        toast.error("Could not get current weather. Please set manually.");
        setShowSliders(true);
      }
      setLoading(false);
    }
  }, [
    activity,
    biophysics,
    date,
    getRecommendation,
    inputMode,
    locationDenied,
    locationSearch,
    showSliders,
    temperature,
    time,
    windspeed,
  ]);

  // Listen for gearUp events from navigation
  useEffect(() => {
    const onGearUp = () => {
      void handleSubmit();
    };
    window.addEventListener("gearUp", onGearUp);
    return () => window.removeEventListener("gearUp", onGearUp);
  }, [handleSubmit]);

  // Auto gear-up from session storage coords
  useEffect(() => {
    const shouldGearUp = searchParams.get("gearUp");
    if (!shouldGearUp || didAutoGearUp.current) return;
    didAutoGearUp.current = true;

    const stored = typeof window !== "undefined"
      ? sessionStorage.getItem("swttr-gearup-coords")
      : null;
    const geoDenied = searchParams.get("geoDenied");

    if (stored) {
      sessionStorage.removeItem("swttr-gearup-coords");
      try {
        const coords = JSON.parse(stored) as { latitude: number; longitude: number };
        setLoading(true);
        void (async () => {
          const weather = await fetchWeatherByCoords(coords.latitude, coords.longitude);
          if (weather) {
            setTemperature(weather.temperature);
            setWindspeed(weather.windSpeed);
            const layers = getRecommendation(weather.temperature);
            setRecommendation(layers);
            const bioData = await biophysics.fetch(activity, {
              temperature: weather.temperature,
              windSpeed: weather.windSpeed,
            });
            setBiophysicsData(bioData);
            setShowResults(true);
          } else {
            setShowSliders(true);
          }
          setLoading(false);
        })();
        return;
      } catch {
        // fall through to manual
      }
    }

    if (geoDenied) {
      setLocationDenied(true);
    }
    setShowSliders(true);
  }, [searchParams, activity, biophysics, getRecommendation]);

  // Dispatch activity change events and persist to localStorage
  useEffect(() => {
    const activityName =
      ACTIVITIES.find((item) => item.value === activity)?.name ?? "";
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, activity);
    }
    window.dispatchEvent(
      new CustomEvent("activityChange", { detail: { name: activityName, value: activity } })
    );
  }, [activity]);

  // Dispatch loading events
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("gearUpLoading", { detail: loading }));
  }, [loading]);

  return {
    // State
    activity,
    setActivity,
    temperature,
    setTemperature,
    windspeed,
    setWindspeed,
    recommendation,
    showResults,
    showSliders,
    inputMode,
    setInputMode,
    date,
    setDate,
    time,
    setTime,
    loading,
    locationDenied,
    biophysicsData,
    sensitivity,

    // Location search (pass-through)
    locationSearch,

    // Actions
    handleSubmit,
    resetToInitialState,
  };
}
