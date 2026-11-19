/**
 * #374: cycling and the ski-touring climb use Compendium METs converted by
 * body mass, cycling adds riding speed to the heat balance, and both taper
 * their cold margins. Alpine, the chairlift, the touring descent and the
 * transition keep their inputs. See docs/cycling-touring-calibration.md.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_METRICS, metabolicHeatFluxFromMet } from '@/lib/biophysics/bodyMetrics';
import { calculateCowedaValidationBuffer } from '@/lib/biophysics/coweda';
import type { ExertionLevel } from '@/lib/biophysics/exertion';
import { CYCLING_RIDE_SPEED_MS, cyclingRelativeAirSpeed } from '@/lib/biophysics/sport-policy';
import type { PrecipitationType } from '@/types/weather';
import type { UserBodyMetrics } from '@/types/preferences';
import { metabolicRateFor, phaseIreq, type PhaseTargets } from './thermal-targets';
import type { RecommendationRequest } from './request';
import { biking } from './sports/biking';
import { skiTouring } from './sports/ski-touring';

const EFFORTS: ExertionLevel[] = ['easy', 'moderate', 'hard'];

function request(
  tempC: number, windMs: number, exertion: ExertionLevel = 'moderate', precipitation = false,
  bodyMetrics: UserBodyMetrics = DEFAULT_BODY_METRICS, precipitationType?: PrecipitationType,
): RecommendationRequest {
  return {
    supabase: null as unknown as RecommendationRequest['supabase'], userId: null,
    weather: { temperature: tempC * 9 / 5 + 32, wind_speed: windMs / 0.44704, precipitation,
      ...(precipitationType ? { precipitation_type: precipitationType } : {}) },
    tempC, windMs, humidity: precipitation ? 95 : 50, precipitation, exertion, bodyMetrics,
    useWardrobeOnly: false, prioritizeLightPack: false,
  };
}

describe('Compendium metabolic rates (#374)', () => {
  it.each([
    ['biking', 'easy', 4.3, 199.9],
    ['biking', 'moderate', 7.0, 325.4],
    ['biking', 'hard', 9.0, 418.4],
    ['ski_touring_uphill', 'easy', 5.3, 246.4],
    ['ski_touring_uphill', 'moderate', 6.8, 316.1],
    ['ski_touring_uphill', 'hard', 8.5, 395.2],
  ] as const)('%s / %s is %s MET, %s W/m² for the reference body', (activity, effort, met, wm2) => {
    expect(metabolicRateFor(activity, effort, DEFAULT_BODY_METRICS)).toBeCloseTo(wm2, 1);
    // One conversion by mass and Du Bois area, with no bounded size factor on top.
    const small = { heightInches: 62, weightLbs: 110 };
    expect(metabolicRateFor(activity, effort, small)).toBeCloseTo(metabolicHeatFluxFromMet(met, small), 8);
  });

  it('leaves the touring descent, the transition and alpine on their earlier rates', () => {
    expect(metabolicRateFor('ski_touring_downhill', 'moderate', DEFAULT_BODY_METRICS)).toBe(145.5);
    expect(metabolicRateFor('alpine_skiing', 'moderate', DEFAULT_BODY_METRICS)).toBe(145.5);
    const t = skiTouring.computeTargets(request(-5, 4));
    expect(t.downhillRate).toBe(145.5);
    expect(t.transitionIreq).toEqual(phaseIreq({ tempC: -5, humidity: 50 }, 6, 90));
  });
});

describe('cycling relative air speed (#374)', () => {
  it('adds riding speed to ambient wind at right angles, capped at 18 m/s', () => {
    for (const effort of EFFORTS) expect(cyclingRelativeAirSpeed(0, effort)).toBe(CYCLING_RIDE_SPEED_MS[effort]);
    expect(cyclingRelativeAirSpeed(4, 'moderate')).toBeCloseTo(Math.sqrt(41), 8);
    expect(cyclingRelativeAirSpeed(30, 'hard')).toBe(18);
    expect(biking.computeTargets(request(5, 4)).ireq).toEqual(
      phaseIreq({ tempC: 5, humidity: 50 }, Math.sqrt(41), metabolicRateFor('biking', 'moderate', DEFAULT_BODY_METRICS)));
  });

  it('keeps riding speed out of the margin taper and the heuristic wind terms', () => {
    // 13°C, still air: riding at 6.3 m/s must not reopen the margins the
    // taper removes in mild, calm, dry weather.
    const t = biking.computeTargets(request(13, 0, 'hard'));
    expect(t.coldExposureFactor).toBe(0);
    expect(t.validationBuffer).toMatchObject({ wholeBody: 0, coldRisk: 0, extremity: 0 });
    expect(t.extremity.min).toEqual({ hands: 0, head: 0 });
  });
});

describe('tapered cold margins (#374)', () => {
  it('drops added margins and hand/head targets in mild dry weather, keeping heat balance', () => {
    const bike = biking.computeTargets(request(13.33, 3.6, 'easy'));
    expect(bike.coldExposureFactor).toBe(0);
    expect(bike.ireq.ireqMin).toBeGreaterThan(0.3);
    expect(bike.targetRange[0]).toBeGreaterThanOrEqual(bike.ireq.ireqMin);
    expect(bike.extremity.min).toEqual({ hands: 0, head: 0 });
    const climb = skiTouring.computeTargets(request(13.33, 3.6, 'easy')).uphill;
    expect(climb.coldExposureFactor).toBe(0);
    expect(climb.extremity.min).toEqual({ hands: 0, head: 0 });
  });

  it('keeps full margins at freezing, and wet or windy allowances when mild', () => {
    for (const t of [biking.computeTargets(request(0, 3.6)), skiTouring.computeTargets(request(0, 3.6)).uphill]) {
      expect(t.coldExposureFactor).toBe(1);
      expect(t.validationBuffer.coldRisk).toBeGreaterThan(0);
      expect(t.extremity.min.hands).toBeGreaterThan(0);
    }
    expect(biking.computeTargets(request(13.33, 3.6, 'moderate', true)).coldExposureFactor).toBe(0.7);
    expect(skiTouring.computeTargets(request(13.33, 3.6, 'moderate', true)).uphill.coldExposureFactor).toBe(0.7);
    expect(biking.computeTargets(request(13.33, 12)).coldExposureFactor).toBe(1);
  });

  it('leaves the touring descent margins untapered', () => {
    const t = skiTouring.computeTargets(request(13.33, 3.6));
    expect(t.downhill.coldExposureFactor).toBeUndefined();
    expect(t.downhill.validationBuffer).toEqual(calculateCowedaValidationBuffer({ airTempC: 13.33, relativeHumidity: 50, metabolicRate: t.downhillRate }));
  });
});

/** Every band of `b` is at most `a`'s: `b` is never the warmer target. */
function expectNoWarmer(a: PhaseTargets, b: PhaseTargets) {
  expect(b.targetRange[0]).toBeLessThanOrEqual(a.targetRange[0]);
  expect(b.targetRange[1]).toBeLessThanOrEqual(a.targetRange[1]);
  for (const band of ['min', 'neutral'] as const) {
    for (const part of ['hands', 'head'] as const) expect(b.extremity[band][part]).toBeLessThanOrEqual(a.extremity[band][part]);
    for (const region of ['torso', 'arms', 'legs'] as const) expect(b.regional[band][region]).toBeLessThanOrEqual(a.regional[band][region]);
  }
}

/** The heat-balance minimum survives the taper. (Regional averaging is
 * checked in resultant clo in thermal-targets.test.ts; the basic-clo
 * conversion clips each region at its resultant value, so these basic bands
 * average back only approximately.) */
function expectConsistent(t: PhaseTargets, ireqMin: number) {
  expect(t.targetRange[0]).toBeGreaterThanOrEqual(ireqMin);
  expect(t.targetRange[0]).toBeLessThanOrEqual(t.targetRange[1]);
}

const PHASES = {
  cycling: (r: RecommendationRequest) => { const t = biking.computeTargets(r); return { t, ireqMin: t.ireq.ireqMin }; },
  'touring climb': (r: RecommendationRequest) => { const t = skiTouring.computeTargets(r); return { t: t.uphill, ireqMin: t.uphillIreq.ireqMin }; },
};

describe('monotonic targets (#374)', () => {
  // Wind brackets the taper's 4 and 12 m/s boundaries and the 18 m/s cap.
  const winds = [0, 2, 3.99, 4, 4.01, 8, 11.99, 12, 12.01, 17, 25];
  const temps = [-25, -15, -5, -1.01, -0.99, -0.01, 0, 0.01, 5, 9.99, 10, 10.01, 13.33, 20, 25];
  const bodies = [DEFAULT_BODY_METRICS, { heightInches: 62, weightLbs: 110 }, { heightInches: 76, weightLbs: 230 }];
  const weathers = [[false, undefined], [true, 'rain'], [true, 'snow']] as const;

  it.each(Object.keys(PHASES).flatMap(phase => weathers.map(([wet, type]) => ({ phase: phase as keyof typeof PHASES, wet, type }))))(
    'warmer weather or greater effort never raises a $phase target (precipitation: $type)', ({ phase, wet, type }) => {
      for (const body of bodies) {
        for (const wind of winds) {
          let previous: PhaseTargets[] | undefined;
          for (const temp of temps) {
            // Harder cycling rides faster, so convective loss rises with effort;
            // the heat production rises more, and riding speed never feeds the
            // margins, so the harder effort's targets must still be no warmer.
            const [easy, moderate, hard] = EFFORTS.map(effort => PHASES[phase](request(temp, wind, effort, wet, body, type)));
            expectNoWarmer(easy.t, moderate.t);
            expectNoWarmer(moderate.t, hard.t);
            if (previous) [easy, moderate, hard].forEach((result, i) => expectNoWarmer(previous![i], result.t));
            for (const result of [easy, moderate, hard]) expectConsistent(result.t, result.ireqMin);
            previous = [easy.t, moderate.t, hard.t];
          }
        }
      }
    });
});
