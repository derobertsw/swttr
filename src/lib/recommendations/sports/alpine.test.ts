import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { categorizeGarments } from '../categorization';
import type { RecommendationRequest } from '../request';
import type { PhaseTargets } from '../thermal-targets';
import type { GarmentRow } from '../types';
import { alpine } from './alpine';

function garment(id: string, category: string, clo: number): GarmentRow {
  return {
    id, brand: 'Test', model_name: id, category,
    covers_torso: true, covers_arms: true, covers_legs: true,
    garment_thermal_properties: { rcl_torso: clo, rcl_arms: clo, rcl_legs: clo, evap_potential: 0.3 },
  };
}

function recommend(garments: GarmentRow[], regional: PhaseTargets['regional'], precipitation = false) {
  const request: RecommendationRequest = {
    supabase: createFakeSupabase({}) as unknown as RecommendationRequest['supabase'],
    userId: 'wardrobe-user', weather: { temperature: -13, wind_speed: 10, precipitation },
    tempC: -25, windMs: 4.47, humidity: 50, precipitation, exertion: 'moderate',
    bodyMetrics: DEFAULT_BODY_METRICS, useWardrobeOnly: true, prioritizeLightPack: false,
  };
  const targets = { ...alpine.computeTargets(request), regional };
  return alpine.recommend(request, targets, {
    usingWardrobe: true, categorized: categorizeGarments(garments), handwear: [], headwear: [],
  });
}

const COLD = { min: { torso: 5, arms: 5, legs: 5 }, neutral: { torso: 6, arms: 6, legs: 6 } };
const MILD = { min: { torso: 1, arms: 1, legs: 1 }, neutral: { torso: 1.2, arms: 1.2, legs: 1.2 } };
const regionalWarnings = (response: ReturnType<typeof recommend>) =>
  response.warnings.filter((warning) => /^Insufficient (torso|arms|legs) insulation:/.test(warning));

describe('alpine regional warnings', () => {
  it('finds warmer separate tops and bottoms even when the chosen full-body base blocks them', () => {
    const fullBodyBase = garment('full-body-base', 'base_layer', 0.5);
    const top = { ...garment('base-top', 'base_layer', 0.5), covers_legs: false };
    const bottoms = {
      ...garment('warm-bottoms', 'base_layer', 1.5), covers_torso: false, covers_arms: false,
    };
    const result = recommend([fullBodyBase, top, bottoms, garment('shell', 'hard_shell', 0.2)], MILD);

    expect(result.recommendation.garments.map((g) => g.id)).toEqual(['full-body-base', 'shell']);
    expect(regionalWarnings(result)).toContainEqual(expect.stringMatching(/^Insufficient legs insulation:/));
  });

  it('does not repeat unreachable regional targets when the wardrobe is already at its wearable maximum', () => {
    const result = recommend([
      garment('base', 'base_layer', 0.5),
      garment('fleece', 'mid_layer_heavy', 1),
      garment('shell', 'hard_shell', 0.2),
    ], COLD);

    expect(result.recommendation.garments.map((g) => g.id)).toEqual(['base', 'fleece', 'shell']);
    expect(regionalWarnings(result)).toEqual([]);
    expect(result.warnings).toContainEqual(expect.stringMatching(/^Insufficient overall insulation:/));
    expect(result.recommendation.thermal_comfort_score).toBeLessThan(85);
  });

  it('still warns about substantial shortfalls when a warmer wearable outfit is available', () => {
    const result = recommend([
      garment('base', 'base_layer', 0.5),
      garment('very-warm-fleece', 'mid_layer_heavy', 2),
      garment('shell', 'hard_shell', 0.2),
    ], MILD);

    // The builder balances deficits and overheating, so it leaves off this fleece.
    expect(result.recommendation.garments.map((g) => g.id)).toEqual(['base', 'shell']);
    for (const region of ['torso', 'arms', 'legs']) {
      expect(regionalWarnings(result)).toContainEqual(expect.stringMatching(`^Insufficient ${region} insulation:`));
    }
  });

  it('ignores shortfalls within the warning tolerance even when warmer gear is available', () => {
    const result = recommend([
      garment('base', 'base_layer', 1),
      garment('very-warm-fleece', 'mid_layer_heavy', 2),
      garment('shell', 'hard_shell', 0.2),
    ], MILD);
    expect(regionalWarnings(result)).toEqual([]);
  });

  it('does not count stacking two mids or a puffy under insulated outerwear as available warmth', () => {
    const result = recommend([
      garment('base', 'base_layer', 0.5),
      garment('fleece', 'mid_layer_heavy', 1),
      garment('second-fleece', 'mid_layer_heavy', 0.8),
      garment('puffy', 'insulation_down', 3),
      garment('insulated-outer', 'outer_insulated', 0.5),
    ], COLD);

    expect(result.recommendation.garments.map((g) => g.id)).toEqual(['base', 'fleece', 'insulated-outer']);
    expect(regionalWarnings(result)).toEqual([]);
  });

  it('does not count a warmer outfit that gives up available rain protection', () => {
    const waterproof = garment('waterproof-shell', 'hard_shell', 0.2);
    waterproof.garment_protection = { waterproof_rating: 'waterproof' };
    const result = recommend([
      garment('base', 'base_layer', 0.5),
      garment('warm-dry-outer', 'outer_insulated', 3),
      waterproof,
    ], COLD, true);

    expect(result.recommendation.garments.map((g) => g.id)).toEqual(['base', 'waterproof-shell']);
    expect(regionalWarnings(result)).toEqual([]);
  });

  it('does not warn when the only possible improvement is below the tolerance', () => {
    const lightMid = garment('light-mid', 'mid_layer_heavy', 0);
    lightMid.garment_thermal_properties = { rcl_torso: 1.5, rcl_arms: 0.8 };
    const heavyMid = garment('heavy-mid', 'mid_layer_heavy', 0);
    heavyMid.garment_thermal_properties = { rcl_torso: 3, rcl_arms: 0.9 };
    const result = recommend([
      garment('base', 'base_layer', 0.5), lightMid, heavyMid, garment('shell', 'hard_shell', 0.2),
    ], { min: { torso: 1.5, arms: 3, legs: 0 }, neutral: { torso: 2, arms: 3.5, legs: 1 } });

    expect(result.recommendation.garments.map((g) => g.id)).toContain('light-mid');
    expect(regionalWarnings(result)).toEqual([]);
  });
});
