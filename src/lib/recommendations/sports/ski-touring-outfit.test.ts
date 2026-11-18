// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { categorizeGarments } from '../categorization';
import type { GarmentRow } from '../types';
import { buildTouringClimbEnsemble, climbProtection, selectDescentPack } from './ski-touring-outfit';

type Region = 'torso' | 'legs';
function garment(id: string, category: string, region: Region, clo: number, extra: Partial<GarmentRow> = {}): GarmentRow {
  return {
    id, brand: 'Test', model_name: id, category,
    covers_torso: region === 'torso', covers_arms: region === 'torso', covers_legs: region === 'legs',
    weight_grams: 300,
    garment_thermal_properties: {
      rcl_whole_body: region === 'torso' ? clo * 0.75 : clo * 0.25,
      rcl_torso: region === 'torso' ? clo : 0, rcl_arms: region === 'torso' ? clo : 0, rcl_legs: region === 'legs' ? clo : 0,
      recl_torso: 10, recl_arms: 10, recl_legs: 10, evap_potential: 0.35,
    },
    ...extra,
  };
}
const windproof = { garment_protection: { windproof_rating: 'windproof', waterproof_rating: 'waterproof' } };
const windResistant = { garment_protection: { windproof_rating: 'wind_resistant', waterproof_rating: 'DWR_only' } };
const shellEvap = (evap: number) => ({ evap_potential: evap });

/** Bands in regressed clo; garments above are raw (torso × 0.836, arms × 0.809, legs × 0.961). */
const band = (min: number, neutral: number) => ({
  min: { torso: min, arms: min, legs: min }, neutral: { torso: neutral, arms: neutral, legs: neutral },
});
const CALM = { wind: false, wet: false };
const climb = (pool: GarmentRow[], targets = band(0.5, 0.8), needs = CALM) =>
  buildTouringClimbEnsemble(categorizeGarments(pool), targets, needs, 0.2).map((g) => g.id).sort();

const baseTop = garment('base-top', 'base_layer', 'torso', 0.3);
const fleece = garment('fleece', 'mid_layer_light', 'torso', 0.6);
const tights = garment('tights', 'base_layer', 'legs', 0.3);
const softPants = garment('soft-pants', 'soft_shell', 'legs', 0.6, windResistant);
const hardJacket = garment('hard-jacket', 'hard_shell', 'torso', 0.75, {
  ...windproof, garment_thermal_properties: { ...garment('x', 'hard_shell', 'torso', 0.75).garment_thermal_properties, ...shellEvap(0.18) },
});
const hardPants = garment('hard-pants', 'hard_shell', 'legs', 0.65, windproof);
const puffy = garment('puffy', 'insulation_synthetic', 'torso', 2.3, { weight_grams: 350 });

describe('climb protection', () => {
  it('asks for wind protection from the climb wind, by the XC thresholds', () => {
    expect(climbProtection(-15, 0.3 * 8.94, false).wind).toBe(true); // 5°F, 20 mph
    expect(climbProtection(-3.9, 0.3 * 5.36, false).wind).toBe(false); // 25°F, 12 mph
    expect(climbProtection(-26, 0.3 * 4.47, false).wind).toBe(false); // -15°F, 10 mph
  });

  it('treats rain, near-melting snow and unknown precipitation as wet, and cold snow as dry', () => {
    expect(climbProtection(2, 1, true, 'rain').wet).toBe(true);
    expect(climbProtection(0, 1, true, 'snow').wet).toBe(true);
    expect(climbProtection(2, 1, true).wet).toBe(true);
    expect(climbProtection(-10, 1, true, 'snow').wet).toBe(false);
    expect(climbProtection(2, 1, false).wet).toBe(false);
  });
});

describe('touring climb outfit', () => {
  it('packs the hard shell when the climb needs no wind or wet protection, even if it fits better', () => {
    // Base + hard shell sits in the torso band and base + fleece just under it.
    const pool = [baseTop, fleece, hardJacket, tights, softPants];
    expect(climb(pool, band(0.85, 1))).toEqual(['base-top', 'fleece', 'soft-pants', 'tights']);
    expect(climb(pool, band(0.85, 1), { wind: true, wet: false })).toEqual(['base-top', 'hard-jacket', 'soft-pants', 'tights']);
  });

  it('fits torso and legs separately instead of filling every slot', () => {
    // Legs need only the soft-shell pants over tights; the torso needs base + fleece.
    const targets = { min: { torso: 0.7, arms: 0.6, legs: 0.8 }, neutral: { torso: 0.8, arms: 0.8, legs: 0.9 } };
    const fleecePants = garment('fleece-pants', 'mid_layer_heavy', 'legs', 0.6);
    expect(climb([baseTop, fleece, tights, fleecePants, softPants], targets)).toEqual(['base-top', 'fleece', 'soft-pants', 'tights']);
  });

  it('lets a reviewed standalone garment be worn alone', () => {
    const standalonePants = garment('standalone-pants', 'soft_shell', 'legs', 0.6, { usage: 'standalone' });
    const sunHoody = garment('sun-hoody', 'base_layer', 'torso', 0.65, { usage: 'either' });
    // Unreviewed base layers alone are thermal underwear; the reviewed pieces need no base.
    expect(climb([baseTop, sunHoody, tights, standalonePants])).toEqual(['standalone-pants', 'sun-hoody']);
  });

  it('wears wind protection when the climb needs it, preferring the breathable layer', () => {
    const windShirt = garment('wind-shirt', 'soft_shell', 'torso', 0.6, windResistant);
    const outfit = climb([baseTop, fleece, windShirt, hardJacket, tights, softPants, hardPants], band(0.6, 0.9), { wind: true, wet: false });
    expect(outfit).toEqual(['base-top', 'soft-pants', 'tights', 'wind-shirt']);
  });

  it('wears waterproof coverage in rain, over a base layer rather than on bare skin', () => {
    const outfit = climb([baseTop, fleece, hardJacket, tights, softPants, hardPants], band(0.5, 0.65), { wind: false, wet: true });
    expect(outfit).toEqual(['base-top', 'hard-jacket', 'hard-pants', 'tights']);
  });

  it('never wears puffies or insulated outerwear on the climb', () => {
    const insulatedPants = garment('insulated-pants', 'outer_insulated', 'legs', 1.8);
    expect(climb([baseTop, puffy, tights, insulatedPants], band(2, 2.5))).toEqual(['base-top', 'tights']);
  });

  it('prefers covering thermal underwear when that does not overheat the region', () => {
    const underwear = garment('underwear', 'base_layer', 'legs', 0.3, { usage: 'underlayer' });
    expect(climb([baseTop, underwear, softPants], band(0.2, 0.9))).toEqual(['base-top', 'soft-pants', 'underwear']);
  });

  it('wears an owned shell rather than leave a region bare', () => {
    expect(climb([hardJacket, tights], band(0.5, 0.8))).toEqual(['hard-jacket', 'tights']);
  });
});

describe('touring descent pack', () => {
  const pool = (extra: GarmentRow[] = []) => {
    const all = [hardJacket, puffy, hardPants, softPants, ...extra];
    return { shells: all.filter((g) => g.category.endsWith('shell')), insulation: all.filter((g) => g.category.includes('insulat')),
      legs: all };
  };
  const cold = band(1.6, 2.4);

  it('packs a leg layer when the climb legs fall short of the descent minimum', () => {
    const pack = selectDescentPack([baseTop, tights], pool(), cold, false);
    expect(pack.shell?.id).toBe('hard-jacket');
    expect(pack.insulation?.id).toBe('puffy');
    expect(pack.legs).not.toBeNull();
  });

  it('adds nothing to the legs when they already meet the descent minimum', () => {
    const warmPants = garment('warm-pants', 'soft_shell', 'legs', 2.0, windResistant);
    expect(selectDescentPack([baseTop, tights, warmPants], pool(), cold, false).legs).toBeNull();
  });

  it('adds only insulation over shell pants', () => {
    const insulatedPants = garment('insulated-pants', 'outer_insulated', 'legs', 1.2, { weight_grams: 600 });
    const pack = selectDescentPack([baseTop, tights, hardPants], pool([insulatedPants]), cold, false);
    expect(pack.legs?.id).toBe('insulated-pants');
    const noInsulation = selectDescentPack([baseTop, tights, hardPants], pool(), cold, false);
    expect(noInsulation.legs).toBeNull();
  });

  it('never puts a second soft shell over soft-shell pants', () => {
    const otherSoft = garment('other-soft', 'soft_shell', 'legs', 0.6, windResistant);
    const pack = selectDescentPack([baseTop, softPants], { shells: [hardJacket, otherSoft], insulation: [], legs: [otherSoft, hardPants] }, cold, false);
    expect(pack.legs?.id).toBe('hard-pants');
  });

  it('keeps the climb hard shell instead of packing another', () => {
    expect(selectDescentPack([baseTop, hardJacket, tights], pool(), cold, false).shell).toBeNull();
  });

  it('skips a layer that would leave the region further from its band', () => {
    const mild = band(0.6, 0.7);
    const hugePuffy = garment('huge-puffy', 'insulation_down', 'torso', 4, { weight_grams: 200 });
    // Torso and arms are just under; the only puffy would overshoot by far more.
    const pack = selectDescentPack([garment('top', 'base_layer', 'torso', 0.6)], { shells: [], insulation: [hugePuffy], legs: [] }, mild, false);
    expect(pack.insulation).toBeNull();
  });

  it('trades warmth for weight more strongly with prioritize_light_pack', () => {
    const lightVest = garment('light-vest', 'insulation_synthetic', 'torso', 0, {
      weight_grams: 150,
      garment_thermal_properties: { rcl_whole_body: 0.8, rcl_torso: 1.6, rcl_arms: 0, rcl_legs: 0, recl_torso: 10, recl_arms: 0, recl_legs: 0, evap_potential: 0.4 },
    });
    lightVest.covers_arms = false;
    const heavyHoody = garment('heavy-hoody', 'insulation_synthetic', 'torso', 2.3, { weight_grams: 650 });
    const insulationPool = { shells: [hardJacket], insulation: [lightVest, heavyHoody], legs: [] };
    expect(selectDescentPack([baseTop], insulationPool, cold, false).insulation?.id).toBe('heavy-hoody');
    expect(selectDescentPack([baseTop], insulationPool, cold, true).insulation?.id).toBe('light-vest');
  });
});
