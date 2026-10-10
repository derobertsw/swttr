import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { EVALUATED_BODY_PARTS, evaluatePhase } from "@/lib/recommendations/layer-evaluation";
import type { PhaseEvaluationInput } from "@/types/biophysics";
import { getSupabase } from '@/lib/supabase';
import { getAuthUserId } from '@/lib/auth';
import { resolveEvaluationItems } from '@/lib/recommendations/evaluation-items';

/** Climb, plus descent for ski touring. */
const MAX_PHASES = 2;
const MAX_ITEMS_PER_BODY_PART = 20;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

function isTargetMap(value: unknown): boolean {
  return !!value && typeof value === "object" &&
    EVALUATED_BODY_PARTS.every((part) => isOptionalNumber((value as Record<string, unknown>)[part]));
}

function parsePhase(value: unknown): PhaseEvaluationInput | null {
  if (!value || typeof value !== "object") return null;
  const { itemClo, items: metadata, targets, minTargets, arms, targetRange } = value as Record<string, unknown>;

  if (!itemClo || typeof itemClo !== "object") return null;
  for (const part of EVALUATED_BODY_PARTS) {
    const items = (itemClo as Record<string, unknown>)[part];
    if (!Array.isArray(items) || items.length > MAX_ITEMS_PER_BODY_PART || !items.every(v => v === null || (isFiniteNumber(v) && v >= 0))) {
      return null;
    }
    if (metadata !== undefined) {
      const refs = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)[part] : null;
      if (!Array.isArray(refs) || refs.length !== items.length || !refs.every(ref => {
        if (!ref || typeof ref !== 'object') return false;
        const { sourceId, item_type, rcl, thermal_provenance } = ref;
        if (sourceId !== undefined && (typeof sourceId !== 'string' || !sourceId.length || sourceId.length > 128)) return false;
        if (item_type !== undefined && !['garment', 'handwear', 'headwear', 'custom'].includes(item_type)) return false;
        if (sourceId && !item_type) return false;
        if (rcl !== undefined && (!isFiniteNumber(rcl) || rcl < 0)) return false;
        return thermal_provenance === undefined || (thermal_provenance !== null && typeof thermal_provenance === 'object'
          && (thermal_provenance.generic_estimate === undefined || typeof thermal_provenance.generic_estimate === 'boolean'));
      })) return null;
    }
  }

  if (!isTargetMap(targets)) return null;
  if (minTargets !== undefined && !isTargetMap(minTargets)) return null;

  if (arms !== undefined) {
    const { clo, target, minTarget, deficitClo } = (arms ?? {}) as Record<string, unknown>;
    if (
      !isFiniteNumber(clo) ||
      !isOptionalNumber(target) ||
      !isOptionalNumber(minTarget) ||
      !isOptionalNumber(deficitClo)
    ) {
      return null;
    }
  }

  if (
    targetRange !== undefined &&
    !(Array.isArray(targetRange) && targetRange.length === 2 && targetRange.every(isFiniteNumber))
  ) {
    return null;
  }

  return value as PhaseEvaluationInput;
}

/**
 * POST /api/v1/ensembles/evaluate
 *
 * Evaluates the layers shown on the recommendation screen (including the
 * user's edits) against the recommendation's targets.
 *
 * Body: { phases: PhaseEvaluationInput[] } — one per phase shown
 * Returns: { phases: PhaseEvaluation[] } — in the same order
 */
export async function POST(request: NextRequest) {
  const body = await readJson<{ phases?: unknown }>(request);
  const phases = Array.isArray(body?.phases) ? body.phases.map(parsePhase) : [];

  if (phases.length === 0 || phases.length > MAX_PHASES || phases.some((phase) => phase === null)) {
    return jsonError(`phases must contain 1-${MAX_PHASES} valid phase inputs`, 400);
  }

  const validPhases = phases as PhaseEvaluationInput[];
  const hasItems = validPhases.some(phase => phase.items);
  const hasCustom = validPhases.some(phase => phase.items &&
    EVALUATED_BODY_PARTS.some(part => phase.items![part].some(item => item.item_type === 'custom' && item.sourceId)));
  try {
    const resolved = hasItems ? await resolveEvaluationItems(validPhases, getSupabase(), hasCustom ? await getAuthUserId() : null) : validPhases;
    return NextResponse.json({ phases: resolved.map(evaluatePhase) });
  } catch (error) {
    console.error('Failed to evaluate catalog items:', error);
    return jsonError('Could not load thermal data for these layers', 503);
  }
}
