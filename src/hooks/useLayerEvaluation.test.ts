import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatePhase } from '@/lib/recommendations/layer-evaluation';
import { useLayerEvaluation } from './useLayerEvaluation';
import type { PhaseEvaluationInput } from '@/types/biophysics';

vi.mock('@/lib/logger', () => ({ logWarn: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
const phase: PhaseEvaluationInput = {
  itemClo: { torso: [0.2], legs: [0.2], hands: [], headNeck: [] },
  targets: {}, arms: { clo: 0 }, targetRange: [0.1, 0.3],
};

describe('recoverable evaluation responses', () => {
  it.each([{ malformed: [] }, { malformed: [null] }, { malformed: [{}] }])('treats malformed phases $malformed as a failed check and retries', async ({ malformed }) => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ phases: malformed }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ phases: [evaluatePhase(phase)] }) });
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useLayerEvaluation([phase], 'same-outfit'));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.evaluation).toBeNull();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.failed).toBe(false);
    expect(result.current.evaluation?.[0].decision?.summary).toBe('Likely comfortable');
  });
});
