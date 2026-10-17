import { describe, it, expect } from 'vitest';
import { buildClothingRequirements, filterUnsuitableEnsemble, isSuitableForRegion } from './requirements';
import type { GarmentRow } from './types';
import type { PhaseTargets } from './thermal-targets';

const MILD = {
  regional: { min: { torso: 0.08, arms: 0.08, legs: 0.05 }, neutral: { torso: 0.15, arms: 0.15, legs: 0.12 } },
  extremity: { min: { hands: 0.01, head: 0.01 }, neutral: { hands: 0.02, head: 0.02 } },
} as unknown as PhaseTargets;

const COLD = {
  regional: { min: { torso: 0.4, arms: 0.4, legs: 0.35 }, neutral: { torso: 0.6, arms: 0.6, legs: 0.55 } },
  extremity: { min: { hands: 0.15, head: 0.12 }, neutral: { hands: 0.3, head: 0.25 } },
} as unknown as PhaseTargets;

function garment(overrides: Partial<GarmentRow>): GarmentRow {
  return {
    id: 'g1', brand: 'Test', model_name: 'Item', category: 'base_layer',
    covers_torso: false, covers_arms: false, covers_legs: false,
    garment_thermal_properties: { rcl_whole_body: 0.1, rcl_torso: 0.1, rcl_arms: 0.05, rcl_legs: 0.06, recl_whole_body: 1, recl_torso: 3, recl_arms: 1, recl_legs: 1.5, evap_potential: 0.4 },
    ...overrides,
  };
}

const thermalBottoms = garment({
  id: 'thermal-bottoms', model_name: 'Thermal Bottoms', usage: 'underlayer',
  covers_legs: true, coverage_legs: 1,
  garment_thermal_properties: { rcl_whole_body: 0.2, rcl_torso: 0, rcl_arms: 0, rcl_legs: 0.25, recl_whole_body: 2, recl_torso: 0, recl_arms: 0, recl_legs: 4, evap_potential: 0.3 },
});
const shorts = garment({
  id: 'shorts', model_name: 'Running Shorts', garment_type: 'shorts', usage: 'standalone',
  covers_legs: true, coverage_legs: 0.3,
});
const tee = garment({
  id: 'tee', model_name: 'Running Tee', garment_type: 'top_short_sleeve', usage: 'standalone',
  covers_torso: true, covers_arms: true, coverage_torso: 1, coverage_arms: 0.2,
});

describe('buildClothingRequirements', () => {
  it('reports running shorts as missing instead of matching thermal bottoms in a wardrobe', () => {
    const requirements = buildClothingRequirements('running', MILD, {
      garments: [thermalBottoms, tee], handwear: [], headwear: [], usingWardrobe: true,
      selectedIds: new Set(['thermal-bottoms', 'tee']),
    });
    const legs = requirements.find((r) => r.region === 'legs')!;
    expect(legs.status).toBe('missing');
    expect(legs.message).toBe('Running shorts — no matching item in your wardrobe');
    expect(legs.matched_garment_id).toBeUndefined();
    expect(legs.generic_suggestion).toEqual({ label: 'Running shorts', estimated_clo: 0.12, generic_estimate: true, owned: false });
    expect(requirements.find((r) => r.region === 'torso')?.status).toBe('owned_match');
    expect(filterUnsuitableEnsemble([thermalBottoms, tee], MILD.regional).map((g) => g.id)).toEqual(['tee']);
  });

  it('matches owned shorts and never marks catalog suggestions as owned', () => {
    const owned = buildClothingRequirements('running', MILD, {
      garments: [shorts, tee], handwear: [], headwear: [], usingWardrobe: true, selectedIds: new Set(['shorts']),
    });
    expect(owned.find((r) => r.region === 'legs')).toMatchObject({ status: 'owned_match', matched_garment_id: 'shorts', matched_is_owned: true });

    const catalog = buildClothingRequirements('running', MILD, {
      garments: [shorts, tee], handwear: [], headwear: [], usingWardrobe: false,
    });
    expect(catalog.find((r) => r.region === 'legs')).toMatchObject({ status: 'generic_suggestion', matched_is_owned: false });
  });

  it('keeps not-needed distinct from missing and covers empty pools and unknown thermal data', () => {
    const mild = buildClothingRequirements('running', MILD, { garments: [], handwear: [], headwear: [], usingWardrobe: true });
    expect(mild.find((r) => r.region === 'hands')?.status).toBe('not_needed');
    expect(mild.find((r) => r.region === 'legs')?.status).toBe('missing');

    const unknown = garment({ id: 'unknown', covers_legs: true, usage: 'standalone', garment_thermal_properties: { rcl_whole_body: 0.1 } });
    expect(isSuitableForRegion(unknown, 'legs', MILD.regional)).toBe(false);
  });

  it('matches cold-weather gloves as owned and leaves them missing without them', () => {
    const glove = { id: 'gloves', brand: 'Test', model_name: 'Gloves', handwear_type: 'gloves', rcl_clo: 0.28 };
    const withGloves = buildClothingRequirements('running', COLD, {
      garments: [tee], handwear: [glove], headwear: [], usingWardrobe: true,
    });
    expect(withGloves.find((r) => r.region === 'hands')).toMatchObject({ status: 'owned_match', matched_garment_id: 'gloves' });
    const without = buildClothingRequirements('running', COLD, { garments: [tee], handwear: [], headwear: [], usingWardrobe: true });
    expect(without.find((r) => r.region === 'hands')?.status).toBe('missing');
  });
});
