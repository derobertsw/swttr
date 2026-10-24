import { describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { evaluatePhase } from '../layer-evaluation';
import { categorizeGarments } from '../categorization';
import { ensembleToThermalGarments } from '../formatting';
import { buildClothingRequirements } from '../requirements';
import { metabolicRateFor, phaseIreq, phaseTargets } from '../thermal-targets';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import type { GarmentRow } from '../types';
import { buildRunningEnsemble, running } from './running';
import { requiredBasicInsulation, walkingSpeedFromMetabolicRate } from "@/lib/biophysics/ireq";
import { createFakeSupabase } from "@/test/fakeSupabase";
import type { RecommendationRequest } from "../request";
import { runningBasic, runningProtection, runningProtectionWarnings, runningRegionMatches } from './running-outfit';

const garments = catalog.garments as GarmentRow[];
const tee = garments.find(g => g.garment_type === 'top_short_sleeve')!;
const shorts = garments.find(g => g.garment_type === 'shorts')!;
const tights = garments.find(g => g.usage === 'standalone' && g.category === 'base_layer' && g.coverage_legs === 1)!;
const thermal = garments.find(g => g.model_name === 'Capilene Thermal Weight Boot-Length Bottoms')!;
const longTop = garments.find(g => g.model_name === 'Capilene Cool Lightweight')!;

function targets(tempC = (56 - 32) * 5 / 9, exertion: 'easy' | 'moderate' | 'hard' = 'moderate', windMs = 8 * 0.44704, precipitation = false) {
  const conditions = { tempC, humidity: precipitation ? 95 : 50, precipitation };
  const rate = metabolicRateFor('running', exertion, DEFAULT_BODY_METRICS);
  const ireq = phaseIreq(conditions, windMs, rate);
  return phaseTargets('running', ireq, rate, conditions, windMs, ireq, exertion);
}

const select = (pool = garments, t = targets()) => buildRunningEnsemble(categorizeGarments(pool), t);
const ids = (outfit: GarmentRow[]) => outfit.map(g => g.id);

describe('complete running outfits', () => {
  it('selects a T-shirt and shorts at 56°F / 8 mph / moderate, despite breathable thermal underwear', () => {
    const outfit = select();
    expect(ids(outfit).sort()).toEqual([tee.id, shorts.id].sort());
    expect(outfit).not.toContain(thermal);
    expect(runningRegionMatches(outfit, targets(), 'torso')).toBe(true);
    expect(runningRegionMatches(outfit, targets(), 'legs')).toBe(true);
  });

  it('keeps warmer dry running light, with intentional short coverage', () => {
    const outfit = select(garments, targets(22, 'hard', 1));
    expect(ids(outfit).sort()).toEqual([tee.id, shorts.id].sort());
    expect(runningBasic(outfit, 'legs')?.garment_type).toBe('shorts');
    expect(shorts.coverage_legs).toBeLessThan(1);
    expect(tee.coverage_arms).toBeLessThan(1);
  });

  it('selects more insulation for an easy effort than a hard effort in the same weather', () => {
    const easy = select(garments, targets(7, 'easy'));
    const hard = select(garments, targets(7, 'hard'));
    const clo = (outfit: GarmentRow[]) => predictEnsembleThermal(ensembleToThermalGarments(outfit)).rcl.wholeBody;
    expect(clo(easy)).toBeGreaterThan(clo(hard));
    expect(easy.some(g => g.covers_legs && g.coverage_legs === 1)).toBe(true);
  });

  it.each([
    { name: 'cold wind', t: targets(-12, 'moderate', 10) },
    { name: 'near-freezing rain', t: targets(1, 'moderate', 4, true) },
  ])('keeps actual protection for $name as part of the outfit', ({ t }) => {
    const outfit = select(garments, t);
    expect(runningProtectionWarnings(outfit, t)).toEqual([]);
    for (const region of ['torso', 'legs'] as const) {
      expect(runningProtection(outfit, region, t.policy!.protection)).toBe(true);
      expect(runningBasic(outfit, region)).toBeDefined();
    }
    expect(new Set(ids(outfit)).size).toBe(outfit.length);
    // Bases are optional even in a protected outfit.
    expect(outfit.filter(g => g.category === 'base_layer' && g.covers_legs).length).toBeLessThanOrEqual(1);
  });

  it('does not treat a shell category or protected shorts as full rain protection', () => {
    const t = targets(1, 'moderate', 4, true);
    const fakeShell = { ...tee, id: 'fake-shell', category: 'hard_shell' };
    const rainShorts = { ...shorts, garment_protection: { waterproof_rating: 'waterproof' } };
    const outfit = select([tee, rainShorts, fakeShell], t);
    expect(runningProtectionWarnings(outfit, t)).toHaveLength(2);
    expect(runningProtection(outfit, 'legs', t.policy!.protection)).toBe(false);
  });

  it('reports ideal basics as missing with only heavy thermal underwear', () => {
    const t = targets();
    const outfit = select([thermal], t);
    expect(outfit).toEqual([]);
    const requirements = buildClothingRequirements('running', t, {
      garments: [thermal], selectedGarments: outfit, handwear: [], headwear: [],
      ownership: { garments: true, handwear: true, headwear: true },
    });
    expect(requirements.filter(r => r.region === 'legs' || r.region === 'torso')).toEqual([
      expect.objectContaining({ label: 'Lightweight short-sleeve running top', status: 'missing' }),
      expect.objectContaining({ label: 'Running shorts', status: 'missing' }),
    ]);
    expect(requirements.find(r => r.region === 'legs')?.matched_garment_id).toBeUndefined();
  });

  it('keeps a suitable top and reports shorts missing instead of thermal bottoms', () => {
    const outfit = select([tee, thermal]);
    expect(ids(outfit)).toEqual([tee.id]);
    expect(runningBasic(outfit, 'legs')).toBeUndefined();
    expect(runningRegionMatches(outfit, targets(), 'legs')).toBe(false);
    expect(select([shorts])).toEqual([shorts]);
  });

  it('uses standalone tops and pants regardless of layer category, without a thermal base', () => {
    const top = { ...tee, category: 'mid_layer_light' };
    const pants = { ...shorts, category: 'soft_shell' };
    const outfit = select([top, pants, thermal]);
    expect(ids(outfit).sort()).toEqual([top.id, pants.id].sort());
    expect(outfit.every(g => g.category !== 'base_layer')).toBe(true);
  });

  it('does not substitute a too-warm standalone garment merely to fill a missing basic', () => {
    const heavy = { ...tights, id: 'heavy-standalone', garment_thermal_properties: { ...tights.garment_thermal_properties, rcl_legs: 2, evap_potential: 100 } };
    expect(select([tee, heavy])).toEqual([tee]);
  });

  it('does not use ski bibs or unreviewed insulated ski outerwear as a moving running outfit', () => {
    for (const t of [targets(-12, 'moderate', 10), targets(1, 'moderate', 4, true)]) {
      const outfit = select(garments, t);
      expect(outfit.some(g => g.garment_type === 'bib' || g.category === 'outer_insulated')).toBe(false);
    }
  });

  it.each([
    { name: 'reported mild run', t: targets() },
    { name: 'warmer hard run', t: targets(22, 'hard', 1) },
    { name: 'cool easy run', t: targets(7, 'easy') },
  ])('adding a highly breathable but too-warm garment never worsens selection: $name', ({ t }) => {
    const tooWarm = { ...longTop, id: 'very-breathable-hot-top', garment_thermal_properties: { ...longTop.garment_thermal_properties, rcl_torso: 1.5, rcl_arms: 1.4, evap_potential: 100 } };
    expect(ids(select([...garments, tooWarm], t))).toEqual(ids(select(garments, t)));
  });

  it('uses regional regression and short coverage exactly once, agreeing with manual evaluation', () => {
    const t = targets();
    const outfit = select();
    const props = predictEnsembleThermal(ensembleToThermalGarments(outfit));
    const evaluation = evaluatePhase({
      itemClo: { torso: [tee.garment_thermal_properties!.rcl_torso!], legs: [shorts.garment_thermal_properties!.rcl_legs!], hands: [], headNeck: [] },
      targets: { torso: t.regional.neutral.torso, legs: t.regional.neutral.legs, hands: 0, headNeck: 0 },
      minTargets: { torso: t.regional.min.torso, legs: t.regional.min.legs, hands: 0, headNeck: 0 },
      arms: { clo: props.rcl.arm, minTarget: t.regional.min.arms }, targetRange: t.targetRange,
    });
    expect(evaluation.totalClo).toBeCloseTo(props.rcl.wholeBody, 12);
    expect(evaluation.bodyParts.legs.clo).toBeCloseTo(0.06 * 0.961, 12);
    expect(evaluation.decision?.riskType).toBe('comfortable');
  });

  it('compares outer warmth with the whole outfit and matches the combination', () => {
    const t = targets(-3, 'moderate', 9);
    const outfit = select([tee, shorts, tights, longTop, ...garments.filter(g => g.category === 'soft_shell')], t);
    const requirements = buildClothingRequirements('running', t, {
      garments, selectedGarments: outfit, handwear: [], headwear: [],
      ownership: { garments: true, handwear: false, headwear: false },
    });
    for (const region of ['torso', 'legs'] as const) {
      const requirement = requirements.find(r => r.region === region)!;
      expect(requirement.status === 'owned_match').toBe(runningRegionMatches(outfit, t, region));
      if (requirement.status === 'owned_match') {
        for (const garment of outfit.filter(g => g[`covers_${region}`])) expect(requirement.matched_garment_name).toContain(garment.model_name);
      }
    }
  });

  it('chooses a light top underneath a warm protective outer instead of choosing the base first', () => {
    const t = targets(-3, 'moderate', 9);
    t.targetRange = [0.25, 0.45];
    t.regional = { min: { torso: 0.35, arms: 0.25, legs: 0.2 }, neutral: { torso: 0.45, arms: 0.4, legs: 0.4 } };
    const jacket: GarmentRow = { ...longTop, id: 'wind-jacket', category: 'soft_shell', usage: 'unknown',
      garment_protection: { windproof_rating: 'windproof' },
      garment_thermal_properties: { ...longTop.garment_thermal_properties, rcl_torso: 0.35, rcl_arms: 0.3 } };
    const pants: GarmentRow = { ...tights, id: 'wind-pants', category: 'soft_shell', usage: 'unknown',
      garment_protection: { windproof_rating: 'windproof' },
      garment_thermal_properties: { ...tights.garment_thermal_properties, rcl_legs: 0.15 } };
    const outfit = select([tee, shorts, tights, longTop, jacket, pants], t);
    expect(ids(outfit).sort()).toEqual([tee.id, shorts.id, jacket.id, pants.id].sort());
    expect(runningRegionMatches(outfit, t, 'torso')).toBe(true);
    expect(runningRegionMatches(outfit, t, 'legs')).toBe(true);
  });

  it('does not repeat a standalone garment spanning torso and legs', () => {
    const suit: GarmentRow = { ...tee, id: 'suit', covers_legs: true, coverage_legs: 0.3,
      garment_thermal_properties: { ...tee.garment_thermal_properties, rcl_legs: 0.06, recl_legs: 1.4 } };
    expect(ids(select([suit]))).toEqual(['suit']);
  });
});

describe("running exposure assumptions", () => {
  const request = (tempC: number, windMs: number, precipitation: boolean): RecommendationRequest => ({
    supabase: createFakeSupabase({}) as unknown as RecommendationRequest['supabase'],
    userId: null, weather: { temperature: tempC * 9 / 5 + 32, wind_speed: windMs / 0.44704, precipitation },
    tempC, windMs, humidity: 85, precipitation, exertion: 'easy',
    bodyMetrics: DEFAULT_BODY_METRICS, useWardrobeOnly: false, prioritizeLightPack: false,
  });

  it.each([[2, 5], [-5, 5], [2, 9]])("does not assume a membrane for accepted water-resistant layers at %s°C / %s m/s", (tempC, windMs) => {
    const input = request(tempC, windMs, true);
    const targets = running.computeTargets(input);
    const exposure = { relativeAirSpeedMs: windMs, walkingSpeedMs: walkingSpeedFromMetabolicRate(targets.metabolicRate) };
    const membraneMinimum = requiredBasicInsulation(targets.ireq.ireqMin, { ...exposure, airPermeability: 1 });
    const windResistantMinimum = requiredBasicInsulation(targets.ireq.ireqMin, { ...exposure, airPermeability: 50 });

    expect(targets.basicIreq.ireqMin).toBeGreaterThan(membraneMinimum);
    // Even a wind-resistant rain layer must not be built against a smaller
    // membrane-only requirement. Allow for the API's two-decimal rounding.
    expect(targets.basicIreq.ireqMin).toBeGreaterThanOrEqual(windResistantMinimum - 0.005);
  });

  it("does not infer wind resistance from wet protection alone", () => {
    const wet = running.computeTargets(request(2, 5, true));
    const open = running.computeTargets(request(2, 5, false));
    expect(wet.policy?.protection).toMatchObject({ wind: false, wet: true });
    expect(wet.basicIreq).toEqual(open.basicIreq);
  });
});
