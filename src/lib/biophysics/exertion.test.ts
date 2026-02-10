import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXERTION_LEVEL,
  exertionToSliderValue,
  exertionToXcIntensity,
  getMetabolicRateForActivity,
  parseExertionLevel,
  sliderValueToExertion,
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

  it("converts slider values to exertion levels", () => {
    expect(exertionToSliderValue("easy")).toBe(1);
    expect(exertionToSliderValue("moderate")).toBe(2);
    expect(exertionToSliderValue("hard")).toBe(3);
    expect(sliderValueToExertion(0)).toBe("easy");
    expect(sliderValueToExertion(2)).toBe("moderate");
    expect(sliderValueToExertion(4)).toBe("hard");
  });
});
