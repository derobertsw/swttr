import { describe, it, expect } from 'vitest';
import { calculateActivityTargetRange, calculateRegionalTargets } from './targets';
import { REGIONAL_IREQ_MULTIPLIERS, REGIONAL_WEIGHTS, type ActivityType } from './constants';

describe('calculateActivityTargetRange', () => {
  it('returns ordered min/max with two-decimal precision', () => {
    const result = calculateActivityTargetRange({
      activity: 'running',
      ireqMin: 0.55,
      ireqNeutral: 0.72,
      dleHours: 7.5,
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
      dleHours: 8,
      airTempC: 2,
      windSpeedMs: 2,
    });

    const harsh = calculateActivityTargetRange({
      activity: 'biking',
      ireqMin: 0.7,
      ireqNeutral: 0.9,
      dleHours: 4,
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
      dleHours: 6.5,
      airTempC: -8,
      windSpeedMs: 5,
    });

    const alpine = calculateActivityTargetRange({
      activity: 'alpine_skiing',
      ireqMin: 1.0,
      ireqNeutral: 1.2,
      dleHours: 6.5,
      airTempC: -8,
      windSpeedMs: 5,
    });

    expect(alpine.max).toBeGreaterThan(running.max);
  });

  it('applies DLE safety: shorter DLE should increase target range', () => {
    const longDle = calculateActivityTargetRange({
      activity: 'xc_skiing',
      ireqMin: 0.9,
      ireqNeutral: 1.1,
      dleHours: 8,
      airTempC: -5,
      windSpeedMs: 4,
    });

    const shortDle = calculateActivityTargetRange({
      activity: 'xc_skiing',
      ireqMin: 0.9,
      ireqNeutral: 1.1,
      dleHours: 3,
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

  it('keeps the activity multipliers in proportion', () => {
    // Alpine: torso 1.0, arms 1.0, legs 1.2, area-weighted mean 1.05.
    const targets = calculateRegionalTargets('alpine_skiing', [2.44, 2.88]);

    expect(targets.min).toEqual({ torso: 2.32, arms: 2.32, legs: 2.79 });
    expect(targets.neutral).toEqual({ torso: 2.74, arms: 2.74, legs: 3.29 });
  });

  it('lets an outfit inside the whole-body range meet every regional minimum', () => {
    // The alpine catalog outfit from #152 at 45°F, which used to score 0.
    const targets = calculateRegionalTargets('alpine_skiing', [2.44, 2.88]);
    const outfit = { torso: 2.89, arms: 2.40, legs: 2.83 };

    expect(areaWeighted(outfit)).toBeGreaterThan(2.44);
    expect(areaWeighted(outfit)).toBeLessThan(2.88);
    expect(outfit.torso).toBeGreaterThanOrEqual(targets.min.torso);
    expect(outfit.arms).toBeGreaterThanOrEqual(targets.min.arms);
    expect(outfit.legs).toBeGreaterThanOrEqual(targets.min.legs);
  });
});
