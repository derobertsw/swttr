import { describe, expect, it } from "vitest";
import { DEFAULT_BODY_METRICS } from "./bodyMetrics";
import { metabolicRateFor } from "@/lib/recommendations/thermal-targets";
import {
  DEFAULT_EXERTION_LEVEL,
  EXERTION_LEVELS,
  exertionToXcIntensity,
  getMetabolicRateForActivity,
  parseExertionLevel,
} from "./exertion";

describe("exertion utilities", () => {
  it("parses known exertion labels and intensity aliases", () => {
    expect(parseExertionLevel("easy")).toBe("easy");
    expect(parseExertionLevel("moderate")).toBe("moderate");
    expect(parseExertionLevel("hard")).toBe("hard");
    expect(parseExertionLevel("racing")).toBe("hard");
  });

  it("falls back to default exertion for unknown inputs", () => {
    expect(parseExertionLevel("unknown")).toBe(DEFAULT_EXERTION_LEVEL);
    expect(parseExertionLevel(undefined)).toBe(DEFAULT_EXERTION_LEVEL);
  });

  it("maps exertion to XC intensity labels", () => {
    expect(exertionToXcIntensity("easy")).toBe("easy");
    expect(exertionToXcIntensity("moderate")).toBe("moderate");
    expect(exertionToXcIntensity("hard")).toBe("racing");
  });

  it("returns higher metabolic rate for higher exertion", () => {
    const easy = getMetabolicRateForActivity("running", "easy");
    const hard = getMetabolicRateForActivity("running", "hard");
    expect(hard).toBeGreaterThan(easy);
  });

  it.each(
    (["running", "xc_skiing"] as const).flatMap(activity =>
      EXERTION_LEVELS.map(exertion => ({ activity, exertion }))
    )
  )("matches the recommendation rate for $activity at $exertion effort with default body metrics", ({ activity, exertion }) => {
    expect(getMetabolicRateForActivity(activity, exertion)).toBeCloseTo(
      metabolicRateFor(activity, exertion, DEFAULT_BODY_METRICS),
      8
    );
  });
});
