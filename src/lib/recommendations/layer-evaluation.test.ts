import { describe, expect, it } from "vitest";
import { evaluatePhase } from "./layer-evaluation";
import type { PhaseEvaluationInput } from "@/types/biophysics";

const base: PhaseEvaluationInput = {
  itemClo: { torso: [0.5, 0.7], legs: [0.4, 0.2], hands: [0.9], headNeck: [0.3, 0.2] },
  targets: { torso: 1.0, legs: 0.6, hands: 1.0, headNeck: 0.5 },
  arms: { clo: 0.8, target: 0.9 },
  targetRange: [0.8, 1.2],
};

describe("evaluatePhase", () => {
  it("applies the layering regression to torso and legs only", () => {
    const { bodyParts } = evaluatePhase(base);
    expect(bodyParts.torso.clo).toBeCloseTo(1.2 * 0.836, 10);
    expect(bodyParts.legs.clo).toBeCloseTo(0.6 * 0.961, 10);
    expect(bodyParts.hands.clo).toBeCloseTo(0.9, 10);
    expect(bodyParts.headNeck.clo).toBeCloseTo(0.5, 10);
  });

  it("weights torso, arms, and legs into a whole-body total", () => {
    const { totalClo, breakdown } = evaluatePhase(base);
    const expected = 1.2 * 0.836 * 0.5 + 0.8 * 0.25 + 0.6 * 0.961 * 0.25;
    expect(totalClo).toBeCloseTo(expected, 10);
    expect(breakdown?.total).toBe(totalClo);
    expect(breakdown?.regions.map((r) => r.region)).toEqual(["torso", "arms", "legs"]);
    expect(breakdown?.regions[1]).toEqual({ region: "arms", clo: 0.8, weight: 0.25, contribution: 0.2 });
  });

  it("reports the largest regional and extremity deficits", () => {
    const result = evaluatePhase(base);
    // Torso 1.0 - 1.0032 < 0; arms 0.9 - 0.8 = 0.1; legs 0.6 - 0.5766 = 0.0234
    expect(result.maxRegionalDeficit).toBeCloseTo(0.1, 10);
    // Hands 1.0 - 0.9 = 0.1; head 0.5 - 0.5 = 0
    expect(result.maxExtremityDeficit).toBeCloseTo(0.1, 10);
    expect(result.hasRegionalGap).toBe(true);
    expect(result.hasExtremityGap).toBe(true);
  });

  it("uses the arm deficit override without changing the total", () => {
    const withOverride = evaluatePhase({ ...base, arms: { clo: 0.8, target: 0.9, deficitClo: 1.0 } });
    expect(withOverride.maxRegionalDeficit).toBeCloseTo(0.6 - 0.6 * 0.961, 10);
    expect(withOverride.totalClo).toBeCloseTo(evaluatePhase(base).totalClo!, 10);
  });

  it("marks body parts under, over, or in range of their target", () => {
    const { bodyParts } = evaluatePhase({
      ...base,
      itemClo: { torso: [0.5], legs: [1.5], hands: [0.95], headNeck: [] },
      targets: { torso: 1.0, legs: 0.6, hands: 1.0 },
    });
    expect(bodyParts.torso.status).toBe("under");
    expect(bodyParts.torso.delta).toBeCloseTo(1.0 - 0.5 * 0.836, 10);
    expect(bodyParts.legs.status).toBe("over");
    expect(bodyParts.hands.status).toBe("in_range");
    expect(bodyParts.headNeck).toEqual({ clo: 0 });
  });

  it("flags cold risk when a region is under target even if the total is in range", () => {
    const result = evaluatePhase({
      ...base,
      itemClo: { ...base.itemClo, hands: [0.2] },
    });
    expect(result.decision).toMatchObject({ riskType: "cold" });
    expect(result.decision?.delta).toBeCloseTo(0.8, 10);
  });

  it("has no total, decision, or score without arm clo and a target range", () => {
    const result = evaluatePhase({ ...base, arms: undefined, targetRange: undefined });
    expect(result.totalClo).toBeUndefined();
    expect(result.breakdown).toBeUndefined();
    expect(result.decision).toBeNull();
    expect(result.comfortScore).toBeNull();
  });
});
