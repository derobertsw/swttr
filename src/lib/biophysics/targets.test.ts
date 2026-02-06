import { describe, it, expect } from 'vitest';
import { calculateActivityTargetRange } from './targets';

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
