"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { format, parse } from "date-fns";
import { toast } from "sonner";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { usePreferences } from "@/hooks/usePreferences";
import { useBiophysicsRecommendation } from "@/hooks/useBiophysicsRecommendation";
import { useActivitySelection } from "@/hooks/useActivitySelection";
import { fetchWeatherAt } from "@/hooks/useCurrentWeather";
import { useDeviceLocation, yourLocation } from "@/hooks/useDeviceLocation";
import { useResultsHistoryEntry } from "@/hooks/useResultsHistoryEntry";
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
import { readGearUpDraft, saveGearUpDraft } from "@/lib/gearUpDraft";
import { logWarn } from "@/lib/logger";
import { RESUME_PARAM, resumeView, type ResumeView } from "@/lib/outingReturn";
import type { LaterTime, LayersResult, Outing, OutingTime } from "@/types/outing";
import type { LocationSuggestion } from "@/types/recommendations";
import type { WeatherData } from "@/types/weather";

function isSamePlace(a: LocationSuggestion, b: LocationSuggestion | null): boolean {
  return b !== null && a.latitude === b.latitude && a.longitude === b.longitude;
}

/** Takes /?resume=… out of the address, so a reload or Edit outing doesn't ask again. */
function removeResumeParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete(RESUME_PARAM);
  // Without Next.js's own state (`__NA`), Next.js takes the new URL as the
  // router's too. With it, the next refresh puts the old URL back.
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
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
 *
 * The results have their own browser history entry, and what was entered is
 * kept for the tab, so Back, Forward and a reload keep the outing. Sign-in
 * and Wardrobe come back to /?resume=outing, which asks for it again, or to
 * /?resume=packing, which also opens the plan on its packing list.
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
  // A personalized request needs to know who's signed in, and their preferences.
  const { isLoaded: authLoaded, userId } = useAuth();
  const readyToRequest = authLoaded && !preferencesLoading;
  /** Who's signed in: a Clerk user ID, null for a guest, or undefined until that's known. */
  const owner = authLoaded ? (userId ?? null) : undefined;

  // /?mode=planAhead, which the iOS shell's Plan tab opens, starts on Later.
  const initialMode: InputMode = searchParams.get("mode") === "planAhead" ? "later" : "now";
  const [state, dispatch] = useReducer(gearUpReducer, initialMode, createInitialState);

  const locationSearch = useLocationSearch();
  const { status: locationStatus, locate, cancel: cancelLocating } = useDeviceLocation();
  const formRef = useRef<HTMLFormElement>(null);
  const biophysics = useBiophysicsRecommendation();
  const { isOnResultsEntry, navigationRef, leaveResultsEntry, forgetResultsEntry } =
    useResultsHistoryEntry(state.result !== null);

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
  /**
   * The tab the next plan shown opens on: Packing when coming back to match
   * its packing list to the wardrobe, otherwise the daily plan. Any other
   * request puts it back.
   */
  const [planTab, setPlanTab] = useState<"days" | "packing">("days");
  /** Starts loading, and returns a check for whether this request is still the latest. */
  const startRequest = useCallback((outing: Outing) => {
    const request = ++latestRequest.current;
    dispatch({ type: "SUBMIT_START", outing });
    setPlanTab("days");
    return () => latestRequest.current === request;
  }, []);

  /** Results and their edit form/draft share the same submitted inputs. */
  const applyOutingInputs = useCallback((outing: Outing) => {
    setActivity(outing.activity);
    setExertion(outing.exertion);
    cancelLocating();
    locationSearch.handleSelectLocation(outing.place);
    dispatch({ type: "APPLY_OUTING_TIME", when: outing.when });
  }, [setActivity, setExertion, cancelLocating, locationSearch]);

  const showLayers = useCallback((result: LayersResult) => {
    // A failed update must not replace useful advice (or a manually edited
    // outfit) with a fallback. Initial requests still explain unavailable advice.
    if (state.result && result.advice.kind !== "personalized" && result.advice.reason === "unavailable") {
      dispatch({ type: "SUBMIT_ERROR", message: "Couldn't load layers for this outing. Try again." });
      return false;
    }
    dispatch({ type: "SUBMIT_SUCCESS", result });
    return true;
  }, [state.result]);

  /**
   * Shows layers for a one-day outing, from its place's current weather or its
   * forecast at the outing's local date-time there. Resolves false, after
   * saying why, when there's no weather; the inputs and the shown result stay
   * as they were. Nothing changes once `isCurrent` says the request was retired.
   */
  const recommendFor = useCallback(async (isCurrent: () => boolean, outing: Outing) => {
    const { data, error } = await fetchWeatherAt(outing.place, forecastDateTime(outing.when));
    if (!isCurrent()) return false;
    if (!data) {
      toast.error(error);
      dispatch({ type: "SUBMIT_ERROR", message: error });
      return false;
    }
    try {
      const result = await layersFor(outing, data);
      if (!isCurrent()) return false;
      return showLayers(result);
    } catch (error) {
      logWarn("useGearUp.recommendFor", error);
      if (isCurrent()) dispatch({ type: "SUBMIT_ERROR", message: "Couldn't load layers for this outing. Try again." });
      return false;
    }
  }, [layersFor, showLayers]);

  /**
   * Shows a multi-day plan for a later outing. Resolves false, after saying
   * why, when it can't be built: on the start date when that's what needs to
   * change. Nothing changes once `isCurrent` says the request was retired.
   */
  const planFor = useCallback(async (isCurrent: () => boolean, outing: Outing & { when: LaterTime }) => {
    try {
      const result = await fetchPlanAhead(outing, sensitivity);
      if (!isCurrent()) return false;
      dispatch({ type: "SUBMIT_SUCCESS", result });
      return true;
    } catch (error) {
      logWarn("useGearUp.planFor", error);
      if (!isCurrent()) return false;
      if (error instanceof PlanAheadError && error.field === "startDate") {
        // Shown on the start date, which is what needs to change.
        dispatch({ type: "START_DATE_INVALID", error: error.message, location: outing.place });
      } else {
        const message = error instanceof PlanAheadError ? error.message : "Couldn't build the plan. Try again.";
        toast.error(message);
        dispatch({ type: "SUBMIT_ERROR", message });
      }
      return false;
    }
  }, [sensitivity]);

  /** Shows an outing's layers, or its plan when it's several days. */
  const showOuting = useCallback((isCurrent: () => boolean, outing: Outing) =>
    outing.when.mode === "later" && outing.when.durationDays > 1
      ? planFor(isCurrent, { ...outing, when: outing.when })
      : recommendFor(isCurrent, outing),
  [planFor, recommendFor]);

  /** Makes the device's position the outing's place, once it's found. */
  const handleUseMyLocation = useCallback(async () => {
    const coordinates = await locate();
    if (coordinates) locationSearch.handleSelectLocation(yourLocation(coordinates));
  }, [locate, locationSearch]);

  const handleSubmit = useCallback(async () => {
    // The iOS shell's Gear Up action can fire again while a request is running,
    // or before a requested location arrives.
    if (state.request.status === "loading" || locationStatus === "locating") return;
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

    // Now: current weather at the chosen place, never silently at the device's location.
    // Later: the forecast hour the outing starts, read on the place's clock, or a plan for several days.
    const when: OutingTime = later
      ? { mode: "later", date: format(state.date!, "yyyy-MM-dd"), time: state.time, durationDays: state.durationDays }
      : { mode: "now" };
    const outing = { activity, exertion, place, when };
    await showOuting(startRequest(outing), outing);
  }, [activity, exertion, state, locationStatus, locationSearch, startRequest, showOuting]);

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
      const outing = { ...shownResult.outing, place, when: outingTimeAt(localDateTime) };
      const isCurrent = startRequest(outing);
      if (!await recommendFor(isCurrent, outing) || !isCurrent()) return false;
      applyOutingInputs(outing);
      return true;
    },
    [shownResult, startRequest, recommendFor, applyOutingInputs]
  );

  /**
   * Layers again for the shown outing's weather, with any changes to the
   * outing. Resolves true once they're shown.
   */
  const recommendForShownWeather = useCallback(async (changes: Partial<Outing>, failureMessage: string) => {
    if (shownResult?.kind !== "layers") return false;
    const outing = { ...shownResult.outing, ...changes };
    const isCurrent = startRequest(outing);
    try {
      const result = await layersFor(outing, shownResult.weather);
      if (!isCurrent()) return false;
      return showLayers(result);
    } catch (error) {
      logWarn("useGearUp.recommendForShownWeather", error);
      if (isCurrent()) {
        toast.error(failureMessage);
        dispatch({ type: "SUBMIT_ERROR", message: failureMessage });
      }
      return false;
    }
  }, [shownResult, startRequest, layersFor, showLayers]);

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

  /** Retry the failed update's snapshot, not the older outing still on screen. */
  const handleRetryUpdate = useCallback(async () => {
    if (state.request.status !== "error") return false;
    const { outing } = state.request;
    const isCurrent = startRequest(outing);
    if (!await showOuting(isCurrent, outing) || !isCurrent()) return false;
    applyOutingInputs(outing);
    return true;
  }, [state.request, startRequest, showOuting, applyOutingInputs]);

  /**
   * Set when an outing should be asked for again once a request can be made:
   * the last one, on its results' entry after a reload or Forward, or on
   * coming back from sign-in or Wardrobe.
   */
  const pendingResume = useRef<{ outing: Outing; onResultsEntry: boolean; view?: ResumeView } | null>(null);

  /** Start over: clears what was entered, and the last outing with it. */
  const resetToInitialState = useCallback(() => {
    latestRequest.current += 1;
    pendingResume.current = null;
    resetActivity();
    cancelLocating();
    dispatch({ type: "RESET" });
    locationSearch.reset();
    biophysics.reset();
    forgetResultsEntry();
  }, [resetActivity, cancelLocating, locationSearch, biophysics, forgetResultsEntry]);

  const formShowing: InputMode | null = state.result === null ? state.inputMode : null;
  /**
   * The form in `mode`, keeping the activity, place, date, time and duration.
   * Unless told to `retire` it, a request made from the form in that mode
   * carries on; one from the results, or from the form in the other mode, is
   * retired.
   */
  const showForm = useCallback((mode: InputMode, retire = formShowing !== mode) => {
    if (retire) latestRequest.current += 1;
    if (state.result) applyOutingInputs(state.result.outing);
    dispatch({ type: "SHOW_FORM", mode, keepLoading: !retire });
  }, [formShowing, state.result, applyOutingInputs]);
  /**
   * Back to the form from the page itself, which also steps back over the
   * results' history entry, so the browser's next Back leaves Gear up.
   */
  const backToForm = useCallback((mode: InputMode) => {
    showForm(mode);
    leaveResultsEntry();
  }, [showForm, leaveResultsEntry]);
  /**
   * Now or Later on the form. A request still running was made for the other
   * mode, so it's retired: its result would otherwise come back to a form,
   * and an Edit outing, on the mode it wasn't asked for.
   */
  const setInputMode = backToForm;
  const showPlanForm = useCallback(() => backToForm("later"), [backToForm]);
  /** Edit outing starts from the shown result, including changes to its place or time. */
  const editOuting = useCallback(() => backToForm(state.result?.outing.when.mode ?? state.inputMode), [backToForm, state.result, state.inputMode]);

  /**
   * Asks again for the last result's outing, for a reload or Forward on the
   * results. The form shows in the outing's mode while it loads. When nothing
   * comes of it, the browser steps back off the results' entry.
   */
  const resume = useCallback(async (outing: Outing, view: ResumeView = "outing") => {
    showForm(outing.when.mode, true);
    applyOutingInputs(outing);
    const isCurrent = startRequest(outing);
    if (view === "packing") setPlanTab("packing");
    const shown = await showOuting(isCurrent, outing);
    if (!shown && isCurrent()) leaveResultsEntry();
  }, [showForm, applyOutingInputs, startRequest, showOuting, leaveResultsEntry]);

  // What was entered in this tab comes back once it's known who's signed in,
  // like after a reload, or after going to another page and coming back. On
  // the results' entry, or back from sign-in or Wardrobe, the last outing is
  // asked for again.
  // When the account changes while the page is open (signing out, or into
  // another account), the page starts over with what that account kept, so
  // one account's outing and gear never show for another.
  useEffect(() => {
    if (owner === undefined || (state.restored && owner === state.owner)) return;
    if (state.restored) resetToInitialState();
    const draft = readGearUpDraft(owner);
    if (draft) {
      setActivity(draft.activity);
      setExertion(draft.exertion);
      if (draft.place) locationSearch.handleSelectLocation(draft.place);
    }
    dispatch({
      type: "RESTORE",
      owner,
      kept: draft && {
        inputMode: initialMode === "later" ? "later" : draft.inputMode,
        date: draft.date ? parse(draft.date, "yyyy-MM-dd", new Date()) : undefined,
        time: draft.time,
        durationDays: draft.durationDays,
        lastOuting: draft.lastOuting,
      },
    });
    const returning = resumeView(searchParams.get(RESUME_PARAM));
    if (returning) removeResumeParam();
    if (returning && draft?.lastOuting) {
      pendingResume.current = { outing: draft.lastOuting, onResultsEntry: false, view: returning };
    } else if (isOnResultsEntry()) {
      if (draft?.lastOuting) pendingResume.current = { outing: draft.lastOuting, onResultsEntry: true };
      else leaveResultsEntry();
    }
  }, [owner]); // eslint-disable-line react-hooks/exhaustive-deps

  const { restored } = state;
  /**
   * From the render where the signed-in account changes until the page has
   * started over for the new one, which happens in an effect. Nothing the
   * last account entered or got should show meanwhile.
   */
  const accountChanging = restored && owner !== undefined && owner !== state.owner;

  useEffect(() => {
    if (!restored || !readyToRequest || !pendingResume.current) return;
    const { outing, onResultsEntry, view } = pendingResume.current;
    pendingResume.current = null;
    // Leaving the results while sign-in loads (Back, Start over, or the form
    // from the page) leaves their entry, and drops the queued request with it.
    if (!onResultsEntry || isOnResultsEntry()) void resume(outing, view);
  }, [restored, readyToRequest, resume, isOnResultsEntry]);

  useEffect(() => {
    // Only into the draft of the account the page's outing belongs to, which
    // differs for a moment when the account changes.
    if (!restored || owner !== state.owner) return;
    saveGearUpDraft(owner, {
      activity,
      exertion,
      place: locationSearch.selectedLocation,
      inputMode: state.inputMode,
      date: state.date ? format(state.date, "yyyy-MM-dd") : null,
      time: state.time,
      durationDays: state.durationDays,
      lastOuting: state.lastOuting,
    });
  }, [
    restored,
    owner,
    state.owner,
    activity,
    exertion,
    locationSearch.selectedLocation,
    state.inputMode,
    state.date,
    state.time,
    state.durationDays,
    state.lastOuting,
  ]);

  // The browser's Back from the results shows the form, as Edit outing does,
  // and retires whatever was running for them. Forward asks again for the
  // last outing, or steps back when there's none.
  useEffect(() => {
    navigationRef.current = {
      onBack: () => showForm(state.inputMode, true),
      onForward: () => {
        if (state.result) return;
        if (!state.lastOuting) {
          leaveResultsEntry();
        } else if (readyToRequest) {
          void resume(state.lastOuting);
        } else {
          pendingResume.current = { outing: state.lastOuting, onResultsEntry: true };
        }
      },
    };
  });

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
    result: accountChanging ? null : state.result,
    planTab,
    accountChanging,
    inputMode: state.inputMode,
    setInputMode,
    date: state.date,
    setDate,
    time: state.time,
    setTime,
    durationDays: state.durationDays,
    setDurationDays,
    loading: state.request.status === "loading",
    request: state.request,
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
    handleRetryUpdate,
    showPlanForm,
    editOuting,
    resetToInitialState,
  };
}
