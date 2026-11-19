import { describe, expect, it } from 'vitest';
import { calculateExposureLimit, EXPOSURE_METHOD, HEAT_DEBT_LIMIT_KJ_M2 } from './exposure';
import {
  calculateHeatStorageRate,
  calculateIreq,
  requiredBasicInsulation,
  resultantInsulationFromBasic,
  walkingSpeedFromMetabolicRate,
} from './ireq';
import { OUTER_AIR_PERMEABILITY, SKIN_TEMP_MINIMUM, SKIN_TEMP_NEUTRAL } from './constants';
import type { ExposureConditions } from '@/types/biophysics';

/** Resting in still, cold air: well inside ISO 11079's range. */
const RESTING: ExposureConditions = {
  airTempC: -10,
  relativeHumidity: 50,
  metabolicRate: 58,
  relativeAirSpeedMs: 0.4,
  walkingSpeedMs: 0,
  airPermeability: OUTER_AIR_PERMEABILITY.membrane,
};

/** Walking at 116 W/m² (2 MET) at -20°C in light wind. */
const WALKING: ExposureConditions = {
  airTempC: -20,
  relativeHumidity: 50,
  metabolicRate: 116,
  relativeAirSpeedMs: 2,
  walkingSpeedMs: walkingSpeedFromMetabolicRate(116),
  airPermeability: OUTER_AIR_PERMEABILITY.membrane,
};

const ireqFor = (conditions: ExposureConditions) => calculateIreq({
  airTemp: conditions.airTempC,
  windSpeed: conditions.relativeAirSpeedMs,
  relativeHumidity: conditions.relativeHumidity,
  metabolicRate: conditions.metabolicRate,
});

describe('resultantInsulationFromBasic', () => {
  it('inverts requiredBasicInsulation', () => {
    for (const resultant of [0.8, 2, 3.5, 5]) {
      const basic = requiredBasicInsulation(resultant, WALKING);
      expect(resultantInsulationFromBasic(basic, WALKING)).toBeCloseTo(resultant, 6);
    }
  });

  it('lowers insulation in wind and motion, and never exceeds the basic value', () => {
    const still = resultantInsulationFromBasic(3, { relativeAirSpeedMs: 0.4, walkingSpeedMs: 0, airPermeability: 1 });
    const windy = resultantInsulationFromBasic(3, { relativeAirSpeedMs: 8, walkingSpeedMs: 0.7, airPermeability: 1 });
    expect(windy).toBeLessThan(still);
    expect(still).toBeLessThanOrEqual(3);
    // Open fabrics let wind through, so they lose more of their insulation.
    const open = resultantInsulationFromBasic(3, { relativeAirSpeedMs: 8, walkingSpeedMs: 0.7, airPermeability: 1000 });
    expect(open).toBeLessThan(windy);
  });
});

describe('calculateHeatStorageRate', () => {
  it('is in balance for an ensemble exactly at IREQ', () => {
    const ireq = ireqFor(WALKING);
    const at = (resultantClo: number, skinTemp: number) => calculateHeatStorageRate({
      airTemp: WALKING.airTempC, windSpeed: WALKING.relativeAirSpeedMs,
      relativeHumidity: WALKING.relativeHumidity, metabolicRate: WALKING.metabolicRate,
      resultantClo, skinTemp,
    });
    // IREQ is rounded to 0.01 clo, so the balance holds to a fraction of a W/m².
    expect(Math.abs(at(ireq.ireqMin, SKIN_TEMP_MINIMUM))).toBeLessThan(0.3);
    expect(Math.abs(at(ireq.ireqNeutral, SKIN_TEMP_NEUTRAL))).toBeLessThan(0.3);
  });
});

describe('calculateExposureLimit', () => {
  it('labels the method and the heat-debt limit', () => {
    const limit = calculateExposureLimit(2, WALKING);
    expect(limit.method).toBe(EXPOSURE_METHOD);
    expect(limit.heat_debt_limit_kj_m2).toBe(144);
    expect(limit.basic_clo).toBe(2);
    expect(limit.resultant_clo).toBeLessThan(2);
    expect(limit.outside_iso_range).toEqual([]);
  });

  it('divides the allowed heat debt by the cooling rate', () => {
    const { minimal, neutral } = calculateExposureLimit(1.5, WALKING);
    for (const criterion of [minimal, neutral]) {
      expect(criterion.heat_storage_w_m2).toBeLessThan(0);
      // 144 kJ/m² = 40 Wh/m², so hours = 40 / |S|.
      expect(criterion.dle_hours).toBeCloseTo(HEAT_DEBT_LIMIT_KJ_M2 / 3.6 / -criterion.heat_storage_w_m2, 1);
    }
    // The neutral skin temperature loses heat faster, so its limit comes first.
    expect(neutral.dle_hours!).toBeLessThan(minimal.dle_hours!);
  });

  it('gives a warmer ensemble a longer limit', () => {
    const lighter = calculateExposureLimit(1.5, WALKING);
    const warmer = calculateExposureLimit(2.2, WALKING);
    expect(warmer.minimal.heat_storage_w_m2).toBeGreaterThan(lighter.minimal.heat_storage_w_m2);
    expect(warmer.neutral.dle_hours!).toBeGreaterThan(lighter.neutral.dle_hours!);
  });

  it('gives colder or windier conditions a shorter limit for the same ensemble', () => {
    const base = calculateExposureLimit(1.5, WALKING);
    const colder = calculateExposureLimit(1.5, { ...WALKING, airTempC: -30 });
    const windier = calculateExposureLimit(1.5, { ...WALKING, relativeAirSpeedMs: 8 });
    expect(colder.neutral.dle_hours!).toBeLessThan(base.neutral.dle_hours!);
    expect(windier.neutral.dle_hours!).toBeLessThan(base.neutral.dle_hours!);
    expect(windier.resultant_clo).toBeLessThan(base.resultant_clo);
  });

  it('reports no finite duration when the ensemble keeps the body in balance', () => {
    const ireq = ireqFor(WALKING);
    const warmEnough = calculateExposureLimit(requiredBasicInsulation(ireq.ireqNeutral + 0.3, WALKING), WALKING);
    for (const criterion of [warmEnough.minimal, warmEnough.neutral]) {
      expect(criterion.heat_storage_w_m2).toBeGreaterThanOrEqual(0);
      expect(criterion.status).toBe('no_heat_debt');
      expect(criterion.dle_hours).toBeNull();
    }
  });

  it('meets minimal strain but not neutral between the two IREQ values', () => {
    const ireq = ireqFor(WALKING);
    const between = (ireq.ireqMin + ireq.ireqNeutral) / 2;
    const limit = calculateExposureLimit(requiredBasicInsulation(between, WALKING), WALKING);
    expect(limit.minimal.status).toBe('no_heat_debt');
    expect(limit.neutral.status).not.toBe('no_heat_debt');
  });

  it('reports limits beyond 8 hours as ISO 11079 does', () => {
    const ireq = ireqFor(RESTING);
    // Just short of the minimum: a slow heat debt.
    const limit = calculateExposureLimit(requiredBasicInsulation(ireq.ireqMin - 0.05, RESTING), RESTING);
    expect(limit.minimal.status).toBe('more_than_8_hours');
    expect(limit.minimal.dle_hours!).toBeGreaterThan(8);
  });

  it('flags conditions outside the standard', () => {
    const running = calculateExposureLimit(0.5, { ...WALKING, airTempC: 12, metabolicRate: 520, relativeAirSpeedMs: 0.2 });
    expect(running.outside_iso_range).toEqual(['metabolic_rate', 'air_temperature', 'air_speed']);
  });
});
