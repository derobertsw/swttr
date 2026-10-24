import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as evaluator from '@/lib/recommendations/layer-evaluation';
import { POST } from "./route";
import catalog from '@/test/fixtures/gear-catalog.json';
import { createFakeSupabase } from '@/test/fakeSupabase';
import type { EvaluationItem } from '@/types/biophysics';

const state = vi.hoisted(() => ({ client: null as unknown, userId: null as string | null }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => state.client }));
vi.mock('@/lib/auth', () => ({ getAuthUserId: async () => state.userId }));
beforeEach(() => { state.client = createFakeSupabase({ garments: catalog.garments }); state.userId = null; });

const phase = {
  itemClo: { torso: [0.5, 0.7], legs: [0.6], hands: [0.9], headNeck: [0.3] },
  targets: { torso: 1.0, legs: 0.6, hands: 1.0, headNeck: 0.5 },
  arms: { clo: 0.8, target: 0.9 },
  targetRange: [0.8, 1.2],
};

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/v1/ensembles/evaluate", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

describe("POST /api/v1/ensembles/evaluate", () => {
  const shorts = catalog.garments.find(g => g.garment_type === 'shorts')!;
  const tights = catalog.garments.find(g => g.model_name === 'Generic Standalone Running/Nordic Tights')!;
  const shirt = catalog.garments.find(g => g.garment_type === 'top_short_sleeve')!;
  function itemPhase(torso: EvaluationItem[], legs: EvaluationItem[] = []) {
    return {
      ...phase,
      items: { torso, legs, hands: [], headNeck: [] },
      // Client values are intentionally wrong: the server must use catalog data.
      itemClo: { torso: torso.map(() => 9), legs: legs.map(() => 9), hands: [], headNeck: [] },
    };
  }
  const reference = (id: string): EvaluationItem => ({ sourceId: id, item_type: 'garment', rcl: 9 });

  it('resolves regional averages and provenance from catalog IDs without weighting coverage twice', async () => {
    const response = await post({ phases: [itemPhase([reference(shirt.id)], [reference(shorts.id)]), itemPhase([reference(shirt.id)], [reference(tights.id)])] });
    expect(response.status).toBe(200);
    const { phases: [short, full] } = await response.json();
    expect(short.bodyParts.torso.clo).toBeCloseTo(0.1 * 0.836);
    expect(short.bodyParts.legs.clo).toBeCloseTo(0.06 * 0.961);
    expect(full.bodyParts.legs.clo).toBeCloseTo(0.25 * 0.961);
    expect(short.items.legs[0]).toMatchObject({ usage: 'standalone', coverage_legs: 0.3, rcl: 0.06, thermal_provenance: { generic_estimate: true }, protection: { windproof_rating: 'none' } });
    expect(full.items.legs[0]).toMatchObject({ usage: 'standalone', coverage_legs: 1 });
  });

  it('recomputes arms from singleton-array catalog relations', async () => {
    state.client = createFakeSupabase({ garments: [{ ...shirt,
      garment_thermal_properties: [shirt.garment_thermal_properties],
    }, shorts] });
    const { phases: [result] } = await (await post({ phases: [itemPhase([reference(shirt.id)], [reference(shorts.id)])] })).json();
    expect(result.thermal_data_status).toBe('known');
    expect(result.breakdown.regions.find((region: { region: string }) => region.region === 'arms').clo).toBeCloseTo(0.02 * 0.809);
  });

  it('retains underlayer identity despite client claims about standalone use', async () => {
    const underlayer = catalog.garments.find(g => g.model_name === 'Capilene Midweight Bottoms')!;
    const { phases: [result] } = await (await post({ phases: [itemPhase([], [{ ...reference(underlayer.id), usage: 'standalone' }])] })).json();
    expect(result.items.legs[0].usage).toBe('underlayer');
  });

  it.each(['missing regional', 'missing evaporative', 'deleted record'])('returns unknown for %s data even when client and whole-body clo are known', async kind => {
    const incomplete = { ...shirt, garment_thermal_properties: { ...shirt.garment_thermal_properties, ...(kind === 'missing regional' ? { rcl_torso: null } : { recl_torso: null }) } };
    state.client = createFakeSupabase({ garments: kind === 'deleted record' ? [] : [incomplete] });
    const { phases: [result] } = await (await post({ phases: [itemPhase([reference(shirt.id)])] })).json();
    expect(result).toMatchObject({ thermal_data_status: 'unknown', decision: null, comfortScore: null, maxRegionalDeficit: null, hasRegionalGap: null });
    expect(result.totalClo).toBeUndefined();
    expect(result.bodyParts.torso.clo).toBeUndefined();
  });

  it('does not confuse known zero clo with unknown thermal data', async () => {
    const zero = { ...shirt, garment_thermal_properties: { ...shirt.garment_thermal_properties, rcl_torso: 0 } };
    state.client = createFakeSupabase({ garments: [zero] });
    const { phases: [result] } = await (await post({ phases: [itemPhase([reference(shirt.id)])] })).json();
    expect(result.thermal_data_status).toBe('known');
    expect(result.bodyParts.torso.clo).toBe(0);
    expect(result.comfortScore).not.toBeNull();
  });

  it('preserves explicitly identified source-free estimates and leaves unlabeled numbers unknown', async () => {
    const { phases: [estimated, unknown] } = await (await post({ phases: [
      itemPhase([{ rcl: 0.2, thermal_provenance: { generic_estimate: true } }]),
      itemPhase([{ rcl: 0.2 }]),
    ] })).json();
    expect(estimated.bodyParts.torso.clo).toBeCloseTo(0.2 * 0.836);
    expect(estimated.items.torso[0].thermal_provenance.generic_estimate).toBe(true);
    expect(unknown.comfortScore).toBeNull();
  });

  it('limits custom item reads to the signed-in owner and matching body area', async () => {
    state.client = createFakeSupabase({ user_custom_items: [
      { id: '00000000-0000-0000-0000-000000000001', user_id: 'user-1', body_part: 'torso', rcl_clo: 0.3 },
      { id: '00000000-0000-0000-0000-000000000002', user_id: 'user-2', body_part: 'torso', rcl_clo: 1.2 },
    ] });
    const custom = (id: string): EvaluationItem => ({ sourceId: id, item_type: 'custom', rcl: 9 });
    const request = { phases: [itemPhase([custom('00000000-0000-0000-0000-000000000001')]), itemPhase([custom('00000000-0000-0000-0000-000000000002')])] };
    const { phases: anonymous } = await (await post(request)).json();
    expect(anonymous[0].thermal_data_status).toBe('unknown');
    state.userId = 'user-1';
    const { phases: [own, other] } = await (await post(request)).json();
    expect(own.bodyParts.torso.clo).toBeCloseTo(0.3 * 0.836);
    expect(own.items.torso[0].thermal_provenance.generic_estimate).toBe(true);
    expect(other.comfortScore).toBeNull();
    const { phases: [wrongRegion] } = await (await post({ phases: [itemPhase([], [custom('00000000-0000-0000-0000-000000000001')])] })).json();
    expect(wrongRegion.comfortScore).toBeNull();
  });

  it('reports a database outage as a failed check rather than a comfort verdict', async () => {
    state.client = null;
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { expect((await post({ phases: [itemPhase([reference(shirt.id)])] })).status).toBe(503); }
    finally { quiet.mockRestore(); }
  });

  it('supports unknown data in legacy numeric requests', async () => {
    const { phases: [result] } = await (await post({ phases: [{ ...phase, itemClo: { ...phase.itemClo, torso: [null] } }] })).json();
    expect(result).toMatchObject({ thermal_data_status: 'unknown', decision: null, comfortScore: null });
  });

  it('uses the running accessory limits for manual addition and removal without changing legacy callers', async () => {
    const input = {
      ...phase, targets: { ...phase.targets, hands: 0, headNeck: 0 }, arms: { clo: 0.8, target: 0.8 },
      itemClo: { ...phase.itemClo, hands: [0.6], headNeck: [] },
    };
    const { phases: [legacy, running] } = await (await post({ phases: [input,
      { ...input, extremityMaxTargets: { hands: 0, headNeck: 0 } },
    ] })).json();
    expect(legacy.decision.status).toBe('warmer');
    expect(running.decision.riskType).toBe('overheat');
    expect(running.bodyParts.hands.status).toBe('over');
    const { phases: [removed] } = await (await post({ phases: [{ ...input,
      extremityMaxTargets: { hands: 0, headNeck: 0 }, itemClo: { ...input.itemClo, hands: [] },
    }] })).json();
    expect(removed.decision.riskType).toBe('comfortable');
    expect(removed.hasExtremityGap).toBe(false);
  });

  it('counts worn hood insulation from catalog data during running/XC manual checks', async () => {
    state.client = createFakeSupabase({ garments: [{ ...shirt, hood_type: 'attached' }] });
    const { phases: [result] } = await (await post({ phases: [{
      ...itemPhase([reference(shirt.id)]), targets: { headNeck: 0.4 }, minTargets: { headNeck: 0.3 },
      extremityMaxTargets: { headNeck: 0.5 },
      // Untrusted client hood values must not override the resolved catalog hood.
      hoodClo: 9,
    }] })).json();
    expect(result.bodyParts.headNeck).toMatchObject({ clo: 0.4, status: 'in_range' });
  });

  it.each([null, [], { hands: -1 }, { headNeck: 'warm' }])('rejects invalid local accessory limits: %j', async extremityMaxTargets => {
    expect((await post({ phases: [{ ...phase, extremityMaxTargets }] })).status).toBe(400);
  });
  it("evaluates each phase in order", async () => {
    const response = await post({ phases: [phase, { ...phase, targetRange: [2, 3] }] });
    expect(response.status).toBe(200);
    const { phases } = await response.json();
    expect(phases).toHaveLength(2);
    expect(phases[0].bodyParts.torso.clo).toBeCloseTo(1.2 * 0.836, 10);
    expect(phases[1].decision).toMatchObject({ riskType: "cold" });
  });

  it("measures shortfalls from the minimum targets when sent", async () => {
    const withMinimums = {
      ...phase,
      minTargets: { torso: 0.9, legs: 0.5, hands: 0.8, headNeck: 0.25 },
      arms: { ...phase.arms, minTarget: 0.75 },
    };
    const { phases: [neutralOnly] } = await (await post({ phases: [phase] })).json();
    const { phases: [minimums] } = await (await post({ phases: [withMinimums] })).json();

    expect(neutralOnly.maxExtremityDeficit).toBeCloseTo(0.2, 10);
    expect(minimums.maxExtremityDeficit).toBe(0);
    expect(minimums.maxRegionalDeficit).toBe(0);
  });

  it('accepts items alone and ignores the obsolete numeric payload, including alignment', async () => {
    const input = itemPhase([reference(shirt.id)]);
    const itemsOnly = { ...input, itemClo: undefined };
    const first = await post({ phases: [itemsOnly, { ...input, itemClo: { torso: [] } }] });
    expect(first.status).toBe(200);
    const { phases } = await first.json();
    expect(phases[0]).toEqual(phases[1]);
    expect(phases[0].bodyParts.torso.clo).toBeCloseTo(0.1 * 0.836);
  });

  it('normalizes uppercase UUID references before querying and matching results', async () => {
    const response = await post({ phases: [itemPhase([reference(shirt.id.toUpperCase())])] });
    expect(response.status).toBe(200);
    const { phases: [result] } = await response.json();
    expect(result.items.torso[0].sourceId).toBe(shirt.id);
    expect(result.thermal_data_status).toBe('known');
  });

  it('treats null item warmth as unknown instead of rejecting the phase', async () => {
    const response = await post({ phases: [itemPhase([{ rcl: null, thermal_provenance: { generic_estimate: true } }])] });
    expect(response.status).toBe(200);
    expect((await response.json()).phases[0]).toMatchObject({ thermal_data_status: 'unknown', decision: null });
  });

  it('whitelists source-free estimates instead of echoing unvalidated client fields', async () => {
    const response = await post({ phases: [itemPhase([{
      rcl: 0.2, item_type: 'custom', thermal_provenance: { generic_estimate: true, data_source: 'unchecked' },
      thermal_data_status: 'bogus', protection: { waterproof_rating: 'unchecked' }, arbitrary: 'unchecked',
    } as unknown as EvaluationItem])] });
    expect(response.status).toBe(200);
    expect((await response.json()).phases[0].items.torso[0]).toEqual({
      rcl: 0.2, item_type: 'custom', thermal_provenance: { generic_estimate: true }, thermal_data_status: 'known',
    });
  });

  it('does not report an evaluation exception as a database outage', async () => {
    const failure = new Error('Evaluation programming error');
    const evaluate = vi.spyOn(evaluator, 'evaluatePhase').mockImplementation(() => { throw failure; });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(post({ phases: [phase] })).rejects.toBe(failure);
      expect(log).not.toHaveBeenCalled();
    } finally { evaluate.mockRestore(); log.mockRestore(); }
  });

  it('reuses public catalog rows until expiry, then reads deletion instead of stale data', async () => {
    const client = createFakeSupabase({ garments: [shirt] });
    state.client = client;
    const from = vi.spyOn(client, 'from');
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      const input = { phases: [itemPhase([reference(shirt.id)])] };
      await post(input);
      await post(input);
      expect(from).toHaveBeenCalledTimes(1);
      await client.from('garments').delete().eq('id', shirt.id);
      from.mockClear();
      now.mockReturnValue(31_000);
      const { phases: [result] } = await (await post(input)).json();
      expect(from).toHaveBeenCalledTimes(1);
      expect(result.thermal_data_status).toBe('unknown');
    } finally { now.mockRestore(); }
  });

  it('uses rows already loaded by the recommendation route', async () => {
    const { fetchGarmentsWithDetails } = await import('@/lib/recommendations/database');
    const client = createFakeSupabase({ garments: [shirt] });
    state.client = client;
    await fetchGarmentsWithDetails(client as unknown as NonNullable<ReturnType<typeof import('@/lib/supabase')['getSupabase']>>);
    const from = vi.spyOn(client, 'from');
    const { phases: [result] } = await (await post({ phases: [itemPhase([reference(shirt.id)])] })).json();
    expect(from).not.toHaveBeenCalled();
    expect(result.thermal_data_status).toBe('known');
  });

  it('does not cache private custom rows across users or deletion', async () => {
    const id = '00000000-0000-0000-0000-000000000001';
    const client = createFakeSupabase({ user_custom_items: [{ id, user_id: 'user-1', body_part: 'torso', rcl_clo: 0.3 }] });
    state.client = client;
    state.userId = 'user-1';
    const input = { phases: [itemPhase([{ sourceId: id, item_type: 'custom' }])] };
    const owned = (await (await post(input)).json()).phases[0];
    expect(owned.items.torso[0].thermal_data_status).toBe('known');
    // A custom torso estimate does not establish arm insulation.
    expect(owned.comfortScore).toBeNull();
    state.userId = 'user-2';
    expect((await (await post(input)).json()).phases[0].thermal_data_status).toBe('unknown');
    state.userId = 'user-1';
    await client.from('user_custom_items').delete().eq('id', id);
    expect((await (await post(input)).json()).phases[0].thermal_data_status).toBe('unknown');
  });

  it.each([
    ["malformed JSON", "{"],
    ["no phases", { phases: [] }],
    ["too many phases", { phases: [phase, phase, phase] }],
    ["non-numeric clo", { phases: [{ ...phase, itemClo: { ...phase.itemClo, torso: ["warm"] } }] }],
    ["missing body part", { phases: [{ ...phase, itemClo: { torso: [0.5] } }] }],
    ["bad target range", { phases: [{ ...phase, targetRange: [1] }] }],
    ["arms without clo", { phases: [{ ...phase, arms: { target: 1 } }] }],
    ["non-numeric minimum", { phases: [{ ...phase, minTargets: { torso: "low" } }] }],
    ["non-numeric arm minimum", { phases: [{ ...phase, arms: { clo: 0.8, minTarget: "low" } }] }],
    ['negative clo', { phases: [{ ...phase, itemClo: { ...phase.itemClo, torso: [-1] } }] }],
    ['malformed UUID', { phases: [itemPhase([reference('invalid')])] }],
    ['too many references', { phases: [itemPhase(Array.from({ length: 21 }, () => reference(shirt.id)))] }],
    ['source without type', { phases: [itemPhase([{ sourceId: shirt.id }])] }],
    ['invalid item type', { phases: [itemPhase([{ sourceId: shirt.id, item_type: 'invalid' } as unknown as EvaluationItem])] }],
  ])("rejects %s with 400", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
  });
});
