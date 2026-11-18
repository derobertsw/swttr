import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import catalog from '@/test/fixtures/gear-catalog.json';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { buildRecommendedLayers, evaluationItemsByBodyPart } from '@/lib/layers';
import type { BiophysicsRecommendation, PhaseEvaluationInput } from '@/types/biophysics';
import { POST as evaluate } from '../../ensembles/evaluate/route';
import { POST } from './route';

const state = vi.hoisted(() => ({ userId: null as string | null, client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => state.client }));
vi.mock('@/lib/auth', () => ({ getAuthUserId: async () => state.userId }));

const USER_ID = 'user_cycling';
type Row = Record<string, unknown>;
const own = (type: string, items: Array<{ id: string }>) =>
  items.map(item => ({ user_id: USER_ID, item_type: type, item_id: item.id, disabled: false }));

function useCatalog() {
  state.userId = null;
  state.client = createFakeSupabase({ ...catalog, user_wardrobe: [] });
}

function useWardrobe(garments: Row[]) {
  state.userId = USER_ID;
  state.client = createFakeSupabase({ ...catalog, user_wardrobe: own('garment', garments as Array<{ id: string }>) });
}

async function call<T>(route: (request: NextRequest) => Promise<Response>, body: unknown): Promise<T> {
  const response = await route(new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body) }));
  expect(response.status).toBe(200);
  return response.json();
}

const ride = (temperature: number, wind: number, extra: Row = {}) =>
  call<BiophysicsRecommendation>(POST, { weather: { temperature, wind_speed: wind }, exertion: 'moderate', ...extra });

type Evaluated = { phases: Array<{ decision: { status: string; summary: string; reasons: string[] } }> };

/** The phase input the results screen sends for the worn garments, built the way LayerDisplay builds it. */
function phase(body: BiophysicsRecommendation, garments = body.recommendation.garments): PhaseEvaluationInput {
  const { ireq, recommendation: rec } = body;
  return {
    items: evaluationItemsByBodyPart(buildRecommendedLayers(garments, rec.handwear, rec.headwear)),
    requireStandalone: Boolean(ireq.policy) || ireq.outfit_checks?.require_standalone === true,
    protectionNeeds: ireq.policy?.protection ?? ireq.outfit_checks?.protection,
    breathabilityTarget: body.recommendation.evaluation?.breathabilityTarget,
    targets: { torso: ireq.regional!.neutral.torso, legs: ireq.regional!.neutral.legs, hands: ireq.extremity!.neutral.hands, headNeck: ireq.extremity!.neutral.head },
    minTargets: { torso: ireq.regional!.min.torso, legs: ireq.regional!.min.legs, hands: ireq.extremity!.min.hands, headNeck: ireq.extremity!.min.head },
    arms: { clo: body.recommendation.ensemble_properties.regional_clo!.arms, target: ireq.regional!.neutral.arms, minTarget: ireq.regional!.min.arms },
    targetRange: ireq.target_range,
  };
}

describe('POST /api/v1/recommendations/biking (complete outfits, #371)', () => {
  it('fits torso and legs at 56°F / 8 mph / moderate from the catalog', async () => {
    useCatalog();
    const body = await ride(56, 8);
    const { evaluation, ensemble_properties: clo, garments } = body.recommendation;
    // Before #371: 0.82 clo against 0.26–0.49, with all four body parts over.
    expect(clo.total_clo).toBeGreaterThanOrEqual(body.ireq.target_range[0]);
    expect(clo.total_clo).toBeLessThanOrEqual(body.ireq.target_range[1]);
    expect(evaluation?.bodyParts.torso.status).toBe('in_range');
    expect(evaluation?.bodyParts.legs.status).toBe('in_range');
    expect(garments.some(g => g.category === 'hard_shell')).toBe(false);
    expect(body.ireq.outfit_checks).toEqual({ require_standalone: true, protection: { wind: false, wet: false, poleGrip: false } });
    expect(body.guidance.join(' ')).toMatch(/while riding/);
    // The helmet is required protection (#373); the golden catalog has no bike helmets yet.
    expect(body.requirements?.map(r => r.id)).toEqual(['biking:torso', 'biking:legs', 'biking:hands', 'biking:head', 'biking:helmet']);
  });

  it('shows no over-warm clothing at 65°F when the catalog has nothing light enough, and reports the gaps', async () => {
    useCatalog();
    const body = await ride(65, 4);
    expect(body.recommendation.ensemble_properties.total_clo).toBeLessThanOrEqual(body.ireq.target_range[1]);
    for (const region of ['torso', 'legs'] as const) {
      const requirement = body.requirements!.find(r => r.region === region)!;
      expect(requirement.status).toBe('missing');
      expect(requirement.generic_suggestion).toMatchObject({ generic_estimate: true, owned: false });
    }
    expect(body.recommendation.evaluation?.decision?.summary).toBe('Outfit incomplete');
  });

  it('wears insulation in deep cold from the catalog', async () => {
    useCatalog();
    const body = await ride(-15, 10);
    expect(body.recommendation.garments.some(g => ['insulation_down', 'insulation_synthetic', 'outer_insulated'].includes(g.category))).toBe(true);
    // Before #371: legs at 1.49 against a 2.39 minimum.
    expect(body.recommendation.ensemble_properties.regional_clo!.legs).toBeGreaterThan(1.49);
    expect(body.ireq.outfit_checks?.protection.wind).toBe(true);
  });

  it('keeps manual edits on the same protection and clothing checks', async () => {
    useCatalog();
    const body = await ride(25, 12);
    const { garments } = body.recommendation;
    const windLayer = garments.find(g => g.covers_torso && ['wind_resistant', 'windproof'].includes(g.protection?.windproof_rating ?? ''));
    expect(windLayer).toBeDefined();
    const { phases: [unchanged, noWind] } = await call<Evaluated>(evaluate, {
      phases: [phase(body), phase(body, garments.filter(g => g !== windLayer))],
    });
    const { phases: [noTorso] } = await call<Evaluated>(evaluate, { phases: [phase(body, garments.filter(g => !g.covers_torso))] });
    expect(unchanged.decision).toEqual(body.recommendation.evaluation!.decision);
    expect(noWind.decision.summary).toBe('Protection incomplete');
    expect(noWind.decision.reasons).toContain('Selected torso clothing does not establish the required wind protection.');
    expect(noTorso.decision.status).toBe('incomplete');
  });

  it('matches only owned clothing in a wardrobe and never claims catalog items as owned', async () => {
    const owned = (catalog.garments as Row[]).filter((_, i) => i % 2 === 0);
    useWardrobe(owned);
    for (const [temperature, wind] of [[56, 8], [32, 5], [-15, 10]]) {
      const body = await ride(temperature, wind, { use_wardrobe_only: true });
      const ownedIds = new Set(owned.map(g => g.id));
      expect(body.recommendation.garments.every(g => ownedIds.has(g.id))).toBe(true);
      for (const requirement of body.requirements!.filter(r => r.region === 'torso' || r.region === 'legs')) {
        if (requirement.status === 'owned_match') expect(ownedIds.has(requirement.matched_garment_id!)).toBe(true);
        expect(requirement.status).not.toBe('generic_suggestion');
      }
    }
    useCatalog();
    const fromCatalog = await ride(32, 5);
    expect(fromCatalog.requirements!.some(r => r.status === 'owned_match' || r.matched_is_owned)).toBe(false);
  });
});
