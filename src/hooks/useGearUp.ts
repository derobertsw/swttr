"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { usePreferences } from "@/hooks/usePreferences";
import { useBiophysicsRecommendation } from "@/hooks/useBiophysicsRecommendation";
import { useActivitySelection } from "@/hooks/useActivitySelection";
import { fetchWeatherAt } from "@/hooks/useCurrentWeather";
import { useDeviceLocation, yourLocation } from "@/hooks/useDeviceLocation";
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
 * State and actions for the home page's Gear Up flow: pick an activity and a
 * place (searched for, or the device's own location when asked), get weather
 * there (now, at a later time, or a multi-day forecast), and fetch layer
 * recommendations for it.
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
  const { status: locationStatus, locate, cancel: cancelLocating } = useDeviceLocation();
  const placeInputRef = useRef<HTMLInputElement>(null);
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

  /** Makes the device's position the outing's place, once it's found. */
  const handleUseMyLocation = useCallback(async () => {
    const coordinates = await locate();
    if (coordinates) locationSearch.handleSelectLocation(yourLocation(coordinates));
  }, [locate, locationSearch]);

  const handleSubmit = useCallback(async () => {
    // The iOS shell's Gear Up action can fire again while a request is running,
    // or before a requested location arrives.
    if (state.loading || locationStatus === "locating") return;
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
    } else if (locationSearch.selectedLocation) {
      // Current weather at the chosen place, never silently at the device's location.
      dispatch({ type: "SUBMIT_START" });
      await recommendAt(locationSearch.selectedLocation);
    } else {
      // Render the error first, so the field is announced as invalid when it takes focus.
      flushSync(() => dispatch({ type: "PLACE_MISSING" }));
      placeInputRef.current?.focus();
    }
  }, [activity, state, locationStatus, locationSearch, sensitivity, recommendAt]);

  // The iOS shell (ios/App/App/SWTTRViewController.swift) dispatches "gearUp"
  // from its native Gear Up tab while this page is open, and otherwise opens
  // /?gearUp=1, where the place search already shows.
  useEffect(() => {
    const onGearUp = () => {
      void handleSubmit();
    };
    window.addEventListener("gearUp", onGearUp);
    return () => window.removeEventListener("gearUp", onGearUp);
  }, [handleSubmit]);

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
    // Loading covers finding the location too, so the plan can't be submitted meanwhile.
    dispatch({ type: "SUBMIT_START" });
    const coordinates = await locate();
    if (!coordinates) {
      // The location button says why, unless the request was cancelled.
      dispatch({ type: "SUBMIT_ERROR" });
      return;
    }
    await recommendAt(yourLocation(coordinates));
  }, [activity, locate, recommendAt]);

  const resetToInitialState = useCallback(() => {
    resetActivity();
    cancelLocating();
    dispatch({ type: "RESET" });
    locationSearch.reset();
    biophysics.reset();
  }, [resetActivity, cancelLocating, locationSearch, biophysics]);

  /** Back to the plan form, keeping the activity, place, date, time and duration. */
  const showPlanForm = useCallback(() => dispatch({ type: "SHOW_PLAN_FORM" }), []);

  // The iOS shell (ios/App/App/SWTTRViewController.swift) dispatches
  // "navigatePlanAhead" when its Plan tab is tapped again on this page, and
  // otherwise opens /?mode=planAhead. Installed apps keep sending it.
  useEffect(() => {
    window.addEventListener("navigatePlanAhead", showPlanForm);
    return () => window.removeEventListener("navigatePlanAhead", showPlanForm);
  }, [showPlanForm]);

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
    showPlaceError: state.showPlaceError,
    locationStatus,
    placeInputRef,
    biophysicsData: state.biophysicsData,
    biophysicsStatus: state.biophysicsStatus,
    multiDayPlan: state.multiDayPlan,
    // Typing or picking a place ends a pending location request, so a position
    // that arrives late can't replace the place.
    locationSearch: {
      ...locationSearch,
      handleLocationInputChange: (value: string) => {
        cancelLocating();
        locationSearch.handleLocationInputChange(value);
      },
      handleSelectLocation: (suggestion: LocationSuggestion) => {
        cancelLocating();
        locationSearch.handleSelectLocation(suggestion);
      },
    },
    handleUseMyLocation,
    cancelLocating,
    handleSubmit,
    handleGoNow,
    handleWeatherChange,
    handleActivityChange,
    handleRetry,
    showPlanForm,
    resetToInitialState,
  };
}
