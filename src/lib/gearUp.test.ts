import { describe, expect, it, vi } from "vitest";
import { buildGearUpResult, createInitialState, fetchPlanAhead, gearUpReducer } from "./gearUp";
import type { BiophysicsRecommendation } from "@/types/biophysics";

const WEATHER = { temperature: 20, windSpeed: 12, precipitation: true, precipitationType: "snow" as const };

describe("gearUpReducer", () => {
  it("stores a successful result and shows it", () => {
    const loading = gearUpReducer(createInitialState("manual"), { type: "SUBMIT_START" });
    const state = gearUpReducer(loading, {
      type: "SUBMIT_SUCCESS",
      recommendation: null,
      biophysicsData: null,
      temperature: 20,
      windspeed: 12,
    });
    expect(state).toMatchObject({ loading: false, showResults: true, temperature: 20, precipitation: false });
  });

  it("stops loading on error and resets to manual mode", () => {
    const planning = createInitialState("planAhead");
    expect(gearUpReducer({ ...planning, loading: true }, { type: "SUBMIT_ERROR" }).loading).toBe(false);
    expect(gearUpReducer(planning, { type: "RESET" }).inputMode).toBe("manual");
  });
});

describe("buildGearUpResult", () => {
  it("combines static layers with biophysics data for the weather", async () => {
    const fetchBiophysics = vi.fn(async () => null);
    const result = await buildGearUpResult(WEATHER, "alpine_skiing", "neutral", fetchBiophysics);

    expect(fetchBiophysics).toHaveBeenCalledWith("alpine_skiing", WEATHER);
    expect(result).toMatchObject({ temperature: 20, windspeed: 12, precipitation: true, precipitationType: "snow" });
    expect(result.recommendation?.torso.base.length).toBeGreaterThan(0);
  });

  it("has no static layers for activities outside the static table", async () => {
    const result = await buildGearUpResult(WEATHER, "running", "neutral", async () => null);
    expect(result.recommendation).toBeNull();
  });

  it("drops a helmet from XC skiing recommendations", async () => {
    const withHelmet = {
      recommendation: {
        headwear: { helmet: { id: "h", name: "Helmet", type: "ski_helmet", rcl: 0.3 }, head_warmth: null, neck_warmth: null },
      },
    } as unknown as BiophysicsRecommendation;
    const result = await buildGearUpResult(WEATHER, "xc_skiing", "neutral", async () => withHelmet);
    expect(result.biophysicsData?.recommendation.headwear?.helmet).toBeNull();
  });
});

describe("fetchPlanAhead", () => {
  it("surfaces the API's error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Forecast unavailable" }, { status: 502 })));
    await expect(
      fetchPlanAhead({
        activity: "running",
        sensitivity: "neutral",
        location: { id: 1, name: "Bend", country: "US", latitude: 44, longitude: -121 },
        date: new Date("2026-10-01T00:00:00"),
        time: "08:00",
        durationDays: 3,
      })
    ).rejects.toThrow("Forecast unavailable");
    vi.unstubAllGlobals();
  });
});
