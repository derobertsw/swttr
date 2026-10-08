// @vitest-environment node
/** Run with: npx vitest bench --run src/lib/recommendations/sports/alpine-ensemble.bench.ts */
import { bench, describe } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { referenceAlpineEnsemble } from '@/test/referenceRegionalEnsemble';
import { categorizeGarments } from '../categorization';
import type { GarmentRow } from '../types';
import { buildAlpineEnsemble, alpineRegionalCapacity } from './alpine-ensemble';

const garments = (catalog.garments as GarmentRow[])
  .filter((g) => (g.garment_activity_ratings?.alpine_skiing_score ?? 0) >= 5);
const targets = {
  min: { torso: 2, arms: 2, legs: 1.5 },
  neutral: { torso: 2.5, arms: 2.5, legs: 2 },
};

for (const scale of [1, 5]) {
  const pool = categorizeGarments(Array.from({ length: scale }, (_, copy) =>
    garments.map((g) => ({ ...g, id: `${g.id}-${copy}` }))
  ).flat());
  const selected = buildAlpineEnsemble(pool, targets, true);
  describe(`${scale}x alpine catalog (${garments.length * scale} garments)`, () => {
    bench('previous search', () => { referenceAlpineEnsemble(pool, targets, true); }, { time: 500, iterations: 5 });
    bench('cached search', () => { buildAlpineEnsemble(pool, targets, true); }, { time: 500, iterations: 5 });
    bench('complete capacity search', () => { alpineRegionalCapacity(pool, selected, true); }, { time: 500, iterations: 5 });
  });
}
