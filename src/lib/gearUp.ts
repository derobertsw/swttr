/**
 * State and request helpers for the home page's Gear Up flow (see useGearUp).
 */
import layerRecommendations from "@/data/layerRecommendations.json";
import { parse } from "date-fns";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { convertLegacyRecommendation, type LegacyRecommendation } from "@/lib/layers";
import type { Recommendation, LocationSuggestion } from "@/types/recommendations";
import type { WeatherData } from "@/types/weather";
import type { BiophysicsOutcome, BiophysicsRecommendation, BiophysicsStatus } from "@/types/biophysics";
import type { MultiDayLayerPlan } from "@/types/plan";
import type { TemperatureSensitivity } from "@/types/preferences";
import { readWeatherProvenance } from "@/lib/weatherProvenance";
import type {
  Advice,
  LaterTime,
  LayersResult,
  Outing,
  OutingResult,
  OutingRequestState,
  OutingTime,
  PlanResult,
} from "@/types/outing";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Whether the form asks for layers now, or for a later date and time. */
export type InputMode = OutingTime["mode"];

interface GearUpState {
  inputMode: InputMode;
  date: Date | undefined;
  time: string;
  durationDays: number;
  /** Set once the form is submitted with a field left empty, so each empty field says it's needed. */
  showFieldErrors: boolean;
  /**
   * Why the plan's start date can't be used at a place, like dates past the end
   * of its forecast. Coverage differs by place, so it applies only to that one.
   */
  startDateError: { message: string; location: LocationSuggestion } | null;
  request: OutingRequestState;
  /**
   * The result on screen, with the outing it was requested for. A newer
   * request leaves it in place while it loads, and when it fails.
   */
  result: OutingResult | null;
  /** The outing of the last result shown, kept on the form so the results can be asked for again. */
  lastOuting: Outing | null;
  /**
   * Whether what was kept for the tab has been read back (see useGearUp).
   * Nothing is kept until it has, so a reload can't save over it.
   */
  restored: boolean;
  /** Whose outing the page holds once restored: a Clerk user ID, or null for a guest. */
  owner: string | null;
  /** The outing asked for again after signing in to save it (#170); its results open Save to trip. */
  saveOnReturn: Outing | null;
  /** Whether the result on screen is that outing's, so Save to trip opens as it appears. */
  opensSave: boolean;
}

/** What's kept for the tab besides the activity, effort and place. */
type RestoredFields = Pick<GearUpState, "inputMode" | "date" | "time" | "durationDays" | "lastOuting">;

type GearUpAction =
  | { type: "SET_INPUT_MODE"; mode: InputMode }
  | { type: "SET_DATE"; date: Date | undefined }
  | { type: "SET_TIME"; time: string }
  | { type: "SET_DURATION_DAYS"; durationDays: number }
  /** Restore the submitted time without converting it to the device's time zone. */
  | { type: "APPLY_OUTING_TIME"; when: OutingTime }
  | { type: "FIELDS_MISSING" }
  | { type: "START_DATE_INVALID"; error: string; location: LocationSuggestion }
  | { type: "SUBMIT_START"; outing: Outing }
  | { type: "SUBMIT_SUCCESS"; result: OutingResult }
  | { type: "SUBMIT_ERROR"; message: string }
  /** `keepLoading` when the running request was made from the form in this mode (see useGearUp). */
  | { type: "SHOW_FORM"; mode: InputMode; keepLoading: boolean }
  /** `kept` is null when nothing was kept for `owner`. */
  | { type: "RESTORE"; owner: string | null; kept: RestoredFields | null; saveOnReturn?: Outing | null }
  | { type: "RESET" };

export function createInitialState(inputMode: InputMode): GearUpState {
  return {
    inputMode,
    date: undefined,
    time: "12:00",
    durationDays: 1,
    showFieldErrors: false,
    startDateError: null,
    request: { status: "idle" },
    result: null,
    lastOuting: null,
    restored: false,
    owner: null,
    saveOnReturn: null,
    opensSave: false,
  };
}

export function gearUpReducer(state: GearUpState, action: GearUpAction): GearUpState {
  switch (action.type) {
    case "SET_INPUT_MODE":
      return { ...state, inputMode: action.mode };
    case "SET_DATE":
      return { ...state, date: action.date, startDateError: null, request: state.request.status === "error" ? { status: "idle" } : state.request };
    case "SET_TIME":
      return { ...state, time: action.time };
    case "SET_DURATION_DAYS":
      return { ...state, durationDays: action.durationDays, startDateError: null, request: state.request.status === "error" ? { status: "idle" } : state.request };
    case "APPLY_OUTING_TIME":
      return {
        ...state,
        inputMode: action.when.mode,
        ...(action.when.mode === "later" && {
          date: parse(action.when.date, "yyyy-MM-dd", new Date()),
          time: action.when.time,
          durationDays: action.when.durationDays,
        }),
        startDateError: null,
      };
    case "FIELDS_MISSING":
      return { ...state, showFieldErrors: true };
    case "START_DATE_INVALID":
      return {
        ...state,
        request: state.request.status === "loading"
          ? { status: "error", outing: state.request.outing, message: action.error, field: "startDate" }
          : state.request,
        startDateError: { message: action.error, location: action.location },
      };
    case "SUBMIT_START":
      return { ...state, request: { status: "loading", outing: action.outing }, startDateError: null };
    case "SUBMIT_SUCCESS":
      return {
        ...state,
        request: { status: "idle" },
        result: action.result,
        lastOuting: action.result.outing,
        saveOnReturn: null,
        opensSave: state.saveOnReturn !== null && JSON.stringify(state.saveOnReturn) === JSON.stringify(action.result.outing),
      };
    case "SUBMIT_ERROR":
      return state.request.status === "loading"
        ? { ...state, request: { status: "error", outing: state.request.outing, message: action.message } }
        : state;
    case "SHOW_FORM": {
      // Keeps what was entered, and the last outing. Asking again for an
      // outing after signing in to save it starts here too.
      const { date, time, durationDays, lastOuting, restored, owner, saveOnReturn } = state;
      const request: OutingRequestState = state.request.status === "loading" && action.keepLoading
        ? state.request : { status: "idle" };
      return { ...createInitialState(action.mode), date, time, durationDays, lastOuting, restored, owner, saveOnReturn, request };
    }
    case "RESTORE":
      return { ...state, ...action.kept, restored: true, owner: action.owner, saveOnReturn: action.saveOnReturn ?? null };
    case "RESET":
      return { ...createInitialState("now"), restored: state.restored, owner: state.owner };
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
  data: BiophysicsRecommendation
): BiophysicsRecommendation {
  if (activity !== "xc_skiing" || !data.recommendation?.headwear?.helmet) return data;
  return {
    ...data,
    recommendation: {
      ...data.recommendation,
      headwear: { ...data.recommendation.headwear, helmet: null },
    },
  };
}

/** The destination-local date-time to get a later outing's forecast for, or nothing for now. */
export function forecastDateTime(when: OutingTime): string | undefined {
  return when.mode === "later" ? `${when.date}T${when.time}` : undefined;
}

/** A one-day outing's time from a destination-local "yyyy-MM-ddTHH:mm", or now without one. */
export function outingTimeAt(localDateTime?: string): OutingTime {
  if (!localDateTime) return { mode: "now" };
  const [date, time] = localDateTime.split("T");
  return { mode: "later", date, time, durationDays: 1 };
}

/**
 * Layers for an outing in one weather reading, tied to that outing and
 * weather: personalized when the API has them, otherwise general layers or
 * none, with the reason.
 */
export async function buildLayersResult(
  outing: Outing,
  weather: WeatherData,
  sensitivity: TemperatureSensitivity,
  fetchBiophysics: (outing: Outing, weather: WeatherData) => Promise<BiophysicsOutcome>
): Promise<LayersResult> {
  const biophysics = await fetchBiophysics(outing, weather);
  if (biophysics.status === "ok") {
    const recommendation = normalizeBiophysicsForActivity(outing.activity, biophysics.data);
    return { kind: "layers", outing, weather, advice: { kind: "personalized", recommendation } };
  }
  const layers = getStaticRecommendation(weather.temperature, outing.activity, sensitivity);
  const advice: Advice = layers
    ? { kind: "general", layers, reason: biophysics.status }
    : { kind: "none", reason: biophysics.status };
  return { kind: "layers", outing, weather, advice };
}

/** LayerDisplay's props for a result's advice, until it takes the advice itself (#127). */
export function layerDisplayAdvice(advice: Advice): {
  recommendation: Recommendation | null;
  biophysicsData: BiophysicsRecommendation | null;
  biophysicsStatus: BiophysicsStatus;
} {
  return {
    recommendation: advice.kind === "general" ? advice.layers : null,
    biophysicsData: advice.kind === "personalized" ? advice.recommendation : null,
    biophysicsStatus: advice.kind === "personalized" ? "ok" : advice.reason,
  };
}

/** Why a multi-day plan couldn't be built, and the form field to fix when there is one. */
export class PlanAheadError extends Error {
  constructor(message: string, readonly field?: "startDate") {
    super(message);
    this.name = "PlanAheadError";
  }
}

const PLAN_AHEAD_FALLBACK_ERROR = "Couldn't get the forecast for this place. Try again.";

/**
 * Multi-day forecast plan for an outing, from its start date and hour on.
 * Throws a PlanAheadError that says what went wrong.
 */
export async function fetchPlanAhead(
  outing: Outing & { when: LaterTime },
  sensitivity: TemperatureSensitivity
): Promise<PlanResult> {
  const parsedStartHour = Number.parseInt(outing.when.time.split(":")[0] ?? "", 10);

  const response = await fetch("/api/plan-ahead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activity: outing.activity,
      sensitivity,
      lat: outing.place.latitude,
      lon: outing.place.longitude,
      startDate: outing.when.date,
      durationDays: outing.when.durationDays,
      startHour: Number.isFinite(parsedStartHour) ? parsedStartHour : undefined,
    }),
  });

  // A response that isn't JSON, like an HTML error or sign-in page, fails like any other error.
  const data = await response.json().catch(() => null) as {
    plan?: MultiDayLayerPlan;
    error?: string;
    field?: string;
  } | null;

  if (!response.ok || !data?.plan) {
    // Requests the API turns down, like dates past the end of the forecast, say what to change.
    const fixableError = response.status >= 400 && response.status < 500 && typeof data?.error === "string"
      ? data.error
      : undefined;
    if (!fixableError) throw new PlanAheadError(PLAN_AHEAD_FALLBACK_ERROR);
    throw new PlanAheadError(fixableError, data?.field === "startDate" ? "startDate" : undefined);
  }

  return { kind: "plan", outing, plan: { ...data.plan, provenance: readWeatherProvenance(data.plan.provenance) } };
}
