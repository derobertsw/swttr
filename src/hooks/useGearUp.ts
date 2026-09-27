"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { usePreferences } from "@/hooks/usePreferences";
import { useBiophysicsRecommendation } from "@/hooks/useBiophysicsRecommendation";
import { useActivitySelection } from "@/hooks/useActivitySelection";
import { fetchCurrentWeather, fetchWeatherAt } from "@/hooks/useCurrentWeather";
import {
  buildGearUpResult,
  createInitialState,
  fetchPlanAhead,
  gearUpReducer,
  type InputMode,
} from "@/lib/gearUp";
import { logWarn } from "@/lib/logger";
import type { LocationSuggestion } from "@/types/recommendations";
import type { WeatherData } from "@/types/weather";

/**
 * State and actions for the home page's Gear Up flow: pick an activity, get
 * weather (current location, a searched location, or a multi-day forecast),
 * and fetch layer recommendations for it.
 */
export function useGearUp() {
  const searchParams = useSearchParams();
  const {
    sensitivity,
    defaultActivity,
    hasStoredDefaultActivity,
    bodyMetrics,
    loading: preferencesLoading,
  } = usePreferences();
  const { activity, setActivity, exertion, setExertion, initializing, resetActivity } =
    useActivitySelection(defaultActivity, hasStoredDefaultActivity || !preferencesLoading);

  const initialMode: InputMode = searchParams.get("mode") === "planAhead" ? "planAhead" : "manual";
  const [state, dispatch] = useReducer(gearUpReducer, initialMode, createInitialState);

  const locationSearch = useLocationSearch();
  const biophysics = useBiophysicsRecommendation();

  const setDate = useCallback((d: Date | undefined) => dispatch({ type: "SET_DATE", date: d }), []);
  const setTime = useCallback((t: string) => dispatch({ type: "SET_TIME", time: t }), []);
  const setDurationDays = useCallback((days: number) => {
    const clampedDays = Math.min(7, Math.max(1, Math.round(days)));
    dispatch({ type: "SET_DURATION_DAYS", durationDays: clampedDays });
  }, []);

  // Update input mode when URL param changes
  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "planAhead" && state.inputMode !== "planAhead") {
      dispatch({ type: "SET_INPUT_MODE", mode: "planAhead" });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Recommendations for the given weather and activity. */
  const recommendFor = useCallback(
    (weather: WeatherData, forActivity: string = activity) =>
      buildGearUpResult(weather, forActivity, sensitivity, (act, w) =>
        biophysics.fetch(act, w, exertion, bodyMetrics)
      ),
    [activity, sensitivity, biophysics, exertion, bodyMetrics]
  );

  /**
   * Shows recommendations for a picked place's current weather, or for its
   * forecast at a local date-time there. Resolves false, after saying why,
   * when there's no weather; the inputs stay as they were.
   */
  const recommendAt = useCallback(async (location: LocationSuggestion, localDateTime?: string) => {
    const { data, error } = await fetchWeatherAt(location, localDateTime);
    if (!data) {
      toast.error(error);
      dispatch({ type: "SUBMIT_ERROR" });
      return false;
    }
    dispatch({ type: "SUBMIT_SUCCESS", ...(await recommendFor(data)) });
    return true;
  }, [recommendFor]);

  /** Recommendations for the device's current location. */
  const recommendForCurrentLocation = useCallback(async () => {
    const current = await fetchCurrentWeather();
    if (current.data) return { result: await recommendFor(current.data) };
    return { result: null, locationDenied: Boolean(current.locationDenied) };
  }, [recommendFor]);

  const handleSubmit = useCallback(async () => {
    // The iOS shell's Gear Up action can fire again while a request is running.
    if (state.loading) return;
    if (!activity) {
      toast.error("Please select an activity");
      return;
    }

    if (state.inputMode === "planAhead") {
      if (!locationSearch.selectedLocation) {
        toast.error("Please select a location");
        return;
      }
      if (!state.date) {
        toast.error("Please select a date");
        return;
      }

      dispatch({ type: "SUBMIT_START" });
      if (state.durationDays === 1) {
        // Single day: layers for the forecast hour the outing starts, read on the place's clock.
        await recommendAt(locationSearch.selectedLocation, `${format(state.date, "yyyy-MM-dd")}T${state.time}`);
      } else {
        try {
          const result = await fetchPlanAhead({
            activity,
            sensitivity,
            location: locationSearch.selectedLocation,
            date: state.date,
            time: state.time,
            durationDays: state.durationDays,
          });
          dispatch({ type: "SUBMIT_PLAN_SUCCESS", ...result });
        } catch (error) {
          toast.error("Failed to fetch weather forecast");
          logWarn("useGearUp.handleSubmit", error);
          dispatch({ type: "SUBMIT_ERROR" });
        }
      }
    } else if (state.locationDenied && locationSearch.selectedLocation) {
      dispatch({ type: "SUBMIT_START" });
      await recommendAt(locationSearch.selectedLocation);
    } else {
      dispatch({ type: "SUBMIT_START" });
      const { result, locationDenied } = await recommendForCurrentLocation();

      if (result) {
        dispatch({ type: "SUBMIT_SUCCESS", ...result });
      } else {
        toast.error(
          locationDenied
            ? "Location access denied. Please enter your location manually."
            : "Could not get current weather. Please enter your location manually."
        );
        dispatch({ type: "LOCATION_DENIED" });
        dispatch({ type: "SUBMIT_ERROR" });
      }
    }
  }, [activity, state, locationSearch, sensitivity, recommendAt, recommendForCurrentLocation]);

  // The iOS shell (ios/App/App/SWTTRViewController.swift) dispatches "gearUp"
  // from its native Gear Up tab while this page is open...
  useEffect(() => {
    const onGearUp = () => {
      void handleSubmit();
    };
    window.addEventListener("gearUp", onGearUp);
    return () => window.removeEventListener("gearUp", onGearUp);
  }, [handleSubmit]);

  // ...and otherwise opens /?gearUp=1, which starts in manual location entry.
  const handledGearUpParam = useRef(false);
  useEffect(() => {
    if (!searchParams.get("gearUp") || handledGearUpParam.current) return;
    handledGearUpParam.current = true;
    dispatch({ type: "LOCATION_DENIED" });
  }, [searchParams]);

  const handleWeatherChange = useCallback((location: LocationSuggestion, localDateTime?: string) => {
    dispatch({ type: "SUBMIT_START" });
    return recommendAt(location, localDateTime);
  }, [recommendAt]);

  /** Recommendations for the weather already shown, keeping the outing. */
  const recommendForShownWeather = useCallback(async (forActivity: string, failureMessage: string) => {
    dispatch({ type: "SUBMIT_START" });
    try {
      const shownWeather: WeatherData = {
        temperature: state.temperature,
        windSpeed: state.windspeed,
        precipitation: state.precipitation,
        precipitationType: state.precipitationType,
        context: state.weatherContext ?? undefined,
      };
      dispatch({ type: "SUBMIT_SUCCESS", ...(await recommendFor(shownWeather, forActivity)) });
    } catch (error) {
      toast.error(failureMessage);
      logWarn("useGearUp.recommendForShownWeather", error);
      dispatch({ type: "SUBMIT_ERROR" });
    }
  }, [state.temperature, state.windspeed, state.precipitation, state.precipitationType, state.weatherContext, recommendFor]);

  const handleActivityChange = useCallback(async (newActivity: string) => {
    setActivity(newActivity);
    await recommendForShownWeather(newActivity, "Failed to update activity");
  }, [setActivity, recommendForShownWeather]);

  const handleRetry = useCallback(
    () => recommendForShownWeather(activity, "Failed to load layers"),
    [activity, recommendForShownWeather]
  );

  const handleGoNow = useCallback(async () => {
    if (!activity) {
      toast.error("Please select an activity");
      return;
    }
    dispatch({ type: "SUBMIT_START" });
    const { result, locationDenied } = await recommendForCurrentLocation();
    if (result) {
      dispatch({ type: "SUBMIT_SUCCESS", ...result });
    } else {
      toast.error(
        locationDenied
          ? "Location access denied. Please enter a location or use Plan Ahead."
          : "Could not get current weather."
      );
      dispatch({ type: "SUBMIT_ERROR" });
    }
  }, [activity, recommendForCurrentLocation]);

  const resetToInitialState = useCallback(() => {
    resetActivity();
    dispatch({ type: "RESET" });
    locationSearch.reset();
    biophysics.reset();
  }, [resetActivity, locationSearch, biophysics]);

  return {
    activity,
    setActivity,
    activityInitializing: initializing,
    exertion,
    setExertion,
    temperature: state.temperature,
    windspeed: state.windspeed,
    precipitation: state.precipitation,
    precipitationType: state.precipitationType,
    weatherContext: state.weatherContext,
    recommendation: state.recommendation,
    showResults: state.showResults,
    inputMode: state.inputMode,
    date: state.date,
    setDate,
    time: state.time,
    setTime,
    durationDays: state.durationDays,
    setDurationDays,
    loading: state.loading,
    locationDenied: state.locationDenied,
    biophysicsData: state.biophysicsData,
    biophysicsStatus: state.biophysicsStatus,
    multiDayPlan: state.multiDayPlan,
    locationSearch,
    handleSubmit,
    handleGoNow,
    handleWeatherChange,
    handleActivityChange,
    handleRetry,
    resetToInitialState,
  };
}
