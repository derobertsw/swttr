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
  it("shows a result with the outing it was requested for", () => {
    const loading = gearUpReducer(createInitialState("manual"), { type: "SUBMIT_START" });
    const state = gearUpReducer(loading, { type: "SUBMIT_SUCCESS", result: LAYERS_RESULT });
    expect(state).toMatchObject({ loading: false, result: LAYERS_RESULT });
  });

  it("keeps the shown result while a newer request loads, and when it fails", () => {
    const shown = gearUpReducer(createInitialState("manual"), { type: "SUBMIT_SUCCESS", result: LAYERS_RESULT });
    const loading = gearUpReducer(shown, { type: "SUBMIT_START" });
    expect(loading).toMatchObject({ loading: true, result: LAYERS_RESULT });
    expect(gearUpReducer(loading, { type: "SUBMIT_ERROR" })).toMatchObject({ loading: false, result: LAYERS_RESULT });
  });

  it("stops loading on error and resets to manual mode", () => {
    const planning = createInitialState("planAhead");
    expect(gearUpReducer({ ...planning, loading: true }, { type: "SUBMIT_ERROR" }).loading).toBe(false);
    expect(gearUpReducer(planning, { type: "RESET" }).inputMode).toBe("manual");
  });

  it("goes back to a form without its results, keeping what was entered", () => {
    const entered = {
      ...createInitialState("planAhead"),
      date: new Date("2026-10-08T00:00:00"),
      time: "07:30",
      durationDays: 5,
    };
    const shown = gearUpReducer(entered, { type: "SUBMIT_SUCCESS", result: PLAN_RESULT });
    expect(gearUpReducer(shown, { type: "SHOW_FORM", mode: "planAhead" })).toEqual(entered);

    const shownNow = gearUpReducer(createInitialState("manual"), { type: "SUBMIT_SUCCESS", result: LAYERS_RESULT });
    expect(gearUpReducer(shownNow, { type: "SHOW_FORM", mode: "manual" })).toEqual(createInitialState("manual"));
    // From Now mode to the plan, as when the iOS shell's Plan tab is tapped after the logo.
    expect(gearUpReducer(createInitialState("manual"), { type: "SHOW_FORM", mode: "planAhead" })).toEqual(
      createInitialState("planAhead")
    );
  });

  it("keeps a request busy only when it was made from the form being shown", () => {
    const busy = (state: ReturnType<typeof createInitialState>) => ({ ...state, loading: true });
    const shown = gearUpReducer(createInitialState("planAhead"), { type: "SUBMIT_SUCCESS", result: LAYERS_RESULT });
    const showPlan = { type: "SHOW_FORM", mode: "planAhead" } as const;

    expect(gearUpReducer(busy(createInitialState("planAhead")), showPlan).loading).toBe(true);
    expect(gearUpReducer(busy(shown), showPlan).loading).toBe(false);
    expect(gearUpReducer(busy(createInitialState("manual")), showPlan).loading).toBe(false);
    expect(gearUpReducer(busy(createInitialState("manual")), { type: "SHOW_FORM", mode: "manual" }).loading).toBe(true);
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
