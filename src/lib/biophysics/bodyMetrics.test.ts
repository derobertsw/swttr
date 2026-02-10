import { describe, expect, it } from "vitest";
import {
  DEFAULT_BODY_METRICS,
  applyBodySizeMetabolicAdjustment,
  getBodySizeMetabolicFactor,
  sanitizeBodyMetrics,
} from "./bodyMetrics";

describe("bodyMetrics", () => {
  it("uses a neutral factor for default profile", () => {
    const factor = getBodySizeMetabolicFactor(DEFAULT_BODY_METRICS);
    expect(factor).toBeCloseTo(1, 4);
  });

  it("increases factor for larger profile and decreases for smaller profile", () => {
    const smaller = getBodySizeMetabolicFactor({ heightInches: 64, weightLbs: 120 });
    const larger = getBodySizeMetabolicFactor({ heightInches: 74, weightLbs: 240 });
    expect(smaller).toBeLessThan(1);
    expect(larger).toBeGreaterThan(1);
  });

  it("applies factor to metabolic rate", () => {
    const baseRate = 300;
    const adjusted = applyBodySizeMetabolicAdjustment(baseRate, { heightInches: 74, weightLbs: 240 });
    expect(adjusted).toBeGreaterThan(baseRate);
  });

  it("sanitizes and clamps invalid values", () => {
    const sanitized = sanitizeBodyMetrics({ heightInches: 10, weightLbs: 999 });
    expect(sanitized.heightInches).toBeGreaterThanOrEqual(54);
    expect(sanitized.weightLbs).toBeLessThanOrEqual(320);
  });
});
