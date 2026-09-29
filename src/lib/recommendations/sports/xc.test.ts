import { describe, it, expect } from "vitest";
import { categorizeGarments } from "../categorization";
import { buildXCEnsemble, needsWindLayer } from "./xc";
import type { GarmentRow } from "../types";

function garment(id: string, category: string, region: "torso" | "legs", clo: number, evap = 0.35): GarmentRow {
  return {
    id,
    brand: "Test",
    model_name: id,
    category,
    covers_torso: region === "torso",
    covers_arms: region === "torso",
    covers_legs: region === "legs",
    garment_thermal_properties: {
      rcl_torso: region === "torso" ? clo : 0,
      rcl_arms: region === "torso" ? clo : 0,
      rcl_legs: region === "legs" ? clo : 0,
      evap_potential: evap,
    },
  };
}

// Regional targets from the golden XC scenarios.
const MILD = { min: { torso: 0.4, arms: 0.4, legs: 0.56 }, neutral: { torso: 0.66, arms: 0.66, legs: 0.88 } };
const COOL = { min: { torso: 0.62, arms: 0.72, legs: 0.84 }, neutral: { torso: 0.94, arms: 1.1, legs: 1.28 } };
const SNOWY = { min: { torso: 0.66, arms: 0.77, legs: 0.88 }, neutral: { torso: 1.08, arms: 1.26, legs: 1.44 } };
const EXTREME = { min: { torso: 1.2, arms: 1.4, legs: 1.62 }, neutral: { torso: 1.66, arms: 1.94, legs: 2.24 } };

function recommend(garments: GarmentRow[], targets: typeof MILD, windLayer: boolean) {
  return buildXCEnsemble(categorizeGarments(garments), targets, 0.25, windLayer).map((g) => g.id);
}

describe("buildXCEnsemble", () => {
  const leggings = garment("leggings", "base_layer", "legs", 0.3, 0.42);
  const fleecePants = garment("fleece-pants", "mid_layer_heavy", "legs", 0.75, 0.38);
  const shellPants = garment("shell-pants", "soft_shell", "legs", 0.5, 0.42);

  it("adds shell pants in cold, windy or wet weather even when fleece pants alone fit", () => {
    const garments = [leggings, fleecePants, shellPants];
    expect(recommend(garments, SNOWY, true)).toEqual(["leggings", "fleece-pants", "shell-pants"]);
    expect(recommend(garments, SNOWY, false)).toEqual(["leggings", "fleece-pants"]);
  });

  it("chooses warmer shell pants over stacking a fleece under light ones", () => {
    const softshellPants = garment("softshell-pants", "soft_shell", "legs", 0.85, 0.28);
    expect(recommend([leggings, fleecePants, shellPants, softshellPants], SNOWY, true))
      .toEqual(["leggings", "softshell-pants"]);
  });

  it("counts insulated pants as the leg shell instead of layering shell pants over them", () => {
    const insulatedPants = garment("insulated-pants", "outer_insulated", "legs", 1.15, 0.18);
    insulatedPants.garment_protection = { windproof_rating: "windproof", waterproof_rating: "waterproof" };
    const result = recommend([
      garment("merino-leggings", "base_layer", "legs", 0.7, 0.28),
      insulatedPants,
      garment("wind-pants", "soft_shell", "legs", 0.55, 0.32),
    ], EXTREME, true);
    expect(result).toEqual(["merino-leggings", "insulated-pants"]);
  });

  it("leaves the wind jacket off in mild, calm, dry weather when the base layer is warm enough", () => {
    const garments = [garment("top", "base_layer", "torso", 0.55), garment("wind-jacket", "hard_shell", "torso", 0.15, 0.5)];
    expect(recommend(garments, MILD, false)).toEqual(["top"]);
    expect(recommend(garments, MILD, true)).toEqual(["top", "wind-jacket"]);
  });

  it("prefers the more breathable shell when both keep the legs in range", () => {
    const result = recommend([
      garment("merino-leggings", "base_layer", "legs", 0.7, 0.28),
      garment("ski-bibs", "hard_shell", "legs", 0.22, 0.2),
      garment("wind-pants", "soft_shell", "legs", 0.55, 0.32),
    ], COOL, true);
    expect(result).toEqual(["merino-leggings", "wind-pants"]);
  });

  it("prefers a breathable mid over one below the breathability bar", () => {
    const result = recommend([
      garment("top", "base_layer", "torso", 0.35, 0.45),
      garment("sweater", "mid_layer_heavy", "torso", 0.7, 0.2),
      garment("fleece", "mid_layer_light", "torso", 0.7, 0.35),
      garment("wind-jacket", "hard_shell", "torso", 0.15, 0.5),
    ], SNOWY, true);
    expect(result).toEqual(["top", "fleece", "wind-jacket"]);
  });
});

describe("needsWindLayer", () => {
  it.each([
    { weather: "mild, calm and dry", tempC: 7, windMs: 2, precipitation: false, expected: false },
    { weather: "freezing", tempC: 0, windMs: 2, precipitation: false, expected: true },
    { weather: "windy", tempC: 7, windMs: 9, precipitation: false, expected: true },
    { weather: "wet", tempC: 7, windMs: 2, precipitation: true, expected: true },
  ])("is $expected when $weather", ({ tempC, windMs, precipitation, expected }) => {
    expect(needsWindLayer({ tempC, windMs, precipitation })).toBe(expected);
  });
});
