import { describe, expect, it } from "vitest";
import { readWeatherProvenance } from "./weatherProvenance";

describe("weather source metadata", () => {
  it("omits unrecognized sources and unsupported units", () => {
    expect(readWeatherProvenance(undefined)).toBeUndefined();
    expect(readWeatherProvenance({ provider: "unknown" })).toBeUndefined();
    expect(readWeatherProvenance({ provider: "Open-Meteo", units: { temperature: "celsius", windSpeed: "mph" } })).toBeUndefined();
  });

  it("keeps where the forecast was read, and drops a point that doesn't add up (#7)", () => {
    const base = { provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" } } as const;
    const point = { latitude: 43.6047, longitude: -72.8187, label: "Top of K-1 Express Gondola", resortId: "wd-Q14711916", elevationM: 1262, elevationSource: "requested" } as const;
    expect(readWeatherProvenance({ ...base, point })).toEqual({ ...base, point });
    expect(readWeatherProvenance({ ...base, point: { ...point, elevationSource: "guess" } })).toEqual(base);
    expect(readWeatherProvenance({ ...base, point: { ...point, latitude: 99 } })).toEqual(base);
    expect(readWeatherProvenance({ ...base, point: { ...point, label: 7, elevationM: "high" } })).toEqual({
      ...base, point: { latitude: 43.6047, longitude: -72.8187, resortId: "wd-Q14711916", elevationSource: "requested" },
    });
  });

  it("drops malformed optional facts while keeping valid source facts", () => {
    expect(readWeatherProvenance({
      provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" },
      timeZone: "not a zone", observedTime: 123,
      coverage: { firstHour: "bad", lastHour: {}, availableHours: -3 },
    })).toEqual({ provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" } });
  });
});
