import { describe, it, expect } from 'vitest';
import { calculateActivityTargetRange, calculateRegionalTargets } from './targets';
import { REGIONAL_IREQ_MULTIPLIERS, REGIONAL_WEIGHTS, type ActivityType } from './constants';

describe('calculateActivityTargetRange', () => {
  it('returns ordered min/max with two-decimal precision', () => {
    const result = calculateActivityTargetRange({
      activity: 'running',
      ireqMin: 0.55,
      ireqNeutral: 0.72,
      heuristicExposureHours: 7.5,
      airTempC: -2,
      windSpeedMs: 3,
    });

    expect(result.min).toBeLessThan(result.max);
    expect(result.min.toFixed(2)).toMatch(/^\d+\.\d{2}$/);
    expect(result.max.toFixed(2)).toMatch(/^\d+\.\d{2}$/);
  });

  it('widens and lifts range in harsher conditions', () => {
    const mild = calculateActivityTargetRange({
      activity: 'biking',
      ireqMin: 0.7,
      ireqNeutral: 0.9,
      heuristicExposureHours: 8,
      airTempC: 2,
      windSpeedMs: 2,
    });

    const harsh = calculateActivityTargetRange({
      activity: 'biking',
      ireqMin: 0.7,
      ireqNeutral: 0.9,
      heuristicExposureHours: 4,
      airTempC: -20,
      windSpeedMs: 10,
    });

    expect(harsh.min).toBeGreaterThan(mild.min);
    expect(harsh.max).toBeGreaterThan(mild.max);
  });

  it('gives alpine a wider target envelope than running for same IREQ/weather', () => {
    const running = calculateActivityTargetRange({
      activity: 'running',
      ireqMin: 1.0,
      ireqNeutral: 1.2,
      heuristicExposureHours: 6.5,
      airTempC: -8,
      windSpeedMs: 5,
    });

    const alpine = calculateActivityTargetRange({
      activity: 'alpine_skiing',
      ireqMin: 1.0,
      ireqNeutral: 1.2,
      heuristicExposureHours: 6.5,
      airTempC: -8,
      windSpeedMs: 5,
    });

    expect(alpine.max).toBeGreaterThan(running.max);
  });

  it('applies the exposure heuristic: a shorter heuristic exposure widens the target range', () => {
    const longDle = calculateActivityTargetRange({
      activity: 'xc_skiing',
      ireqMin: 0.9,
      ireqNeutral: 1.1,
      heuristicExposureHours: 8,
      airTempC: -5,
      windSpeedMs: 4,
    });

    const shortDle = calculateActivityTargetRange({
      activity: 'xc_skiing',
      ireqMin: 0.9,
      ireqNeutral: 1.1,
      heuristicExposureHours: 3,
      airTempC: -5,
      windSpeedMs: 4,
    });

    expect(shortDle.min).toBeGreaterThan(longDle.min);
    expect(shortDle.max).toBeGreaterThan(longDle.max);
  });
});

describe('calculateRegionalTargets', () => {
  const areaWeighted = (clo: { torso: number; arms: number; legs: number }) =>
    clo.torso * REGIONAL_WEIGHTS.torso + clo.arms * REGIONAL_WEIGHTS.arm + clo.legs * REGIONAL_WEIGHTS.leg;

  it.each(Object.keys(REGIONAL_IREQ_MULTIPLIERS) as ActivityType[])(
    'splits the %s range so the regions average back to it',
    (activity) => {
      const targets = calculateRegionalTargets(activity, [2.44, 2.88]);

      // Each regional target is rounded to 0.01 clo.
      expect(Math.abs(areaWeighted(targets.min) - 2.44)).toBeLessThanOrEqual(0.005);
      expect(Math.abs(areaWeighted(targets.neutral) - 2.88)).toBeLessThanOrEqual(0.005);
    }
  );

  it.each(Object.keys(REGIONAL_IREQ_MULTIPLIERS) as ActivityType[])(
    'gives %s torso, arms and legs the whole-body band (no unsourced regional bias, #375)',
    (activity) => {
      const targets = calculateRegionalTargets(activity, [2.44, 2.88]);

      expect(targets.min).toEqual({ torso: 2.44, arms: 2.44, legs: 2.44 });
      expect(targets.neutral).toEqual({ torso: 2.88, arms: 2.88, legs: 2.88 });
    }
  );

  it('lets an outfit with every region inside the whole-body range meet every regional minimum', () => {
    // Before #152 rescaled the multipliers, their area-weighted mean above 1
    // lifted the regional minimums past the whole-body one, so an outfit
    // inside the whole-body range still fell short and scored 0.
    const targets = calculateRegionalTargets('ski_touring_downhill', [2.44, 2.88]);
    const outfit = { torso: 2.50, arms: 2.46, legs: 2.75 };

    expect(areaWeighted(outfit)).toBeGreaterThan(2.44);
    expect(areaWeighted(outfit)).toBeLessThan(2.88);
    expect(outfit.torso).toBeGreaterThanOrEqual(targets.min.torso);
    expect(outfit.arms).toBeGreaterThanOrEqual(targets.min.arms);
    expect(outfit.legs).toBeGreaterThanOrEqual(targets.min.legs);
  });
});
