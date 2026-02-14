import { describe, expect, it } from "vitest";
import {
  calculateThermalComfortScore,
  evaluateThermalComfort,
  getMaxExtremityDeficit,
} from "./comfort";

describe("getMaxExtremityDeficit", () => {
  it("returns the larger hands/head deficit", () => {
    const deficit = getMaxExtremityDeficit(
      { hands: 0.5, head: 0.3 },
      { hands: 0.8, head: 0.7 }
    );

    expect(deficit).toBeCloseTo(0.4, 5);
  });
});

describe("evaluateThermalComfort", () => {
  it("marks cold risk when extremity deficit exceeds threshold even if whole-body is in range", () => {
    const result = evaluateThermalComfort({
      totalClo: 1.6,
      targetRange: [1.5, 1.9],
      maxRegionalDeficit: 0.02,
      maxExtremityDeficit: 0.2,
    });

    expect(result?.riskType).toBe("cold");
    expect(result?.delta).toBeCloseTo(0.2, 5);
  });
});

describe("calculateThermalComfortScore", () => {
  it("penalizes score for large extremity deficits", () => {
    const base = calculateThermalComfortScore({
      totalClo: 1.6,
      targetRange: [1.5, 1.9],
      maxRegionalDeficit: 0.02,
      maxExtremityDeficit: 0.01,
    });
    const withExtremityGap = calculateThermalComfortScore({
      totalClo: 1.6,
      targetRange: [1.5, 1.9],
      maxRegionalDeficit: 0.02,
      maxExtremityDeficit: 0.25,
    });

    expect(base).not.toBeNull();
    expect(withExtremityGap).not.toBeNull();
    expect((withExtremityGap ?? 0)).toBeLessThan(base ?? 0);
  });
});
