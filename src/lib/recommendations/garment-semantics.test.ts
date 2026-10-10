import { describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import type { GarmentRow } from './types';
import { garmentCapabilities, hasUsableThermalData } from './garment-semantics';
import { formatGarmentResponse, ensembleToThermalGarments } from './formatting';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { categorizeGarments } from './categorization';

const garments = catalog.garments as GarmentRow[];
const shorts = garments.find(g => g.garment_type === 'shorts')!;
const shirt = garments.find(g => g.garment_type === 'top_short_sleeve')!;
const tights = garments.find(g => g.model_name === 'Generic Standalone Running/Nordic Tights')!;

describe('explicit garment semantics', () => {
  it('distinguishes standalone tights from thermal underwear without a name heuristic', () => {
    const underlayer = garments.find(g => g.model_name === 'Capilene Midweight Bottoms')!;
    expect(tights.category).toBe(underlayer.category);
    expect(garmentCapabilities({ ...tights, model_name: 'Renamed garment' }).standalone).toBe(true);
    expect(garmentCapabilities({ ...underlayer, model_name: 'Running tights' }).standalone).toBe(false);
    expect(garmentCapabilities({ ...tights, usage: undefined }).standalone).toBe(false);
  });
  it('uses regional averages for short sleeves/shorts exactly once', () => {
    const result = predictEnsembleThermal(ensembleToThermalGarments([shirt, shorts]));
    expect(shorts.coverage_legs).toBe(0.3);
    expect(shirt.coverage_arms).toBe(0.2);
    expect(result.rcl.leg).toBeCloseTo(0.06 * 0.961, 8);
    expect(result.rcl.arm).toBeCloseTo(0.02 * 0.809, 8);
    expect(result.rcl.wholeBody).toBeCloseTo(0.1 * 0.836 * 0.5 + 0.02 * 0.809 * 0.25 + 0.06 * 0.961 * 0.25, 8);
    expect(result.rcl.leg).toBeLessThan(predictEnsembleThermal(ensembleToThermalGarments([tights])).rcl.leg);
  });
  it('does not use shell category as proof of protection or missing values as zero', () => {
    const unknown = { ...shirt, category: 'hard_shell', garment_thermal_properties: undefined, garment_protection: undefined };
    expect(hasUsableThermalData(unknown)).toBe(false);
    expect(garmentCapabilities(unknown)).toMatchObject({ wind: false, wet: false, thermalDataKnown: false });
    expect(formatGarmentResponse(unknown)).toMatchObject({ thermal_data_status: 'unknown' });
    expect(formatGarmentResponse(unknown).rcl).toBeUndefined();
    expect(hasUsableThermalData({ ...shorts, garment_thermal_properties: { ...shorts.garment_thermal_properties, rcl_legs: Number.NaN } })).toBe(false);
  });
  it('makes the three generic basics available to selectors with explicit estimate provenance', () => {
    const basics = garments.filter(g => g.brand === 'SWTTR');
    expect(basics).toHaveLength(3);
    expect(categorizeGarments(basics).baseLayers).toHaveLength(3);
    expect(basics.every(hasUsableThermalData)).toBe(true);
    for (const garment of basics) {
      expect(formatGarmentResponse(garment).thermal_provenance).toMatchObject({ generic_estimate: true, data_source: 'docs/running-xc-foundations.md#catalog-estimates' });
      expect(garment.garment_thermal_properties?.uncertainty_clo).toBeGreaterThan(0);
    }
    expect(new Set(garments.map(g => `${g.brand}/${g.model_name}`)).size).toBe(garments.length);
  });
});
