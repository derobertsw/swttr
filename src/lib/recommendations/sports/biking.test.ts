import { describe, expect, it } from 'vitest';
import catalog from '@/test/fixtures/gear-catalog.json';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { DEFAULT_BODY_METRICS } from '@/lib/biophysics/bodyMetrics';
import { fahrenheitToCelsius, mphToMs } from '@/lib/biophysics/ireq';
import type { ExertionLevel } from '@/lib/biophysics/exertion';
import { categorizeGarments } from '../categorization';
import { ensembleToThermalGarments } from '../formatting';
import { buildClothingRequirements } from '../requirements';
import type { RecommendationRequest } from '../request';
import type { GarmentRow } from '../types';
import { biking } from './biking';
import { buildCyclingEnsemble, cyclingProtection } from './cycling-outfit';
import { runningBasic, runningProtection, runningProtectionWarnings, runningRegionMatches } from './running-outfit';

// The catalog as the gear pool loads it for cycling: running-only basics are excluded.
const garments = (catalog.garments as GarmentRow[])
  .filter(g => !g.suitable_activities?.length || g.suitable_activities.includes('biking'));
const named = (model: string) => garments.find(g => g.model_name === model)!;
// The running archetypes, offered to cycling only where a test says so.
const generic = (type: string): GarmentRow => ({
  ...(catalog.garments as GarmentRow[]).find(g => g.brand === 'SWTTR' && g.garment_type === type)!,
  suitable_activities: ['running', 'biking'],
});
const tee = generic('top_short_sleeve');
const shorts = generic('shorts');
const tights = generic('pants');

const MIN_EVAP = 0.25;

function request(temperature: number, windMph: number, exertion: ExertionLevel = 'moderate', precipitation = false): RecommendationRequest {
  return {
    supabase: null as unknown as RecommendationRequest['supabase'], userId: null,
    weather: { temperature, wind_speed: windMph, precipitation },
    tempC: fahrenheitToCelsius(temperature), windMs: mphToMs(windMph),
    humidity: precipitation ? 95 : 50, precipitation, exertion, bodyMetrics: DEFAULT_BODY_METRICS,
    useWardrobeOnly: false, prioritizeLightPack: false,
  };
}

const targetsFor = (...args: Parameters<typeof request>) => biking.computeTargets(request(...args));
type Targets = ReturnType<typeof targetsFor>;

function select(t: Targets, pool: GarmentRow[] = garments) {
  return buildCyclingEnsemble(categorizeGarments(pool), t, MIN_EVAP, t.protection!);
}

const regional = (outfit: GarmentRow[]) => {
  const { rcl } = predictEnsembleThermal(ensembleToThermalGarments(outfit));
  return { torso: rcl.torso, arms: rcl.arm, legs: rcl.leg, whole: rcl.wholeBody };
};

/** Never warmer-or-equal in every region and warmer in one. */
function addsInsulation(warmer: GarmentRow[], colder: GarmentRow[]): boolean {
  const w = regional(warmer), c = regional(colder);
  const parts = ['torso', 'arms', 'legs'] as const;
  return parts.every(p => w[p] >= c[p] - 1e-9) && parts.some(p => w[p] > c[p] + 1e-9);
}

describe('cycling protection policy', () => {
  it.each([
    { temperature: 56, wind: 8, precipitation: false, expected: { wind: false, wet: false } },
    { temperature: 32, wind: 4, precipitation: false, expected: { wind: true, wet: false } },
    { temperature: 45, wind: 20, precipitation: false, expected: { wind: true, wet: false } },
    { temperature: 36, wind: 8, precipitation: true, expected: { wind: false, wet: true } },
  ])('asks for wind at or below freezing or in winds over 8 m/s, and rain protection in precipitation: $temperature°F, $wind mph', ({ temperature, wind, precipitation, expected }) => {
    expect(cyclingProtection(request(temperature, wind, 'moderate', precipitation))).toEqual({ ...expected, poleGrip: false });
  });

  it('does not depend on effort', () => {
    for (const exertion of ['easy', 'moderate', 'hard'] as const) {
      expect(targetsFor(32, 4, exertion).protection).toEqual({ wind: true, wet: false, poleGrip: false });
    }
  });
});

describe('complete cycling outfits', () => {
  it('fits the 56°F / 8 mph / moderate reproduction without a mandatory base or a wind shell', () => {
    const t = targetsFor(56, 8);
    const outfit = select(t);
    const clo = regional(outfit);
    // Before #371: base top, base tights, wind jacket and soft-shell joggers at 0.82 clo.
    expect(clo.whole).toBeGreaterThanOrEqual(t.targetRange[0]);
    expect(clo.whole).toBeLessThanOrEqual(t.targetRange[1]);
    // Within the shared 0.05 clo local tolerance: since #374 and #375 the
    // legs' upper limit is the whole-body one (0.46), and the tights give 0.48.
    expect(clo.torso).toBeLessThanOrEqual(t.regional.neutral.torso + 0.05);
    expect(clo.legs).toBeLessThanOrEqual(t.regional.neutral.legs + 0.05);
    expect(outfit.filter(g => g.covers_torso)).toHaveLength(1);
    expect(outfit.filter(g => g.covers_legs)).toHaveLength(1);
    expect(outfit.some(g => g.category === 'hard_shell')).toBe(false);
    expect(runningRegionMatches(outfit, t, 'legs', t.protection)).toBe(true);
  });

  it('selects a jersey and shorts at 65°F when they are available, and nothing too warm when they are not', () => {
    const t = targetsFor(65, 4);
    const withBasics = select(t, [...garments, tee, shorts, tights]);
    expect(withBasics.map(g => g.id).sort()).toEqual([tee.id, shorts.id].sort());
    const clo = regional(withBasics);
    expect(clo.whole).toBeGreaterThanOrEqual(t.targetRange[0] - 0.05);
    expect(clo.whole).toBeLessThanOrEqual(t.targetRange[1]);
    expect(runningRegionMatches(withBasics, t, 'legs', t.protection)).toBe(true);
    // With tapered margins (#374) bare forearms sit within the arm band's tolerance.
    expect(clo.arms).toBeGreaterThanOrEqual(t.regional.min.arms - 0.05);

    // Before #371 the same outfit as at 56°F: 0.82 clo against 0.07–0.21.
    const catalogOnly = select(t);
    expect(regional(catalogOnly).whole).toBeLessThanOrEqual(t.targetRange[1]);
    const requirements = buildClothingRequirements('biking', t, {
      garments, selectedGarments: catalogOnly, handwear: [], headwear: [],
      ownership: { garments: false, handwear: false, headwear: false }, functional: { protection: t.protection },
    });
    // Riding speed (#374) puts a lightweight long-sleeve top inside the torso band.
    expect(requirements.filter(r => r.region === 'torso' || r.region === 'legs')).toEqual([
      expect.objectContaining({ id: 'biking:torso', status: 'generic_suggestion' }),
      expect.objectContaining({ id: 'biking:legs', label: 'Cycling shorts', status: 'missing' }),
    ]);
  });

  it('wears wind protection at freezing and counts its warmth in the fit', () => {
    const t = targetsFor(32, 5);
    const outfit = select(t);
    for (const region of ['torso', 'legs'] as const) {
      expect(runningProtection(outfit, region, t.protection!)).toBe(true);
      expect(runningBasic(outfit, region)).toBeDefined();
    }
    // The protective layer is part of the regional fit, not an extra shell on top.
    const clo = regional(outfit);
    expect(clo.torso).toBeLessThanOrEqual(t.regional.neutral.torso + 0.15);
    expect(clo.legs).toBeLessThanOrEqual(t.regional.neutral.legs + 0.15);
    expect(clo.whole).toBeLessThanOrEqual(t.targetRange[1]);
    expect(outfit.filter(g => ['soft_shell', 'hard_shell', 'windbreaker'].includes(g.category) && g.covers_torso)).toHaveLength(1);
  });

  it('keeps strong-wind protection in mild weather', () => {
    const t = targetsFor(50, 22);
    expect(t.protection?.wind).toBe(true);
    const outfit = select(t);
    expect(runningProtection(outfit, 'torso', t.protection!)).toBe(true);
    expect(runningProtection(outfit, 'legs', t.protection!)).toBe(true);
  });

  it('wears rain protection in near-freezing rain and reports legs it cannot protect', () => {
    const t = targetsFor(36, 8, 'moderate', true);
    const outfit = select(t);
    expect(runningProtection(outfit, 'torso', t.protection!)).toBe(true);
    expect(outfit.some(g => g.covers_torso && g.garment_protection?.waterproof_rating === 'waterproof')).toBe(true);
    // The catalog's rain pants are unreviewed, so nothing standalone protects the legs.
    expect(runningProtection(outfit, 'legs', t.protection!)).toBe(false);
    expect(runningProtectionWarnings(outfit, t, t.protection)).toEqual(['Available clothing does not provide the required wet protection for legs.']);

    const rainPants = { ...named('Sentinel Gore-Tex Pant'), id: 'rain-pants', usage: 'standalone' as const, coverage_torso: 0, coverage_arms: 0, coverage_legs: 1 };
    const protectedOutfit = select(t, [...garments, rainPants]);
    expect(runningProtection(protectedOutfit, 'legs', t.protection!)).toBe(true);
  });

  it('uses insulation pieces in deep cold, and does more for the legs than before', () => {
    const t = targetsFor(-15, 10);
    const outfit = select(t);
    expect(outfit.some(g => ['insulation_down', 'insulation_synthetic', 'outer_insulated'].includes(g.category))).toBe(true);
    const clo = regional(outfit);
    // Before #371: 1.56 clo with legs at 1.49 against 1.93–2.43 and a 2.39 leg minimum.
    expect(clo.whole).toBeGreaterThanOrEqual(t.targetRange[0]);
    expect(clo.legs).toBeGreaterThan(1.49);
    expect(clo.torso).toBeGreaterThanOrEqual(t.regional.min.torso - 0.05);
    expect(clo.torso).toBeLessThanOrEqual(t.regional.neutral.torso + 0.15);
  });

  it('wears one garment per layer slot in each region and no ski bibs', () => {
    for (const [temperature, wind] of [[56, 8], [32, 5], [25, 12], [5, 20], [-15, 10]]) {
      const outfit = select(targetsFor(temperature, wind));
      expect(new Set(outfit.map(g => g.id)).size).toBe(outfit.length);
      expect(outfit.some(g => g.garment_type === 'bib')).toBe(false);
      for (const region of ['torso', 'legs'] as const) {
        const layers = outfit.filter(g => g[`covers_${region}`]);
        const slot = (g: GarmentRow) => g.category === 'base_layer' ? 0
          : ['soft_shell', 'hard_shell', 'windbreaker', 'outer_insulated'].includes(g.category) ? 2 : 1;
        expect(new Set(layers.map(slot)).size).toBe(layers.length);
      }
    }
  });

  it('reports gaps instead of wearing heavy thermal underwear alone', () => {
    const t = targetsFor(56, 8);
    const heavy = [named('Capilene Thermal Weight Boot-Length Bottoms'), named('Capilene Midweight Bottoms')];
    const outfit = select(t, heavy);
    expect(outfit).toEqual([]);
    const requirements = buildClothingRequirements('biking', t, {
      garments: heavy, selectedGarments: outfit, handwear: [], headwear: [],
      ownership: { garments: true, handwear: true, headwear: true }, functional: { protection: t.protection },
    });
    for (const region of ['torso', 'legs'] as const) {
      const requirement = requirements.find(r => r.region === region)!;
      expect(requirement.status).toBe('missing');
      expect(requirement.matched_garment_id).toBeUndefined();
      expect(requirement.message).toContain('no matching item in your wardrobe');
    }
  });

  it('wears what a sparse wardrobe has and names the remaining gap', () => {
    const t = targetsFor(45, 4, 'hard');
    const top = named('Capilene Cool Lightweight');
    const outfit = select(t, [top]);
    expect(outfit).toEqual([top]);
    const requirements = buildClothingRequirements('biking', t, {
      garments: [top], selectedGarments: outfit, handwear: [], headwear: [],
      ownership: { garments: true, handwear: false, headwear: false }, functional: { protection: t.protection },
    });
    expect(requirements.find(r => r.region === 'torso')).toMatchObject({ status: 'owned_match', matched_garment_id: top.id, matched_is_owned: true });
    expect(requirements.find(r => r.region === 'legs')).toMatchObject({ status: 'missing', label: 'Cycling tights or pants' });
  });

  it('labels requirements with the protection the policy asks for', () => {
    const requirements = (t: Targets) => buildClothingRequirements('biking', t, {
      garments: [], handwear: [], headwear: [],
      ownership: { garments: false, handwear: false, headwear: false }, functional: { protection: t.protection },
    }).filter(r => r.region === 'torso' || r.region === 'legs').map(r => r.label);
    expect(requirements(targetsFor(25, 12))).toEqual([
      'Breathable long-sleeve cycling top with insulation as needed with wind protection',
      'Cycling tights or pants with wind protection',
    ]);
    expect(requirements(targetsFor(36, 8, 'moderate', true)).every(label => label.endsWith('with rain protection'))).toBe(true);
  });
});

describe('cycling outfits under warmer weather and harder effort (dry)', () => {
  it.each([2, 8, 15, 25])('never add insulation as the temperature rises, in %i mph wind', wind => {
    const outfits = Array.from({ length: 46 }, (_, i) => 70 - i * 2).map(temperature => select(targetsFor(temperature, wind)));
    for (let i = 0; i < outfits.length; i++) {
      for (let j = i + 1; j < outfits.length; j++) expect(addsInsulation(outfits[i], outfits[j])).toBe(false);
    }
  });

  it.each([65, 56, 45, 32, 25, 5, -15])('never add insulation for a harder effort at %i°F', temperature => {
    const [easy, moderate, hard] = (['easy', 'moderate', 'hard'] as const).map(e => select(targetsFor(temperature, 8, e)));
    for (const [lighter, heavier] of [[moderate, easy], [hard, moderate], [hard, easy]]) {
      const l = regional(lighter), h = regional(heavier);
      for (const part of ['torso', 'arms', 'legs', 'whole'] as const) expect(l[part]).toBeLessThanOrEqual(h[part] + 1e-9);
    }
  });
});
