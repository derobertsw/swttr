import { describe, it, expect } from "vitest";
import { buildRunningEnsemble, running } from "./running";
import type { CategorizedGarments, GarmentRow } from "../types";
import { DEFAULT_BODY_METRICS } from "@/lib/biophysics/bodyMetrics";
import { requiredBasicInsulation, walkingSpeedFromMetabolicRate } from "@/lib/biophysics/ireq";
import { createFakeSupabase } from "@/test/fakeSupabase";
import type { RecommendationRequest } from "../request";

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

  it("does not duplicate a garment that covers both torso and legs", () => {
    const dualCoverBase = createGarment({
      id: "dual-base",
      category: "base_layer",
      covers_torso: true,
      covers_legs: true,
      garment_thermal_properties: { rcl_whole_body: 0.2, evap_potential: 0.2 },
    });

    const categorized: CategorizedGarments = {
      baseLayers: [dualCoverBase],
      midLayers: [],
      insulation: [],
      shells: [],
    };

    const ensemble = buildRunningEnsemble(
      categorized,
      { ireqMin: 0.3, ireqNeutral: 0.5 },
      1.5,
      0.3
    );

    const ids = ensemble.map((g) => g.id);
    expect(ids).toEqual(["dual-base"]);
  });
});

describe("running exposure assumptions", () => {
  const request = (tempC: number, windMs: number, precipitation: boolean): RecommendationRequest => ({
    supabase: createFakeSupabase({}) as unknown as RecommendationRequest['supabase'],
    userId: null, weather: { temperature: tempC * 9 / 5 + 32, wind_speed: windMs / 0.44704, precipitation },
    tempC, windMs, humidity: 85, precipitation, exertion: 'easy',
    bodyMetrics: DEFAULT_BODY_METRICS, useWardrobeOnly: false, prioritizeLightPack: false,
  });

  it.each([[2, 5], [-5, 5], [2, 9]])("does not assume a membrane for accepted water-resistant layers at %s°C / %s m/s", (tempC, windMs) => {
    const input = request(tempC, windMs, true);
    const targets = running.computeTargets(input);
    const exposure = { relativeAirSpeedMs: windMs, walkingSpeedMs: walkingSpeedFromMetabolicRate(targets.metabolicRate) };
    const membraneMinimum = requiredBasicInsulation(targets.ireq.ireqMin, { ...exposure, airPermeability: 1 });
    const windResistantMinimum = requiredBasicInsulation(targets.ireq.ireqMin, { ...exposure, airPermeability: 50 });

    expect(targets.basicIreq.ireqMin).toBeGreaterThan(membraneMinimum);
    // Even a wind-resistant rain layer must not be built against a smaller
    // membrane-only requirement. Allow for the API's two-decimal rounding.
    expect(targets.basicIreq.ireqMin).toBeGreaterThanOrEqual(windResistantMinimum - 0.005);
  });

  it("does not infer wind resistance from wet protection alone", () => {
    const wet = running.computeTargets(request(2, 5, true));
    const open = running.computeTargets(request(2, 5, false));
    expect(wet.policy?.protection).toMatchObject({ wind: false, wet: true });
    expect(wet.basicIreq).toEqual(open.basicIreq);
  });
});
