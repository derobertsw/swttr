/**
 * State and request helpers for the home page's Gear Up flow (see useGearUp).
 */
import { format } from "date-fns";
import layerRecommendations from "@/data/layerRecommendations.json";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { convertLegacyRecommendation, type LegacyRecommendation } from "@/lib/layers";
import type { Recommendation, LocationSuggestion } from "@/types/recommendations";
import type { WeatherContext, WeatherData, PrecipitationType } from "@/types/weather";
import type { BiophysicsOutcome, BiophysicsRecommendation, BiophysicsStatus } from "@/types/biophysics";
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
  /** Where and when the shown weather applies. */
  weatherContext: WeatherContext | null;
  inputMode: InputMode;
  date: Date | undefined;
  time: string;
  durationDays: number;
  showResults: boolean;
  locationDenied: boolean;
  loading: boolean;
  recommendation: Recommendation | null;
  biophysicsData: BiophysicsRecommendation | null;
  biophysicsStatus: BiophysicsStatus | null;
  multiDayPlan: MultiDayLayerPlan | null;
}

/** Recommendations for one weather reading. */
interface GearUpResult {
  recommendation: Recommendation | null;
  biophysicsData: BiophysicsRecommendation | null;
  /** Why biophysicsData is missing, when it is. */
  biophysicsStatus: BiophysicsStatus;
  temperature: number;
  windspeed: number;
  precipitation?: boolean;
  precipitationType?: PrecipitationType;
  weatherContext?: WeatherContext;
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
    weatherContext: null,
    inputMode,
    date: undefined,
    time: "12:00",
    durationDays: 3,
    showResults: false,
    locationDenied: false,
    loading: false,
    recommendation: null,
    biophysicsData: null,
    biophysicsStatus: null,
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
        weatherContext: action.weatherContext ?? null,
        recommendation: action.recommendation,
        biophysicsData: action.biophysicsData,
        biophysicsStatus: action.biophysicsStatus,
        multiDayPlan: null,
        showResults: true,
      };
    case "SUBMIT_PLAN_SUCCESS":
      return {
        ...state,
        loading: false,
        temperature: action.temperature,
        windspeed: action.windspeed,
        weatherContext: null,
        recommendation: action.recommendation,
        biophysicsData: null,
        biophysicsStatus: null,
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
  fetchBiophysics: (activity: string, weather: WeatherData) => Promise<BiophysicsOutcome>
): Promise<GearUpResult> {
  const recommendation = getStaticRecommendation(weather.temperature, activity, sensitivity);
  const biophysics = await fetchBiophysics(activity, weather);
  return {
    recommendation,
    biophysicsData: normalizeBiophysicsForActivity(activity, biophysics.data),
    biophysicsStatus: biophysics.status,
    temperature: weather.temperature,
    windspeed: weather.windSpeed,
    precipitation: weather.precipitation,
    precipitationType: weather.precipitationType,
    weatherContext: weather.context,
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

  // A response that isn't JSON, like an HTML error or sign-in page, fails like any other error.
  const data = await response.json().catch(() => null) as {
    plan?: MultiDayLayerPlan;
    baseline?: {
      recommendation: Recommendation | null;
      effectiveTemperature: number;
      maxWindSpeed: number;
    };
    error?: string;
  } | null;

  if (!response.ok || !data?.plan || !data.baseline) {
    throw new Error(data?.error ?? "Failed to build plan");
  }

  return {
    plan: data.plan,
    recommendation: data.baseline.recommendation,
    temperature: data.baseline.effectiveTemperature,
    windspeed: data.baseline.maxWindSpeed,
  };
}
