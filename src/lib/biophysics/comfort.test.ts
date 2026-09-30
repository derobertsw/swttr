import { describe, expect, it } from "vitest";
import {
  calculateThermalComfortScore,
  evaluateThermalComfort,
  withMinimums,
} from "./comfort";

describe("withMinimums", () => {
  it("pairs each part's clo with its minimum", () => {
    expect(withMinimums({ hands: 0.5, head: 0.3 }, { hands: 0.8, head: 0.7 })).toEqual([
      { clo: 0.5, minimum: 0.8 },
      { clo: 0.3, minimum: 0.7 },
    ]);
  });

  it("returns no parts without minimums", () => {
    expect(withMinimums({ hands: 0.5, head: 0.3 }, undefined)).toEqual([]);
  });
});

describe("evaluateThermalComfort", () => {
  it("marks cold risk when a body part visibly misses its minimum even if whole-body is in range", () => {
    const result = evaluateThermalComfort({
      totalClo: 1.6,
      targetRange: [1.5, 1.9],
      bodyParts: [{ clo: 1.0, minimum: 1.02 }, { clo: 0.5, minimum: 0.56 }],
    });

    expect(result?.riskType).toBe("cold");
    expect(result?.delta).toBeCloseTo(0.06, 5);
  });

  it("stays comfortable when whole-body and local deficits are within the display tolerance", () => {
    const result = evaluateThermalComfort({
      totalClo: 1.48,
      targetRange: [1.5, 1.9],
      bodyParts: [{ clo: 1.0, minimum: 1.04 }, { clo: 0.5, minimum: 0.53 }],
    });

    expect(result?.riskType).toBe("comfortable");
    expect(result?.delta).toBe(0);
  });

  it("prioritizes overheating when total clo is clearly above range", () => {
    const result = evaluateThermalComfort({
      totalClo: 2.3,
      targetRange: [1.5, 1.9],
      bodyParts: [{ clo: 1.0, minimum: 1.04 }, { clo: 0.5, minimum: 0.58 }],
    });

    expect(result?.riskType).toBe("overheat");
    expect(result?.delta).toBeCloseTo(0.4, 5);
  });

  it("flags overheating immediately above the configured overheat buffer", () => {
    const result = evaluateThermalComfort({
      totalClo: 2.21,
      targetRange: [1.5, 1.9],
      bodyParts: [{ clo: 1.0, minimum: 1.02 }, { clo: 0.5, minimum: 0.56 }],
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
      bodyParts: [{ clo: 1.0, minimum: 1.02 }, { clo: 0.5, minimum: 0.51 }],
    });
    const withExtremityGap = calculateThermalComfortScore({
      totalClo: 1.6,
      targetRange: [1.5, 1.9],
      bodyParts: [{ clo: 1.0, minimum: 1.02 }, { clo: 0.5, minimum: 0.75 }],
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
    const oneShort = calculateThermalComfortScore({
      totalClo: 2.66,
      targetRange: [2.44, 2.88],
      bodyParts: [{ clo: 2.0, minimum: 2.3 }],
    });
    const twoShort = calculateThermalComfortScore({
      totalClo: 2.66,
      targetRange: [2.44, 2.88],
      bodyParts: [{ clo: 2.0, minimum: 2.3 }, { clo: 1.0, minimum: 1.1 }],
    });

    expect(twoShort).toBe(oneShort);
  });

  it("weighs the same shortfall more when the body part needs less insulation", () => {
    const running = calculateThermalComfortScore({
      totalClo: 0.4,
      targetRange: [0.4, 0.6],
      bodyParts: [{ clo: 0.2, minimum: 0.4 }],
    });
    const alpine = calculateThermalComfortScore({
      totalClo: 3.0,
      targetRange: [3.0, 3.5],
      bodyParts: [{ clo: 2.8, minimum: 3.0 }],
    });

    expect(running).toBeLessThan(alpine ?? 0);
  });

  it("measures a body part against its own minimum when it needs more than the whole body", () => {
    // Easy biking at -15°F in 40 mph wind: the hands need 3.42 clo while the
    // whole body needs 1.99, and every other part is at its minimum.
    const gloves = (clo: number) =>
      calculateThermalComfortScore({
        totalClo: 2.0,
        targetRange: [1.99, 2.11],
        bodyParts: [{ clo: 2.0, minimum: 2.0 }, { clo, minimum: 3.42 }],
      }) ?? 0;

    // 2.82 and 2.52 clo short of 3.42 clo plus 0.5 clo of surface air
    expect(gloves(0.6)).toBeCloseTo(23.9, 1);
    expect(gloves(0.9)).toBeCloseTo(30.4, 1);
  });

  it("still ranks outfits that fall far short of an unreachable target", () => {
    // Alpine at -15°F: the whole-body range needs more than any outfit reaches.
    const warmer = calculateThermalComfortScore({
      totalClo: 3.96,
      targetRange: [6.21, 6.33],
      bodyParts: [{ clo: 2.83, minimum: 7.10 }, { clo: 4.0, minimum: 4.97 }],
    });
    const cooler = calculateThermalComfortScore({
      totalClo: 2.83,
      targetRange: [6.21, 6.33],
      bodyParts: [{ clo: 1.87, minimum: 7.10 }, { clo: 3.5, minimum: 4.97 }],
    });

    expect(cooler).toBeGreaterThan(0);
    expect(warmer).toBeGreaterThan(cooler ?? 0);
  });

  it("doesn't let extra insulation elsewhere raise the score of a body part that's short", () => {
    const shortPart = [{ clo: 0.5, minimum: 1.0 }];
    const score = (totalClo: number) =>
      calculateThermalComfortScore({ totalClo, targetRange: [1, 1.2], bodyParts: shortPart }) ?? 0;

    // In range, the short body part sets the score.
    expect(score(1.2)).toBeCloseTo(56.7, 1);
    // Overheating overall, with the same body part still short.
    expect(
      evaluateThermalComfort({ totalClo: 1.51, targetRange: [1, 1.2], bodyParts: shortPart })?.riskType
    ).toBe("overheat");
    expect(score(1.51)).toBeLessThanOrEqual(score(1.2));
    expect(score(2.0)).toBeLessThan(score(1.51));
  });

  it("agrees with the displayed decision", () => {
    const targetRange: [number, number] = [2.44, 2.88];
    const cases = [
      { totalClo: 2.66, targetRange },
      { totalClo: 2.66, targetRange, bodyParts: [{ clo: 2.0, minimum: 2.06 }] },
      { totalClo: 2.3, targetRange },
    ];

    for (const input of cases) {
      const decision = evaluateThermalComfort(input);
      const score = calculateThermalComfortScore(input) ?? 0;
      if (decision?.riskType === "comfortable") expect(score).toBeGreaterThanOrEqual(85);
      else expect(score).toBeLessThan(85);
    }
  });
});
