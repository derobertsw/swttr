/**
 * Accessory selection for alpine, cycling and the ski-touring climb and
 * descent (#370): head, neck and hand warmth chosen against each phase's
 * local band, with the required helmet and any worn hood in the head budget.
 */
import { describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import { THERMAL_DISPLAY_CLO_EPSILON } from '@/lib/biophysics/comfort';
import type { ExertionLevel } from '@/lib/biophysics/exertion';
import { alpine } from './sports/alpine';
import { biking } from './sports/biking';
import { skiTouring } from './sports/ski-touring';
import { selectPhaseAccessories } from './extremities';
import { evaluatePhase } from './layer-evaluation';
import type { RecommendationRequest } from './request';
import type { PhaseTargets } from './thermal-targets';
import type { GarmentRow, HandwearRow, HeadwearRow } from './types';

const HANDWEAR = catalog.handwear as unknown as HandwearRow[];
const HEADWEAR = catalog.headwear as unknown as HeadwearRow[];
const CATALOG = { handwear: HANDWEAR, headwear: HEADWEAR };
// The golden tests' wardrobe: every third catalog accessory.
const WARDROBE = { handwear: HANDWEAR.filter((_, i) => i % 3 === 0), headwear: HEADWEAR.filter((_, i) => i % 3 === 0) };

const PHASES = {
  alpine: 'alpine_skiing', cycling: 'biking', climb: 'ski_touring_uphill', descent: 'ski_touring_downhill',
} as const;
type Phase = keyof typeof PHASES;
const ALL_PHASES = Object.keys(PHASES) as Phase[];
const HELMET_PHASES: Phase[] = ['alpine', 'descent'];

const f2c = (f: number) => (f - 32) * 5 / 9;
const mph = (v: number) => v * 0.44704;
const EPS = THERMAL_DISPLAY_CLO_EPSILON;

interface Conditions { tempF: number; windMph: number; exertion?: ExertionLevel; humidity?: number }

const targetCache = new Map<string, PhaseTargets>();

/** The phase targets the sport's route computes for these conditions. */
function targetsFor(phase: Phase, conditions: Conditions): PhaseTargets {
  const key = JSON.stringify([phase, conditions]);
  if (!targetCache.has(key)) targetCache.set(key, computeTargets(phase, conditions));
  return targetCache.get(key)!;
}

function computeTargets(phase: Phase, { tempF, windMph, exertion = 'moderate', humidity = 50 }: Conditions): PhaseTargets {
  const request = {
    tempC: f2c(tempF), windMs: mph(windMph), humidity, exertion, bodyMetrics: DEFAULT_BODY_METRICS,
    precipitation: false, weather: { temperature: tempF, wind_speed: windMph },
  } as unknown as RecommendationRequest;
  if (phase === 'alpine') return alpine.computeTargets(request);
  if (phase === 'cycling') return biking.computeTargets(request);
  const touring = skiTouring.computeTargets(request);
  return phase === 'climb' ? touring.uphill : touring.downhill;
}

function select(phase: Phase, conditions: Conditions, pool: Parameters<typeof selectPhaseAccessories>[2] = CATALOG,
  ensemble: GarmentRow[] = [], options?: Parameters<typeof selectPhaseAccessories>[5]) {
  const targets = targetsFor(phase, conditions);
  return { targets, ...selectPhaseAccessories(PHASES[phase], targets, pool, f2c(conditions.tempF), ensemble, options) };
}

const hood = (hood_type: string) => ({ hood_type }) as GarmentRow;
const glove = (id: string, clo: number, extra: Partial<HandwearRow> = {}): HandwearRow => ({
  id, rcl_clo: clo, brand: 'Test', model_name: id, handwear_type: 'insulated_glove', dexterity_score: 6, ...extra,
});
const hat = (id: string, clo: number, extra: Partial<HeadwearRow> = {}): HeadwearRow => ({
  id, rcl_clo: clo, brand: 'Test', model_name: id, headwear_type: 'midweight_beanie', ...extra,
});
const worn = (selection: ReturnType<typeof select>) => [selection.headwear.helmet, selection.headwear.headWarmth, selection.headwear.neckWarmth]
  .flatMap(item => item ? [item.rcl_clo] : []);

/** The manual check (/api/v1/ensembles/evaluate) of the same accessories, sent the selection's limits. */
function manualCheck(selection: ReturnType<typeof select>, hands: number[], headNeck: number[], hoodClo = 0) {
  const { targets, extremityMax } = selection;
  return evaluatePhase({
    itemClo: { torso: [], legs: [], hands, headNeck },
    hoodClo,
    targets: { hands: targets.extremity.neutral.hands, headNeck: targets.extremity.neutral.head },
    minTargets: { hands: targets.extremity.min.hands, headNeck: targets.extremity.min.head },
    extremityMaxTargets: { hands: extremityMax.hands, headNeck: extremityMax.head },
    targetRange: targets.targetRange,
  }).bodyParts;
}

describe('the #370 reproductions', () => {
  it('alpine, 25°F, 12 mph: counts the helmet and hood and stays within the head band', () => {
    // Before: helmet, hood, a 1.5 clo balaclava and a 0.9 clo neck piece, 3.75 clo against 2.29.
    const selection = select('alpine', { tempF: 25, windMph: 12, humidity: 60 }, CATALOG, [hood('helmet_compatible')]);
    const { head, hands } = selection.assessments;
    expect(selection.headwear.helmet).not.toBeNull();
    expect(head.clo).toBeCloseTo(0.5 + worn(selection).reduce((a, b) => a + b, 0), 10);
    expect(head).toMatchObject({ state: 'selected', thermal_status: 'in_range' });
    expect(head.clo).toBeLessThanOrEqual(selection.targets.extremity.neutral.head + EPS);
    expect(hands).toMatchObject({ state: 'selected', thermal_status: 'in_range' });
  });

  it('cycling, 32°F, 5 mph: no balaclava against a ~0.55 clo head target', () => {
    const selection = select('cycling', { tempF: 32, windMph: 5 });
    expect(selection.targets.extremity.neutral.head).toBeLessThan(0.6);
    expect(selection.headwear.headWarmth?.headwear_type).not.toMatch(/^balaclava/);
    expect(selection.assessments.head.thermal_status).toBe('in_range');
    expect(selection.assessments.hands.thermal_status).toBe('in_range');
  });

  it('cycling, 36°F rain: no hat over a jacket hood when the lightest hat would overshoot more than the hood falls short', () => {
    const conditions = { tempF: 36, windMph: 8, humidity: 95 };
    const bareHeaded = select('cycling', conditions);
    expect(bareHeaded.assessments.head.thermal_status).toBe('in_range');
    const hooded = select('cycling', conditions, CATALOG, [hood('attached')]);
    expect(hooded.headwear.headWarmth).toBeNull();
    expect(hooded.assessments.head.clo).toBe(0.4);
  });

  it('touring climb, 25°F, 12 mph: two hoods already meet the head target, so nothing is added', () => {
    // Before: a balaclava, a neck piece and two hoods, 3.2 clo against 0.85.
    const selection = select('climb', { tempF: 25, windMph: 12 }, CATALOG, [hood('attached'), hood('attached')]);
    expect(selection.headwear).toEqual({ helmet: null, headWarmth: null, neckWarmth: null });
    expect(selection.assessments.head).toMatchObject({ clo: 0.8, thermal_status: 'in_range', state: 'not_needed' });
    expect(selection.assessments.head.message).toBe('head: no additional thermal coverage needed.');
  });

  it('touring descent, −15°F, 10 mph: the warmest rated mitten bounds the choice and the shortfall is reported', () => {
    const selection = select('descent', { tempF: -15, windMph: 10 }, CATALOG, [hood('helmet_compatible')]);
    const { hands, head } = selection.assessments;
    expect(selection.targets.extremity.min.hands).toBeGreaterThan(5);
    const warmest = Math.max(...HANDWEAR.map(item => item.rcl_clo));
    expect(selection.handwear?.rcl_clo).toBe(warmest);
    expect(hands).toMatchObject({ state: 'missing', thermal_status: 'under', clo: warmest });
    expect(hands.message).toContain('closest available option still falls short');
    expect(selection.headwear.helmet).not.toBeNull();
    expect(head).toMatchObject({ state: 'missing', thermal_status: 'under' });
    expect(selection.warnings).toEqual(expect.arrayContaining([hands.message, head.message]));
    // The limits aren't lowered to hide the gap: the manual check agrees it is short.
    expect(manualCheck(selection, [hands.clo], worn(selection), 0.5).hands.status).toBe('under');
  });

  it('touring descent, 45°F easy: a glove within the band, not the −25°C glove the old rule chose', () => {
    const selection = select('descent', { tempF: 45, windMph: 4, exertion: 'easy' });
    expect(selection.assessments.hands.thermal_status).toBe('in_range');
    expect(selection.handwear!.min_temp_active!).toBeGreaterThan(-25);
  });
});

describe.each(ALL_PHASES)('%s keeps its own policy', phase => {
  const helmet = HELMET_PHASES.includes(phase);

  it.each([
    ['mild', { tempF: 50, windMph: 5 }],
    ['freezing', { tempF: 32, windMph: 8 }],
  ] as const)('%s: gloves stay on and hands and head are within the band', (_, conditions) => {
    const selection = select(phase, conditions);
    expect(selection.handwear).not.toBeNull();
    expect(selection.headwear.helmet !== null).toBe(helmet);
    expect(selection.assessments.hands.thermal_status).toBe('in_range');
    expect(selection.assessments.head.thermal_status).toBe('in_range');
    expect(selection.warnings).toEqual([]);
  });

  it('deep cold: wears rated gear and reports what is still short', () => {
    const tempF = -15;
    const selection = select(phase, { tempF, windMph: 10 });
    expect(selection.handwear).not.toBeNull();
    expect(selection.headwear.helmet !== null).toBe(helmet);
    expect(selection.headwear.headWarmth).not.toBeNull();
    for (const part of ['hands', 'head'] as const) {
      const assessment = selection.assessments[part];
      if (assessment.thermal_status === 'under') {
        expect(assessment.state).toBe('missing');
        expect(selection.warnings).toContain(assessment.message);
      } else {
        expect(assessment.thermal_status).toBe('in_range');
      }
    }
    // Worn items are rated for the cold whenever rated gear is available.
    expect(selection.warnings.join(' ')).not.toContain("isn't rated");
  });

  it('the recommendation and a manual check use the same limits', () => {
    for (const conditions of [{ tempF: 56, windMph: 8 }, { tempF: 25, windMph: 12 }, { tempF: 5, windMph: 20, exertion: 'hard' as const }, { tempF: -15, windMph: 10 }]) {
      for (const pool of [CATALOG, WARDROBE]) {
        const ensemble = [hood(helmet ? 'helmet_compatible' : 'attached')];
        const selection = select(phase, conditions, pool, ensemble);
        const hoodClo = helmet ? 0.5 : 0.4;
        const manual = manualCheck(selection, selection.handwear ? [selection.handwear.rcl_clo] : [], worn(selection), hoodClo);
        expect(manual.hands.status).toBe(selection.assessments.hands.thermal_status);
        expect(manual.headNeck.status).toBe(selection.assessments.head.thermal_status);
      }
    }
  });
});

describe('gloves stay on outside running and XC', () => {
  it.each(ALL_PHASES)('%s: a thin glove is within the band even when warm air asks for almost nothing', phase => {
    const selection = select(phase, { tempF: 65, windMph: 4 });
    expect(selection.handwear).not.toBeNull();
    expect(selection.extremityMax.hands).toBeGreaterThanOrEqual(0.55);
    expect(selection.assessments.hands.thermal_status).toBe('in_range');
  });

  it('keeps the only owned pair when it is warmer than the band, and says so', () => {
    const selection = select('cycling', { tempF: 65, windMph: 4 }, { handwear: [glove('ski-glove', 2.1)], headwear: [] });
    expect(selection.handwear?.id).toBe('ski-glove');
    expect(selection.assessments.hands).toMatchObject({ state: 'selected', thermal_status: 'over' });
    expect(selection.assessments.hands.message).toContain('gloves stay on');
    expect(selection.warnings).toContain(selection.assessments.hands.message);
  });

  it.each(ALL_PHASES)('%s: with no gloves at all, they are reported missing even when the band asks for no hand warmth', phase => {
    const base = targetsFor(phase, { tempF: 75, windMph: 4 });
    // These phases keep some hand demand in warm air; the rule holds at zero too.
    const targets: PhaseTargets = { ...base, extremity: { ...base.extremity, min: { ...base.extremity.min, hands: 0 } } };
    const selection = selectPhaseAccessories(PHASES[phase], targets, { handwear: [], headwear: [] }, f2c(75));
    expect(selection.handwear).toBeNull();
    // A protection gap, not a thermal one.
    expect(selection.assessments.hands).toMatchObject({ state: 'missing', thermal_status: 'in_range', clo: 0 });
    expect(selection.assessments.hands.message).toContain('no gloves available, and gloves stay on');
    expect(selection.warnings).toContain(selection.assessments.hands.message);
  });

  it('the descent keeps the climb pair when it fits the descent band', () => {
    const conditions = { tempF: 56, windMph: 8 };
    const descent = targetsFor('descent', conditions).extremity;
    const fits = glove('climb-pair', descent.neutral.hands, { windproof: false });
    const lighter = glove('lighter', descent.min.hands, { windproof: true });
    const pool = { handwear: [lighter, fits], headwear: [] };
    expect(select('descent', conditions, pool).handwear?.id).toBe('lighter');
    expect(select('descent', conditions, pool, [], { preferHandwearId: 'climb-pair' }).handwear?.id).toBe('climb-pair');
  });
});

describe('required helmets', () => {
  const helmet = hat('helmet', 0.85, { headwear_type: 'ski_helmet' });

  it.each(HELMET_PHASES)('%s: a helmet warmer than a mild head band is still worn, and not judged as overheating', phase => {
    const selection = select(phase, { tempF: 65, windMph: 4 }, { handwear: [], headwear: [helmet, hat('beanie', 0.5)] });
    expect(selection.targets.extremity.neutral.head).toBeLessThan(0.85);
    expect(selection.headwear).toEqual({ helmet, headWarmth: null, neckWarmth: null });
    expect(selection.extremityMax.head).toBe(0.85);
    expect(selection.assessments.head).toMatchObject({ thermal_status: 'in_range', clo: 0.85 });
    expect(manualCheck(selection, [], [0.85]).headNeck.status).toBe('in_range');
  });

  it('only a helmet-compatible hood counts under the helmet, and a vented hood is advised when it overshoots', () => {
    const conditions = { tempF: 65, windMph: 4 };
    const pool = { handwear: [], headwear: [helmet] };
    expect(select('alpine', conditions, pool, [hood('attached')]).assessments.head.clo).toBe(0.85);
    const compatible = select('alpine', conditions, pool, [hood('helmet_compatible')]);
    expect(compatible.assessments.head).toMatchObject({ clo: 1.35, thermal_status: 'over' });
    expect(compatible.assessments.head.message).toContain('vent the hood');
  });

  it('a neck piece may complete a helmeted head, which needs no hat underneath', () => {
    const conditions = { tempF: 45, windMph: 4, exertion: 'easy' as const };
    const band = targetsFor('alpine', conditions).extremity;
    expect(band.min.head).toBeGreaterThan(0.85 + EPS);
    const gaiter = hat('gaiter', Math.round(((band.min.head + band.neutral.head) / 2 - 0.85) * 100) / 100, { headwear_type: 'buff_heavy' });
    const selection = select('alpine', conditions, { handwear: [], headwear: [helmet, gaiter] });
    expect(selection.headwear).toEqual({ helmet, headWarmth: null, neckWarmth: gaiter });
    expect(selection.assessments.head.thermal_status).toBe('in_range');
  });

  it('a neck piece goes over a balaclava only when nothing else reaches the head band', () => {
    const balaclava = hat('balaclava', 1.5, { headwear_type: 'balaclava_heavy', covers_neck: true });
    const mask = hat('mask', 0.9, { headwear_type: 'facemask', covers_neck: true });
    const pool = { handwear: [], headwear: [helmet, balaclava, mask] };
    // 5°F, 20 mph: helmet + balaclava (2.35) is short of the descent band; the mask over it reaches it.
    const cold = select('descent', { tempF: 5, windMph: 20, exertion: 'hard' }, pool);
    expect(cold.targets.extremity.min.head).toBeGreaterThan(2.35 + EPS);
    expect(cold.headwear).toEqual({ helmet, headWarmth: balaclava, neckWarmth: mask });
    // 32°F: the balaclava alone overshoots less than layering, so no mask goes over it.
    const freezing = select('descent', { tempF: 32, windMph: 5 }, pool);
    expect(freezing.headwear.neckWarmth?.id === 'mask' && freezing.headwear.headWarmth?.id === 'balaclava').toBe(false);
  });

  it('in deep cold, a required hat can take a neck piece over a balaclava when the helmet plus neck piece alone would reach the band', () => {
    const conditions = { tempF: -4, windMph: 10 };
    const base = targetsFor('descent', conditions);
    const band = (head: number) => ({ ...base.extremity.neutral, head });
    const targets: PhaseTargets = { ...base, extremity: { ...base.extremity, min: band(1.5), neutral: band(1.9), max: band(2.3) } };
    const balaclava = hat('balaclava', 0.5, { headwear_type: 'balaclava_light', covers_neck: true, min_temp_static: -30 });
    const neck = hat('neck', 0.9, { headwear_type: 'buff_heavy', min_temp_static: -30 });
    // A lighter hat that isn't rated for −20°C makes this deep cold, so the head needs a hat.
    const lightHat = hat('light-hat', 0.3, { headwear_type: 'liner_beanie', min_temp_static: 10 });
    const selection = selectPhaseAccessories('ski_touring_downhill', targets,
      { handwear: [], headwear: [helmet, balaclava, neck, lightHat] }, f2c(conditions.tempF));
    expect(selection.headwear).toEqual({ helmet, headWarmth: balaclava, neckWarmth: neck });
    expect(selection.assessments.head).toMatchObject({ clo: 2.25, thermal_status: 'in_range' });
  });

  it.each(['cycling', 'climb'] as const)('%s never selects a helmet from the thermal budget', phase => {
    expect(select(phase, { tempF: 25, windMph: 12 }).headwear.helmet).toBeNull();
  });
});

describe('no temperature switch', () => {
  // Hold the helmet fixed: which helmet is selected is #373's. Catalog
  // ratings are removed here so only the bands move; ratings are covered by
  // the deep-cold cases.
  const unrated = <T extends HandwearRow | HeadwearRow>(items: T[]) => items.map(item => ({ ...item, min_temp_active: undefined, min_temp_static: undefined }));
  const oneHelmet = (items: HeadwearRow[]) => items.filter(item => item.headwear_type !== 'ski_helmet' || item.id === items.find(h => h.headwear_type === 'ski_helmet')!.id);
  const pools = {
    catalog: { handwear: unrated(HANDWEAR), headwear: oneHelmet(unrated(HEADWEAR)) },
    wardrobe: { handwear: unrated(WARDROBE.handwear), headwear: oneHelmet(unrated(HEADWEAR)).filter((_, i) => i % 3 === 0) },
  };
  const rising = (before: PhaseTargets['extremity'], after: PhaseTargets['extremity'], part: 'hands' | 'head') =>
    after.min[part] >= before.min[part] && after.neutral[part] >= before.neutral[part];

  function expectMonotonic(phase: Phase, steps: Conditions[], pool: typeof pools.catalog, ensemble: GarmentRow[]) {
    let previous: ReturnType<typeof select> | undefined;
    for (const conditions of steps) {
      const current = select(phase, conditions, pool, ensemble);
      if (previous) {
        const where = `${phase} at ${conditions.tempF}°F, ${conditions.windMph} mph`;
        if (rising(previous.targets.extremity, current.targets.extremity, 'hands')) {
          expect(current.handwear?.rcl_clo ?? 0, where).toBeGreaterThanOrEqual(previous.handwear?.rcl_clo ?? 0);
        }
        if (rising(previous.targets.extremity, current.targets.extremity, 'head')) {
          expect(current.assessments.head.clo, where).toBeGreaterThanOrEqual(previous.assessments.head.clo - 1e-9);
        }
      }
      previous = current;
    }
  }

  it.each(ALL_PHASES)('%s: colder air never selects lighter accessories', phase => {
    for (const [name, pool] of Object.entries(pools)) {
      for (const ensemble of [[], [hood(HELMET_PHASES.includes(phase) ? 'helmet_compatible' : 'attached')]]) {
        for (const exertion of ['easy', 'moderate', 'hard'] as const) {
          for (const windMph of [0, 12]) {
            const steps = Array.from({ length: 34 }, (_, i) => ({ tempF: 65 - i * 3, windMph, exertion }));
            expect(() => expectMonotonic(phase, steps, pool, ensemble), name).not.toThrow();
          }
        }
      }
    }
  });

  it.each(ALL_PHASES)('%s: windier air never selects lighter accessories', phase => {
    for (const pool of Object.values(pools)) {
      for (const tempF of [50, 32, 14, -4]) {
        const steps = Array.from({ length: 13 }, (_, i) => ({ tempF, windMph: i * 2 }));
        expectMonotonic(phase, steps, pool, []);
      }
    }
  });
});

describe('sparse wardrobes and unknown accessory data', () => {
  it.each(ALL_PHASES)('%s: with nothing owned, cold hands and head are reported missing', phase => {
    const selection = select(phase, { tempF: 25, windMph: 12 }, { handwear: [], headwear: [] });
    expect(selection.handwear).toBeNull();
    expect(selection.headwear).toEqual({ helmet: null, headWarmth: null, neckWarmth: null });
    expect(selection.assessments.hands).toMatchObject({ state: 'missing', thermal_status: 'under' });
    expect(selection.assessments.head).toMatchObject({ state: 'missing', thermal_status: 'under' });
  });

  it.each(ALL_PHASES)('%s: unknown availability or insulation is reported unknown, never selected', phase => {
    const conditions = { tempF: 25, windMph: 12 };
    expect(select(phase, conditions, { handwear: [], headwear: [], availability: 'unknown' }).assessments.hands.state).toBe('unknown');
    const unknown = select(phase, conditions, {
      handwear: [glove('mystery', null as unknown as number)], headwear: [hat('mystery-hat', Number.NaN)],
    });
    expect(unknown.handwear).toBeNull();
    expect(unknown.headwear.headWarmth).toBeNull();
    expect(unknown.assessments.hands.state).toBe('unknown');
    expect(unknown.assessments.head.state).toBe('unknown');
  });

  it('a helmet with unknown insulation is worn, and the head is reported unknown', () => {
    const helmet = hat('helmet', null as unknown as number, { headwear_type: 'ski_helmet' });
    const selection = select('alpine', { tempF: 45, windMph: 4 }, { handwear: [], headwear: [helmet, hat('beanie', 0.7)] });
    expect(selection.headwear.helmet?.id).toBe('helmet');
    expect(selection.assessments.head.state).toBe('unknown');
  });

  it('the golden wardrobe still finds in-band gear for alpine at 25°F', () => {
    const selection = select('alpine', { tempF: 25, windMph: 12, humidity: 60 }, WARDROBE, [hood('helmet_compatible')]);
    expect(selection.headwear.helmet).not.toBeNull();
    expect(selection.assessments.head.thermal_status).toBe('in_range');
  });
});
