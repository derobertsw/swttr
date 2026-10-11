import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLayersResult,
  createInitialState,
  fetchPlanAhead,
  forecastDateTime,
  gearUpReducer,
  layerDisplayAdvice,
  outingTimeAt,
  PlanAheadError,
} from "./gearUp";
import type { BiophysicsOutcome, BiophysicsRecommendation } from "@/types/biophysics";
import type { LaterTime, Outing, OutingResult } from "@/types/outing";
import type { MultiDayLayerPlan } from "@/types/plan";
import type { WeatherContext } from "@/types/weather";
import { format } from "date-fns";

const STOWE = { id: 1, name: "Stowe", region: "Vermont", country: "United States", latitude: 44.47, longitude: -72.69 };
const FORECAST_CONTEXT: WeatherContext = {
  source: "forecast",
  place: "Stowe, Vermont, United States",
  forecastTime: "2026-10-08T14:00-04:00",
  timeZone: "America/New_York",
};
const WEATHER = {
  temperature: 20,
  windSpeed: 12,
  precipitation: true,
  precipitationType: "snow" as const,
  context: FORECAST_CONTEXT,
};
const LATER: LaterTime = { mode: "later", date: "2026-10-08", time: "14:00", durationDays: 1 };
const ALPINE_OUTING: Outing = { activity: "alpine_skiing", exertion: "moderate", place: STOWE, when: LATER };
const SIGN_IN_REQUIRED: BiophysicsOutcome = { status: "auth_required", data: null };
const LAYERS_RESULT: OutingResult = {
  kind: "layers",
  outing: ALPINE_OUTING,
  weather: WEATHER,
  advice: { kind: "none", reason: "auth_required" },
};
const PLAN_RESULT: OutingResult = {
  kind: "plan",
  outing: { ...ALPINE_OUTING, when: { ...LATER, durationDays: 5 } },
  plan: { days: [] } as unknown as MultiDayLayerPlan,
};

describe("gearUpReducer", () => {
  it("restores the outing's destination-local time and duration, and can return it to Now", () => {
    const later = gearUpReducer(createInitialState("now"), {
      type: "APPLY_OUTING_TIME",
      when: { ...LATER, time: "09:15", durationDays: 4 },
    });
    expect(later).toMatchObject({ inputMode: "later", time: "09:15", durationDays: 4 });
    expect(format(later.date!, "yyyy-MM-dd")).toBe(LATER.date);
    expect(gearUpReducer(later, { type: "APPLY_OUTING_TIME", when: { mode: "now" } })).toMatchObject({
      inputMode: "now",
      // A hidden Later choice remains available when switching the form's mode.
      date: later.date,
      time: "09:15",
      durationDays: 4,
    });
  });

  it("shows a result with the outing it was requested for, and keeps that outing", () => {
    const loading = gearUpReducer(createInitialState("now"), { type: "SUBMIT_START", outing: ALPINE_OUTING });
    const state = gearUpReducer(loading, { type: "SUBMIT_SUCCESS", result: LAYERS_RESULT });
    expect(state).toMatchObject({ request: { status: "idle" }, result: LAYERS_RESULT, lastOuting: ALPINE_OUTING });
  });

  it("keeps the shown result while a newer request loads, and when it fails", () => {
    const shown = gearUpReducer(createInitialState("now"), { type: "SUBMIT_SUCCESS", result: LAYERS_RESULT });
    const loading = gearUpReducer(shown, { type: "SUBMIT_START", outing: ALPINE_OUTING });
    expect(loading).toMatchObject({ request: { status: "loading", outing: ALPINE_OUTING }, result: LAYERS_RESULT });
    expect(gearUpReducer(loading, { type: "SUBMIT_ERROR", message: "Weather unavailable" })).toMatchObject({ request: { status: "error", outing: ALPINE_OUTING, message: "Weather unavailable" }, result: LAYERS_RESULT });
  });

  it("stops loading on error, and starts over on Now without the last outing", () => {
    const planning = { ...createInitialState("later"), lastOuting: ALPINE_OUTING };
    expect(gearUpReducer(gearUpReducer(planning, { type: "SUBMIT_START", outing: ALPINE_OUTING }), { type: "SUBMIT_ERROR", message: "Weather unavailable" }).request.status).toBe("error");
    expect(gearUpReducer(planning, { type: "RESET" })).toEqual(createInitialState("now"));
  });

  it("starts a later outing as one day, and switches between Now and Later keeping what was entered", () => {
    const later = gearUpReducer(createInitialState("now"), { type: "SET_INPUT_MODE", mode: "later" });
    expect(later).toMatchObject({ inputMode: "later", durationDays: 1 });

    const dated = gearUpReducer(later, { type: "SET_DATE", date: new Date("2026-10-08T00:00:00") });
    const now = gearUpReducer(dated, { type: "SET_INPUT_MODE", mode: "now" });
    expect(gearUpReducer(now, { type: "SET_INPUT_MODE", mode: "later" })).toEqual(dated);
  });

  it("marks empty fields once the form is submitted with them, until the form is shown again", () => {
    const missing = gearUpReducer(createInitialState("later"), { type: "FIELDS_MISSING" });
    expect(missing.showFieldErrors).toBe(true);
    expect(gearUpReducer(missing, { type: "SHOW_FORM", mode: "later", keepLoading: false }).showFieldErrors).toBe(false);
  });

  it("goes back to a form without its results, keeping what was entered and the last outing", () => {
    const entered = {
      ...createInitialState("later"),
      date: new Date("2026-10-08T00:00:00"),
      time: "07:30",
      durationDays: 5,
    };
    const shown = gearUpReducer(entered, { type: "SUBMIT_SUCCESS", result: PLAN_RESULT });
    expect(gearUpReducer(shown, { type: "SHOW_FORM", mode: "later", keepLoading: false })).toEqual({
      ...entered,
      lastOuting: PLAN_RESULT.outing,
    });

    const shownNow = gearUpReducer(createInitialState("now"), { type: "SUBMIT_SUCCESS", result: LAYERS_RESULT });
    expect(gearUpReducer(shownNow, { type: "SHOW_FORM", mode: "now", keepLoading: false })).toEqual({
      ...createInitialState("now"),
      lastOuting: ALPINE_OUTING,
    });
    // From Now to Later, as when the iOS shell's Plan tab is tapped after the logo.
    expect(gearUpReducer(createInitialState("now"), { type: "SHOW_FORM", mode: "later", keepLoading: false })).toEqual(
      createInitialState("later")
    );
  });

  it("keeps a request busy on the form only when it's kept", () => {
    const busy = gearUpReducer(createInitialState("later"), { type: "SUBMIT_START", outing: ALPINE_OUTING });
    expect(gearUpReducer(busy, { type: "SHOW_FORM", mode: "later", keepLoading: true }).request.status).toBe("loading");
    expect(gearUpReducer(busy, { type: "SHOW_FORM", mode: "later", keepLoading: false }).request.status).toBe("idle");
  });

  it("restores what was kept for the tab, and keeps it restored for its owner through Back and Start over", () => {
    const kept = {
      inputMode: "later",
      date: new Date("2026-10-08T00:00:00"),
      time: "07:30",
      durationDays: 3,
      lastOuting: ALPINE_OUTING,
    } as const;
    const restored = gearUpReducer(createInitialState("now"), { type: "RESTORE", owner: "user_1", kept });
    expect(restored).toEqual({ ...createInitialState("later"), ...kept, restored: true, owner: "user_1" });
    expect(gearUpReducer(createInitialState("now"), { type: "RESTORE", owner: null, kept: null })).toEqual({
      ...createInitialState("now"),
      restored: true,
      owner: null,
    });

    expect(gearUpReducer(restored, { type: "SHOW_FORM", mode: "now", keepLoading: false })).toMatchObject({
      restored: true,
      owner: "user_1",
    });
    expect(gearUpReducer(restored, { type: "RESET" })).toEqual({
      ...createInitialState("now"),
      restored: true,
      owner: "user_1",
    });
  });

  it("opens Save to trip only on the results of the outing asked for again to save it", () => {
    const restored = gearUpReducer(createInitialState("now"), {
      type: "RESTORE", owner: "user_1", kept: null, saveOnReturn: { outing: ALPINE_OUTING, open: true, tripId: null },
    });
    // Asking again shows the form first; the outing waits for its result.
    const asking = gearUpReducer(
      gearUpReducer(restored, { type: "SHOW_FORM", mode: "later", keepLoading: true }),
      { type: "SUBMIT_START", outing: ALPINE_OUTING }
    );
    expect(asking.saveOnReturn?.outing).toBe(ALPINE_OUTING);
    const shown = gearUpReducer(asking, { type: "SUBMIT_SUCCESS", result: { ...LAYERS_RESULT, outing: { ...ALPINE_OUTING } } });
    expect(shown).toMatchObject({ opensSave: true, saveTripId: null, saveOnReturn: null });
    // The next result, like another activity, doesn't open it again.
    expect(gearUpReducer(shown, { type: "SUBMIT_SUCCESS", result: LAYERS_RESULT }).opensSave).toBe(false);
    // Another outing's result doesn't open it, and Start over forgets it.
    const other = { ...LAYERS_RESULT, outing: { ...ALPINE_OUTING, activity: "xc_skiing" } };
    expect(gearUpReducer(asking, { type: "SUBMIT_SUCCESS", result: other }).opensSave).toBe(false);
    expect(gearUpReducer(asking, { type: "RESET" }).saveOnReturn).toBeNull();
  });

  it("picks the trip of a saved kit being updated on that outing's results, without opening Save to trip", () => {
    const asking = gearUpReducer(
      gearUpReducer(createInitialState("now"), {
        type: "RESTORE", owner: "user_1", kept: null, saveOnReturn: { outing: ALPINE_OUTING, open: false, tripId: "trip-1" },
      }),
      { type: "SUBMIT_START", outing: ALPINE_OUTING }
    );
    const shown = gearUpReducer(asking, { type: "SUBMIT_SUCCESS", result: { ...LAYERS_RESULT, outing: { ...ALPINE_OUTING } } });
    expect(shown).toMatchObject({ opensSave: false, saveTripId: "trip-1" });
    // Changing the outing from the results forgets the trip: its date may differ.
    expect(gearUpReducer(shown, { type: "SUBMIT_SUCCESS", result: LAYERS_RESULT }).saveTripId).toBeNull();
  });
});

describe("outing times", () => {
  it("reads a later outing's forecast at its local start, and none for now", () => {
    expect(forecastDateTime(LATER)).toBe("2026-10-08T14:00");
    expect(forecastDateTime({ mode: "now" })).toBeUndefined();
  });

  it("makes a one-day outing time from a local date-time, or now without one", () => {
    expect(outingTimeAt("2026-10-02T09:15")).toEqual({ mode: "later", date: "2026-10-02", time: "09:15", durationDays: 1 });
    expect(outingTimeAt(undefined)).toEqual({ mode: "now" });
  });
});

describe("buildLayersResult", () => {
  it("ties the advice to the outing and weather it was asked for", async () => {
    const fetchBiophysics = vi.fn(async () => SIGN_IN_REQUIRED);
    const result = await buildLayersResult(ALPINE_OUTING, WEATHER, "neutral", fetchBiophysics);

    expect(fetchBiophysics).toHaveBeenCalledWith(ALPINE_OUTING, WEATHER);
    expect(result).toMatchObject({ kind: "layers", outing: ALPINE_OUTING, weather: WEATHER });
  });

  it("gives general layers, with the reason they aren't personalized, when the activity has a static table", async () => {
    const { advice } = await buildLayersResult(ALPINE_OUTING, WEATHER, "neutral", async () => SIGN_IN_REQUIRED);
    expect(advice).toMatchObject({ kind: "general", reason: "auth_required" });
    expect(advice.kind === "general" && advice.layers.torso.base.length).toBeGreaterThan(0);
  });

  it.each([
    { reason: "auth_required" as const, case: "a signed-out or expired session" },
    { reason: "no_gear" as const, case: "targets without usable gear" },
    { reason: "unavailable" as const, case: "a failed recommendation" },
  ])("has no layers for $case outside the static table", async ({ reason }) => {
    const running = { ...ALPINE_OUTING, activity: "running" };
    const { advice } = await buildLayersResult(running, WEATHER, "neutral", async () => ({ status: reason, data: null }));
    expect(advice).toEqual({ kind: "none", reason });
  });

  it("gives hiking general layers, since it has no personalized model", async () => {
    const hiking = { ...ALPINE_OUTING, activity: "hiking_snowshoeing" };
    const { advice } = await buildLayersResult(hiking, WEATHER, "neutral", async () => ({ status: "unsupported", data: null }));
    expect(advice).toMatchObject({ kind: "general", reason: "unsupported" });
  });

  it("drops a helmet from XC skiing recommendations", async () => {
    const withHelmet = {
      recommendation: {
        headwear: { helmet: { id: "h", name: "Helmet", type: "ski_helmet", rcl: 0.3 }, head_warmth: null, neck_warmth: null },
      },
    } as unknown as BiophysicsRecommendation;
    const xc = { ...ALPINE_OUTING, activity: "xc_skiing" };
    const { advice } = await buildLayersResult(xc, WEATHER, "neutral", async () => ({ status: "ok", data: withHelmet }));
    expect(advice.kind).toBe("personalized");
    expect(advice.kind === "personalized" && advice.recommendation.recommendation.headwear?.helmet).toBeNull();
  });
});

describe("layerDisplayAdvice", () => {
  it("passes on each kind of advice with the reason for anything less than personalized", () => {
    const data = {} as BiophysicsRecommendation;
    expect(layerDisplayAdvice({ kind: "personalized", recommendation: data })).toEqual({
      recommendation: null,
      biophysicsData: data,
      biophysicsStatus: "ok",
    });
    expect(layerDisplayAdvice({ kind: "none", reason: "no_gear" })).toEqual({
      recommendation: null,
      biophysicsData: null,
      biophysicsStatus: "no_gear",
    });
  });
});

describe("fetchPlanAhead", () => {
  const PLAN_OUTING = {
    activity: "running",
    exertion: "moderate",
    place: { id: 1, name: "Bend", country: "US", latitude: 44, longitude: -121 },
    when: { mode: "later", date: "2026-10-01", time: "08:00", durationDays: 3 },
  } as const;
  const requestPlan = () => fetchPlanAhead(PLAN_OUTING, "neutral");

  it("asks for the outing's place, dates and start hour, and keeps the outing with the plan", async () => {
    const plan = { days: [] } as unknown as MultiDayLayerPlan;
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => Response.json({ plan }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestPlan()).resolves.toEqual({ kind: "plan", outing: PLAN_OUTING, plan });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      activity: "running",
      sensitivity: "neutral",
      lat: 44,
      lon: -121,
      startDate: "2026-10-01",
      durationDays: 3,
      startHour: 8,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes on the API's reason for a request it turns down, with the field to fix", async () => {
    const error = "The forecast for this place covers Oct 1 to Oct 16. A 3-day plan can start from Oct 1 to Oct 14.";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error, field: "startDate" }, { status: 422 })));
    await expect(requestPlan()).rejects.toEqual(new PlanAheadError(error, "startDate"));
    await expect(requestPlan()).rejects.toHaveProperty("field", "startDate");
  });

  it("asks to try again when the forecast service fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Failed to fetch weather data" }, { status: 502 })));
    const failure = requestPlan();
    await expect(failure).rejects.toThrow("Couldn't get the forecast for this place. Try again.");
    await expect(failure).rejects.toHaveProperty("field", undefined);
  });

  it.each([
    { page: "a sign-in page, after following a redirect", status: 200 },
    { page: "an error page", status: 404 },
  ])("fails with its own message, not a parse error, when it gets $page", async ({ status }) => {
    const html = "<!DOCTYPE html><html><body>Sign in</body></html>";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status, headers: { "Content-Type": "text/html" } })));
    await expect(requestPlan()).rejects.toThrow("Couldn't get the forecast for this place. Try again.");
  });
});
