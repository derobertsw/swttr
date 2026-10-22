import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import { evaluatePhase } from './layer-evaluation';
import { selectPhaseAccessories, selectHandwear, selectHeadwearByCategory } from './extremities';
import { metabolicRateFor, phaseIreq, phaseTargets } from './thermal-targets';
import { buildClothingRequirements } from './requirements';
import type { ActivityType } from '@/lib/biophysics/constants';
import type { ExertionLevel } from '@/lib/biophysics/exertion';
import type { GarmentRow, HandwearRow, HeadwearRow } from './types';
import type { PhaseTargets } from './thermal-targets';

function targets(activity: ActivityType, tempC: number, wind = 3.57632, effort: ExertionLevel = 'moderate', wet = false) {
  const conditions = { tempC, precipitation: wet, humidity: wet ? 95 : 50 };
  const rate = metabolicRateFor(activity, effort, DEFAULT_BODY_METRICS);
  const ireq = phaseIreq(conditions, wind, rate);
  return phaseTargets(activity, ireq, rate, conditions, wind, ireq, effort);
}
const glove = (id: string, clo: number, extra: Partial<HandwearRow> = {}): HandwearRow => ({
  id, rcl_clo: clo, brand: 'Test', model_name: id, handwear_type: 'liner_glove', dexterity_score: 9, ...extra,
});
const hat = (id: string, clo: number, extra: Partial<HeadwearRow> = {}): HeadwearRow => ({
  id, rcl_clo: clo, brand: 'Test', model_name: id, headwear_type: 'liner_beanie', ...extra,
});
const pool = {
  handwear: [glove('liner', 0.5), glove('running', 0.6), glove('wind-glove', 0.8, { windproof: true }), glove('insulated', 1, { handwear_type: 'insulated_glove', windproof: true, waterproof: true }), glove('expedition', 2.7, { handwear_type: 'mitten', dexterity_score: 2 })],
  headwear: [hat('headband', 0.3, { headwear_type: 'headband' }), hat('thin-beanie', 0.45), hat('beanie', 0.8), hat('buff', 0.3, { headwear_type: 'buff_thin' }), hat('helmet', 0.7, { headwear_type: 'ski_helmet' })],
};

function manual(t: PhaseTargets, hands: (number | null)[], head: (number | null)[]) {
  return evaluatePhase({
    itemClo: { torso: [t.regional.neutral.torso / 0.836], legs: [t.regional.neutral.legs / 0.961], hands, headNeck: head },
    targets: { torso: t.regional.neutral.torso, legs: t.regional.neutral.legs, hands: t.extremity.neutral.hands, headNeck: t.extremity.neutral.head },
    minTargets: { torso: t.regional.min.torso, legs: t.regional.min.legs, hands: t.extremity.min.hands, headNeck: t.extremity.min.head },
    extremityMaxTargets: t.extremity.max ? { hands: t.extremity.max.hands, headNeck: t.extremity.max.head } : undefined,
    arms: { clo: t.regional.neutral.arms, minTarget: t.regional.min.arms },
    targetRange: t.targetRange,
  });
}

describe('optional sustained-activity accessories', () => {
  it.each(['moderate', 'hard'] as const)('omits gloves, hats and neckwear in the 56°F running fixture (%s)', effort => {
    const t = targets('running', (56 - 32) * 5 / 9, 3.57632, effort);
    const result = selectPhaseAccessories('running', t, pool, 13.333);
    expect(result.handwear).toBeNull();
    expect(result.headwear).toEqual({ helmet: null, headWarmth: null, neckWarmth: null });
    expect(result.assessments?.hands).toMatchObject({ state: 'not_needed', thermal_status: 'in_range' });
    expect(result.assessments?.head.state).toBe('not_needed');
    expect(manual(t, [], []).decision?.riskType).toBe('comfortable');
    expect(manual(t, [0.6], [0.5]).decision?.riskType).toBe('overheat');
  });

  it('explains thin XC gloves as functional protection even with zero thermal demand', () => {
    const t = targets('xc_skiing', 13.333);
    const result = selectPhaseAccessories('xc_skiing', t, pool, 13.333);
    expect(t.extremity.neutral.hands).toBe(0);
    expect(result.handwear?.id).toBe('liner');
    expect(result.headwear.headWarmth).toBeNull();
    expect(result.assessments?.hands).toMatchObject({ state: 'selected', purpose: 'pole_grip', thermal_status: 'in_range' });
    expect(result.assessments?.hands.message).toContain('friction');
    expect(manual(t, [0.5], []).decision?.riskType).toBe('comfortable');
    // Removing functional protection doesn't invent a thermal cold warning.
    expect(manual(t, [], []).decision?.riskType).toBe('comfortable');
    const requirements = buildClothingRequirements('xc_skiing', t, {
      garments: [], ...pool, ownership: { garments: true, handwear: true, headwear: true }, accessories: result.assessments,
    });
    expect(requirements.find(r => r.region === 'hands')).toMatchObject({ status: 'owned_match', matched_garment_id: 'liner' });
  });

  it.each(['running', 'xc_skiing'] as const)('retains local cold warnings and appropriate gear for cold/windy or wet %s', activity => {
    for (const [temp, wind, wet, effort] of [[-15, 8, false, 'hard'], [0, 3.5, true, 'moderate']] as const) {
      const t = targets(activity, temp, wind, effort, wet);
      const result = selectPhaseAccessories(activity, t, { ...pool, handwear: [...pool.handwear, glove('thin-wet-glove', 0.4, { waterproof: true })] }, temp);
      expect(result.handwear, JSON.stringify(t.extremity)).not.toBeNull();
      expect(result.headwear.headWarmth).not.toBeNull();
      expect(result.assessments?.hands.thermal_status).toBe('in_range');
      expect(result.assessments?.head.thermal_status).toBe('in_range');
      expect(manual(t, [], []).decision?.riskType).toBe('cold');
      expect(manual(t, [], []).hasExtremityGap).toBe(true);
      const missing = selectPhaseAccessories(activity, t, { handwear: [], headwear: [] }, temp);
      expect(missing.assessments?.hands.state).toBe('missing');
      expect(missing.warnings.length).toBeGreaterThan(0);
    }
  });

  it('distinguishes intentional absence, unavailable suitable gear, and unknown catalog data', () => {
    const mild = targets('running', 13.333);
    const cold = targets('running', -10);
    const empty = { handwear: [], headwear: [] };
    expect(selectPhaseAccessories('running', mild, empty, 13.333).assessments?.hands.state).toBe('not_needed');
    expect(selectPhaseAccessories('running', cold, empty, -10).assessments?.hands.state).toBe('missing');
    expect(selectPhaseAccessories('running', cold, { ...empty, availability: 'unknown' }, -10).assessments?.hands.state).toBe('unknown');
    expect(selectPhaseAccessories('running', mild, { ...empty, availability: 'unknown' }, 13.333).assessments?.hands.state).toBe('not_needed');
    const unknown = { handwear: [glove('unknown', null as unknown as number)], headwear: [hat('unknown', Number.NaN)] };
    const result = selectPhaseAccessories('running', cold, unknown, -10);
    expect(result.assessments?.hands.state).toBe('unknown');
    expect(result.assessments?.head.state).toBe('unknown');
    expect(result.handwear).toBeNull();
    expect(manual(cold, [null], []).decision).toBeNull();
    const req = buildClothingRequirements('running', cold, {
      garments: [], ...unknown, ownership: { garments: true, handwear: true, headwear: true }, accessories: result.assessments,
    });
    expect(req.find(r => r.region === 'hands')?.status).toBe('unknown');
  });

  it('rejects only-overwarm wardrobes instead of choosing expedition insulation or claiming comfort', () => {
    for (const activity of ['running', 'xc_skiing'] as const) {
      const t = targets(activity, 0);
      const result = selectPhaseAccessories(activity, t, {
        handwear: [glove('mitten', 3, { handwear_type: 'mitten' })], headwear: [hat('heavy', 2)],
      }, 0);
      expect(result.handwear).toBeNull();
      expect(result.headwear.headWarmth).toBeNull();
      expect(result.assessments?.hands.state).toBe('missing');
      expect(result.assessments?.head.state).toBe('missing');
      expect(manual(t, [], []).decision?.riskType).toBe('cold');
      expect(manual(t, [3], [2]).decision?.riskType).toBe('overheat');
    }
  });

  it('competes headbands, thin beanies, neck combinations and existing hoods within one budget', () => {
    const t = targets('xc_skiing', 0);
    const result = selectPhaseAccessories('xc_skiing', t, pool, 0);
    expect(result.headwear.headWarmth?.id).toBe('headband');
    expect(result.headwear.neckWarmth).toBeNull();
    const hooded = { hood_type: 'attached' } as GarmentRow;
    const withHood = selectPhaseAccessories('xc_skiing', t, pool, 0, [hooded]);
    expect(withHood.assessments?.head.clo).toBeLessThanOrEqual(t.extremity.max!.head + 0.05);
    const onlyNeck = selectPhaseAccessories('xc_skiing', t, { handwear: [], headwear: [hat('buff', 0.4, { headwear_type: 'buff_thin' })] }, 0);
    expect(onlyNeck.assessments?.head.state).toBe('missing');
    const neckPool = { handwear: [], headwear: [hat('thin-buff', 0.1, { headwear_type: 'buff_thin' })] };
    const hoodTarget = targets('running', -8);
    const neckWithHood = selectPhaseAccessories('running', hoodTarget, neckPool, -8, [hooded]);
    expect(neckWithHood.headwear.neckWarmth?.id).toBe('thin-buff');
    const requirements = buildClothingRequirements('running', hoodTarget, {
      ...neckPool, garments: [], ownership: { garments: true, headwear: true, handwear: true }, accessories: neckWithHood.assessments,
    });
    expect(requirements.find(r => r.region === 'head')).toMatchObject({ status: 'owned_match', label: 'Neck layer to complement hood warmth', matched_garment_id: 'thin-buff' });
    // A colder head band can use a light head + neck combination.
    const colder = targets('xc_skiing', -15, 8, 'hard');
    const combined = selectPhaseAccessories('xc_skiing', colder, { handwear: [], headwear: pool.headwear.filter(h => ['headband', 'buff'].includes(h.id)) }, -15);
    expect(combined.assessments?.head.thermal_status).toBe('in_range');
    expect(combined.headwear.neckWarmth?.id).toBe('buff');
  });

  it.each(['head-first', 'neck-first'] as const)('matches combined head/neck warmth to the head layer with %s inventory', order => {
    const t = targets('xc_skiing', -15, 8, 'hard');
    const head = hat('headband', 0.3, { headwear_type: 'headband' });
    const neck = hat('buff', 0.3, { headwear_type: 'buff_thin' });
    const headwear = order === 'head-first' ? [head, neck] : [neck, head];
    const accessories = selectPhaseAccessories('xc_skiing', t, { handwear: [], headwear }, -15);
    expect(accessories.assessments?.head.selected_ids).toEqual(['headband', 'buff']);
    const requirements = buildClothingRequirements('xc_skiing', t, {
      garments: [], handwear: [], headwear, accessories: accessories.assessments,
      ownership: { garments: true, handwear: true, headwear: true },
    });
    expect(requirements.find(r => r.region === 'head')).toMatchObject({
      status: 'owned_match', label: 'XC ski hat or headband',
      matched_garment_id: 'headband', matched_garment_name: 'Test headband', matched_is_owned: true,
    });
  });

  it.each(['running', 'xc_skiing'] as const)('does not add thermal insulation for warmer air or greater effort (%s)', activity => {
    for (const effort of ['easy', 'moderate', 'hard'] as const) {
      const cloes = [-15, -5, 0, 5, 10, 15].map(temp => {
        const selected = selectPhaseAccessories(activity, targets(activity, temp, 3.5, effort), pool, temp);
        return [selected.handwear?.rcl_clo ?? 0, selected.assessments?.head.clo ?? 0];
      });
      // Sparse gear can be absent because nothing fits; compare only adjacent
      // evaluated selections, so missing gear isn't mistaken for less demand.
      for (let i = 1; i < cloes.length; i++) for (const region of [0, 1]) {
        if (cloes[i - 1][region] > 0) expect(cloes[i][region]).toBeLessThanOrEqual(cloes[i - 1][region]);
      }
    }
    for (const temp of [-10, 0, 10]) {
      const easy = selectPhaseAccessories(activity, targets(activity, temp, 3.5, 'easy'), pool, temp);
      const hard = selectPhaseAccessories(activity, targets(activity, temp, 3.5, 'hard'), pool, temp);
      if (easy.handwear) expect(hard.handwear?.rcl_clo ?? 0).toBeLessThanOrEqual(easy.handwear.rcl_clo);
    }
  });

  it.each(['biking', 'alpine_skiing', 'ski_touring_uphill', 'ski_touring_downhill'] as const)('preserves explicit compatibility selection for %s', activity => {
    const t = targets(activity, -8);
    const result = selectPhaseAccessories(activity, t, pool, -8);
    expect(result.assessments).toBeUndefined();
    expect(result.handwear).toEqual(selectHandwear(pool.handwear, -8, activity === 'biking', t.extremity.neutral.hands));
    expect(result.headwear).toEqual(selectHeadwearByCategory(pool.headwear, -8,
      activity === 'biking' || activity === 'ski_touring_uphill',
      { includeHelmet: activity === 'alpine_skiing' || activity === 'ski_touring_downhill' }));
    if (activity === 'alpine_skiing' || activity === 'ski_touring_downhill') expect(result.headwear.helmet?.id).toBe('helmet');
  });
});
