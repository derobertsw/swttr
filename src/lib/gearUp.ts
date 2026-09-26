/**
 * State and request helpers for the home page's Gear Up flow (see useGearUp).
 */
import { format } from "date-fns";
import layerRecommendations from "@/data/layerRecommendations.json";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { convertLegacyRecommendation, type LegacyRecommendation } from "@/lib/layers";
import type { Recommendation, LocationSuggestion } from "@/types/recommendations";
import type { WeatherData, PrecipitationType } from "@/types/weather";
import type { BiophysicsRecommendation } from "@/types/biophysics";
import type { MultiDayLayerPlan } from "@/types/plan";
import type { TemperatureSensitivity } from "@/types/preferences";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type InputMode = "manual" | "planAhead";

interface GearUpState {
  temperature: number;
  windspeed: number;
  precipitation: boolean;
  precipitationType?: PrecipitationType;
  inputMode: InputMode;
  date: Date | undefined;
  time: string;
  durationDays: number;
  showResults: boolean;
  locationDenied: boolean;
  loading: boolean;
  recommendation: Recommendation | null;
  biophysicsData: BiophysicsRecommendation | null;
  multiDayPlan: MultiDayLayerPlan | null;
}

/** Recommendations for one weather reading. */
export interface GearUpResult {
  recommendation: Recommendation | null;
  biophysicsData: BiophysicsRecommendation | null;
  temperature: number;
  windspeed: number;
  precipitation?: boolean;
  precipitationType?: PrecipitationType;
}

interface PlanAheadResult {
  plan: MultiDayLayerPlan;
  recommendation: Recommendation | null;
  temperature: number;
  windspeed: number;
}

type GearUpAction =
  | { type: "SET_INPUT_MODE"; mode: InputMode }
  | { type: "SET_DATE"; date: Date | undefined }
  | { type: "SET_TIME"; time: string }
  | { type: "SET_DURATION_DAYS"; durationDays: number }
  | { type: "LOCATION_DENIED" }
  | { type: "SUBMIT_START" }
  | ({ type: "SUBMIT_SUCCESS" } & GearUpResult)
  | ({ type: "SUBMIT_PLAN_SUCCESS" } & PlanAheadResult)
  | { type: "SUBMIT_ERROR" }
  | { type: "RESET" };

export function createInitialState(inputMode: InputMode): GearUpState {
  return {
    temperature: 50,
    windspeed: 10,
    precipitation: false,
    precipitationType: undefined,
    inputMode,
    date: undefined,
    time: "12:00",
    durationDays: 3,
    showResults: false,
    locationDenied: false,
    loading: false,
    recommendation: null,
    biophysicsData: null,
    multiDayPlan: null,
  };
}

export function gearUpReducer(state: GearUpState, action: GearUpAction): GearUpState {
  switch (action.type) {
    case "SET_INPUT_MODE":
      return { ...state, inputMode: action.mode };
    case "SET_DATE":
      return { ...state, date: action.date };
    case "SET_TIME":
      return { ...state, time: action.time };
    case "SET_DURATION_DAYS":
      return { ...state, durationDays: action.durationDays };
    case "LOCATION_DENIED":
      return { ...state, locationDenied: true };
    case "SUBMIT_START":
      return { ...state, loading: true };
    case "SUBMIT_SUCCESS":
      return {
        ...state,
        loading: false,
        temperature: action.temperature,
        windspeed: action.windspeed,
        precipitation: action.precipitation ?? false,
        precipitationType: action.precipitationType,
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
// Requests
// ---------------------------------------------------------------------------

/** Static layers for signed-out users, from the bundled recommendation table. */
function getStaticRecommendation(
  temperature: number,
  activity: string,
  sensitivity: TemperatureSensitivity
): Recommendation | null {
  const tempRange = getAdjustedTempRange(temperature, sensitivity);
  const activityData = layerRecommendations[activity as keyof typeof layerRecommendations];
  const legacyRec = activityData?.[tempRange as keyof typeof activityData];
  return legacyRec ? convertLegacyRecommendation(legacyRec as LegacyRecommendation) : null;
}

/** XC skiers get no helmet, even if the API returns one. */
function normalizeBiophysicsForActivity(
  activity: string,
  data: BiophysicsRecommendation | null
): BiophysicsRecommendation | null {
  if (!data || activity !== "xc_skiing" || !data.recommendation?.headwear?.helmet) return data;
  return {
    ...data,
    recommendation: {
      ...data.recommendation,
      headwear: { ...data.recommendation.headwear, helmet: null },
    },
  };
}

/** Static and biophysics recommendations for one weather reading. */
export async function buildGearUpResult(
  weather: WeatherData,
  activity: string,
  sensitivity: TemperatureSensitivity,
  fetchBiophysics: (activity: string, weather: WeatherData) => Promise<BiophysicsRecommendation | null>
): Promise<GearUpResult> {
  const recommendation = getStaticRecommendation(weather.temperature, activity, sensitivity);
  const biophysicsData = await fetchBiophysics(activity, weather);
  return {
    recommendation,
    biophysicsData: normalizeBiophysicsForActivity(activity, biophysicsData),
    temperature: weather.temperature,
    windspeed: weather.windSpeed,
    precipitation: weather.precipitation,
    precipitationType: weather.precipitationType,
  };
}

/** Multi-day forecast plan for a location, starting on a date and hour. */
export async function fetchPlanAhead(params: {
  activity: string;
  sensitivity: TemperatureSensitivity;
  location: LocationSuggestion;
  date: Date;
  time: string;
  durationDays: number;
}): Promise<PlanAheadResult> {
  const parsedStartHour = Number.parseInt(params.time.split(":")[0] ?? "", 10);

  const response = await fetch("/api/plan-ahead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activity: params.activity,
      sensitivity: params.sensitivity,
      lat: params.location.latitude,
      lon: params.location.longitude,
      startDate: format(params.date, "yyyy-MM-dd"),
      durationDays: params.durationDays,
      startHour: Number.isFinite(parsedStartHour) ? parsedStartHour : undefined,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error ?? "Failed to build plan");
  }

  const data = await response.json() as {
    plan: MultiDayLayerPlan;
    baseline: {
      recommendation: Recommendation | null;
      effectiveTemperature: number;
      maxWindSpeed: number;
    };
  };

  return {
    plan: data.plan,
    recommendation: data.baseline.recommendation,
    temperature: data.baseline.effectiveTemperature,
    windspeed: data.baseline.maxWindSpeed,
  };
}
