import { describe, it, expect } from 'vitest';
import {
  categorizeGarments,
  sortByBreathability,
  sortByInsulation,
  sortByWaterproofness,
  getEnsembleClo,
  findBreathableGarment,
  formatGarmentResponse,
  type GarmentRow,
} from './shared';

// Test fixtures
const createMockGarment = (overrides: Partial<GarmentRow>): GarmentRow => ({
  id: 'test-id',
  brand: 'TestBrand',
  model_name: 'TestModel',
  category: 'base_layer',
  covers_torso: true,
  covers_arms: true,
  covers_legs: false,
  weight_grams: 200,
  garment_thermal_properties: {
    rcl_whole_body: 0.5,
    evap_potential: 0.3,
  },
  garment_protection: {
    windproof_rating: 'none',
    waterproof_rating: 'none',
  },
  ...overrides,
});

describe('categorizeGarments', () => {
  it('should categorize base layers correctly', () => {
    const garments = [
      createMockGarment({ id: '1', category: 'base_layer' }),
      createMockGarment({ id: '2', category: 'base_layer' }),
    ];

    const result = categorizeGarments(garments);

    expect(result.baseLayers).toHaveLength(2);
    expect(result.midLayers).toHaveLength(0);
    expect(result.insulation).toHaveLength(0);
    expect(result.shells).toHaveLength(0);
  });

  it('should categorize mid layers correctly', () => {
    const garments = [
      createMockGarment({ id: '1', category: 'mid_layer_light' }),
      createMockGarment({ id: '2', category: 'mid_layer_heavy' }),
    ];

    const result = categorizeGarments(garments);

    expect(result.midLayers).toHaveLength(2);
    expect(result.baseLayers).toHaveLength(0);
  });

  it('should categorize insulation correctly', () => {
    const garments = [
      createMockGarment({ id: '1', category: 'insulation_synthetic' }),
      createMockGarment({ id: '2', category: 'insulation_down' }),
      createMockGarment({ id: '3', category: 'outer_insulated' }),
    ];

    const result = categorizeGarments(garments);

    expect(result.insulation).toHaveLength(3);
  });

  it('should categorize shells correctly', () => {
    const garments = [
      createMockGarment({ id: '1', category: 'soft_shell' }),
      createMockGarment({ id: '2', category: 'hard_shell' }),
      createMockGarment({ id: '3', category: 'windbreaker' }),
    ];

    const result = categorizeGarments(garments);

    expect(result.shells).toHaveLength(3);
  });

  it('should handle mixed garment types', () => {
    const garments = [
      createMockGarment({ id: '1', category: 'base_layer' }),
      createMockGarment({ id: '2', category: 'mid_layer_light' }),
      createMockGarment({ id: '3', category: 'insulation_down' }),
      createMockGarment({ id: '4', category: 'hard_shell' }),
    ];

    const result = categorizeGarments(garments);

    expect(result.baseLayers).toHaveLength(1);
    expect(result.midLayers).toHaveLength(1);
    expect(result.insulation).toHaveLength(1);
    expect(result.shells).toHaveLength(1);
  });

  it('should handle empty array', () => {
    const result = categorizeGarments([]);

    expect(result.baseLayers).toHaveLength(0);
    expect(result.midLayers).toHaveLength(0);
    expect(result.insulation).toHaveLength(0);
    expect(result.shells).toHaveLength(0);
  });
});

describe('sortByBreathability', () => {
  it('should sort garments by evap_potential descending by default', () => {
    const garments = [
      createMockGarment({
        id: '1',
        garment_thermal_properties: { evap_potential: 0.2 },
      }),
      createMockGarment({
        id: '2',
        garment_thermal_properties: { evap_potential: 0.5 },
      }),
      createMockGarment({
        id: '3',
        garment_thermal_properties: { evap_potential: 0.3 },
      }),
    ];

    const result = sortByBreathability(garments);

    expect(result[0].id).toBe('2'); // Highest evap potential
    expect(result[1].id).toBe('3');
    expect(result[2].id).toBe('1'); // Lowest evap potential
  });

  it('should sort ascending when specified', () => {
    const garments = [
      createMockGarment({
        id: '1',
        garment_thermal_properties: { evap_potential: 0.5 },
      }),
      createMockGarment({
        id: '2',
        garment_thermal_properties: { evap_potential: 0.2 },
      }),
    ];

    const result = sortByBreathability(garments, false);

    expect(result[0].id).toBe('2'); // Lowest evap potential first
    expect(result[1].id).toBe('1');
  });

  it('should handle missing evap_potential', () => {
    const garments = [
      createMockGarment({ id: '1', garment_thermal_properties: {} }),
      createMockGarment({
        id: '2',
        garment_thermal_properties: { evap_potential: 0.5 },
      }),
    ];

    const result = sortByBreathability(garments);

    expect(result[0].id).toBe('2'); // Has evap potential
    expect(result[1].id).toBe('1'); // Missing (treated as 0)
  });

  it('should not mutate the original array', () => {
    const garments = [
      createMockGarment({
        id: '1',
        garment_thermal_properties: { evap_potential: 0.2 },
      }),
      createMockGarment({
        id: '2',
        garment_thermal_properties: { evap_potential: 0.5 },
      }),
    ];

    const originalFirst = garments[0].id;
    sortByBreathability(garments);

    expect(garments[0].id).toBe(originalFirst);
  });
});

describe('sortByInsulation', () => {
  it('should sort garments by rcl_whole_body descending by default', () => {
    const garments = [
      createMockGarment({
        id: '1',
        garment_thermal_properties: { rcl_whole_body: 0.3 },
      }),
      createMockGarment({
        id: '2',
        garment_thermal_properties: { rcl_whole_body: 1.0 },
      }),
      createMockGarment({
        id: '3',
        garment_thermal_properties: { rcl_whole_body: 0.5 },
      }),
    ];

    const result = sortByInsulation(garments);

    expect(result[0].id).toBe('2'); // Highest clo
    expect(result[1].id).toBe('3');
    expect(result[2].id).toBe('1'); // Lowest clo
  });

  it('should sort ascending when specified', () => {
    const garments = [
      createMockGarment({
        id: '1',
        garment_thermal_properties: { rcl_whole_body: 1.0 },
      }),
      createMockGarment({
        id: '2',
        garment_thermal_properties: { rcl_whole_body: 0.3 },
      }),
    ];

    const result = sortByInsulation(garments, false);

    expect(result[0].id).toBe('2'); // Lowest clo first
    expect(result[1].id).toBe('1');
  });
});

describe('sortByWaterproofness', () => {
  it('should sort garments by waterproof_mm descending', () => {
    const garments = [
      createMockGarment({
        id: '1',
        garment_protection: { waterproof_mm: 5000 },
      }),
      createMockGarment({
        id: '2',
        garment_protection: { waterproof_mm: 20000 },
      }),
      createMockGarment({
        id: '3',
        garment_protection: { waterproof_mm: 10000 },
      }),
    ];

    const result = sortByWaterproofness(garments);

    expect(result[0].id).toBe('2'); // Highest waterproof
    expect(result[1].id).toBe('3');
    expect(result[2].id).toBe('1');
  });

  it('should handle missing waterproof_mm', () => {
    const garments = [
      createMockGarment({ id: '1', garment_protection: {} }),
      createMockGarment({
        id: '2',
        garment_protection: { waterproof_mm: 10000 },
      }),
    ];

    const result = sortByWaterproofness(garments);

    expect(result[0].id).toBe('2');
    expect(result[1].id).toBe('1');
  });
});

describe('getEnsembleClo', () => {
  it('should sum clo values of all garments', () => {
    const ensemble = [
      createMockGarment({
        garment_thermal_properties: { rcl_whole_body: 0.3 },
      }),
      createMockGarment({
        garment_thermal_properties: { rcl_whole_body: 0.5 },
      }),
      createMockGarment({
        garment_thermal_properties: { rcl_whole_body: 0.2 },
      }),
    ];

    const result = getEnsembleClo(ensemble);

    expect(result).toBe(1.0);
  });

  it('should return 0 for empty ensemble', () => {
    const result = getEnsembleClo([]);

    expect(result).toBe(0);
  });

  it('should handle missing thermal properties', () => {
    const ensemble = [
      createMockGarment({ garment_thermal_properties: undefined }),
      createMockGarment({
        garment_thermal_properties: { rcl_whole_body: 0.5 },
      }),
    ];

    const result = getEnsembleClo(ensemble);

    expect(result).toBe(0.5);
  });
});

describe('findBreathableGarment', () => {
  it('should find garment meeting minimum evap potential', () => {
    const garments = [
      createMockGarment({
        id: '1',
        garment_thermal_properties: { evap_potential: 0.2 },
      }),
      createMockGarment({
        id: '2',
        garment_thermal_properties: { evap_potential: 0.35 },
      }),
      createMockGarment({
        id: '3',
        garment_thermal_properties: { evap_potential: 0.4 },
      }),
    ];

    const result = findBreathableGarment(garments, 0.3);

    // Should return first that meets threshold (after sorting by breathability)
    expect(result).toBeDefined();
    expect(result?.garment_thermal_properties?.evap_potential).toBeGreaterThanOrEqual(0.3);
  });

  it('should return undefined if no garment meets threshold', () => {
    const garments = [
      createMockGarment({
        id: '1',
        garment_thermal_properties: { evap_potential: 0.1 },
      }),
      createMockGarment({
        id: '2',
        garment_thermal_properties: { evap_potential: 0.15 },
      }),
    ];

    const result = findBreathableGarment(garments, 0.3);

    expect(result).toBeUndefined();
  });

  it('should return undefined for empty array', () => {
    const result = findBreathableGarment([], 0.3);

    expect(result).toBeUndefined();
  });
});

describe('formatGarmentResponse', () => {
  it('should format garment with all properties', () => {
    const garment = createMockGarment({
      id: 'abc-123',
      brand: 'Patagonia',
      model_name: 'Capilene',
      category: 'base_layer',
      garment_thermal_properties: {
        rcl_whole_body: 0.45,
        evap_potential: 0.38,
      },
    });

    const result = formatGarmentResponse(garment);

    expect(result).toEqual({
      id: 'abc-123',
      name: 'Patagonia Capilene',
      category: 'base_layer',
      rcl: 0.45,
      rcl_torso: undefined,
      rcl_arms: undefined,
      rcl_legs: undefined,
      recl: undefined,
      evap_potential: 0.38,
      covers_torso: true,
      covers_arms: true,
      covers_legs: false,
    });
  });

  it('should include arm clo values when present', () => {
    const garment = createMockGarment({
      id: 'mid-123',
      brand: 'Patagonia',
      model_name: 'Capilene Midweight',
      covers_arms: true,
      garment_thermal_properties: {
        rcl_whole_body: 0.45,
        rcl_torso: 0.69,
        rcl_arms: 0.55,
        rcl_legs: 0,
        evap_potential: 0.32,
      },
    });

    const result = formatGarmentResponse(garment);

    expect(result.rcl_arms).toBe(0.55);
    expect(result.covers_arms).toBe(true);
  });

  it('should handle missing thermal properties', () => {
    const garment = createMockGarment({
      brand: 'Arc\'teryx',
      model_name: 'Beta AR',
      garment_thermal_properties: undefined,
    });

    const result = formatGarmentResponse(garment);

    expect(result.rcl).toBeUndefined();
    expect(result.rcl_arms).toBeUndefined();
    expect(result.evap_potential).toBeUndefined();
  });

  it('should concatenate brand and model name', () => {
    const garment = createMockGarment({
      brand: 'The North Face',
      model_name: 'ThermoBall Eco',
    });

    const result = formatGarmentResponse(garment);

    expect(result.name).toBe('The North Face ThermoBall Eco');
  });
});
