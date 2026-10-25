// @vitest-environment node
import { bench, describe } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import { categorizeGarments } from '../categorization';
import { metabolicRateFor, phaseIreq, phaseTargets } from '../thermal-targets';
import type { GarmentRow } from '../types';
import { buildRunningEnsemble } from './running-outfit';

// Run with: npx vitest bench --run src/lib/recommendations/sports/running.bench.ts
// Compare these cases when changing the search; the unit suite also bounds
// prediction/conversion counts so an exhaustive cross product fails in CI.
const garments = catalog.garments as GarmentRow[];
const expanded = [0, 1, 2, 3].flatMap(copy => garments.map(g => ({
  ...g, id: `${g.id}-variant-${copy}`,
  garment_thermal_properties: Object.fromEntries(Object.entries(g.garment_thermal_properties ?? {}).map(([key, value]) =>
    [key, typeof value === 'number' && /^(rcl|recl)_/.test(key) ? value * (1 + copy * 0.03) : value])),
})));

for (const [label, pool] of [['catalog', garments], ['4x catalog with distinct thermal values', expanded]] as const) {
  describe(label, () => {
    const categorized = categorizeGarments(pool);
    for (const [name, tempC, windMs, precipitation] of [
      ['mild', 13.33, 3.58, false], ['cold wind', -12, 10, false], ['near-freezing rain', 1, 4, true],
    ] as const) {
      const conditions = { tempC, humidity: precipitation ? 95 : 50, precipitation };
      const rate = metabolicRateFor('running', 'moderate', DEFAULT_BODY_METRICS);
      const ireq = phaseIreq(conditions, windMs, rate);
      const targets = phaseTargets('running', ireq, rate, conditions, windMs, ireq, 'moderate');
      bench(`${name}: ${pool.length} garments`, () => { buildRunningEnsemble(categorized, targets); }, {
        time: 200, warmupTime: 50, iterations: 10,
      });
    }
  });
}
