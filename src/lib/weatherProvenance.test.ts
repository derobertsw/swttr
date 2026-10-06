import { describe, expect, it } from "vitest";
import { readWeatherProvenance } from "./weatherProvenance";

describe("weather source metadata", () => {
  it("omits unrecognized sources and unsupported units", () => {
    expect(readWeatherProvenance(undefined)).toBeUndefined();
    expect(readWeatherProvenance({ provider: "unknown" })).toBeUndefined();
    expect(readWeatherProvenance({ provider: "Open-Meteo", units: { temperature: "celsius", windSpeed: "mph" } })).toBeUndefined();
  });

  it("drops malformed optional facts while keeping valid source facts", () => {
    expect(readWeatherProvenance({
      provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" },
      timeZone: "not a zone", observedTime: 123,
      coverage: { firstHour: "bad", lastHour: {}, availableHours: -3 },
    })).toEqual({ provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" } });
  });
});
