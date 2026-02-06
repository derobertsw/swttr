import { describe, it, expect } from 'vitest';
import {
  calculateIreq,
  calculateRegionalIreq,
  calculateExtremityIreq,
  fahrenheitToCelsius,
  celsiusToFahrenheit,
  mphToMs,
  msToMph,
} from './ireq';
import { METABOLIC_RATES, getAlpineCloTargets, ALPINE_CLO_TARGETS } from './constants';

describe('Unit Conversions', () => {
  describe('fahrenheitToCelsius', () => {
    it('should convert 32°F to 0°C', () => {
      expect(fahrenheitToCelsius(32)).toBe(0);
    });

    it('should convert 212°F to 100°C', () => {
      expect(fahrenheitToCelsius(212)).toBe(100);
    });

    it('should convert 0°F to approximately -17.78°C', () => {
      expect(fahrenheitToCelsius(0)).toBeCloseTo(-17.78, 1);
    });

    it('should convert negative temperatures correctly', () => {
      expect(fahrenheitToCelsius(-40)).toBe(-40); // -40 is same in both scales
    });
  });

  describe('celsiusToFahrenheit', () => {
    it('should convert 0°C to 32°F', () => {
      expect(celsiusToFahrenheit(0)).toBe(32);
    });

    it('should convert 100°C to 212°F', () => {
      expect(celsiusToFahrenheit(100)).toBe(212);
    });

    it('should convert -40°C to -40°F', () => {
      expect(celsiusToFahrenheit(-40)).toBe(-40);
    });
  });

  describe('mphToMs', () => {
    it('should convert 1 mph to approximately 0.447 m/s', () => {
      expect(mphToMs(1)).toBeCloseTo(0.447, 2);
    });

    it('should convert 10 mph to approximately 4.47 m/s', () => {
      expect(mphToMs(10)).toBeCloseTo(4.47, 1);
    });

    it('should return 0 for 0 mph', () => {
      expect(mphToMs(0)).toBe(0);
    });
  });

  describe('msToMph', () => {
    it('should convert 1 m/s to approximately 2.237 mph', () => {
      expect(msToMph(1)).toBeCloseTo(2.237, 2);
    });

    it('should convert 10 m/s to approximately 22.37 mph', () => {
      expect(msToMph(10)).toBeCloseTo(22.37, 1);
    });

    it('should return 0 for 0 m/s', () => {
      expect(msToMph(0)).toBe(0);
    });
  });

  describe('round-trip conversions', () => {
    it('should maintain value after mph -> m/s -> mph', () => {
      const original = 15;
      const result = msToMph(mphToMs(original));
      expect(result).toBeCloseTo(original, 5);
    });

    it('should maintain value after F -> C -> F', () => {
      const original = 50;
      const result = celsiusToFahrenheit(fahrenheitToCelsius(original));
      expect(result).toBeCloseTo(original, 5);
    });
  });
});

describe('calculateIreq', () => {
  describe('basic IREQ calculations', () => {
    it('should return positive IREQ values for cold conditions', () => {
      const result = calculateIreq({
        airTemp: -10,
        windSpeed: 5,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.xc_skiing_moderate,
      });

      expect(result.ireqMin).toBeGreaterThan(0);
      expect(result.ireqNeutral).toBeGreaterThan(0);
      expect(result.ireqNeutral).toBeGreaterThan(result.ireqMin);
    });

    it('should return higher IREQ for colder temperatures', () => {
      const warmResult = calculateIreq({
        airTemp: 0,
        windSpeed: 3,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.xc_skiing_moderate,
      });

      const coldResult = calculateIreq({
        airTemp: -20,
        windSpeed: 3,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.xc_skiing_moderate,
      });

      expect(coldResult.ireqMin).toBeGreaterThan(warmResult.ireqMin);
      expect(coldResult.ireqNeutral).toBeGreaterThan(warmResult.ireqNeutral);
    });

    it('should return higher IREQ for higher wind speeds', () => {
      const calmResult = calculateIreq({
        airTemp: -10,
        windSpeed: 1,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.alpine_skiing,
      });

      const windyResult = calculateIreq({
        airTemp: -10,
        windSpeed: 10,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.alpine_skiing,
      });

      expect(windyResult.ireqMin).toBeGreaterThan(calmResult.ireqMin);
    });

    it('should return lower IREQ for higher metabolic rates', () => {
      const restingResult = calculateIreq({
        airTemp: -10,
        windSpeed: 3,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.chairlift, // Low activity
      });

      const activeResult = calculateIreq({
        airTemp: -10,
        windSpeed: 3,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.xc_skiing_racing, // High activity
      });

      expect(restingResult.ireqMin).toBeGreaterThan(activeResult.ireqMin);
    });
  });

  describe('edge cases', () => {
    it('should handle very cold temperatures', () => {
      const result = calculateIreq({
        airTemp: -40,
        windSpeed: 5,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.alpine_skiing,
      });

      expect(result.ireqMin).toBeGreaterThan(0);
      expect(result.ireqNeutral).toBeGreaterThan(2); // Should need significant insulation
    });

    it('should handle near-freezing temperatures', () => {
      const result = calculateIreq({
        airTemp: 0,
        windSpeed: 3,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.xc_skiing_moderate,
      });

      expect(result.ireqMin).toBeGreaterThanOrEqual(0);
      expect(result.ireqNeutral).toBeGreaterThan(0);
    });

    it('should return 0 ireqMin for warm conditions with high activity', () => {
      const result = calculateIreq({
        airTemp: 10, // Above freezing
        windSpeed: 2,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.xc_skiing_racing, // Very high activity
      });

      expect(result.ireqMin).toBeLessThanOrEqual(0.02);
    });
  });

  describe('IREQ values are reasonable', () => {
    it('should return IREQ values in expected clo range for typical skiing', () => {
      const result = calculateIreq({
        airTemp: -5,
        windSpeed: 4,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.xc_skiing_moderate,
      });

      // Typical skiing ensemble is 0.5-2.0 clo
      expect(result.ireqMin).toBeLessThan(3);
      expect(result.ireqNeutral).toBeLessThan(4);
    });
  });

  describe('benchmark scenarios (golden values)', () => {
    it('should match benchmark: mild active output', () => {
      const result = calculateIreq({
        airTemp: 0,
        windSpeed: 3,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.xc_skiing_moderate,
      });

      expect(result.ireqMin).toBeCloseTo(0.5, 2);
      expect(result.ireqNeutral).toBeCloseTo(0.59, 2);
      expect(result.dleHours).toBeCloseTo(8, 2);
    });

    it('should match benchmark: cold moderate output', () => {
      const result = calculateIreq({
        airTemp: -10,
        windSpeed: 5,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.xc_skiing_moderate,
      });

      expect(result.ireqMin).toBeCloseTo(0.84, 2);
      expect(result.ireqNeutral).toBeCloseTo(0.94, 2);
      expect(result.dleHours).toBeCloseTo(7.27, 2);
    });

    it('should match benchmark: very cold low metabolic output', () => {
      const result = calculateIreq({
        airTemp: -25,
        windSpeed: 8,
        relativeHumidity: 60,
        metabolicRate: METABOLIC_RATES.alpine_skiing,
      });

      expect(result.ireqMin).toBeCloseTo(2.84, 2);
      expect(result.ireqNeutral).toBeCloseTo(3.04, 2);
      expect(result.dleHours).toBeCloseTo(5.16, 2);
    });
  });

  describe('DLE behavior', () => {
    it('should return finite DLE hours', () => {
      const result = calculateIreq({
        airTemp: -10,
        windSpeed: 5,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.alpine_skiing,
      });

      expect(Number.isFinite(result.dleHours)).toBe(true);
      expect(result.dleHours).toBeGreaterThanOrEqual(0.5);
      expect(result.dleHours).toBeLessThanOrEqual(8);
    });

    it('should reduce DLE in harsher cold and wind', () => {
      const mild = calculateIreq({
        airTemp: -5,
        windSpeed: 2,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.alpine_skiing,
      });

      const severe = calculateIreq({
        airTemp: -25,
        windSpeed: 10,
        relativeHumidity: 50,
        metabolicRate: METABOLIC_RATES.alpine_skiing,
      });

      expect(severe.dleHours).toBeLessThan(mild.dleHours);
    });
  });
});

describe('calculateRegionalIreq', () => {
  const baseIreq = {
    ireqMin: 1.0,
    ireqNeutral: 1.5,
    dleHours: Infinity,
  };

  describe('XC skiing regional multipliers', () => {
    it('should apply correct multipliers for XC skiing', () => {
      const result = calculateRegionalIreq(baseIreq, 'xc_skiing');

      // XC skiing: torso 0.85, arms 1.0, legs 1.15
      expect(result.min.torso).toBeCloseTo(0.85, 2);
      expect(result.min.arms).toBeCloseTo(1.0, 2);
      expect(result.min.legs).toBeCloseTo(1.15, 2);

      expect(result.neutral.torso).toBeCloseTo(1.275, 2);
      expect(result.neutral.arms).toBeCloseTo(1.5, 2);
      expect(result.neutral.legs).toBeCloseTo(1.725, 2);
    });
  });

  describe('Alpine skiing regional multipliers', () => {
    it('should apply correct multipliers for alpine skiing', () => {
      const result = calculateRegionalIreq(baseIreq, 'alpine_skiing');

      // Alpine skiing: torso 1.0, arms 1.0, legs 1.20
      expect(result.min.torso).toBeCloseTo(1.0, 2);
      expect(result.min.arms).toBeCloseTo(1.0, 2);
      expect(result.min.legs).toBeCloseTo(1.2, 2);
    });
  });

  describe('Unknown activity fallback', () => {
    it('should use default multipliers for unknown activities', () => {
      const result = calculateRegionalIreq(baseIreq, 'unknown_activity');

      // Should apply default (1.0) multipliers
      expect(result.min.torso).toBeCloseTo(1.0, 2);
      expect(result.min.arms).toBeCloseTo(1.0, 2);
      expect(result.min.legs).toBeCloseTo(1.0, 2);
    });
  });
});

describe('calculateExtremityIreq', () => {
  const baseIreq = {
    ireqMin: 1.0,
    ireqNeutral: 1.5,
    dleHours: Infinity,
  };

  describe('basic extremity calculations', () => {
    it('should return higher values for hands than base IREQ', () => {
      const result = calculateExtremityIreq(baseIreq, 'alpine_skiing', -10, 5);

      // Alpine skiing hands multiplier is 1.45
      expect(result.min.hands).toBeGreaterThan(baseIreq.ireqMin);
      expect(result.neutral.hands).toBeGreaterThan(baseIreq.ireqNeutral);
    });

    it('should apply temperature scaling', () => {
      const warmResult = calculateExtremityIreq(baseIreq, 'xc_skiing', 0, 3);
      const coldResult = calculateExtremityIreq(baseIreq, 'xc_skiing', -20, 3);

      expect(coldResult.min.hands).toBeGreaterThan(warmResult.min.hands);
      expect(coldResult.min.head).toBeGreaterThan(warmResult.min.head);
    });

    it('should apply wind scaling', () => {
      const calmResult = calculateExtremityIreq(baseIreq, 'alpine_skiing', -10, 1);
      const windyResult = calculateExtremityIreq(baseIreq, 'alpine_skiing', -10, 10);

      expect(windyResult.min.hands).toBeGreaterThan(calmResult.min.hands);
    });
  });

  describe('activity-specific multipliers', () => {
    it('should return lower hand insulation needs for XC than alpine', () => {
      const xcResult = calculateExtremityIreq(baseIreq, 'xc_skiing', -10, 5);
      const alpineResult = calculateExtremityIreq(baseIreq, 'alpine_skiing', -10, 5);

      // XC hands multiplier (1.10) < Alpine hands multiplier (1.45)
      expect(xcResult.min.hands).toBeLessThan(alpineResult.min.hands);
    });
  });
});

describe('getAlpineCloTargets', () => {
  describe('temperature range selection', () => {
    it('should return mild targets for temperatures >= -5°C', () => {
      expect(getAlpineCloTargets(0)).toBe(ALPINE_CLO_TARGETS.mild);
      expect(getAlpineCloTargets(-5)).toBe(ALPINE_CLO_TARGETS.mild);
      expect(getAlpineCloTargets(5)).toBe(ALPINE_CLO_TARGETS.mild);
    });

    it('should return cold targets for temperatures -15°C to -5°C', () => {
      expect(getAlpineCloTargets(-6)).toBe(ALPINE_CLO_TARGETS.cold);
      expect(getAlpineCloTargets(-10)).toBe(ALPINE_CLO_TARGETS.cold);
      expect(getAlpineCloTargets(-15)).toBe(ALPINE_CLO_TARGETS.cold);
    });

    it('should return veryCold targets for temperatures < -15°C', () => {
      expect(getAlpineCloTargets(-16)).toBe(ALPINE_CLO_TARGETS.veryCold);
      expect(getAlpineCloTargets(-20)).toBe(ALPINE_CLO_TARGETS.veryCold);
      expect(getAlpineCloTargets(-40)).toBe(ALPINE_CLO_TARGETS.veryCold);
    });
  });

  describe('target value structure', () => {
    it('should return correct mild range values', () => {
      const targets = getAlpineCloTargets(0);

      expect(targets.torso.min).toBe(2.0);
      expect(targets.torso.neutral).toBe(3.0);
      expect(targets.legs.min).toBe(1.5);
      expect(targets.legs.neutral).toBe(2.0);
      expect(targets.head.min).toBe(0.5);
      expect(targets.head.neutral).toBe(1.0);
      expect(targets.hands.min).toBe(1.0);
      expect(targets.hands.neutral).toBe(1.5);
    });

    it('should return correct cold range values', () => {
      const targets = getAlpineCloTargets(-10);

      expect(targets.torso.min).toBe(3.5);
      expect(targets.torso.neutral).toBe(4.5);
      expect(targets.legs.min).toBe(2.0);
      expect(targets.legs.neutral).toBe(3.0);
      expect(targets.head.min).toBe(1.0);
      expect(targets.head.neutral).toBe(1.5);
      expect(targets.hands.min).toBe(1.5);
      expect(targets.hands.neutral).toBe(2.5);
    });

    it('should return correct veryCold range values', () => {
      const targets = getAlpineCloTargets(-25);

      expect(targets.torso.min).toBe(5.0);
      expect(targets.torso.neutral).toBe(6.0);
      expect(targets.legs.min).toBe(3.0);
      expect(targets.legs.neutral).toBe(4.0);
      expect(targets.head.min).toBe(1.5);
      expect(targets.head.neutral).toBe(2.0);
      expect(targets.hands.min).toBe(2.5);
      expect(targets.hands.neutral).toBe(3.5);
    });
  });

  describe('neutral > min invariant', () => {
    it('should always have neutral clo greater than min clo', () => {
      const temps = [5, 0, -5, -10, -15, -20, -30];

      for (const temp of temps) {
        const targets = getAlpineCloTargets(temp);

        expect(targets.torso.neutral).toBeGreaterThan(targets.torso.min);
        expect(targets.legs.neutral).toBeGreaterThan(targets.legs.min);
        expect(targets.head.neutral).toBeGreaterThan(targets.head.min);
        expect(targets.hands.neutral).toBeGreaterThan(targets.hands.min);
      }
    });
  });
});
