import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_METRICS, metabolicHeatFluxFromMet } from '@/lib/biophysics/bodyMetrics';
import { getMetabolicRateForActivity, type ExertionLevel } from '@/lib/biophysics/exertion';
import { OUTER_AIR_PERMEABILITY, REGIONAL_WEIGHTS, type ActivityType } from '@/lib/biophysics/constants';
import { requiredBasicInsulation } from '@/lib/biophysics/ireq';
import { basicIreq, metabolicRateFor, phaseExposure, phaseIreq, phaseTargets } from './thermal-targets';
import { evaluatePhase } from './layer-evaluation';

function targets(activity: ActivityType, tempC: number, windMs = 3.57632, exertion: ExertionLevel = 'moderate', precipitation = false, body = DEFAULT_BODY_METRICS) {
  const conditions = { tempC, humidity: precipitation ? 95 : 50, precipitation };
  const rate = metabolicRateFor(activity, exertion, body);
  const ireq = phaseIreq(conditions, windMs, rate);
  return { rate, ireq, ...phaseTargets(activity, ireq, rate, conditions, windMs, ireq, exertion) };
}

describe('running/XC calibrated policy', () => {
  it.each([
    ['running', 'easy', 302.174],
    ['running', 'moderate', 395.151],
    ['running', 'hard', 511.371],
    ['xc_skiing', 'easy', 316.120],
    ['xc_skiing', 'moderate', 395.151],
    ['xc_skiing', 'hard', 525.318],
  ] as const)('uses the reference-body heat flux for %s / %s', (activity, effort, expectedWm2) => {
    expect(metabolicRateFor(activity, effort, DEFAULT_BODY_METRICS)).toBeCloseTo(expectedWm2, 3);
  });

  it('converts mass-based METs to W/m² once, using Du Bois surface area', () => {
    // 69 in, 170 lb -> 175.26 cm, 77.1107 kg, approximately 1.9278 m².
    const mass = 170 * 0.45359237;
    const area = 0.007184 * (69 * 2.54) ** 0.725 * mass ** 0.425;
    expect(metabolicHeatFluxFromMet(8.5, DEFAULT_BODY_METRICS)).toBeCloseTo(8.5 * (4184 / 3600) * mass / area, 8);
    expect(metabolicRateFor('running', 'moderate', DEFAULT_BODY_METRICS)).toBeCloseTo(395.2, 0);
    expect(metabolicRateFor('xc_skiing', 'moderate', DEFAULT_BODY_METRICS)).toBeCloseTo(metabolicRateFor('running', 'moderate', DEFAULT_BODY_METRICS), 8);
  });

  it('allows exposed arms/lower legs and no thermal accessories in the reported mild dry run', () => {
    const result = targets('running', (56 - 32) * 5 / 9);
    expect(result.targetRange[0]).toBe(result.ireq.ireqMin);
    expect(result.extremity).toEqual({ min: { hands: 0, head: 0 }, neutral: { hands: 0, head: 0 }, max: { hands: 0, head: 0 } });
    expect(result.validationBuffer.coldRisk).toBe(0);
    // A generic shirt/shorts ensemble uses region averages, with no thermal accessories.
    const evaluation = evaluatePhase({
      itemClo: { torso: [0.1], legs: [0.06], hands: [], headNeck: [] },
      targets: { torso: result.regional.neutral.torso, legs: result.regional.neutral.legs, hands: 0, headNeck: 0 },
      minTargets: { torso: result.regional.min.torso, legs: result.regional.min.legs, hands: 0, headNeck: 0 },
      arms: { clo: 0.02 * 0.809, minTarget: result.regional.min.arms, target: result.regional.neutral.arms },
      targetRange: result.targetRange,
    });
    expect(evaluation.decision?.riskType).toBe('comfortable');
  });

  it.each(['running', 'xc_skiing'] as const)('retains the heat-balance requirement for a smaller, easy-effort %s outing', activity => {
    const body = { heightInches: 62, weightLbs: 110 };
    for (const tempC of [5, 9.99, 10, 10.01, 13.33]) {
      const result = targets(activity, tempC, 3.57632, 'easy', false, body);
      // Mild air alone cannot erase a positive heat-balance requirement.
      expect(result.ireq.ireqMin).toBeGreaterThan(0.15);
      expect(result.targetRange[0]).toBeGreaterThanOrEqual(result.ireq.ireqMin);
      const evaluation = evaluatePhase({
        itemClo: { torso: [], legs: [], hands: [], headNeck: [] },
        targets: {},
        arms: { clo: 0 },
        targetRange: result.targetRange,
      });
      expect(evaluation.decision?.riskType).toBe('cold');
    }
    // Zero thermal requirements remain possible when heat output is sufficient.
    const warm = targets(activity, 20, 3.57632, 'hard', false, body);
    expect(warm.targetRange[0]).toBe(0);
    expect(warm.regional.min).toEqual({ torso: 0, arms: 0, legs: 0 });
    expect(warm.extremity.min).toEqual({ hands: 0, head: 0 });
  });

  it.each(['running', 'xc_skiing'] as const)('preserves cold, wet and exposed allowances for %s', activity => {
    const dry = targets(activity, 13.33);
    for (const conditions of [[0, 3.6, true], [-15, 8, false], [13.33, 12, false]] as const) {
      const result = targets(activity, conditions[0], conditions[1], 'moderate', conditions[2]);
      expect(result.targetRange[0]).toBeGreaterThan(dry.targetRange[0]);
      expect(result.extremity.min.hands).toBeGreaterThan(0);
      expect(result.validationBuffer.coldRisk).toBeGreaterThan(0);
    }
    expect(targets(activity, 0, 3.6, 'moderate', true).policy?.protection.wet).toBe(true);
  });

  it.each(
    (['running', 'xc_skiing'] as const).flatMap(activity =>
      [false, true].map(precipitation => ({ activity, precipitation }))
    )
  )('warmer weather or greater sustained effort does not raise $activity targets (wet: $precipitation)', ({ activity, precipitation }) => {
    for (const body of [DEFAULT_BODY_METRICS, { heightInches: 62, weightLbs: 110 }, { heightInches: 76, weightLbs: 230 }]) {
      for (const wind of [0, 3.6, 3.99, 4, 4.01, 8, 11.99, 12, 12.01]) {
        let previous: ReturnType<typeof targets> | undefined;
        for (const temp of [-25, -15, -5, -0.01, 0, 0.01, 5, 9.99, 10, 10.01, 13.33, 20, 25]) {
          const easy = targets(activity, temp, wind, 'easy', precipitation, body);
          const moderate = targets(activity, temp, wind, 'moderate', precipitation, body);
          const hard = targets(activity, temp, wind, 'hard', precipitation, body);
          for (const [a, b] of [[easy, moderate], [moderate, hard], ...(previous ? [[previous, easy]] : [])]) {
            expect(b.targetRange[0]).toBeLessThanOrEqual(a.targetRange[0]);
            expect(b.targetRange[1]).toBeLessThanOrEqual(a.targetRange[1]);
            for (const band of ['min', 'neutral'] as const) {
              for (const part of ['hands', 'head'] as const) {
                expect(b.extremity[band][part]).toBeLessThanOrEqual(a.extremity[band][part]);
              }
              for (const region of ['torso', 'arms', 'legs'] as const) {
                expect(b.regional[band][region]).toBeLessThanOrEqual(a.regional[band][region]);
              }
            }
          }
          for (const result of [easy, moderate, hard]) {
            expect(result.targetRange[0]).toBeGreaterThanOrEqual(result.ireq.ireqMin);
            expect(result.targetRange[0]).toBeLessThanOrEqual(result.targetRange[1]);
            for (const [band, wholeBody] of [['min', result.targetRange[0]], ['neutral', result.targetRange[1]]] as const) {
              const mean = result.regional[band].torso * REGIONAL_WEIGHTS.torso + result.regional[band].arms * REGIONAL_WEIGHTS.arm + result.regional[band].legs * REGIONAL_WEIGHTS.leg;
              expect(Math.abs(mean - wholeBody)).toBeLessThanOrEqual(0.00501);
            }
          }
          previous = easy;
        }
      }
    }
  });

  it('keeps body-size sensitivity finite and separates current defaults from other sports', () => {
    expect(targets('running', -5, 3.6, 'moderate', false, { heightInches: 62, weightLbs: 110 }).rate)
      .toBeLessThan(targets('running', -5, 3.6, 'moderate', false, { heightInches: 76, weightLbs: 230 }).rate);
    expect(getMetabolicRateForActivity('biking', 'moderate')).toBe(290);
    expect(getMetabolicRateForActivity('ski_touring_uphill', 'moderate')).toBe(232.8);
    expect(getMetabolicRateForActivity('ski_touring_downhill', 'moderate')).toBe(145.5);
    expect(targets('alpine_skiing', -5).policy).toBeUndefined();
    expect(targets('ski_touring_uphill', -5).policy).toBeUndefined();
  });
});

describe('dynamic exposure', () => {
  const conditions = { tempC: -4, humidity: 60 };
  const rate = 145.5;
  const ireq = phaseIreq(conditions, 10.4, rate);
  const areaWeighted = (clo: { torso: number; arms: number; legs: number }) =>
    clo.torso * REGIONAL_WEIGHTS.torso + clo.arms * REGIONAL_WEIGHTS.arm + clo.legs * REGIONAL_WEIGHTS.leg;

  it('converts the whole-body and regional bands to basic clo, leaving hands and head alone', () => {
    const resultant = phaseTargets('ski_touring_downhill', ireq, rate, conditions, 10.4);
    const basic = phaseTargets('ski_touring_downhill', ireq, rate, conditions, 10.4, ireq, 'moderate',
      phaseExposure(10.4, rate, OUTER_AIR_PERMEABILITY.membrane));

    expect(basic.targetRange[0]).toBeCloseTo(requiredBasicInsulation(resultant.targetRange[0], phaseExposure(10.4, rate, 1)), 2);
    expect(basic.targetRange[1]).toBeGreaterThan(resultant.targetRange[1] * 1.3);
    expect(basic.extremity).toEqual(resultant.extremity);
  });

  it('keeps the converted regions averaging back to the converted whole-body band', () => {
    const basic = phaseTargets('ski_touring_downhill', ireq, rate, conditions, 10.4, ireq, 'moderate',
      phaseExposure(10.4, rate, OUTER_AIR_PERMEABILITY.membrane));

    expect(Math.abs(areaWeighted(basic.regional.min) - basic.targetRange[0])).toBeLessThanOrEqual(0.01);
    expect(Math.abs(areaWeighted(basic.regional.neutral) - basic.targetRange[1])).toBeLessThanOrEqual(0.01);
  });

  it('converts IREQ itself for the builders', () => {
    const exposure = phaseExposure(10.4, rate, OUTER_AIR_PERMEABILITY.membrane);
    expect(basicIreq(ireq, exposure)).toEqual({
      ireqMin: Math.round(requiredBasicInsulation(ireq.ireqMin, exposure) * 100) / 100,
      ireqNeutral: Math.round(requiredBasicInsulation(ireq.ireqNeutral, exposure) * 100) / 100,
      dleHours: ireq.dleHours,
    });
  });

  it('uses no walking speed for a seated phase', () => {
    expect(phaseExposure(5, 70, 1, true).walkingSpeedMs).toBe(0);
    expect(phaseExposure(5, 145.5, 1).walkingSpeedMs).toBeCloseTo(0.455, 3);
  });
});
