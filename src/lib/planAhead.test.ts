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
    expect(result.uncoveredDays.map((day) => day.date)).toEqual([
      "2026-01-17",
      "2026-01-18",
      "2026-01-19",
      "2026-01-20",
      "2026-01-21",
    ]);
    expect(result.uncoveredDays[0]).toEqual({ date: "2026-01-17", label: "Sat, Jan 17", reason: "noForecast" });
  });

  it("says when the first day's daytime hours all come before the start time", () => {
    const hours: ForecastHour[] = [
      { time: "2026-01-15T12:00", temperature: 35, windSpeed: 8, precipitationProbability: 0 },
      { time: "2026-01-15T21:00", temperature: 30, windSpeed: 8, precipitationProbability: 0 },
      { time: "2026-01-16T09:00", temperature: 32, windSpeed: 8, precipitationProbability: 0 },
    ];

    const result = buildMultiDayLayerPlan({
      startDate: new Date("2026-01-15T00:00:00"),
      durationDays: 2,
      startHour: 22,
      hourlyForecast: hours,
      getRecommendation: () => makeRecommendation(2),
    });

    expect(result.days.map((day) => day.date)).toEqual(["2026-01-16"]);
    expect(result.uncoveredDays).toEqual([{ date: "2026-01-15", label: "Thu, Jan 15", reason: "afterStartTime" }]);
  });

  it("leaves no days uncovered when every day has daytime hours", () => {
    const hours: ForecastHour[] = [
      { time: "2026-01-15T08:00", temperature: 35, windSpeed: 10, precipitationProbability: 0 },
      { time: "2026-01-16T09:00", temperature: 36, windSpeed: 10, precipitationProbability: 0 },
    ];

    const result = buildMultiDayLayerPlan({
      startDate: new Date("2026-01-15T00:00:00"),
      durationDays: 2,
      hourlyForecast: hours,
      getRecommendation: () => makeRecommendation(2),
    });

    expect(result.uncoveredDays).toEqual([]);
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

  it("starts the first day at the start time, but not before the daytime hours", () => {
    const hours: ForecastHour[] = [
      { time: "2026-01-15T12:00", temperature: 35, windSpeed: 8, precipitationProbability: 0 },
    ];
    const plan = (startHour?: number) => buildMultiDayLayerPlan({
      startDate: new Date("2026-01-15T00:00:00"),
      durationDays: 1,
      startHour,
      hourlyForecast: hours,
      getRecommendation: () => makeRecommendation(2),
    });

    expect(plan(12).firstDayStartHour).toBe(12);
    expect(plan(4).firstDayStartHour).toBe(6);
    expect(plan().firstDayStartHour).toBe(6);
  });

  describe("layer changes", () => {
    // Colder than 25°F after the wind: a second torso mid and a second hat.
    const getRecommendation = (temp: number) => {
      const layers = makeRecommendation(3);
      if (temp >= 25) return layers;
      return {
        ...layers,
        torso: { ...layers.torso, mid: [...(layers.torso.mid ?? []), { name: "Down vest" }] },
        headNeck: { base: [...layers.headNeck.base, { name: "Neck gaiter" }], outer: [] },
      };
    };
    const hours: ForecastHour[] = [
      // Thu: a cold morning, then a warmer midday.
      { time: "2026-01-15T07:00", temperature: 20, windSpeed: 0, precipitationProbability: 0 },
      { time: "2026-01-15T12:00", temperature: 30, windSpeed: 0, precipitationProbability: 0 },
      // Fri: as cold as Thu.
      { time: "2026-01-16T09:00", temperature: 20, windSpeed: 0, precipitationProbability: 0 },
      // Sat: warmer.
      { time: "2026-01-17T09:00", temperature: 30, windSpeed: 0, precipitationProbability: 0 },
    ];
    const plan = () => buildMultiDayLayerPlan({
      startDate: new Date("2026-01-15T00:00:00"),
      durationDays: 3,
      hourlyForecast: hours,
      getRecommendation,
    });

    it("lists what each daypart takes off or puts on, from the day's layers", () => {
      const [thursday] = plan().days;

      expect(thursday.dayparts.map((part) => [part.id, part.changes])).toEqual([
        ["morning", { add: [], remove: [] }],
        ["midday", {
          add: [],
          remove: [
            { bodyPart: "torso", layerType: "mid", name: "Down vest" },
            { bodyPart: "headNeck", layerType: "base", name: "Neck gaiter" },
          ],
        }],
      ]);
    });

    it("lists what changes from the day before, after the first day", () => {
      const [thursday, friday, saturday] = plan().days;

      expect(thursday.changesFromPreviousDay).toBeNull();
      expect(friday.changesFromPreviousDay).toEqual({ add: [], remove: [] });
      expect(saturday.changesFromPreviousDay).toEqual({
        add: [],
        remove: [
          { bodyPart: "torso", layerType: "mid", name: "Down vest" },
          { bodyPart: "headNeck", layerType: "base", name: "Neck gaiter" },
        ],
      });
    });

    it("puts on what the other layers have and these don't", () => {
      const [, friday] = buildMultiDayLayerPlan({
        startDate: new Date("2026-01-15T00:00:00"),
        durationDays: 2,
        hourlyForecast: [hours[1], hours[2]],
        getRecommendation,
      }).days;

      expect(friday.changesFromPreviousDay).toEqual({
        add: [
          { bodyPart: "torso", layerType: "mid", name: "Down vest" },
          { bodyPart: "headNeck", layerType: "base", name: "Neck gaiter" },
        ],
        remove: [],
      });
    });

    it("has no changes when either side has no layers", () => {
      const result = buildMultiDayLayerPlan({
        startDate: new Date("2026-01-15T00:00:00"),
        durationDays: 3,
        hourlyForecast: hours,
        getRecommendation: (temp) => (temp < 25 ? null : makeRecommendation(3)),
      });
      const [thursday, friday, saturday] = result.days;

      expect(thursday.dayparts.map((part) => part.changes)).toEqual([null, null]);
      expect(friday.changesFromPreviousDay).toBeNull();
      expect(saturday.changesFromPreviousDay).toBeNull();
    });
  });
});
