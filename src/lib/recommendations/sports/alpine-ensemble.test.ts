import { describe, expect, it } from 'vitest';
import { categorizeGarments } from '../categorization';
import type { GarmentRow } from '../types';
import { buildAlpineEnsemble } from './alpine-ensemble';

function garment(id: string, category: string, region: 'torso' | 'legs' | 'both', clo: number): GarmentRow {
  return {
    id, brand: 'Test', model_name: id, category,
    covers_torso: region !== 'legs',
    covers_arms: region !== 'legs',
    covers_legs: region !== 'torso',
    garment_thermal_properties: {
      rcl_torso: region !== 'legs' ? clo : 0,
      rcl_arms: region !== 'legs' ? clo : 0,
      rcl_legs: region !== 'torso' ? clo : 0,
      // Small whole-body contributions must not license stacking legwear.
      rcl_whole_body: region === 'legs' ? clo / 4 : clo,
      evap_potential: 0.3,
    },
  };
}

function recommend(garments: GarmentRow[], torso = 2, legs = 2, precipitation = false) {
  return buildAlpineEnsemble(categorizeGarments(garments), {
    min: { torso, arms: torso, legs },
    neutral: { torso: torso + 0.5, arms: torso + 0.5, legs: legs + 0.5 },
  }, precipitation);
}

const ids = (garments: GarmentRow[]) => garments.map((g) => g.id);

describe('buildAlpineEnsemble', () => {
  it('selects one warm mid instead of stacking several fleeces to reach the target', () => {
    const result = recommend([
      garment('base', 'base_layer', 'torso', 0.5),
      garment('light-fleece', 'mid_layer_light', 'torso', 0.6),
      garment('medium-fleece', 'mid_layer_heavy', 'torso', 1),
      garment('warm-fleece', 'mid_layer_heavy', 'torso', 1.8),
      garment('shell', 'hard_shell', 'torso', 0.2),
    ]);
    expect(ids(result)).toEqual(['base', 'warm-fleece', 'shell']);
  });

  it.each([
    { armsClo: 2, outcome: 'eliminates the arms shortfall' },
    { armsClo: 1.5, outcome: 'reduces an unavoidable arms shortfall' },
  ])('accepts a small torso excess when a warmer mid $outcome', ({ armsClo }) => {
    const lightMid = garment('light-mid', 'mid_layer_heavy', 'torso', 1.8);
    lightMid.garment_thermal_properties = { rcl_torso: 1.8, rcl_arms: 0.7 };
    const warmMid = garment('warm-mid', 'mid_layer_heavy', 'torso', 2.31);
    warmMid.garment_thermal_properties = { rcl_torso: 2.31, rcl_arms: armsClo };
    // With base + shell, the light mid gives 1.13 clo at the arms. The
    // warmer mid puts the torso only 0.016 clo above its 2.5 clo maximum.
    const result = recommend([
      garment('base', 'base_layer', 'torso', 0.5),
      lightMid,
      warmMid,
      garment('shell', 'hard_shell', 'torso', 0.2),
    ]);
    expect(ids(result)).toEqual(['base', 'warm-mid', 'shell']);
  });

  it('prefers less excess insulation once both outfits meet regional minimums', () => {
    const result = recommend([
      garment('base', 'base_layer', 'torso', 0.5),
      garment('overly-warm-mid', 'mid_layer_heavy', 'torso', 2.5),
      garment('adequate-mid', 'mid_layer_heavy', 'torso', 1.8),
      garment('shell', 'hard_shell', 'torso', 0.2),
    ]);
    expect(ids(result)).toEqual(['base', 'adequate-mid', 'shell']);
  });

  it('does not overheat the torso to chase an arms target it cannot reach', () => {
    const layer = (id: string, category: string, torso: number, arms: number) => {
      const g = garment(id, category, 'torso', torso);
      g.garment_thermal_properties = { rcl_torso: torso, rcl_arms: arms };
      return g;
    };
    // The parka narrows the arms shortfall by 0.13 clo but pushes the torso
    // 0.72 clo past its maximum; the fleece outfit keeps the torso in range.
    const result = recommend([
      layer('base', 'base_layer', 0.9, 0.75),
      layer('fleece', 'mid_layer_heavy', 1.45, 1.2),
      layer('parka', 'insulation_synthetic', 4.7, 2.94),
      layer('insulated-jacket', 'outer_insulated', 2.2, 1.8),
      layer('shell', 'hard_shell', 0.28, 0.22),
    ], 3.7);
    expect(ids(result)).toEqual(['base', 'fleece', 'insulated-jacket']);
  });

  it('uses one insulated pant as the outer layer instead of stacking pants and a shell', () => {
    const result = recommend([
      garment('leggings', 'base_layer', 'legs', 0.5),
      garment('fleece-pants', 'mid_layer_heavy', 'legs', 0.5),
      ...[1, 1.2, 1.5, 1.8].map((clo) => garment(`ski-pants-${clo}`, 'outer_insulated', 'legs', clo)),
      garment('shell-pants', 'hard_shell', 'legs', 0.2),
    ], 2, 2);
    expect(ids(result)).toEqual(['leggings', 'ski-pants-1.8']);
  });

  it('does not add leg insulation to compensate for a cold torso', () => {
    const garments = [
      garment('base-top', 'base_layer', 'torso', 0.5),
      garment('base-bottom', 'base_layer', 'legs', 0.5),
      garment('fleece-pants', 'mid_layer_heavy', 'legs', 0.7),
      garment('ski-pants', 'outer_insulated', 'legs', 1.5),
      garment('shell-top', 'hard_shell', 'torso', 0.2),
    ];
    const legIds = (torso: number) => ids(recommend(garments, torso, 1.5).filter((g) => g.covers_legs));
    expect(legIds(8)).toEqual(legIds(2));
    expect(legIds(8)).toEqual(['base-bottom', 'ski-pants']);
  });

  it('budgets the warmth of the outer layer before adding a mid', () => {
    const result = recommend([
      garment('base', 'base_layer', 'torso', 0.5),
      garment('fleece', 'mid_layer_heavy', 'torso', 1),
      garment('insulated-jacket', 'outer_insulated', 'torso', 2),
    ], 1.5);
    expect(ids(result)).toEqual(['base', 'insulated-jacket']);
  });

  it.each(['outer_insulated', 'soft_shell', 'windbreaker'])(
    'does not put a puffy under a %s, but can use a fleece', (category) => {
      const result = recommend([
        garment('base', 'base_layer', 'torso', 0.5),
        garment('puffy', 'insulation_down', 'torso', 2),
        garment('fleece', 'mid_layer_heavy', 'torso', 1),
        garment('outer', category, 'torso', 0.5),
      ], 3);
      expect(ids(result)).toEqual(['base', 'fleece', 'outer']);
    }
  );

  it('allows a single puffy under a hard shell, without another mid', () => {
    const result = recommend([
      garment('base', 'base_layer', 'torso', 0.5),
      garment('puffy', 'insulation_synthetic', 'torso', 2),
      garment('fleece', 'mid_layer_heavy', 'torso', 1),
      garment('shell', 'hard_shell', 'torso', 0.2),
    ], 2);
    expect(ids(result)).toEqual(['base', 'puffy', 'shell']);
  });

  it('counts a multi-region base and outer in both regions without duplication', () => {
    const result = recommend([
      garment('union-suit', 'base_layer', 'both', 0.5),
      garment('leggings', 'base_layer', 'legs', 0.5),
      garment('ski-suit', 'outer_insulated', 'both', 2),
      garment('pants', 'outer_insulated', 'legs', 1.5),
    ], 2, 2);
    expect(ids(result)).toEqual(['union-suit', 'ski-suit']);
  });

  it.each(['hard_shell', 'outer_insulated'])('wears %s bibs under the jacket as the leg outer layer', (category) => {
    // Bibs cover the torso but not the arms, and sit under the jacket.
    const bibs = garment('bibs', category, 'both', 1);
    bibs.covers_arms = false;
    bibs.garment_thermal_properties = { rcl_torso: 0.3, rcl_legs: 1 };
    const result = recommend([
      garment('base-top', 'base_layer', 'torso', 0.5),
      garment('leggings', 'base_layer', 'legs', 0.5),
      garment('puffy', 'insulation_synthetic', 'torso', 1.5),
      garment('jacket', 'hard_shell', 'torso', 0.2),
      bibs,
    ]);
    expect(ids(result)).toEqual(['base-top', 'leggings', 'puffy', 'jacket', 'bibs']);
  });

  it('checks every covered region before choosing a multi-region item', () => {
    const result = recommend([
      garment('base', 'base_layer', 'both', 0.3),
      garment('fleece-suit', 'mid_layer_heavy', 'both', 2),
      garment('fleece-top', 'mid_layer_heavy', 'torso', 2),
      garment('shell-suit', 'hard_shell', 'both', 0.2),
    ], 2, 0.3);
    expect(ids(result)).toContain('fleece-top');
    expect(ids(result)).not.toContain('fleece-suit');
  });

  it('retains the lightest available base and outer when all exceed a warm target', () => {
    const result = recommend([
      garment('base', 'base_layer', 'torso', 0.5),
      garment('heavy-base', 'base_layer', 'torso', 1),
      garment('fleece', 'mid_layer_heavy', 'torso', 1),
      garment('outer', 'outer_insulated', 'torso', 1),
    ], 0.2);
    expect(ids(result)).toEqual(['base', 'outer']);
  });

  it('chooses a waterproof outer in precipitation instead of a warmer unprotected jacket', () => {
    const waterproof = garment('waterproof', 'hard_shell', 'torso', 0.2);
    waterproof.garment_protection = { waterproof_rating: 'waterproof' };
    const garments = [
      garment('base', 'base_layer', 'torso', 0.5),
      garment('warm-outer', 'outer_insulated', 'torso', 2),
      waterproof,
    ];
    expect(ids(recommend(garments, 2, 2, true))).toEqual(['base', 'waterproof']);
    expect(ids(recommend(garments, 2, 2, false))).toEqual(['base', 'warm-outer']);
  });

  it('returns available layers for incomplete wardrobes and stops at the layer cap in extreme cold', () => {
    expect(recommend([])).toEqual([]);
    const base = garment('base', 'base_layer', 'torso', 0.5);
    expect(recommend([base])).toEqual([base]);
    const result = recommend([
      base,
      garment('fleece', 'mid_layer_heavy', 'torso', 1),
      garment('warm-fleece', 'mid_layer_heavy', 'torso', 1.5),
      garment('shell', 'hard_shell', 'torso', 0.2),
    ], 10);
    expect(ids(result)).toEqual(['base', 'warm-fleece', 'shell']);
  });

  it('does not mistake whole-body clo for missing regional insulation', () => {
    const unknownMid = garment('unknown-mid', 'mid_layer_heavy', 'torso', 2);
    unknownMid.garment_thermal_properties = { rcl_whole_body: 2 };
    const result = recommend([
      garment('base', 'base_layer', 'torso', 0.5),
      unknownMid,
      garment('known-mid', 'mid_layer_heavy', 'torso', 1.5),
      garment('shell', 'hard_shell', 'torso', 0.2),
    ], 2);
    expect(ids(result)).toEqual(['base', 'known-mid', 'shell']);
  });
});
