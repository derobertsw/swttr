import { describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { categorizeGarments } from '../categorization';
import { garmentCapabilities } from '../garment-semantics';
import type { GarmentRow } from '../types';
import { retainRunningProtection } from './running-protection';

const garments = catalog.garments as GarmentRow[];
const shirt = garments.find(g => g.garment_type === 'top_short_sleeve')!;
const shorts = garments.find(g => g.garment_type === 'shorts')!;
const pool = categorizeGarments(garments);

describe('running protection independent of a smaller insulation budget', () => {
  it.each([{ wind: true, wet: false, poleGrip: false }, { wind: true, wet: true, poleGrip: false }])('retains actual protection for both regions: %j', needs => {
    const result = retainRunningProtection([shirt, shorts], pool, needs);
    expect(result.warnings).toEqual([]);
    for (const region of ['torso', 'legs'] as const) {
      expect(result.ensemble.some(g => g[`covers_${region}`] && garmentCapabilities(g).wind && (!needs.wet || garmentCapabilities(g).wet))).toBe(true);
    }
    expect(new Set(result.ensemble.map(g => g.id)).size).toBe(result.ensemble.length);
    expect(retainRunningProtection(result.ensemble, pool, needs).ensemble).toEqual(result.ensemble);
  });
  it('does not add protection to mild dry outfits or claim missing protection exists', () => {
    expect(retainRunningProtection([shirt, shorts], pool, { wind: false, wet: false, poleGrip: false }).ensemble).toEqual([shirt, shorts]);
    const fakeShell = { ...shirt, category: 'hard_shell', garment_protection: undefined };
    const sparse = categorizeGarments([shirt, shorts, fakeShell]);
    const result = retainRunningProtection([shirt, shorts], sparse, { wind: true, wet: true, poleGrip: false });
    expect(result.ensemble).toEqual([shirt, shorts]);
    expect(result.warnings).toHaveLength(2);
  });
});
