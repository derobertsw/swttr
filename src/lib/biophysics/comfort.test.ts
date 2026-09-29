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

  it("flags overheating immediately above the configured overheat buffer", () => {
    const result = evaluateThermalComfort({
      totalClo: 2.21,
      targetRange: [1.5, 1.9],
      maxRegionalDeficit: 0.02,
      maxExtremityDeficit: 0.06,
    });

    expect(result?.riskType).toBe("overheat");
    expect(result?.delta).toBeCloseTo(0.31, 5);
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

  it("scores an outfit inside the range with no shortfall 85 or more", () => {
    expect(calculateThermalComfortScore({ totalClo: 2.66, targetRange: [2.44, 2.88] })).toBe(100);
    expect(calculateThermalComfortScore({ totalClo: 2.44, targetRange: [2.44, 2.88] })).toBe(85);
  });

  it("scores a cold outfit by the share of the needed insulation it provides", () => {
    // 0.5 clo short of 2.0 clo, plus 0.5 clo of surface air: 80% of 2.5 clo.
    expect(calculateThermalComfortScore({ totalClo: 1.5, targetRange: [2.0, 2.5] })).toBe(68);
  });

  it("counts each shortfall once", () => {
    const regionalOnly = calculateThermalComfortScore({
      totalClo: 2.66,
      targetRange: [2.44, 2.88],
      maxRegionalDeficit: 0.3,
    });
    const regionalAndExtremity = calculateThermalComfortScore({
      totalClo: 2.66,
      targetRange: [2.44, 2.88],
      maxRegionalDeficit: 0.3,
      maxExtremityDeficit: 0.2,
    });

    expect(regionalAndExtremity).toBe(regionalOnly);
  });

  it("weighs the same shortfall more when the outing needs less insulation", () => {
    const running = calculateThermalComfortScore({ totalClo: 0.4, targetRange: [0.4, 0.6], maxRegionalDeficit: 0.2 });
    const alpine = calculateThermalComfortScore({ totalClo: 3.0, targetRange: [3.0, 3.5], maxRegionalDeficit: 0.2 });

    expect(running).toBeLessThan(alpine ?? 0);
  });

  it("still ranks outfits that fall far short of an unreachable target", () => {
    // Alpine at -15°F: the whole-body range needs more than any outfit reaches.
    const warmer = calculateThermalComfortScore({
      totalClo: 3.96,
      targetRange: [6.21, 6.33],
      maxRegionalDeficit: 4.27,
      maxExtremityDeficit: 0.97,
    });
    const cooler = calculateThermalComfortScore({
      totalClo: 2.83,
      targetRange: [6.21, 6.33],
      maxRegionalDeficit: 5.23,
      maxExtremityDeficit: 1.47,
    });

    expect(cooler).toBeGreaterThan(0);
    expect(warmer).toBeGreaterThan(cooler ?? 0);
  });

  it("agrees with the displayed decision", () => {
    const cases = [
      { totalClo: 2.66, targetRange: [2.44, 2.88] as [number, number] },
      { totalClo: 2.66, targetRange: [2.44, 2.88] as [number, number], maxRegionalDeficit: 0.06 },
      { totalClo: 2.3, targetRange: [2.44, 2.88] as [number, number] },
    ];

    for (const input of cases) {
      const decision = evaluateThermalComfort(input);
      const score = calculateThermalComfortScore(input) ?? 0;
      if (decision?.riskType === "comfortable") expect(score).toBeGreaterThanOrEqual(85);
      else expect(score).toBeLessThan(85);
    }
  });
});
