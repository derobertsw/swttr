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
  buildLayersResult,
  createInitialState,
  fetchPlanAhead,
  forecastDateTime,
  gearUpReducer,
  outingTimeAt,
  PlanAheadError,
  type InputMode,
} from "@/lib/gearUp";
import { logWarn } from "@/lib/logger";
import type { LaterTime, Outing } from "@/types/outing";
import type { LocationSuggestion } from "@/types/recommendations";
import type { WeatherData } from "@/types/weather";

function isSamePlace(a: LocationSuggestion, b: LocationSuggestion | null): boolean {
  return b !== null && a.latitude === b.latitude && a.longitude === b.longitude;
}

/**
 * State and actions for the home page's Gear Up flow: pick an activity and a
 * place (searched for, or the device's own location when asked), get weather
 * there (now, at a later time, or a multi-day forecast), and fetch layer
 * recommendations for it. One form asks for all of it; Now or Later picks
 * which time fields it shows.
 *
 * Each request reads its inputs from one Outing, and its result keeps that
 * outing (see docs/outing-contract.md). Changes made from the results start
 * from the shown result's outing, not from the form.
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

  // /?mode=planAhead, which the iOS shell's Plan tab opens, starts on Later.
  const initialMode: InputMode = searchParams.get("mode") === "planAhead" ? "later" : "now";
  const [state, dispatch] = useReducer(gearUpReducer, initialMode, createInitialState);

  const locationSearch = useLocationSearch();
  const { status: locationStatus, locate, cancel: cancelLocating } = useDeviceLocation();
  const formRef = useRef<HTMLFormElement>(null);
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
    if (mode === "planAhead" && state.inputMode !== "later") {
      dispatch({ type: "SET_INPUT_MODE", mode: "later" });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Layers for an outing in the given weather. */
  const layersFor = useCallback(
    (outing: Outing, weather: WeatherData) =>
      buildLayersResult(outing, weather, sensitivity, (o, w) =>
        biophysics.fetch(o.activity, w, o.exertion, bodyMetrics)
      ),
    [sensitivity, biophysics, bodyMetrics]
  );

  // Only the latest request's answer is used. Going to the form from the
  // results, switching the form between Now and Later, or starting over
  // retires the running request, so a late answer can't show results or
  // report an error for an outing that's gone.
  const latestRequest = useRef(0);
  /** Starts loading, and returns a check for whether this request is still the latest. */
  const startRequest = useCallback(() => {
    const request = ++latestRequest.current;
    dispatch({ type: "SUBMIT_START" });
    return () => latestRequest.current === request;
  }, []);

  /**
   * Shows layers for a one-day outing, from its place's current weather or its
   * forecast at the outing's local date-time there. Resolves false, after
   * saying why, when there's no weather; the inputs and the shown result stay
   * as they were. Nothing changes once `isCurrent` says the request was retired.
   */
  const recommendFor = useCallback(async (isCurrent: () => boolean, outing: Outing) => {
    const { data, error } = await fetchWeatherAt(outing.place, forecastDateTime(outing.when));
    if (!data) {
      if (isCurrent()) {
        toast.error(error);
        dispatch({ type: "SUBMIT_ERROR" });
      }
      return false;
    }
    const result = await layersFor(outing, data);
    if (isCurrent()) dispatch({ type: "SUBMIT_SUCCESS", result });
    return true;
  }, [layersFor]);

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

    const place = locationSearch.selectedLocation;
    const later = state.inputMode === "later";
    if (!place || (later && (!state.date || !state.time))) {
      // Render the errors first, so the first field to fix is announced as invalid when it takes focus.
      flushSync(() => dispatch({ type: "FIELDS_MISSING" }));
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }

    if (!later) {
      // Current weather at the chosen place, never silently at the device's location.
      await recommendFor(startRequest(), { activity, exertion, place, when: { mode: "now" } });
      return;
    }

    const when: LaterTime = {
      mode: "later",
      date: format(state.date!, "yyyy-MM-dd"),
      time: state.time,
      durationDays: state.durationDays,
    };
    const outing = { activity, exertion, place, when };
    const isCurrent = startRequest();
    if (when.durationDays === 1) {
      // Single day: layers for the forecast hour the outing starts, read on the place's clock.
      await recommendFor(isCurrent, outing);
      return;
    }
    try {
      const result = await fetchPlanAhead(outing, sensitivity);
      if (isCurrent()) dispatch({ type: "SUBMIT_SUCCESS", result });
    } catch (error) {
      logWarn("useGearUp.handleSubmit", error);
      if (!isCurrent()) return;
      if (error instanceof PlanAheadError && error.field === "startDate") {
        // Shown on the start date, which is what needs to change.
        dispatch({ type: "START_DATE_INVALID", error: error.message, location: place });
      } else {
        toast.error(error instanceof PlanAheadError ? error.message : "Couldn't build the plan. Try again.");
        dispatch({ type: "SUBMIT_ERROR" });
      }
    }
  }, [activity, exertion, state, locationStatus, locationSearch, sensitivity, startRequest, recommendFor]);

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

  const shownResult = state.result;

  /** The shown outing's layers at another place, or another local time there. */
  const handleWeatherChange = useCallback(
    async (place: LocationSuggestion, localDateTime?: string) => {
      if (shownResult?.kind !== "layers") return false;
      return recommendFor(startRequest(), { ...shownResult.outing, place, when: outingTimeAt(localDateTime) });
    },
    [shownResult, startRequest, recommendFor]
  );

  /**
   * Layers again for the shown outing's weather, with any changes to the
   * outing. Resolves true once they're shown.
   */
  const recommendForShownWeather = useCallback(async (changes: Partial<Outing>, failureMessage: string) => {
    if (shownResult?.kind !== "layers") return false;
    const isCurrent = startRequest();
    try {
      const result = await layersFor({ ...shownResult.outing, ...changes }, shownResult.weather);
      if (!isCurrent()) return false;
      dispatch({ type: "SUBMIT_SUCCESS", result });
      return true;
    } catch (error) {
      logWarn("useGearUp.recommendForShownWeather", error);
      if (isCurrent()) {
        toast.error(failureMessage);
        dispatch({ type: "SUBMIT_ERROR" });
      }
      return false;
    }
  }, [shownResult, startRequest, layersFor]);

  // The form takes the new activity only with its layers, so Edit outing
  // while they load, or after they fail, opens on the activity still shown.
  const handleActivityChange = useCallback(async (newActivity: string) => {
    if (await recommendForShownWeather({ activity: newActivity }, "Failed to update activity")) {
      setActivity(newActivity);
    }
  }, [setActivity, recommendForShownWeather]);

  const handleRetry = useCallback(
    () => recommendForShownWeather({}, "Failed to load layers"),
    [recommendForShownWeather]
  );

  const resetToInitialState = useCallback(() => {
    latestRequest.current += 1;
    resetActivity();
    cancelLocating();
    dispatch({ type: "RESET" });
    locationSearch.reset();
    biophysics.reset();
  }, [resetActivity, cancelLocating, locationSearch, biophysics]);

  const formShowing: InputMode | null = state.result === null ? state.inputMode : null;
  /**
   * Back to the form in `mode`, keeping the activity, place, date, time and
   * duration. A request made from the form in that mode carries on; one from
   * the results, or from the form in the other mode, is retired.
   */
  const showForm = useCallback((mode: InputMode) => {
    if (formShowing !== mode) latestRequest.current += 1;
    dispatch({ type: "SHOW_FORM", mode });
  }, [formShowing]);
  /**
   * Now or Later on the form. A request still running was made for the other
   * mode, so it's retired: its result would otherwise come back to a form,
   * and an Edit outing, on the mode it wasn't asked for.
   */
  const setInputMode = showForm;
  const showPlanForm = useCallback(() => showForm("later"), [showForm]);
  /** Edit outing: back to the form as the results were requested from it, with what was entered. */
  const editOuting = useCallback(() => showForm(state.inputMode), [showForm, state.inputMode]);

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
    result: state.result,
    inputMode: state.inputMode,
    setInputMode,
    date: state.date,
    setDate,
    time: state.time,
    setTime,
    durationDays: state.durationDays,
    setDurationDays,
    loading: state.loading,
    showFieldErrors: state.showFieldErrors,
    // Only for the place it was found at: another place's forecast may cover the dates.
    startDateError: state.startDateError && isSamePlace(state.startDateError.location, locationSearch.selectedLocation)
      ? state.startDateError.message
      : null,
    locationStatus,
    formRef,
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
    handleWeatherChange,
    handleActivityChange,
    handleRetry,
    showPlanForm,
    editOuting,
    resetToInitialState,
  };
}
