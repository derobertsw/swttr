import { describe, expect, it, vi } from "vitest";
import { buildMultiDayLayerPlan } from "@/lib/planAhead";
import { Recommendation } from "@/types/recommendations";
import { ForecastHour } from "@/types/plan";

function makeRecommendation(layerCount: number): Recommendation {
  const items = Array.from({ length: layerCount }, (_, index) => ({ name: `layer-${index}` }));
  return {
    torso: { base: items.slice(0, 1), mid: items.slice(1, 2), outer: items.slice(2, 3) },
    legs: { base: items.slice(0, 1), outer: items.slice(1, 2) },
    hands: { base: items.slice(0, 1), outer: [] },
    headNeck: { base: items.slice(0, 1), outer: [] },
  };
}

describe("buildMultiDayLayerPlan", () => {
  it("ignores overnight hours for baseline and dayparts", () => {
    const hours: ForecastHour[] = [
      { time: "2026-01-15T03:00", temperature: 10, windSpeed: 2, precipitationProbability: 0 },
      { time: "2026-01-15T07:00", temperature: 40, windSpeed: 5, precipitationProbability: 0 },
      { time: "2026-01-15T12:00", temperature: 45, windSpeed: 6, precipitationProbability: 0 },
      { time: "2026-01-15T18:00", temperature: 42, windSpeed: 7, precipitationProbability: 0 },
    ];

    const getRecommendation = vi.fn((temp: number) =>
      temp < 35 ? makeRecommendation(3) : makeRecommendation(2)
    );

    const result = buildMultiDayLayerPlan({
      startDate: new Date("2026-01-15T00:00:00"),
      durationDays: 1,
      hourlyForecast: hours,
      getRecommendation,
    });

    expect(result.days).toHaveLength(1);
    expect(result.days[0].baseline.minTemp).toBe(40);
    expect(result.days[0].dayparts.map((part) => part.id)).toEqual(["morning", "midday", "evening"]);
    expect(getRecommendation).toHaveBeenCalled();
    expect(getRecommendation.mock.calls[0][0]).toBeGreaterThanOrEqual(35);
  });

  it("clamps duration to seven days and only includes days with data", () => {
    const hours: ForecastHour[] = [
      { time: "2026-01-15T08:00", temperature: 35, windSpeed: 10, precipitationProbability: 0 },
      { time: "2026-01-16T09:00", temperature: 36, windSpeed: 10, precipitationProbability: 0 },
    ];

    const result = buildMultiDayLayerPlan({
      startDate: new Date("2026-01-15T00:00:00"),
      durationDays: 10,
      hourlyForecast: hours,
      getRecommendation: () => makeRecommendation(2),
    });

    expect(result.durationDays).toBe(7);
    expect(result.startDate).toBe("2026-01-15");
    expect(result.endDate).toBe("2026-01-21");
    expect(result.days).toHaveLength(2);
  });

  it("respects start hour on the first day", () => {
    const hours: ForecastHour[] = [
      { time: "2026-01-15T07:00", temperature: 30, windSpeed: 8, precipitationProbability: 0 },
      { time: "2026-01-15T12:00", temperature: 35, windSpeed: 8, precipitationProbability: 0 },
      { time: "2026-01-15T18:00", temperature: 40, windSpeed: 8, precipitationProbability: 0 },
    ];

    const result = buildMultiDayLayerPlan({
      startDate: new Date("2026-01-15T00:00:00"),
      durationDays: 1,
      startHour: 16,
      hourlyForecast: hours,
      getRecommendation: () => makeRecommendation(2),
    });

    expect(result.days).toHaveLength(1);
    expect(result.days[0].baseline.minTemp).toBe(40);
    expect(result.days[0].dayparts.map((part) => part.id)).toEqual(["evening"]);
  });

  it("adds carry items for precipitation, wind, cold, and large daytime swings", () => {
    const hours: ForecastHour[] = [
      { time: "2026-01-15T07:00", temperature: 25, windSpeed: 20, precipitationProbability: 70 },
      { time: "2026-01-15T13:00", temperature: 42, windSpeed: 12, precipitationProbability: 10 },
      { time: "2026-01-15T18:00", temperature: 38, windSpeed: 10, precipitationProbability: 5 },
    ];

    const result = buildMultiDayLayerPlan({
      startDate: new Date("2026-01-15T00:00:00"),
      durationDays: 1,
      hourlyForecast: hours,
      getRecommendation: () => makeRecommendation(3),
    });

    expect(result.days).toHaveLength(1);
    expect(result.days[0].carryItems).toContain("Waterproof shell");
    expect(result.days[0].carryItems).toContain("Wind-blocking outer layer");
    expect(result.days[0].carryItems).toContain("Warm gloves and head insulation");
    expect(result.days[0].carryItems).toContain("Removable mid-layer for daytime swings");
  });
});
