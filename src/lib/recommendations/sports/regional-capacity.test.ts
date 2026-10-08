import { describe, expect, it } from 'vitest';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { categorizeGarments } from '../categorization';
import { ensembleToThermalGarments } from '../formatting';
import type { GarmentRow } from '../types';
import { alpineRegionalCapacity } from './alpine-ensemble';

const REGIONS = ['torso', 'arms', 'legs'] as const;
type Region = typeof REGIONS[number];
const OUTERS = ['hard_shell', 'soft_shell', 'windbreaker', 'outer_insulated'];
const PUFFIES = ['insulation_down', 'insulation_synthetic'];
const layer = (g: GarmentRow) => g.category === 'base_layer' ? 'base' : OUTERS.includes(g.category) ? 'outer' : 'mid';
const occupies = (g: GarmentRow, region: Region) =>
  g[`covers_${region}`] && !(region === 'torso' && g.covers_legs && !g.covers_arms);
const waterproof = (g: GarmentRow) =>
  g.garment_protection?.waterproof_rating === 'waterproof' || (g.garment_protection?.waterproof_mm ?? 0) > 0;

function garment(id: string, category: string, regions: Region[], clo: number): GarmentRow {
  return {
    id, brand: 'Test', model_name: id, category,
    covers_torso: regions.includes('torso'), covers_arms: regions.includes('arms'), covers_legs: regions.includes('legs'),
    garment_thermal_properties: { rcl_torso: clo, rcl_arms: clo / 2, rcl_legs: clo },
  };
}

// Independently enumerate every subset of a small wardrobe, then apply the
// wearing rules. This checks the state-based search against a complete oracle.
function exhaustiveCapacity(garments: GarmentRow[], selected: GarmentRow[], wet: boolean) {
  const capacity = { torso: 0, arms: 0, legs: 0 };
  for (let mask = 0; mask < 2 ** garments.length; mask++) {
    const outfit = garments.filter((_, i) => mask & (1 << i));
    if (new Set(outfit.map((g) => g.id)).size !== outfit.length) continue;
    const wearable = REGIONS.every((region) => {
      const items = outfit.filter((g) => occupies(g, region));
      if (['base', 'mid', 'outer'].some((slot) => items.filter((g) => layer(g) === slot).length > 1)) return false;
      if (items.some((g) => PUFFIES.includes(g.category)) &&
        items.some((g) => layer(g) === 'outer' && g.category !== 'hard_shell')) return false;
      for (const slot of ['base', 'outer']) {
        if (selected.some((g) => occupies(g, region) && layer(g) === slot) &&
          !items.some((g) => layer(g) === slot)) return false;
      }
      return !wet || !selected.some((g) => occupies(g, region) && layer(g) === 'outer' && waterproof(g)) ||
        items.some((g) => layer(g) === 'outer' && waterproof(g));
    });
    if (!wearable) continue;
    const clo = predictEnsembleThermal(ensembleToThermalGarments(outfit)).rcl;
    capacity.torso = Math.max(capacity.torso, clo.torso);
    capacity.arms = Math.max(capacity.arms, clo.arm);
    capacity.legs = Math.max(capacity.legs, clo.leg);
  }
  return capacity;
}

const top = garment('top', 'base_layer', ['torso', 'arms'], 0.5);
const bottoms = garment('bottoms', 'base_layer', ['legs'], 1.5);
const shell = garment('shell', 'hard_shell', ['torso', 'arms'], 0.2);
const bibs = garment('bibs', 'hard_shell', ['torso', 'legs'], 0.4);
bibs.garment_protection = { waterproof_rating: 'waterproof' };
const armsMid = garment('arms-mid', 'mid_layer_heavy', ['torso', 'arms'], 0.5);
armsMid.garment_thermal_properties = { rcl_torso: 0.5, rcl_arms: 2 };
const garments = [
  garment('union-base', 'base_layer', [...REGIONS], 0.6),
  top, bottoms,
  garment('fleece', 'mid_layer_heavy', ['torso', 'arms'], 1.5),
  armsMid,
  garment('puffy', 'insulation_down', [...REGIONS], 2),
  // Duplicate identities across slots must never be worn together.
  { ...garment('union-base', 'mid_layer_heavy', ['torso', 'arms'], 2.5) },
  shell, bibs,
  garment('insulated-suit', 'outer_insulated', [...REGIONS], 1.8),
];

describe('alpineRegionalCapacity', () => {
  it.each([false, true])('matches exhaustive outfit enumeration (wet: %s) in either input order', (wet) => {
    const selected = [top, bottoms, shell, bibs];
    const expected = exhaustiveCapacity(garments, selected, wet);
    for (const pool of [garments, [...garments].reverse()]) {
      const actual = alpineRegionalCapacity(categorizeGarments(pool), selected, wet);
      for (const region of REGIONS) expect(actual[region]).toBeCloseTo(expected[region], 10);
    }
  });

  it('retains separate regional maxima even when they come from different outfits', () => {
    const torsoMid = garment('torso-mid', 'mid_layer_heavy', ['torso', 'arms'], 0);
    torsoMid.garment_thermal_properties = { rcl_torso: 3, rcl_arms: 0.2 };
    const selected = [top, shell];
    const pool = [top, torsoMid, armsMid, shell];
    const actual = alpineRegionalCapacity(categorizeGarments(pool), selected, false);
    const torsoOutfit = predictEnsembleThermal(ensembleToThermalGarments([top, torsoMid, shell])).rcl;
    const armsOutfit = predictEnsembleThermal(ensembleToThermalGarments([top, armsMid, shell])).rcl;
    expect(actual.torso).toBeCloseTo(torsoOutfit.torso, 10);
    expect(actual.arms).toBeCloseTo(armsOutfit.arm, 10);
  });

  it('does not gain warmth by giving up an already covered region', () => {
    const torsoOnly = garment('torso-only', 'base_layer', ['torso'], 10);
    const actual = alpineRegionalCapacity(categorizeGarments([top, torsoOnly, shell]), [top, shell], false);
    const selected = predictEnsembleThermal(ensembleToThermalGarments([top, shell])).rcl;
    expect(actual.torso).toBeCloseTo(selected.torso, 10);
    expect(actual.arms).toBeCloseTo(selected.arm, 10);
  });

  it('can find additional coverage in incomplete wardrobes and returns zero for an empty pool', () => {
    const actual = alpineRegionalCapacity(categorizeGarments([top, bottoms]), [top], false);
    expect(actual.legs).toBeGreaterThan(0);
    expect(alpineRegionalCapacity(categorizeGarments([]), [], false)).toEqual({ torso: 0, arms: 0, legs: 0 });
  });
});
