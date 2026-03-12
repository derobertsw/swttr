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
  it("marks cold risk when a body-part target is visibly missed even if whole-body is in range", () => {
    const result = evaluateThermalComfort({
      totalClo: 1.6,
      targetRange: [1.5, 1.9],
      maxRegionalDeficit: 0.02,
      maxExtremityDeficit: 0.06,
    });

    expect(result?.riskType).toBe("cold");
    expect(result?.delta).toBeCloseTo(0.06, 5);
  });

  it("stays comfortable when whole-body and local deficits are within the display tolerance", () => {
    const result = evaluateThermalComfort({
      totalClo: 1.48,
      targetRange: [1.5, 1.9],
      maxRegionalDeficit: 0.04,
      maxExtremityDeficit: 0.03,
    });

    expect(result?.riskType).toBe("comfortable");
    expect(result?.delta).toBe(0);
  });

  it("prioritizes overheating when total clo is clearly above range", () => {
    const result = evaluateThermalComfort({
      totalClo: 2.3,
      targetRange: [1.5, 1.9],
      maxRegionalDeficit: 0.04,
      maxExtremityDeficit: 0.08,
    });

    expect(result?.riskType).toBe("overheat");
    expect(result?.delta).toBeCloseTo(0.4, 5);
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
