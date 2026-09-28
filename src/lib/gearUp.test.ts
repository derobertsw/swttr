import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGearUpResult, createInitialState, fetchPlanAhead, gearUpReducer } from "./gearUp";
import type { BiophysicsOutcome, BiophysicsRecommendation } from "@/types/biophysics";
import type { MultiDayLayerPlan } from "@/types/plan";
import type { WeatherContext } from "@/types/weather";

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
const SIGN_IN_REQUIRED: BiophysicsOutcome = { status: "auth_required", data: null };

describe("gearUpReducer", () => {
  it("stores a successful result and shows it", () => {
    const loading = gearUpReducer(createInitialState("manual"), { type: "SUBMIT_START" });
    const state = gearUpReducer(loading, {
      type: "SUBMIT_SUCCESS",
      recommendation: null,
      biophysicsData: null,
      biophysicsStatus: "auth_required",
      temperature: 20,
      windspeed: 12,
    });
    expect(state).toMatchObject({
      loading: false,
      showResults: true,
      temperature: 20,
      precipitation: false,
      biophysicsStatus: "auth_required",
    });
  });

  it("keeps where and when the weather applies, until a multi-day plan replaces it", () => {
    const shown = gearUpReducer(createInitialState("planAhead"), {
      type: "SUBMIT_SUCCESS",
      recommendation: null,
      biophysicsData: null,
      biophysicsStatus: "auth_required",
      temperature: 20,
      windspeed: 12,
      weatherContext: FORECAST_CONTEXT,
    });
    expect(shown.weatherContext).toEqual(FORECAST_CONTEXT);

    const planned = gearUpReducer(shown, {
      type: "SUBMIT_PLAN_SUCCESS",
      plan: { days: [] } as unknown as MultiDayLayerPlan,
      recommendation: null,
      temperature: 18,
      windspeed: 10,
    });
    expect(planned.weatherContext).toBeNull();
  });

  it("stops loading on error and resets to manual mode", () => {
    const planning = createInitialState("planAhead");
    expect(gearUpReducer({ ...planning, loading: true }, { type: "SUBMIT_ERROR" }).loading).toBe(false);
    expect(gearUpReducer(planning, { type: "RESET" }).inputMode).toBe("manual");
  });

  it("goes back to the plan form without its results, keeping what was entered", () => {
    const entered = {
      ...createInitialState("planAhead"),
      date: new Date("2026-10-08T00:00:00"),
      time: "07:30",
      durationDays: 5,
    };
    const shown = gearUpReducer(entered, {
      type: "SUBMIT_PLAN_SUCCESS",
      plan: { days: [] } as unknown as MultiDayLayerPlan,
      recommendation: null,
      temperature: 18,
      windspeed: 10,
    });

    expect(gearUpReducer(shown, { type: "SHOW_PLAN_FORM" })).toEqual(entered);
    // From Now mode too, as when the iOS shell's Plan tab is tapped after the logo.
    expect(gearUpReducer(createInitialState("manual"), { type: "SHOW_PLAN_FORM" })).toEqual(
      createInitialState("planAhead")
    );
    // A request still running keeps the form busy until it answers.
    expect(gearUpReducer({ ...entered, loading: true }, { type: "SHOW_PLAN_FORM" }).loading).toBe(true);
  });
});

describe("buildGearUpResult", () => {
  it("combines static layers with biophysics data for the weather", async () => {
    const fetchBiophysics = vi.fn(async () => SIGN_IN_REQUIRED);
    const result = await buildGearUpResult(WEATHER, "alpine_skiing", "neutral", fetchBiophysics);

    expect(fetchBiophysics).toHaveBeenCalledWith("alpine_skiing", WEATHER);
    expect(result).toMatchObject({
      temperature: 20,
      windspeed: 12,
      precipitation: true,
      precipitationType: "snow",
      biophysicsData: null,
      biophysicsStatus: "auth_required",
      weatherContext: FORECAST_CONTEXT,
    });
    expect(result.recommendation?.torso.base.length).toBeGreaterThan(0);
  });

  it("has no static layers for activities outside the static table", async () => {
    const result = await buildGearUpResult(WEATHER, "running", "neutral", async () => SIGN_IN_REQUIRED);
    expect(result.recommendation).toBeNull();
    expect(result.biophysicsStatus).toBe("auth_required");
  });

  it("drops a helmet from XC skiing recommendations", async () => {
    const withHelmet = {
      recommendation: {
        headwear: { helmet: { id: "h", name: "Helmet", type: "ski_helmet", rcl: 0.3 }, head_warmth: null, neck_warmth: null },
      },
    } as unknown as BiophysicsRecommendation;
    const result = await buildGearUpResult(WEATHER, "xc_skiing", "neutral", async () => ({
      status: "ok",
      data: withHelmet,
    }));
    expect(result.biophysicsData?.recommendation.headwear?.helmet).toBeNull();
    expect(result.biophysicsStatus).toBe("ok");
  });
});

describe("fetchPlanAhead", () => {
  const PLAN_REQUEST = {
    activity: "running",
    sensitivity: "neutral",
    location: { id: 1, name: "Bend", country: "US", latitude: 44, longitude: -121 },
    date: new Date("2026-10-01T00:00:00"),
    time: "08:00",
    durationDays: 3,
  } as const;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces the API's error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Forecast unavailable" }, { status: 502 })));
    await expect(fetchPlanAhead(PLAN_REQUEST)).rejects.toThrow("Forecast unavailable");
  });

  it.each([
    { page: "a sign-in page, after following a redirect", status: 200 },
    { page: "an error page", status: 404 },
  ])("fails with its own message, not a parse error, when it gets $page", async ({ status }) => {
    const html = "<!DOCTYPE html><html><body>Sign in</body></html>";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status, headers: { "Content-Type": "text/html" } })));
    await expect(fetchPlanAhead(PLAN_REQUEST)).rejects.toThrow(new Error("Failed to build plan"));
  });
});
