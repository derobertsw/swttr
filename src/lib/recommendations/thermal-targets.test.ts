import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_METRICS, metabolicHeatFluxFromMet } from '@/lib/biophysics/bodyMetrics';
import { getMetabolicRateForActivity, type ExertionLevel } from '@/lib/biophysics/exertion';
import { REGIONAL_WEIGHTS, type ActivityType } from '@/lib/biophysics/constants';
import { metabolicRateFor, phaseIreq, phaseTargets } from './thermal-targets';
import { evaluatePhase } from './layer-evaluation';

function targets(activity: ActivityType, tempC: number, windMs = 3.57632, exertion: ExertionLevel = 'moderate', precipitation = false, body = DEFAULT_BODY_METRICS) {
  const conditions = { tempC, humidity: precipitation ? 95 : 50, precipitation };
  const rate = metabolicRateFor(activity, exertion, body);
  const ireq = phaseIreq(conditions, windMs, rate);
  return { rate, ireq, ...phaseTargets(activity, ireq, rate, conditions, windMs, ireq, exertion) };
}

describe('running/XC calibrated policy', () => {
  it('converts mass-based METs to W/m² once, using Du Bois surface area', () => {
    // 69 in, 170 lb -> 175.26 cm, 77.1107 kg, approximately 1.9263 m².
    const mass = 170 * 0.45359237;
    const area = 0.007184 * (69 * 2.54) ** 0.725 * mass ** 0.425;
    expect(metabolicHeatFluxFromMet(8.5, DEFAULT_BODY_METRICS)).toBeCloseTo(8.5 * (4184 / 3600) * mass / area, 8);
    expect(metabolicRateFor('running', 'moderate', DEFAULT_BODY_METRICS)).toBeCloseTo(395.2, 0);
    expect(metabolicRateFor('xc_skiing', 'moderate', DEFAULT_BODY_METRICS)).toBeCloseTo(metabolicRateFor('running', 'moderate', DEFAULT_BODY_METRICS), 8);
  });

  it('allows exposed arms/lower legs and no thermal accessories in the reported mild dry run', () => {
    const result = targets('running', (56 - 32) * 5 / 9);
    expect(result.targetRange[0]).toBe(0);
    expect(result.regional.min).toEqual({ torso: 0, arms: 0, legs: 0 });
    expect(result.extremity).toEqual({ min: { hands: 0, head: 0 }, neutral: { hands: 0, head: 0 } });
    expect(result.validationBuffer.coldRisk).toBe(0);
    // A generic shirt/shorts ensemble uses region averages, with no thermal accessories.
    const evaluation = evaluatePhase({
      itemClo: { torso: [0.1], legs: [0.06], hands: [], headNeck: [] },
      targets: { torso: result.regional.neutral.torso, legs: result.regional.neutral.legs, hands: 0, headNeck: 0 },
      minTargets: { torso: 0, legs: 0, hands: 0, headNeck: 0 },
      arms: { clo: 0.02 * 0.809, minTarget: 0, target: result.regional.neutral.arms },
      targetRange: result.targetRange,
    });
    expect(evaluation.decision?.riskType).toBe('comfortable');
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

  it.each(['running', 'xc_skiing'] as const)('warmer weather or greater sustained effort does not raise %s targets', activity => {
    for (const body of [DEFAULT_BODY_METRICS, { heightInches: 62, weightLbs: 110 }, { heightInches: 76, weightLbs: 230 }]) {
      for (const wind of [0, 3.6, 8, 12]) {
        let previous: ReturnType<typeof targets> | undefined;
        for (const temp of [-25, -15, -5, -0.01, 0, 0.01, 5, 9.99, 10, 10.01, 13.33, 20, 25]) {
          const easy = targets(activity, temp, wind, 'easy', false, body);
          const moderate = targets(activity, temp, wind, 'moderate', false, body);
          const hard = targets(activity, temp, wind, 'hard', false, body);
          for (const [a, b] of [[easy, moderate], [moderate, hard], ...(previous ? [[previous, easy]] : [])]) {
            expect(b.targetRange[0]).toBeLessThanOrEqual(a.targetRange[0]);
            expect(b.targetRange[1]).toBeLessThanOrEqual(a.targetRange[1]);
            expect(b.extremity.min.hands).toBeLessThanOrEqual(a.extremity.min.hands);
            expect(b.extremity.neutral.head).toBeLessThanOrEqual(a.extremity.neutral.head);
          }
          for (const result of [easy, moderate, hard]) {
            expect(result.targetRange[0]).toBeLessThanOrEqual(result.targetRange[1]);
            const mean = result.regional.min.torso * REGIONAL_WEIGHTS.torso + result.regional.min.arms * REGIONAL_WEIGHTS.arm + result.regional.min.legs * REGIONAL_WEIGHTS.leg;
            expect(Math.abs(mean - result.targetRange[0])).toBeLessThanOrEqual(0.00501);
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
