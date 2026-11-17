import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import { REGIONAL_WEIGHTS, type ActivityType } from '@/lib/biophysics/constants';
import { POLE_GRIP_MAX_CLO, PREFERENCE_BAND_SHARE, preferenceBand } from '@/lib/biophysics/sport-policy';
import type { TemperatureSensitivity } from '@/types/preferences';
import { metabolicRateFor, phaseExposure, phaseIreq, phaseTargets } from './thermal-targets';
import { describePreference, preferenceOverreach, type PreferenceSelection } from './preference';
import type { GarmentRow } from './types';

function targets(activity: ActivityType, tempC: number, windMs: number, sensitivity: TemperatureSensitivity) {
  const conditions = { tempC, humidity: 50, precipitation: false };
  const rate = metabolicRateFor(activity, 'moderate', DEFAULT_BODY_METRICS);
  const ireq = phaseIreq(conditions, windMs, rate);
  return phaseTargets(activity, ireq, rate, conditions, windMs, ireq, 'moderate', phaseExposure(windMs, rate, 300), sensitivity);
}

describe('preferenceBand', () => {
  const hot = { sensitivity: 'hot' as const, bandShare: PREFERENCE_BAND_SHARE };
  const cold = { sensitivity: 'cold' as const, bandShare: PREFERENCE_BAND_SHARE };

  it('gives up a quarter of the band from one side and never moves the other limit', () => {
    expect(preferenceBand(0.4, 0.8, hot)).toEqual([0.4, 0.7]);
    expect(preferenceBand(0.4, 0.8, cold)).toEqual([0.5, 0.8]);
    expect(preferenceBand(0.4, 0.8)).toEqual([0.4, 0.8]);
  });

  it('leaves an empty or zero band unchanged', () => {
    expect(preferenceBand(0, 0, hot)).toEqual([0, 0]);
    expect(preferenceBand(0.3, 0.3, cold)).toEqual([0.3, 0.3]);
  });
});

describe('phaseTargets with a preference', () => {
  it.each([[-10, 6], [0, 3.6], [8, 2], [13, 5.4]])('keeps regional bands averaging to the whole-body band at %s°C, %s m/s', (tempC, windMs) => {
    for (const activity of ['running', 'xc_skiing'] as const) {
      for (const sensitivity of ['hot', 'cold'] as const) {
        const result = targets(activity, tempC, windMs, sensitivity);
        const mean = (values: { torso: number; arms: number; legs: number }) =>
          values.torso * REGIONAL_WEIGHTS.torso + values.arms * REGIONAL_WEIGHTS.arm + values.legs * REGIONAL_WEIGHTS.leg;
        expect(mean(result.regional.min)).toBeCloseTo(result.targetRange[0], 1);
        expect(mean(result.regional.neutral)).toBeCloseTo(result.targetRange[1], 1);
        expect(result.policy?.preference).toEqual({ sensitivity, bandShare: PREFERENCE_BAND_SHARE, targetsChanged: true });
      }
    }
  });

  it('keeps the XC pole-grip glove allowance under Run Warm', () => {
    const result = targets('xc_skiing', 13, 2, 'hot');
    expect(result.extremity.max?.hands).toBe(POLE_GRIP_MAX_CLO);
    expect(result.policy?.protection.poleGrip).toBe(true);
  });

  it('leaves zero-width bands alone, so mild weather adds no thermal accessories', () => {
    for (const sensitivity of ['hot', 'cold'] as const) {
      const result = targets('running', 25, 1, sensitivity);
      expect(result.extremity).toEqual({ min: { hands: 0, head: 0 }, neutral: { hands: 0, head: 0 }, max: { hands: 0, head: 0 } });
      // The whole-body band is always at least 0.12 clo wide, so it still narrows.
      expect(result.targetRange).not.toEqual(targets('running', 25, 1, 'neutral').targetRange);
    }
  });

  it('ignores the setting for sports without the sustained policy', () => {
    const conditions = { tempC: -5, humidity: 50 };
    const rate = metabolicRateFor('alpine_skiing', 'moderate', DEFAULT_BODY_METRICS);
    const ireq = phaseIreq(conditions, 5, rate);
    const standard = phaseTargets('alpine_skiing', ireq, rate, conditions, 5, ireq, 'moderate');
    expect(phaseTargets('alpine_skiing', ireq, rate, conditions, 5, ireq, 'moderate', undefined, 'cold')).toEqual(standard);
  });
});

function garment(id: string, rcl: number): GarmentRow {
  return {
    id, brand: 'Test', model_name: id, category: 'base_layer', covers_torso: true, covers_arms: true, covers_legs: true,
    garment_thermal_properties: { rcl_torso: rcl, rcl_arms: rcl, rcl_legs: rcl, recl_torso: 0.01, recl_arms: 0.01, recl_legs: 0.01 },
  } as GarmentRow;
}

const BANDS = {
  targetRange: [0.4, 0.8] as [number, number],
  regional: { min: { torso: 0.4, arms: 0.4, legs: 0.4 }, neutral: { torso: 0.8, arms: 0.8, legs: 0.8 } },
  extremity: { min: { hands: 0, head: 0 }, neutral: { hands: 0, head: 0 } },
};

describe('preferenceOverreach', () => {
  it('stops Run Warm from trading minimum warmth for lighter layers', () => {
    expect(preferenceOverreach('hot', [garment('light', 0.2)], [garment('usual', 0.6)], BANDS)).toBe('minimum');
    expect(preferenceOverreach('hot', [garment('lighter', 0.45)], [garment('usual', 0.6)], BANDS)).toBeNull();
  });

  it('stops Run Cold from going past the upper limit', () => {
    expect(preferenceOverreach('cold', [garment('heavy', 1.2)], [garment('usual', 0.6)], BANDS)).toBe('upper_limit');
    expect(preferenceOverreach('cold', [garment('warmer', 0.75)], [garment('usual', 0.6)], BANDS)).toBeNull();
  });

  it('allows a change no worse than the standard choice already is', () => {
    expect(preferenceOverreach('hot', [garment('light', 0.2)], [garment('usual', 0.2)], BANDS)).toBeNull();
  });
});

describe('describePreference', () => {
  const selection = (...ensemble: GarmentRow[]): PreferenceSelection => ({
    ensemble, handwear: null, headwear: { helmet: null, headWarmth: null, neckWarmth: null },
  });
  const narrowed = { targetRange: [0.4, 0.7] as [number, number], policy: { preference: { targetsChanged: true } } };
  const hot = { sensitivity: 'hot' as const, source: 'request' as const };

  it('names the layers that changed and which way', () => {
    const result = describePreference(hot, narrowed, { targets: { targetRange: [0.4, 0.8] }, selections: {
      kept: null, chosen: selection(garment('Light Top', 0.45)), usual: selection(garment('Warm Top', 0.6)),
    } });
    expect(result).toMatchObject({ effect: 'changed_layers', targets_adjusted: true, standard_target_range: [0.4, 0.8] });
    expect(result.message).toContain('That gives lighter layers than the standard choice: it adds Test Light Top; leaves out Test Warm Top.');
  });

  it('claims no clothing difference when the layers are the same or kept', () => {
    const same = describePreference(hot, narrowed, { targets: { targetRange: [0.4, 0.8] }, selections: {
      kept: null, chosen: selection(garment('Top', 0.6)), usual: selection(garment('Top', 0.6)),
    } });
    expect(same.effect).toBe('same_layers');
    const kept = describePreference(hot, narrowed, { targets: { targetRange: [0.4, 0.8] }, selections: {
      kept: 'minimum', chosen: selection(garment('Top', 0.6)), usual: selection(garment('Top', 0.6)),
    } });
    expect(kept.effect).toBe('standard_layers_kept');
    expect(kept.message).toContain('would fall short of minimum warmth');
    for (const { message } of [same, kept]) expect(message).not.toMatch(/adds|leaves out/);
  });

  it('says when the conditions leave no room to adjust', () => {
    const result = describePreference({ sensitivity: 'cold', source: 'saved' },
      { targetRange: [0.1, 0.3], policy: { preference: { targetsChanged: false } } }, { targets: { targetRange: [0.1, 0.3] } });
    expect(result).toMatchObject({ sensitivity: 'cold', source: 'saved', effect: 'no_change', targets_adjusted: false });
  });
});
