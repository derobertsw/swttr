import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import type { ActivityType } from '@/lib/biophysics/constants';
import { selectPhaseAccessories } from './extremities';
import { buildHelmetRequirement } from './requirements';
import { metabolicRateFor, phaseIreq, phaseTargets } from './thermal-targets';
import type { HeadwearRow } from './types';

function targets(activity: ActivityType, tempC: number) {
  const conditions = { tempC, humidity: 50 };
  const rate = metabolicRateFor(activity, 'moderate', DEFAULT_BODY_METRICS);
  const ireq = phaseIreq(conditions, 3.6, rate);
  return phaseTargets(activity, ireq, rate, conditions, 3.6, ireq, 'moderate');
}
const headwear = (id: string, headwear_type: string, rcl_clo: number): HeadwearRow => ({
  id, brand: 'Test', model_name: id, headwear_type, rcl_clo,
});
const SKI = headwear('ski-helmet', 'ski_helmet', 0.7);
const BIKE = headwear('bike-helmet', 'bike_helmet', 0.2);
const BEANIE = headwear('beanie', 'midweight_beanie', 0.8);

describe('required helmets', () => {
  const required = [
    ['alpine_skiing', SKI, BIKE],
    ['ski_touring_downhill', SKI, BIKE],
    ['biking', BIKE, SKI],
  ] as const;

  // Hot, mild and deep-cold days alike: thermal demand never removes a helmet.
  it.each(required.flatMap(([activity, right, wrong]) => [30, 10, -25].map(tempC => ({ activity, right, wrong, tempC }))))(
    '$activity wears its own helmet type at $tempC°C', ({ activity, right, wrong, tempC }) => {
      const pool = { handwear: [], headwear: [BEANIE, wrong, right] };
      expect(selectPhaseAccessories(activity, targets(activity, tempC), pool, tempC).headwear.helmet?.id).toBe(right.id);
      // The other sport's helmet never stands in.
      const without = selectPhaseAccessories(activity, targets(activity, tempC), { handwear: [], headwear: [BEANIE, wrong] }, tempC);
      expect(without.headwear.helmet).toBeNull();
    });

  it.each(['running', 'xc_skiing', 'ski_touring_uphill'] as const)('%s neither selects nor requires a helmet', activity => {
    const result = selectPhaseAccessories(activity, targets(activity, -5), { handwear: [], headwear: [SKI, BIKE, BEANIE] }, -5);
    expect(result.headwear.helmet).toBeNull();
    expect(buildHelmetRequirement(activity, null, { usingWardrobe: true, headwearOwned: true })).toBeUndefined();
  });

  it('wears only helmet-compatible head warmth under a helmet', () => {
    const cabinHat = { ...headwear('cabin-hat', 'heavy_beanie', 1.1), helmet_compatible: false };
    const liner = { ...headwear('liner', 'liner_beanie', 0.4), helmet_compatible: true };
    const pick = (activity: ActivityType, items: HeadwearRow[]) =>
      selectPhaseAccessories(activity, targets(activity, -20), { handwear: [], headwear: items }, -20).headwear;
    for (const [activity, helmet] of [['alpine_skiing', SKI], ['biking', BIKE]] as const) {
      expect(pick(activity, [cabinHat, liner, helmet])).toMatchObject({ helmet: { id: helmet.id }, headWarmth: { id: 'liner' } });
      // No head warmth rather than a hat that doesn't fit under the helmet.
      expect(pick(activity, [cabinHat, helmet])).toMatchObject({ helmet: { id: helmet.id }, headWarmth: null });
    }
    // Without a required helmet, including one owned but not required, the hat is a candidate.
    expect(pick('ski_touring_uphill', [cabinHat, SKI])).toMatchObject({ helmet: null, headWarmth: { id: 'cabin-hat' } });
  });

  it('matches an owned helmet as owned and a catalog helmet as a suggestion, never as owned', () => {
    expect(buildHelmetRequirement('biking', BIKE, { usingWardrobe: true, headwearOwned: true })).toEqual({
      requirement: {
        id: 'biking:helmet', region: 'head', kind: 'protection', label: 'Bike helmet', status: 'owned_match',
        matched_garment_id: 'bike-helmet', matched_garment_name: 'Test bike-helmet', matched_is_owned: true,
        message: 'Bike helmet — matched to Test bike-helmet in your wardrobe',
      },
      warnings: [],
    });
    expect(buildHelmetRequirement('alpine_skiing', SKI, { usingWardrobe: false, headwearOwned: false })?.requirement).toMatchObject({
      status: 'generic_suggestion', matched_garment_id: 'ski-helmet', matched_is_owned: false,
    });
  });

  it('reports a missing helmet with a warning and a generic suggestion', () => {
    const wardrobe = buildHelmetRequirement('ski_touring_downhill', null, { usingWardrobe: true, headwearOwned: false });
    expect(wardrobe?.requirement).toEqual({
      id: 'ski_touring_downhill:helmet', region: 'head', kind: 'protection', label: 'Ski helmet', status: 'missing',
      generic_suggestion: { label: 'Ski helmet', generic_estimate: true, owned: false },
      message: 'Ski helmet — required protection in any weather; none in your wardrobe',
    });
    expect(wardrobe?.warnings).toEqual(["No ski helmet in your wardrobe. Wear one in any weather: it's required protection, not optional warmth."]);

    // A catalog without the type yet (bike_helmet before its migration) still reports the gap.
    const catalog = buildHelmetRequirement('biking', null, { usingWardrobe: false, headwearOwned: false });
    expect(catalog?.requirement).toMatchObject({ status: 'missing', message: 'Bike helmet — required protection in any weather; none available to suggest' });
    expect(catalog?.requirement.matched_is_owned).toBeUndefined();
    expect(catalog?.warnings).toHaveLength(1);

    // A selected helmet of the wrong type never satisfies the requirement.
    expect(buildHelmetRequirement('biking', SKI, { usingWardrobe: true, headwearOwned: true })?.requirement.status).toBe('missing');
  });
});
