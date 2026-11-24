import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import type { ExertionLevel } from '@/lib/biophysics/exertion';
import { calculateFootIreq, mphToMs } from '@/lib/biophysics/ireq';
import { ASSUMED_FOOTWEAR, assessFootwear, footwearAdvice, SOCK_WEIGHTS } from './footwear';
import type { RecommendationRequest } from './request';
import { alpine } from './sports/alpine';
import { biking } from './sports/biking';
import { running } from './sports/running';
import { skiTouring } from './sports/ski-touring';
import { xc } from './sports/xc';

function request(tempC: number, mph = 8, exertion: ExertionLevel = 'moderate'): RecommendationRequest {
  return {
    weather: { temperature: tempC * 9 / 5 + 32, wind_speed: mph },
    tempC, windMs: mphToMs(mph), humidity: 50, precipitation: false, exertion,
    bodyMetrics: DEFAULT_BODY_METRICS, useWardrobeOnly: false, prioritizeLightPack: false,
  } as RecommendationRequest;
}

/** The foot band each sport sizes its sock against. */
const SPORTS = [
  { activity: 'running', reference: -10, feet: (r: RecommendationRequest) => running.computeTargets(r).feet },
  { activity: 'biking', reference: 0, feet: (r: RecommendationRequest) => biking.computeTargets(r).feet },
  { activity: 'xc_skiing', reference: -15, feet: (r: RecommendationRequest) => xc.computeTargets(r).feet },
  { activity: 'alpine_skiing', reference: -15, feet: (r: RecommendationRequest) => alpine.computeTargets(r).feet },
  { activity: 'ski_touring_downhill', reference: -15, feet: (r: RecommendationRequest) => skiTouring.computeTargets(r).downhill.feet },
] as const;

describe('heuristic foot band and sock suggestion (#405)', () => {
  it.each(SPORTS)('$activity: footwear plus a midweight sock just reaches the band at its reference', ({ activity, reference, feet }) => {
    const band = feet(request(reference));
    const midweight = ASSUMED_FOOTWEAR[activity].clo + 0.39;
    expect(Math.abs(band.min - midweight)).toBeLessThanOrEqual(0.03);
    const assessment = assessFootwear(activity, band);
    expect(assessment).toMatchObject({ method: 'heuristic', state: 'selected', thermal_status: 'in_range' });
    expect(assessment.sock).toMatchObject({ weight: 'midweight', clo: 0.39, measured: true });
  });

  it.each(SPORTS)('$activity: colder, windier or easier never asks for a lighter sock', ({ activity, reference, feet }) => {
    const rank = (tempC: number, mph: number, exertion: ExertionLevel) => {
      const assessment = assessFootwear(activity, feet(request(tempC, mph, exertion)));
      return assessment.state === 'short' ? SOCK_WEIGHTS.length : SOCK_WEIGHTS.indexOf(assessment.sock);
    };
    for (const tempC of [reference + 15, reference + 5, reference, reference - 5]) {
      expect(rank(tempC - 5, 8, 'moderate')).toBeGreaterThanOrEqual(rank(tempC, 8, 'moderate'));
      expect(rank(tempC, 20, 'moderate')).toBeGreaterThanOrEqual(rank(tempC, 8, 'moderate'));
      expect(rank(tempC, 8, 'easy')).toBeGreaterThanOrEqual(rank(tempC, 8, 'moderate'));
      expect(rank(tempC, 8, 'moderate')).toBeGreaterThanOrEqual(rank(tempC, 8, 'hard'));
    }
  });

  it('mild weather needs only thin socks, and says they are enough', () => {
    const assessment = assessFootwear('running', running.computeTargets(request(15)).feet);
    expect(assessment).toMatchObject({ state: 'selected', thermal_status: 'over', sock: { weight: 'thin' } });
    expect(assessment.message).toBe('Feet (estimate): thin liner socks are enough in running shoes. Sized by a heuristic foot range; feet are not in the comfort score.');
    expect(footwearAdvice(assessment)).toEqual({ guidance: [assessment.message], warnings: [] });
  });

  it('reports a shortfall with the sport remedy, as a warning, when the warmest sock falls short', () => {
    const assessment = assessFootwear('biking', biking.computeTargets(request(-10, 12)).feet);
    expect(assessment).toMatchObject({ state: 'short', thermal_status: 'under', sock: { weight: 'heavy' } });
    expect(assessment.message).toContain('toe covers, insulated overshoes or winter cycling boots');
    expect(footwearAdvice(assessment)).toEqual({ guidance: [], warnings: [assessment.message] });
  });

  it('never puts a heavyweight sock in a fitted ski-boot shell', () => {
    for (const activity of ['alpine_skiing', 'ski_touring_downhill'] as const) {
      const assessment = assessFootwear(activity, { min: 5, neutral: 6 }, activity === 'alpine_skiing' ? undefined : 'descent');
      expect(assessment).toMatchObject({ state: 'short', sock: { weight: 'midweight' } });
    }
    expect(assessFootwear('ski_touring_downhill', { min: 0.9, neutral: 1 }, 'descent').message)
      .toMatch(/^Feet, sized for the descent \(estimate\): /);
  });

  it('follows the hands\' baseline without the CoWEDA extremity buffer', () => {
    const r = request(-15);
    const targets = alpine.computeTargets(r);
    expect(targets.validationBuffer.extremity).toBeGreaterThan(0);
    expect(targets.feet).toEqual(calculateFootIreq(targets.skiing, 'alpine_skiing', r.tempC, r.windMs));
  });

  it('describes feet without toe temperatures, frostbite or exposure times', () => {
    for (const { activity, reference, feet } of SPORTS) {
      for (const tempC of [reference + 20, reference, reference - 15]) {
        const { message } = assessFootwear(activity, feet(request(tempC)));
        expect(message).not.toMatch(/frostbite|toe temperature|°|minutes|hours/i);
      }
    }
  });
});
