import { describe, it, expect } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import { xcPhaseContext } from '@/lib/biophysics/xc-policy';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { categorizeGarments } from '../categorization';
import { buildClothingRequirements } from '../requirements';
import { ensembleToThermalGarments } from '../formatting';
import type { GarmentRow } from '../types';
import type { RecommendationRequest } from '../request';
import { buildXCEnsemble, xc } from './xc';
import { xcProtection, xcRegionMatches } from './xc-outfit';

function garment(id: string, category: string, region: 'torso' | 'legs', clo: number, extra: Partial<GarmentRow> = {}): GarmentRow {
  return {
    id, brand: 'Test', model_name: id, category, usage: 'standalone',
    covers_torso: region === 'torso', covers_arms: region === 'torso', covers_legs: region === 'legs',
    coverage_torso: region === 'torso' ? 1 : 0, coverage_arms: region === 'torso' ? 1 : 0, coverage_legs: region === 'legs' ? 1 : 0,
    garment_thermal_properties: {
      rcl_whole_body: clo, rcl_torso: region === 'torso' ? clo : 0,
      rcl_arms: region === 'torso' ? clo : 0, rcl_legs: region === 'legs' ? clo : 0,
      recl_torso: 10, recl_arms: 10, recl_legs: 10, evap_potential: 0.4,
    }, ...extra,
  };
}
const MILD = { min: { torso: 0.2, arms: 0.2, legs: 0.2 }, neutral: { torso: 0.4, arms: 0.4, legs: 0.4 } };
const CALM = { wind: false, wet: false };
const select = (pool: GarmentRow[], t = MILD, needs = CALM) => buildXCEnsemble(categorizeGarments(pool), t, 0.25, needs);
const ids = (outfit: GarmentRow[]) => outfit.map(g => g.id);
function request(overrides: Partial<RecommendationRequest> = {}): RecommendationRequest {
  return {
    supabase: {} as RecommendationRequest['supabase'], userId: null,
    tempC: 0, windMs: 1, humidity: 50, precipitation: false,
    weather: { temperature: 32, wind_speed: 2.24 }, exertion: 'moderate',
    bodyMetrics: DEFAULT_BODY_METRICS, useWardrobeOnly: false, prioritizeLightPack: false,
    ...overrides,
  };
}

describe('XC regional moving outfits', () => {
  it('prefers one suitable Nordic tight over thermal underwear plus shell pants', () => {
    const tights = garment('tights', 'base_layer', 'legs', 0.3);
    const underwear = garment('underwear', 'base_layer', 'legs', 0.3, { usage: 'underlayer' });
    const shell = garment('shell', 'hard_shell', 'legs', 0.45, { usage: 'either' });
    expect(select([underwear, shell, tights])).toEqual([tights]);
  });

  it.each(['base_layer', 'mid_layer_light', 'soft_shell', 'outer_insulated'])('allows standalone %s pants without filling a base or outer slot', category => {
    const pants = garment('pants', category, 'legs', 0.3, { garment_protection: { windproof_rating: 'wind_resistant' } });
    expect(select([pants], MILD, { wind: true, wet: false })).toEqual([pants]);
  });

  it('does not require an extra garment merely because it is freezing', () => {
    const t = xc.computeTargets(request());
    expect(t.policy?.protection.wind).toBe(false);
    const pants = garment('pants', 'soft_shell', 'legs', t.regional.min.legs / 0.961 + 0.02);
    const outfit = select([pants], t.regional, t.policy!.protection);
    expect(outfit).toEqual([pants]);
    expect(xcRegionMatches(outfit, t, 'legs')).toBe(true);
  });

  it('uses actual full-region wind and wet protection instead of category occupancy', () => {
    const fakeShell = garment('fake', 'hard_shell', 'legs', 0.3);
    const windPants = garment('wind', 'base_layer', 'legs', 0.3, { garment_protection: { windproof_rating: 'windproof' } });
    expect(select([fakeShell, windPants], MILD, { wind: true, wet: false })).toEqual([windPants]);
    const rainPants = { ...windPants, id: 'rain', garment_protection: { windproof_rating: 'windproof', waterproof_rating: 'waterproof' } };
    expect(select([fakeShell, windPants, rainPants], MILD, { wind: true, wet: true })).toEqual([rainPants]);
    expect(xcProtection([{ ...rainPants, coverage_legs: 0.5 }], 'legs', { wind: false, wet: true })).toBe(false);
  });

  it('retains cold wind layering without shell pants over insulated outer pants or a puffy under insulated outerwear', () => {
    const base = garment('base', 'base_layer', 'legs', 0.45, { usage: 'underlayer' });
    const pants = garment('insulated', 'outer_insulated', 'legs', 0.55, { garment_protection: { windproof_rating: 'windproof' } });
    const shell = garment('shell', 'hard_shell', 'legs', 0.3, { garment_protection: { windproof_rating: 'windproof' } });
    const puffy = garment('puffy', 'insulation_synthetic', 'legs', 0.95);
    const cold = { min: { torso: 0.8, arms: 0.8, legs: 0.8 }, neutral: { torso: 1.1, arms: 1.1, legs: 1.1 } };
    expect(ids(select([base, pants, shell, puffy], cold, { wind: true, wet: false }))).toEqual(['base', 'insulated']);
  });

  it('keeps torso and arm fit independent of leg warmth', () => {
    const vest = garment('cold-arms', 'base_layer', 'torso', 0.35);
    vest.garment_thermal_properties!.rcl_arms = 0.01;
    const top = garment('top', 'base_layer', 'torso', 0.35);
    const pants = garment('pants', 'base_layer', 'legs', 0.3);
    expect(ids(select([vest, top, pants]))).toEqual(['top', 'pants']);
  });

  it('rejects standalone underwear and unknown thermal data, and reports unsuitable heavy-only wardrobes as missing', () => {
    const unknown = garment('unknown', 'base_layer', 'legs', 0.3);
    delete unknown.garment_thermal_properties!.recl_legs;
    const underwear = garment('underwear', 'base_layer', 'legs', 0.3, { usage: 'underlayer' });
    const heavy = garment('heavy', 'outer_insulated', 'legs', 2);
    const pool = [unknown, underwear, heavy];
    expect(select(pool)).toEqual([]);
    const t = { ...xc.computeTargets(request({ tempC: 8 })), regional: MILD };
    const requirements = buildClothingRequirements('xc_skiing', t, {
      garments: pool, selectedGarments: [], handwear: [], headwear: [], ownership: { garments: true, handwear: true, headwear: true },
    });
    expect(requirements.find(r => r.region === 'legs')).toMatchObject({ status: 'missing', generic_suggestion: { owned: false } });
  });

  it('never selects the same spanning garment twice', () => {
    const suit = garment('suit', 'base_layer', 'torso', 0.3, { covers_legs: true, coverage_legs: 1 });
    suit.garment_thermal_properties!.rcl_legs = 0.3;
    expect(select([suit])).toEqual([suit]);
  });

  it('keeps spring and sustained hard-effort skiing lighter than cold easy skiing', () => {
    const pool = catalog.garments as GarmentRow[];
    const clo = (tempC: number, exertion: RecommendationRequest['exertion']) => {
      const t = xc.computeTargets(request({ tempC, exertion }));
      return predictEnsembleThermal(ensembleToThermalGarments(select(pool, t.regional, t.policy!.protection))).rcl.wholeBody;
    };
    expect(clo(7, 'moderate')).toBeLessThan(clo(-8, 'moderate'));
    expect(clo(-5, 'hard')).toBeLessThanOrEqual(clo(-5, 'easy'));
  });

  it('does not add insulation as dry weather warms or sustained effort rises', () => {
    const pool = catalog.garments as GarmentRow[];
    const clo = (tempC: number, exertion: RecommendationRequest['exertion']) => {
      const t = xc.computeTargets(request({ tempC, exertion }));
      return predictEnsembleThermal(ensembleToThermalGarments(select(pool, t.regional, t.policy!.protection))).rcl.wholeBody;
    };
    const temperatures = [-15, -10, -5, 0, 5, 8, 12];
    const values = new Map(temperatures.map(temp => [temp, {
      easy: clo(temp, 'easy'), moderate: clo(temp, 'moderate'), hard: clo(temp, 'hard'),
    }]));
    for (const effort of ['easy', 'moderate', 'hard'] as const) {
      const insulation = temperatures.map(temp => values.get(temp)![effort]);
      for (let i = 1; i < insulation.length; i++) expect(insulation[i], `${effort}: ${temperatures[i]}°C`).toBeLessThanOrEqual(insulation[i - 1] + 1e-6);
    }
    for (const temp of temperatures) {
      const value = values.get(temp)!;
      expect(value.hard, `hard at ${temp}°C`).toBeLessThanOrEqual(value.moderate + 1e-6);
      expect(value.moderate, `moderate at ${temp}°C`).toBeLessThanOrEqual(value.easy + 1e-6);
    }
  }, 30_000);
});

describe('XC exposure and stop policy', () => {
  it.each([
    { tempC: -5, windMs: 1, xcExposure: 'sheltered' as const, expected: 1, wind: false },
    { tempC: -5, windMs: 1, xcExposure: 'descents' as const, expected: 5, wind: true },
    { tempC: -5, windMs: 12, xcExposure: 'descents' as const, expected: 12, wind: true },
    { tempC: 2, windMs: 1, xcExposure: 'exposed' as const, expected: 4, wind: true },
  ])('uses exposure once for $xcExposure at $windMs m/s', ({ tempC, windMs, xcExposure, expected, wind }) => {
    const t = xc.computeTargets(request({ tempC, windMs, xcExposure }));
    expect(t.policy?.xc?.effectiveWindMs).toBe(expected);
    expect(t.policy?.protection.wind).toBe(wind);
  });

  it.each([
    { tempC: -5, precipitationType: 'snow' as const, wet: false },
    { tempC: 0, precipitationType: 'snow' as const, wet: true },
    { tempC: -5, precipitationType: 'mixed' as const, wet: true },
    { tempC: 2, precipitationType: 'rain' as const, wet: true },
    { tempC: -5, precipitationType: undefined, wet: true },
  ])('distinguishes snow/rain at $tempC°C with type $precipitationType', ({ tempC, precipitationType, wet }) => {
    const t = xc.computeTargets(request({ tempC, precipitation: true, weather: { temperature: tempC * 1.8 + 32, wind_speed: 1, precipitation_type: precipitationType } }));
    expect(t.policy?.protection.wet).toBe(wet);
  });

  it('keeps moving targets identical for frequent stops and continuous training, but adds separate carry advice', () => {
    const continuous = xc.computeTargets(request({ tempC: 8, outingPattern: 'continuous' }));
    const stops = xc.computeTargets(request({ tempC: 8, outingPattern: 'frequent_stops' }));
    expect(stops.targetRange).toEqual(continuous.targetRange);
    expect(stops.metabolicRate).toBe(continuous.metabolicRate);
    const c = xc.emptyResponse(request(), continuous) as { carry_items: unknown[] };
    const s = xc.emptyResponse(request(), stops) as { carry_items: unknown[] };
    expect(c.carry_items).toEqual([]);
    expect(s.carry_items).toHaveLength(1);
    expect(xcPhaseContext({ tempC: 8, windMs: 1, precipitation: false }).outingPattern).toBe('unknown');
  });
});
