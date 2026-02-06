import { describe, it, expect } from "vitest";
import { buildXCEnsemble } from "./route";
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

describe("buildXCEnsemble", () => {
  it("includes a leg shell when a torso shell is also selected", () => {
    const torsoBase = createGarment({
      id: "torso-base",
      category: "base_layer",
      model_name: "Torso Base",
      covers_torso: true,
      garment_thermal_properties: { rcl_whole_body: 0.2, evap_potential: 0.35 },
    });

    const legBase = createGarment({
      id: "leg-base",
      category: "base_layer",
      model_name: "Leg Base",
      covers_legs: true,
      garment_thermal_properties: { rcl_whole_body: 0.15, evap_potential: 0.33 },
    });

    const torsoShell = createGarment({
      id: "torso-shell",
      category: "soft_shell",
      brand: "Dynafit",
      model_name: "Touring Jacket",
      covers_torso: true,
      covers_arms: true,
      garment_thermal_properties: { rcl_whole_body: 0.25, evap_potential: 0.4 },
    });

    const windShieldPants = createGarment({
      id: "wind-shield-pants",
      category: "soft_shell",
      brand: "Patagonia",
      model_name: "Wind Shield Pants",
      covers_legs: true,
      garment_thermal_properties: { rcl_whole_body: 0.14, evap_potential: 0.32 },
    });

    const categorized: CategorizedGarments = {
      baseLayers: [torsoBase, legBase],
      midLayers: [],
      insulation: [],
      shells: [torsoShell, windShieldPants],
    };

    const ensemble = buildXCEnsemble(
      categorized,
      {
        min: { torso: 0.4, legs: 0.3 },
        neutral: { torso: 0.9, legs: 0.7 },
      },
      0.25
    );

    expect(ensemble.map((g) => g.id)).toContain("torso-shell");
    expect(ensemble.map((g) => g.id)).toContain("wind-shield-pants");
  });

  it("adds torso and leg shells independently when each regional budget allows", () => {
    const torsoBase = createGarment({
      id: "torso-base",
      category: "base_layer",
      covers_torso: true,
      garment_thermal_properties: { rcl_whole_body: 0.2, evap_potential: 0.35 },
    });

    const legBase = createGarment({
      id: "leg-base",
      category: "base_layer",
      covers_legs: true,
      garment_thermal_properties: { rcl_whole_body: 0.15, evap_potential: 0.33 },
    });

    const torsoShell = createGarment({
      id: "torso-shell",
      category: "soft_shell",
      covers_torso: true,
      garment_thermal_properties: { rcl_whole_body: 0.25, evap_potential: 0.4 },
    });

    const windShieldPants = createGarment({
      id: "wind-shield-pants",
      category: "soft_shell",
      covers_legs: true,
      garment_thermal_properties: { rcl_whole_body: 0.14, evap_potential: 0.32 },
    });

    const categorized: CategorizedGarments = {
      baseLayers: [torsoBase, legBase],
      midLayers: [],
      insulation: [],
      shells: [torsoShell, windShieldPants],
    };

    const ensemble = buildXCEnsemble(
      categorized,
      {
        min: { torso: 0.4, legs: 0.3 },
        neutral: { torso: 0.6, legs: 0.7 },
      },
      0.25
    );

    expect(ensemble.map((g) => g.id)).toContain("wind-shield-pants");
    expect(ensemble.map((g) => g.id)).toContain("torso-shell");
  });

  it("allows leg shell even when torso shell exceeds torso regional budget", () => {
    const torsoBase = createGarment({
      id: "torso-base",
      category: "base_layer",
      covers_torso: true,
      garment_thermal_properties: { rcl_torso: 0.45, rcl_whole_body: 0.2, evap_potential: 0.35 },
    });

    const legBase = createGarment({
      id: "leg-base",
      category: "base_layer",
      covers_legs: true,
      garment_thermal_properties: { rcl_legs: 0.2, rcl_whole_body: 0.15, evap_potential: 0.33 },
    });

    const torsoShell = createGarment({
      id: "torso-shell",
      category: "soft_shell",
      covers_torso: true,
      garment_thermal_properties: { rcl_torso: 0.2, rcl_whole_body: 0.25, evap_potential: 0.4 },
    });

    const windShieldPants = createGarment({
      id: "wind-shield-pants",
      category: "soft_shell",
      covers_legs: true,
      garment_thermal_properties: { rcl_legs: 0.16, rcl_whole_body: 0.14, evap_potential: 0.32 },
    });

    const categorized: CategorizedGarments = {
      baseLayers: [torsoBase, legBase],
      midLayers: [],
      insulation: [],
      shells: [torsoShell, windShieldPants],
    };

    const ensemble = buildXCEnsemble(
      categorized,
      {
        min: { torso: 0.4, legs: 0.3 },
        neutral: { torso: 0.6, legs: 0.8 },
      },
      0.25
    );

    expect(ensemble.map((g) => g.id)).toContain("wind-shield-pants");
    expect(ensemble.map((g) => g.id)).not.toContain("torso-shell");
  });

  it("keeps a torso mid-layer when budget allows by preferring region-specific mids", () => {
    const torsoBase = createGarment({
      id: "torso-base",
      category: "base_layer",
      covers_torso: true,
      garment_thermal_properties: { rcl_torso: 0.2, rcl_whole_body: 0.2, evap_potential: 0.35 },
    });

    const legBase = createGarment({
      id: "leg-base",
      category: "base_layer",
      covers_legs: true,
      garment_thermal_properties: { rcl_legs: 0.15, rcl_whole_body: 0.15, evap_potential: 0.33 },
    });

    const torsoMid = createGarment({
      id: "torso-mid",
      category: "mid_layer_light",
      covers_torso: true,
      garment_thermal_properties: { rcl_torso: 0.2, rcl_whole_body: 0.2, evap_potential: 0.3 },
    });

    const bibMid = createGarment({
      id: "bib-mid",
      category: "mid_layer_light",
      covers_torso: true,
      covers_legs: true,
      garment_thermal_properties: {
        rcl_torso: 0.35,
        rcl_legs: 0.2,
        rcl_whole_body: 0.3,
        evap_potential: 0.4,
      },
    });

    const torsoShell = createGarment({
      id: "torso-shell",
      category: "soft_shell",
      covers_torso: true,
      garment_thermal_properties: { rcl_torso: 0.2, rcl_whole_body: 0.2, evap_potential: 0.35 },
    });

    const categorized: CategorizedGarments = {
      baseLayers: [torsoBase, legBase],
      midLayers: [bibMid, torsoMid],
      insulation: [],
      shells: [torsoShell],
    };

    const ensemble = buildXCEnsemble(
      categorized,
      {
        min: { torso: 0.5, legs: 0.3 },
        neutral: { torso: 0.6, legs: 0.6 },
      },
      0.25
    );

    expect(ensemble.map((g) => g.id)).toContain("torso-mid");
    expect(ensemble.map((g) => g.id)).not.toContain("bib-mid");
  });

  it("reserves torso budget so base, mid, and shell can all be included when feasible", () => {
    const torsoBaseWarm = createGarment({
      id: "torso-base-warm",
      category: "base_layer",
      covers_torso: true,
      garment_thermal_properties: { rcl_torso: 0.45, rcl_whole_body: 0.35, evap_potential: 0.4 },
    });

    const torsoBaseLight = createGarment({
      id: "torso-base-light",
      category: "base_layer",
      covers_torso: true,
      garment_thermal_properties: { rcl_torso: 0.2, rcl_whole_body: 0.15, evap_potential: 0.3 },
    });

    const torsoMid = createGarment({
      id: "torso-mid",
      category: "mid_layer_light",
      covers_torso: true,
      garment_thermal_properties: { rcl_torso: 0.2, rcl_whole_body: 0.2, evap_potential: 0.3 },
    });

    const torsoShell = createGarment({
      id: "torso-shell",
      category: "soft_shell",
      covers_torso: true,
      garment_thermal_properties: { rcl_torso: 0.2, rcl_whole_body: 0.2, evap_potential: 0.35 },
    });

    const categorized: CategorizedGarments = {
      baseLayers: [torsoBaseWarm, torsoBaseLight],
      midLayers: [torsoMid],
      insulation: [],
      shells: [torsoShell],
    };

    const ensemble = buildXCEnsemble(
      categorized,
      {
        min: { torso: 0.4, legs: 0.2 },
        neutral: { torso: 0.6, legs: 0.6 },
      },
      0.25
    );

    expect(ensemble.map((g) => g.id)).toContain("torso-base-light");
    expect(ensemble.map((g) => g.id)).not.toContain("torso-base-warm");
    expect(ensemble.map((g) => g.id)).toContain("torso-mid");
    expect(ensemble.map((g) => g.id)).toContain("torso-shell");
  });
});
