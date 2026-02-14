"use client";

import { useState, useCallback, useEffect, useRef, useReducer } from "react";
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
import { ForecastHour, MultiDayLayerPlan } from "@/types/plan";
import { logWarn } from "@/lib/logger";
import { ACTIVITIES, DEFAULT_ACTIVITY } from "@/data/activities";
import { STORAGE_KEYS } from "@/lib/storage";
import { TemperatureSensitivity, UserBodyMetrics } from "@/types/preferences";
import { buildMultiDayLayerPlan } from "@/lib/planAhead";
import {
  type ExertionLevel,
  DEFAULT_EXERTION_LEVEL,
} from "@/lib/biophysics/exertion";

// ---------------------------------------------------------------------------
// State & Actions
// ---------------------------------------------------------------------------

type InputMode = "manual" | "planAhead";

interface GearUpState {
  temperature: number;
  windspeed: number;
  inputMode: InputMode;
  date: Date | undefined;
  time: string;
  durationDays: number;
  showSliders: boolean;
  showResults: boolean;
  locationDenied: boolean;
  loading: boolean;
  recommendation: Recommendation | null;
  biophysicsData: BiophysicsRecommendation | null;
  multiDayPlan: MultiDayLayerPlan | null;
}

type GearUpAction =
  | { type: "SET_WEATHER"; temperature: number; windspeed: number }
  | { type: "SET_TEMPERATURE"; temperature: number }
  | { type: "SET_WINDSPEED"; windspeed: number }
  | { type: "SET_INPUT_MODE"; mode: InputMode }
  | { type: "SET_DATE"; date: Date | undefined }
  | { type: "SET_TIME"; time: string }
  | { type: "SET_DURATION_DAYS"; durationDays: number }
  | { type: "LOCATION_DENIED" }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS"; recommendation: Recommendation | null; biophysicsData: BiophysicsRecommendation | null; temperature: number; windspeed: number }
  | { type: "SUBMIT_PLAN_SUCCESS"; plan: MultiDayLayerPlan; recommendation: Recommendation | null; temperature: number; windspeed: number }
  | { type: "SUBMIT_ERROR" }
  | { type: "RESET"; defaultActivity?: string };

function createInitialState(inputMode: InputMode): GearUpState {
  return {
    temperature: 50,
    windspeed: 10,
    inputMode,
    date: undefined,
    time: "12:00",
    durationDays: 3,
    showSliders: false,
    showResults: false,
    locationDenied: false,
    loading: false,
    recommendation: null,
    biophysicsData: null,
    multiDayPlan: null,
  };
}

function gearUpReducer(state: GearUpState, action: GearUpAction): GearUpState {
  switch (action.type) {
    case "SET_WEATHER":
      return { ...state, temperature: action.temperature, windspeed: action.windspeed };
    case "SET_TEMPERATURE":
      return { ...state, temperature: action.temperature };
    case "SET_WINDSPEED":
      return { ...state, windspeed: action.windspeed };
    case "SET_INPUT_MODE":
      return { ...state, inputMode: action.mode };
    case "SET_DATE":
      return { ...state, date: action.date };
    case "SET_TIME":
      return { ...state, time: action.time };
    case "SET_DURATION_DAYS":
      return { ...state, durationDays: action.durationDays };
    case "LOCATION_DENIED":
      return { ...state, locationDenied: true, showSliders: false };
    case "SUBMIT_START":
      return { ...state, loading: true };
    case "SUBMIT_SUCCESS":
      return {
        ...state,
        loading: false,
        temperature: action.temperature,
        windspeed: action.windspeed,
        recommendation: action.recommendation,
        biophysicsData: action.biophysicsData,
        multiDayPlan: null,
        showResults: true,
      };
    case "SUBMIT_PLAN_SUCCESS":
      return {
        ...state,
        loading: false,
        temperature: action.temperature,
        windspeed: action.windspeed,
        recommendation: action.recommendation,
        biophysicsData: null,
        multiDayPlan: action.plan,
        showResults: true,
      };
    case "SUBMIT_ERROR":
      return { ...state, loading: false };
    case "RESET":
      return createInitialState("manual");
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Submit helpers (plain async functions, not hooks)
// ---------------------------------------------------------------------------

function normalizeBiophysicsForActivity(
  activityValue: string,
  data: BiophysicsRecommendation | null
): BiophysicsRecommendation | null {
  if (!data) return null;
  if (activityValue !== "xc_skiing") return data;
  if (!data.recommendation?.headwear?.helmet) return data;

  return {
    ...data,
    recommendation: {
      ...data.recommendation,
      headwear: {
        ...data.recommendation.headwear,
        helmet: null,
      },
    },
  };
}

function getRecommendation(
  temp: number,
  activity: string,
  sensitivity: TemperatureSensitivity
): Recommendation | null {
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
}

interface SubmitResult {
  recommendation: Recommendation | null;
  biophysicsData: BiophysicsRecommendation | null;
  temperature: number;
  windspeed: number;
}

interface PlanSubmitResult {
  plan: MultiDayLayerPlan;
  recommendation: Recommendation | null;
  temperature: number;
  windspeed: number;
}

async function submitPlanAhead(
  state: GearUpState,
  activity: string,
  sensitivity: TemperatureSensitivity,
  locationSearch: ReturnType<typeof useLocationSearch>,
): Promise<PlanSubmitResult> {
  const dateStr = format(state.date!, "yyyy-MM-dd");
  const { selectedLocation } = locationSearch;

  const response = await fetch(
    `/api/weather?lat=${selectedLocation!.latitude}&lon=${selectedLocation!.longitude}&startDate=${dateStr}&days=${state.durationDays}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch forecast");
  }

  const data = await response.json() as {
    hourly?: ForecastHour[];
    startDate?: string;
    endDate?: string;
  };

  const hourly = Array.isArray(data.hourly) ? data.hourly : [];
  const parsedStartHour = Number.parseInt(state.time.split(":")[0] ?? "", 10);
  const plan = buildMultiDayLayerPlan({
    startDate: state.date!,
    durationDays: state.durationDays,
    startHour: Number.isFinite(parsedStartHour) ? parsedStartHour : undefined,
    hourlyForecast: hourly,
    getRecommendation: (effectiveTemperature) =>
      getRecommendation(effectiveTemperature, activity, sensitivity),
  });

  if (plan.days.length === 0) {
    throw new Error("No daytime forecast data returned for the selected window");
  }

  const firstDay = plan.days[0];
  const baseline = firstDay.baseline;

  return {
    plan,
    recommendation: baseline.recommendation,
    temperature: baseline.effectiveTemperature,
    windspeed: baseline.maxWindSpeed,
  };
}

async function submitLocationDenied(
  state: GearUpState,
  activity: string,
  exertion: ExertionLevel,
  bodyMetrics: UserBodyMetrics,
  sensitivity: TemperatureSensitivity,
  locationSearch: ReturnType<typeof useLocationSearch>,
  biophysics: ReturnType<typeof useBiophysicsRecommendation>,
): Promise<SubmitResult | null> {
  const { selectedLocation } = locationSearch;
  const weather = await fetchWeatherByCoords(
    selectedLocation!.latitude,
    selectedLocation!.longitude
  );

  if (weather) {
    const layers = getRecommendation(weather.temperature, activity, sensitivity);
    const bioData = await biophysics.fetch(
      activity,
      { temperature: weather.temperature, windSpeed: weather.windSpeed },
      exertion,
      bodyMetrics
    );

    return {
      recommendation: layers,
      biophysicsData: normalizeBiophysicsForActivity(activity, bioData),
      temperature: weather.temperature,
      windspeed: weather.windSpeed,
    };
  }
  return null;
}

async function submitCurrentLocation(
  activity: string,
  exertion: ExertionLevel,
  bodyMetrics: UserBodyMetrics,
  sensitivity: TemperatureSensitivity,
  biophysics: ReturnType<typeof useBiophysicsRecommendation>,
): Promise<{ result: SubmitResult | null; locationDenied?: boolean; showSliders?: boolean }> {
  const result = await fetchCurrentWeather();

  if (result.data) {
    const layers = getRecommendation(result.data.temperature, activity, sensitivity);
    const bioData = await biophysics.fetch(
      activity,
      { temperature: result.data.temperature, windSpeed: result.data.windSpeed },
      exertion,
      bodyMetrics
    );

    return {
      result: {
        recommendation: layers,
        biophysicsData: normalizeBiophysicsForActivity(activity, bioData),
        temperature: result.data.temperature,
        windspeed: result.data.windSpeed,
      },
    };
  } else if (result.locationDenied) {
    return { result: null, locationDenied: true };
  } else {
    return { result: null, showSliders: true };
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGearUp() {
  const searchParams = useSearchParams();
  const {
    sensitivity,
    defaultActivity,
    hasStoredDefaultActivity,
    bodyMetrics,
    loading: preferencesLoading,
  } = usePreferences();

  // Activity stays as useState — drives effects and is passed to sub-hooks
  const [activity, setActivityState] = useState<string>(defaultActivity || DEFAULT_ACTIVITY);
  const [exertion, setExertion] = useState<ExertionLevel>(DEFAULT_EXERTION_LEVEL);
  const [hasSetInitialActivity, setHasSetInitialActivity] = useState<boolean>(false);

  const initialMode: InputMode = searchParams.get("mode") === "planAhead" ? "planAhead" : "manual";
  const [state, dispatch] = useReducer(gearUpReducer, initialMode, createInitialState);

  const locationSearch = useLocationSearch();
  const biophysics = useBiophysicsRecommendation();
  const didAutoGearUp = useRef(false);
  const isActivityInitializing = !hasSetInitialActivity;

  const setActivity = useCallback((nextActivity: string) => {
    setHasSetInitialActivity(true);
    setActivityState(nextActivity);
  }, []);

  // Setter wrappers for consumers
  const setTemperature = useCallback((t: number) => dispatch({ type: "SET_TEMPERATURE", temperature: t }), []);
  const setWindspeed = useCallback((w: number) => dispatch({ type: "SET_WINDSPEED", windspeed: w }), []);
  const setInputMode = useCallback((m: InputMode) => dispatch({ type: "SET_INPUT_MODE", mode: m }), []);
  const setDate = useCallback((d: Date | undefined) => dispatch({ type: "SET_DATE", date: d }), []);
  const setTime = useCallback((t: string) => dispatch({ type: "SET_TIME", time: t }), []);
  const setDurationDays = useCallback((days: number) => {
    const clampedDays = Math.min(7, Math.max(1, Math.round(days)));
    dispatch({ type: "SET_DURATION_DAYS", durationDays: clampedDays });
  }, []);

  // Set initial activity once from stored/server preferences.
  useEffect(() => {
    if (hasSetInitialActivity || !defaultActivity) return;

    if (hasStoredDefaultActivity) {
      setActivityState(defaultActivity);
      setHasSetInitialActivity(true);
      return;
    }

    if (preferencesLoading) return;

    setActivityState(defaultActivity);
    setHasSetInitialActivity(true);
  }, [defaultActivity, hasSetInitialActivity, hasStoredDefaultActivity, preferencesLoading]);

  // Update input mode when URL param changes
  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "planAhead" && state.inputMode !== "planAhead") {
      dispatch({ type: "SET_INPUT_MODE", mode: "planAhead" });
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for planAhead navigation events (resets form even if already on plan mode)
  useEffect(() => {
    const onPlanAhead = () => {
      dispatch({ type: "RESET" });
      locationSearch.reset();
      biophysics.reset();
      dispatch({ type: "SET_INPUT_MODE", mode: "planAhead" });
    };
    window.addEventListener("navigatePlanAhead", onPlanAhead);
    return () => window.removeEventListener("navigatePlanAhead", onPlanAhead);
  }, [locationSearch, biophysics]);

  const handleSubmit = useCallback(async () => {
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
      try {
        if (state.durationDays === 1) {
          // Single-day plan-ahead: use regular layer display with biophysics
          const result = await submitLocationDenied(
            state,
            activity,
            exertion,
            bodyMetrics,
            sensitivity,
            locationSearch,
            biophysics
          );
          if (result) {
            dispatch({ type: "SUBMIT_SUCCESS", ...result });
          } else {
            toast.error("Could not get weather for this location.");
            dispatch({ type: "SUBMIT_ERROR" });
          }
        } else {
          const result = await submitPlanAhead(
            state,
            activity,
            sensitivity,
            locationSearch,
          );
          dispatch({ type: "SUBMIT_PLAN_SUCCESS", ...result });
        }
      } catch (error) {
        toast.error("Failed to fetch weather forecast");
        logWarn("useGearUp.handleSubmit", error);
        dispatch({ type: "SUBMIT_ERROR" });
      }
    } else if (state.locationDenied && locationSearch.selectedLocation) {
      dispatch({ type: "SUBMIT_START" });
      const result = await submitLocationDenied(
        state,
        activity,
        exertion,
        bodyMetrics,
        sensitivity,
        locationSearch,
        biophysics
      );
      if (result) {
        dispatch({ type: "SUBMIT_SUCCESS", ...result });
      } else {
        toast.error("Could not get weather for this location.");
        dispatch({ type: "SUBMIT_ERROR" });
      }
    } else {
      dispatch({ type: "SUBMIT_START" });
      const { result, locationDenied, showSliders } = await submitCurrentLocation(
        activity,
        exertion,
        bodyMetrics,
        sensitivity,
        biophysics
      );

      if (result) {
        dispatch({ type: "SUBMIT_SUCCESS", ...result });
      } else if (locationDenied) {
        toast.error("Location access denied. Please enter your location manually.");
        dispatch({ type: "LOCATION_DENIED" });
        dispatch({ type: "SUBMIT_ERROR" });
      } else if (showSliders) {
        toast.error("Could not get current weather. Please enter your location manually.");
        dispatch({ type: "LOCATION_DENIED" });
        dispatch({ type: "SUBMIT_ERROR" });
      }
    }
  }, [activity, biophysics, bodyMetrics, exertion, state, locationSearch, sensitivity]);

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
        dispatch({ type: "SUBMIT_START" });
        void (async () => {
          const weather = await fetchWeatherByCoords(coords.latitude, coords.longitude);
          if (weather) {
            const layers = getRecommendation(weather.temperature, activity, sensitivity);
            const bioData = await biophysics.fetch(activity, {
              temperature: weather.temperature,
              windSpeed: weather.windSpeed,
            }, exertion, bodyMetrics);
            dispatch({
              type: "SUBMIT_SUCCESS",
              recommendation: layers,
              biophysicsData: normalizeBiophysicsForActivity(activity, bioData),
              temperature: weather.temperature,
              windspeed: weather.windSpeed,
            });
          } else {
            dispatch({ type: "LOCATION_DENIED" });
            dispatch({ type: "SUBMIT_ERROR" });
          }
        })();
        return;
      } catch {
        // fall through to manual
      }
    }

    if (geoDenied) {
      dispatch({ type: "LOCATION_DENIED" });
      return;
    }
    dispatch({ type: "LOCATION_DENIED" });
  }, [searchParams, activity, biophysics, bodyMetrics, exertion, sensitivity]);

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
    window.dispatchEvent(new CustomEvent("gearUpLoading", { detail: state.loading }));
  }, [state.loading]);

  const handleGoNow = useCallback(async () => {
    if (!activity) {
      toast.error("Please select an activity");
      return;
    }
    dispatch({ type: "SUBMIT_START" });
    const { result, locationDenied: denied } = await submitCurrentLocation(
      activity,
      exertion,
      bodyMetrics,
      sensitivity,
      biophysics
    );
    if (result) {
      dispatch({ type: "SUBMIT_SUCCESS", ...result });
    } else if (denied) {
      toast.error("Location access denied. Please enter a location or use Plan Ahead.");
      dispatch({ type: "SUBMIT_ERROR" });
    } else {
      toast.error("Could not get current weather.");
      dispatch({ type: "SUBMIT_ERROR" });
    }
  }, [activity, biophysics, bodyMetrics, exertion, sensitivity]);

  const resetToInitialState = useCallback(() => {
    setActivityState(defaultActivity || DEFAULT_ACTIVITY);
    setHasSetInitialActivity(true);
    setExertion(DEFAULT_EXERTION_LEVEL);
    dispatch({ type: "RESET" });
    locationSearch.reset();
    biophysics.reset();
  }, [locationSearch, defaultActivity, biophysics]);

  return {
    // State
    activity,
    setActivity,
    activityInitializing: isActivityInitializing,
    exertion,
    setExertion,
    temperature: state.temperature,
    setTemperature,
    windspeed: state.windspeed,
    setWindspeed,
    recommendation: state.recommendation,
    showResults: state.showResults,
    showSliders: state.showSliders,
    inputMode: state.inputMode,
    setInputMode,
    date: state.date,
    setDate,
    time: state.time,
    setTime,
    durationDays: state.durationDays,
    setDurationDays,
    loading: state.loading,
    locationDenied: state.locationDenied,
    biophysicsData: state.biophysicsData,
    multiDayPlan: state.multiDayPlan,
    sensitivity,

    // Location search (pass-through)
    locationSearch,

    // Actions
    handleSubmit,
    handleGoNow,
    resetToInitialState,
  };
}
