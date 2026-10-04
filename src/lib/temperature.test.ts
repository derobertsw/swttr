import { describe, expect, it } from "vitest";
import { defaultTemperatureUnit, formatTemperature, formatTemperatureRange } from "./temperature";

describe("temperature display", () => {
  it.each([
    ["en-US", "F"], ["es-US", "F"], ["en", "F"],
    ["en-GB", "C"], ["en-CA", "C"], ["fr-FR", "C"], ["invalid_locale", "F"],
  ] as const)("defaults %s to %s", (locale, unit) => {
    expect(defaultTemperatureUnit(locale)).toBe(unit);
  });

  it.each([
    [32, "0°C"], [212, "100°C"], [-40, "-40°C"], [0, "-18°C"],
    [31.9, "0°C"], [25, "-4°C"], [50.4, "10°C"],
  ])("formats %s°F as %s", (fahrenheit, expected) => {
    expect(formatTemperature(fahrenheit as number, "C")).toBe(expected);
  });

  it("rounds only for display, including both ends of negative ranges", () => {
    expect(formatTemperature(92.66, "C", 1)).toBe("33.7°C");
    expect(formatTemperature(92.66, "F", 1)).toBe("92.7°F");
    expect(formatTemperatureRange(-40, 14, "C")).toBe("-40°C – -10°C");
    expect(formatTemperatureRange(-40, 14, "F")).toBe("-40°F – 14°F");
  });
});
