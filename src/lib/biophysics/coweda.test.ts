import { describe, expect, it } from "vitest";
import { METABOLIC_RATES } from "./constants";
import {
  applyCowedaBufferToExtremityTargets,
  applyCowedaBufferToTargetRange,
  calculateCowedaValidationBuffer,
} from "./coweda";

describe("calculateCowedaValidationBuffer", () => {
  it("returns positive clo buffers", () => {
    const result = calculateCowedaValidationBuffer({
      airTempC: -10,
      relativeHumidity: 50,
      metabolicRate: METABOLIC_RATES.xc_skiing_moderate,
    });

    expect(result.wholeBody).toBeGreaterThan(0);
    expect(result.coldRisk).toBeGreaterThan(0);
    expect(result.extremity).toBeGreaterThan(0);
    expect(result.extremity).toBeGreaterThan(result.wholeBody);
  });

  it("applies larger buffers for low-metabolic contexts", () => {
    const active = calculateCowedaValidationBuffer({
      airTempC: -10,
      relativeHumidity: 50,
      metabolicRate: METABOLIC_RATES.xc_skiing_racing,
    });
    const staticContext = calculateCowedaValidationBuffer({
      airTempC: -10,
      relativeHumidity: 50,
      metabolicRate: METABOLIC_RATES.chairlift,
    });

    expect(staticContext.coldRisk).toBeGreaterThan(active.coldRisk);
    expect(staticContext.extremity).toBeGreaterThan(active.extremity);
  });
});

describe("applyCowedaBufferToTargetRange", () => {
  it("raises target range with uncertainty margins", () => {
    const buffer = calculateCowedaValidationBuffer({
      airTempC: -12,
      relativeHumidity: 55,
      metabolicRate: METABOLIC_RATES.alpine_skiing,
    });
    const adjusted = applyCowedaBufferToTargetRange({ min: 1.2, max: 1.8 }, buffer);

    expect(adjusted.min).toBeGreaterThan(1.2);
    expect(adjusted.max).toBeGreaterThan(1.8);
    expect(adjusted.max).toBeGreaterThan(adjusted.min);
  });
});

describe("applyCowedaBufferToExtremityTargets", () => {
  it("adds extremity margin to hands and head targets", () => {
    const buffer = calculateCowedaValidationBuffer({
      airTempC: -15,
      relativeHumidity: 45,
      metabolicRate: METABOLIC_RATES.alpine_skiing,
    });
    const base = {
      min: { hands: 1.0, head: 0.8 },
      neutral: { hands: 1.4, head: 1.0 },
    };

    const adjusted = applyCowedaBufferToExtremityTargets(base, buffer);

    expect(adjusted.min.hands).toBeGreaterThan(base.min.hands);
    expect(adjusted.min.head).toBeGreaterThan(base.min.head);
    expect(adjusted.neutral.hands).toBeGreaterThan(base.neutral.hands);
    expect(adjusted.neutral.head).toBeGreaterThan(base.neutral.head);
  });
});
