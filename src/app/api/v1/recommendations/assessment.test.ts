import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import catalog from '@/test/fixtures/gear-catalog.json';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { POST as alpine } from './alpine/route';
import { POST as running } from './running/route';
import { POST as biking } from './biking/route';
import { POST as xc } from './xc/route';
import { POST as touring } from './ski-touring/route';
import { POST as evaluate } from '../ensembles/evaluate/route';
import { buildRecommendedLayers, buildDescentLayers, evaluationItemsByBodyPart } from '@/lib/layers';
import type { BiophysicsRecommendation, PhaseEvaluationInput } from '@/types/biophysics';

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => state.client }));
vi.mock('@/lib/auth', () => ({ getAuthUserId: async () => null }));
beforeEach(() => { state.client = createFakeSupabase(catalog); });
const call = async (route: typeof evaluate, body: unknown) => {
  const response = await route(new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body) }));
  expect(response.status).toBe(200);
  return response.json();
};

function phase(body: BiophysicsRecommendation): PhaseEvaluationInput {
  const { ireq, recommendation: rec } = body;
  return {
    items: evaluationItemsByBodyPart(buildRecommendedLayers(rec.garments, rec.handwear, rec.headwear)),
    targets: { torso: ireq.regional!.neutral.torso, legs: ireq.regional!.neutral.legs,
      hands: ireq.extremity!.neutral.hands, headNeck: ireq.extremity!.neutral.head },
    minTargets: { torso: ireq.regional!.min.torso, legs: ireq.regional!.min.legs,
      hands: ireq.extremity!.min.hands, headNeck: ireq.extremity!.min.head },
    arms: { clo: 99, target: ireq.regional!.neutral.arms, minTarget: ireq.regional!.min.arms },
    extremityMaxTargets: ireq.extremity?.max ? { hands: ireq.extremity.max.hands, headNeck: ireq.extremity.max.head } : undefined,
    targetRange: ireq.target_range,
    breathabilityTarget: rec.evaluation?.breathabilityTarget,
    requireStandalone: Boolean(ireq.policy), protectionNeeds: ireq.policy?.protection,
  };
}

describe('canonical recommendation and edit assessments', () => {
  for (const [sport, route] of [['alpine', alpine], ['running', running], ['biking', biking], ['xc', xc], ['touring', touring]] as const) {
    it.each([
      { temperature: 56, wind_speed: 8 },
      { temperature: 25, wind_speed: 12 },
      { temperature: -15, wind_speed: 20 },
      { temperature: 36, wind_speed: 8, precipitation: true, precipitation_type: 'rain' },
    ])(`${sport} agrees with manual assessment at $temperature°F`, async weather => {
      const body: BiophysicsRecommendation = await call(route, { weather, exertion: 'moderate' });
      const inputs = [phase(body)];
      if (body.descent_evaluation) {
        const { recommendation: rec, descent_breakdown: d } = body;
        inputs.push({
          ...phase(body),
          items: evaluationItemsByBodyPart(buildDescentLayers(rec.garments, rec.handwear, rec.headwear, body.pack_items?.garments ?? [], body.descent_handwear, body.descent_headwear)),
          targets: { torso: d!.regional_ireq.neutral.torso, legs: d!.regional_ireq.neutral.legs,
            hands: d!.extremity_ireq.neutral.hands, headNeck: d!.extremity_ireq.neutral.head },
          minTargets: { torso: d!.regional_ireq.min.torso, legs: d!.regional_ireq.min.legs,
            hands: d!.extremity_ireq.min.hands, headNeck: d!.extremity_ireq.min.head },
          arms: { clo: 99, target: d!.regional_ireq.neutral.arms, minTarget: d!.regional_ireq.min.arms },
          targetRange: body.ireq.downhill_target_range,
          breathabilityTarget: body.descent_evaluation.breathabilityTarget,
        });
      }
      const { phases } = await call(evaluate, { phases: inputs });
      for (const [index, initial] of [body.recommendation.evaluation, body.descent_evaluation].entries()) {
        if (!initial) continue;
        const edited = phases[index];
        expect(edited.totalClo).toBeCloseTo(initial.totalClo!, 10);
        expect(edited.comfortScore).toBe(initial.comfortScore);
        expect(edited.decision).toEqual(initial.decision);
        expect(edited.bodyParts).toEqual(initial.bodyParts);
      }
    });
  }

  it('recalculates arms when a selected top is removed, leaving a recoverable incomplete outfit', async () => {
    const body: BiophysicsRecommendation = await call(running, { weather: { temperature: 56, wind_speed: 8 } });
    const input = phase(body);
    const { phases: [removed] } = await call(evaluate, { phases: [{ ...input, items: { ...input.items, torso: [] } }] });
    expect(removed.breakdown.regions.find((r: { region: string }) => r.region === 'arms').clo).toBe(0);
    expect(removed.decision.status).toBe('incomplete');
    expect(removed.decision.summary).toBe('Outfit incomplete');
  });
});
