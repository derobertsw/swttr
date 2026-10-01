// @vitest-environment node
import { describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { referenceAlpineEnsemble, referenceXCEnsemble } from '@/test/referenceRegionalEnsemble';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { categorizeGarments } from '../categorization';
import { metabolicRateFor, phaseIreq, phaseTargets } from '../thermal-targets';
import type { GarmentRow } from '../types';
import type { RecommendationRequest } from '../request';
import { alpine } from './alpine';
import { buildAlpineEnsemble } from './alpine-ensemble';
import { buildXCEnsemble, needsWindLayer } from './xc';

const garments = catalog.garments as GarmentRow[];
const conditions = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15].flatMap((tempC) =>
  [0, 2, 8, 14].flatMap((windMs) =>
    (['easy', 'moderate', 'hard'] as const).flatMap((exertion) =>
      [false, true].map((precipitation) => ({ tempC, windMs, exertion, precipitation }))
    )
  )
);
const ids = (outfit: GarmentRow[]) => outfit.map((g) => g.id);

describe.each(['catalog', 'wardrobe', 'sparse wardrobe'] as const)('regional search parity: %s', (mode) => {
  it.each(['alpine', 'xc'] as const)('preserves %s choices and order across 240 conditions', (sport) => {
    const pool = mode === 'catalog'
      ? garments.filter((g) => sport === 'alpine'
        ? (g.garment_activity_ratings?.alpine_skiing_score ?? 0) >= 5
        : (g.garment_activity_ratings?.xc_skiing_score ?? 0) >= 6)
      : garments.filter((_, index) => index % (mode === 'wardrobe' ? 2 : 11) === 0);
    const categorized = categorizeGarments(pool);
    const supabase = createFakeSupabase({}) as unknown as RecommendationRequest['supabase'];

    for (const condition of conditions) {
      const request: RecommendationRequest = {
        ...condition, supabase, userId: null, humidity: 50, bodyMetrics: DEFAULT_BODY_METRICS,
        weather: { temperature: condition.tempC * 9 / 5 + 32, wind_speed: condition.windMs / 0.44704 },
        useWardrobeOnly: mode !== 'catalog', prioritizeLightPack: false,
      };
      if (sport === 'alpine') {
        const targets = alpine.computeTargets(request).regional;
        expect(ids(buildAlpineEnsemble(categorized, targets, condition.precipitation)), JSON.stringify(condition))
          .toEqual(ids(referenceAlpineEnsemble(categorized, targets, condition.precipitation)));
      } else {
        const rate = metabolicRateFor('xc_skiing', condition.exertion, DEFAULT_BODY_METRICS);
        const ireq = phaseIreq(request, condition.windMs, rate);
        const targets = phaseTargets('xc_skiing', ireq, rate, request, condition.windMs).regional;
        const windLayer = needsWindLayer(request);
        expect(ids(buildXCEnsemble(categorized, targets, 0.25, windLayer)), JSON.stringify(condition))
          .toEqual(ids(referenceXCEnsemble(categorized, targets, 0.25, windLayer)));
      }
    }
  }, 60_000);
});

describe('regional search edge cases', () => {
  const targets = {
    min: { torso: 1, arms: 1, legs: 1 },
    neutral: { torso: 1.5, arms: 1.5, legs: 1.5 },
  };
  const base: GarmentRow = {
    id: 'base', brand: 'Test', model_name: 'Base', category: 'base_layer',
    covers_torso: true, covers_arms: true, covers_legs: true,
    garment_thermal_properties: { rcl_torso: 0.5, rcl_arms: 0.5, rcl_legs: 0.5, evap_potential: 0.3 },
  };

  it('retains the first equally ranked item and does not mutate the pool', () => {
    const first = { ...base, id: 'first' };
    const second = { ...base, id: 'second' };
    const categorized = categorizeGarments([first, second]);
    expect(buildAlpineEnsemble(categorized, targets, false)).toEqual([first]);
    expect(buildXCEnsemble(categorized, targets, 0.25, false)).toEqual([first]);
    expect(categorized.baseLayers).toEqual([first, second]);
  });

  it('preserves identity checks when different slots contain the same garment ID', () => {
    const duplicate = { ...base, category: 'hard_shell' };
    const shell = { ...duplicate, id: 'shell' };
    const categorized = categorizeGarments([base, duplicate, shell]);
    expect(ids(buildAlpineEnsemble(categorized, targets, true))).toEqual(['base', 'shell']);
    expect(buildAlpineEnsemble(categorized, targets, true)).toEqual(referenceAlpineEnsemble(categorized, targets, true));
    expect(buildXCEnsemble(categorized, targets, 0.25, true)).toEqual(referenceXCEnsemble(categorized, targets, 0.25, true));
  });
});
