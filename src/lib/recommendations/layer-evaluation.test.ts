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

  it("marks body parts under their minimum, over their target, or in range", () => {
    const { bodyParts } = evaluatePhase({
      ...base,
      itemClo: { torso: [0.5], legs: [1.5], hands: [0.9], headNeck: [] },
      targets: { torso: 1.0, legs: 0.6, hands: 1.0 },
      minTargets: { torso: 0.8, legs: 0.5, hands: 0.85 },
    });
    expect(bodyParts.torso.status).toBe("under");
    expect(bodyParts.torso.delta).toBeCloseTo(1.0 - 0.5 * 0.836, 10);
    expect(bodyParts.legs.status).toBe("over");
    // Above its minimum, though 0.1 clo below its target
    expect(bodyParts.hands.status).toBe("in_range");
    expect(bodyParts.hands.delta).toBeCloseTo(0.1, 10);
    expect(bodyParts.headNeck).toEqual({ clo: 0 });
  });

  it("measures shortfalls from each part's minimum", () => {
    const result = evaluatePhase({
      ...base,
      minTargets: { torso: 0.9, legs: 0.5, hands: 0.8, headNeck: 0.4 },
      arms: { clo: 0.8, target: 0.9, minTarget: 0.75 },
    });
    // Every part clears its minimum, though arms and hands miss their targets.
    expect(result.maxRegionalDeficit).toBe(0);
    expect(result.maxExtremityDeficit).toBe(0);
    expect(result.decision).toMatchObject({ riskType: "comfortable" });
    expect(result.comfortScore).toBeGreaterThanOrEqual(85);
  });

  it("scores gloves against the hand minimum when it exceeds the whole-body minimum", () => {
    // Easy biking at -15°F in 40 mph wind: the hands need 3.42 clo, the whole
    // body 1.99, and every other part sits at its minimum.
    const withGloves = (gloveClo: number) => evaluatePhase({
      itemClo: { torso: [2.4], legs: [2.1], hands: [gloveClo], headNeck: [1.0] },
      targets: { torso: 2.2, legs: 2.3, hands: 3.6, headNeck: 1.2 },
      minTargets: { torso: 2.0, legs: 2.0, hands: 3.42, headNeck: 1.0 },
      arms: { clo: 2.0, target: 2.2, minTarget: 2.0 },
      targetRange: [1.99, 2.11],
    });

    expect(withGloves(0.6).comfortScore).toBeCloseTo(23.9, 1);
    expect(withGloves(0.9).comfortScore).toBeCloseTo(30.4, 1);
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
