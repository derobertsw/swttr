import { describe, it, expect } from "vitest";
import { buildRunningEnsemble } from "./route";
import type { CategorizedGarments, GarmentRow } from "@/lib/recommendations/shared";

function createGarment(overrides: Partial<GarmentRow>): GarmentRow {
  return {
    id: overrides.id ?? "garment-id",
    brand: overrides.brand ?? "Brand",
    model_name: overrides.model_name ?? "Model",
    category: overrides.category ?? "base_layer",
    covers_torso: overrides.covers_torso ?? false,
    covers_arms: overrides.covers_arms ?? false,
    covers_legs: overrides.covers_legs ?? false,
    garment_thermal_properties: overrides.garment_thermal_properties ?? {
      rcl_whole_body: 0.2,
      evap_potential: 0.3,
    },
    garment_protection: overrides.garment_protection,
    garment_activity_ratings: overrides.garment_activity_ratings,
    weight_grams: overrides.weight_grams,
  };
}

describe("buildRunningEnsemble", () => {
  it("does not recommend leg-only mid-layers for torso zone", () => {
    const torsoBase = createGarment({
      id: "torso-base",
      category: "base_layer",
      covers_torso: true,
      garment_thermal_properties: { rcl_whole_body: 0.15, evap_potential: 0.35 },
    });
    const legsBase = createGarment({
      id: "legs-base",
      category: "base_layer",
      covers_legs: true,
      garment_thermal_properties: { rcl_whole_body: 0.15, evap_potential: 0.35 },
    });
    const legsPants = createGarment({
      id: "legs-pants-mid",
      category: "mid_layer_light",
      covers_legs: true,
      covers_torso: false,
      garment_thermal_properties: { rcl_whole_body: 0.3, evap_potential: 0.4 },
    });
    const torsoMid = createGarment({
      id: "torso-mid",
      category: "mid_layer_light",
      covers_torso: true,
      covers_legs: false,
      garment_thermal_properties: { rcl_whole_body: 0.25, evap_potential: 0.3 },
    });

    const categorized: CategorizedGarments = {
      baseLayers: [torsoBase, legsBase],
      midLayers: [legsPants, torsoMid],
      insulation: [],
      shells: [],
    };

    const ensemble = buildRunningEnsemble(
      categorized,
      { ireqMin: 0.5, ireqNeutral: 0.8 },
      1.5,
      0.3
    );

    const ids = ensemble.map((g) => g.id);
    expect(ids).toContain("torso-mid");
    expect(ids).toContain("legs-pants-mid");
  });

  it("does not recommend leg-only shells for torso zone", () => {
    const torsoBase = createGarment({
      id: "torso-base",
      category: "base_layer",
      covers_torso: true,
      garment_thermal_properties: { rcl_whole_body: 0.2, evap_potential: 0.35 },
    });
    const legsBase = createGarment({
      id: "legs-base",
      category: "base_layer",
      covers_legs: true,
      garment_thermal_properties: { rcl_whole_body: 0.2, evap_potential: 0.35 },
    });
    const torsoShell = createGarment({
      id: "torso-shell",
      category: "soft_shell",
      covers_torso: true,
      covers_legs: false,
      garment_thermal_properties: { rcl_whole_body: 0.2, evap_potential: 0.3 },
    });
    const legsShell = createGarment({
      id: "legs-shell",
      category: "soft_shell",
      covers_legs: true,
      covers_torso: false,
      garment_thermal_properties: { rcl_whole_body: 0.15, evap_potential: 0.35 },
    });

    const categorized: CategorizedGarments = {
      baseLayers: [torsoBase, legsBase],
      midLayers: [],
      insulation: [],
      shells: [legsShell, torsoShell],
    };

    const ensemble = buildRunningEnsemble(
      categorized,
      { ireqMin: 1.1, ireqNeutral: 1.5 },
      2.0,
      0.3
    );

    const ids = ensemble.map((g) => g.id);
    expect(ids).toContain("torso-shell");
    expect(ids).toContain("legs-shell");
  });
});
