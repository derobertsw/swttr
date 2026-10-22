import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { EVALUATED_BODY_PARTS, evaluatePhase } from "@/lib/recommendations/layer-evaluation";
import type { EvaluationItem, PhaseEvaluationInput } from "@/types/biophysics";
import { getSupabase } from '@/lib/supabase';
import { getAuthUserId } from '@/lib/auth';
import { resolveEvaluationItems } from '@/lib/recommendations/evaluation-items';

/** Climb, plus descent for ski touring. */
const MAX_PHASES = 2;
const MAX_ITEMS_PER_BODY_PART = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Validate phase inputs and whitelist item references before catalog resolution. */
function parsePhase(value: unknown): PhaseEvaluationInput | null {
  if (!value || typeof value !== "object") return null;
  const { itemClo, items: metadata, targets, minTargets, arms, targetRange, extremityMaxTargets } = value as Record<string, unknown>;

  const parsedItems: Record<string, EvaluationItem[]> = {};
  const parsedClo: Record<string, (number | null)[]> = {};
  for (const part of EVALUATED_BODY_PARTS) {
    if (metadata !== undefined) {
      const refs = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)[part] : null;
      if (!Array.isArray(refs) || refs.length > MAX_ITEMS_PER_BODY_PART) return null;
      parsedItems[part] = [];
      for (const ref of refs) {
        if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return null;
        const { sourceId, item_type, rcl, thermal_provenance } = ref;
        if (sourceId !== undefined && (typeof sourceId !== 'string' || !UUID.test(sourceId))) return null;
        if (item_type !== undefined && !['garment', 'handwear', 'headwear', 'custom'].includes(item_type)) return null;
        if (sourceId && !item_type) return null;
        if (rcl != null && (!isFiniteNumber(rcl) || rcl < 0)) return null;
        if (thermal_provenance !== undefined && (!thermal_provenance || typeof thermal_provenance !== 'object'
          || Array.isArray(thermal_provenance)
          || (thermal_provenance.generic_estimate !== undefined && typeof thermal_provenance.generic_estimate !== 'boolean'))) return null;
        // Whitelist the request contract. Catalog metadata always comes from the DB.
        parsedItems[part].push(sourceId
          ? { sourceId: sourceId.toLowerCase(), item_type }
          : { rcl: rcl ?? null, item_type, thermal_provenance: { generic_estimate: thermal_provenance?.generic_estimate === true } });
      }
    } else {
      const values = itemClo && typeof itemClo === 'object' ? (itemClo as Record<string, unknown>)[part] : null;
      if (!Array.isArray(values) || values.length > MAX_ITEMS_PER_BODY_PART || !values.every(v => v === null || (isFiniteNumber(v) && v >= 0))) return null;
      parsedClo[part] = values;
    }
  }

  if (!isTargetMap(targets)) return null;
  if (minTargets !== undefined && !isTargetMap(minTargets)) return null;
  if (extremityMaxTargets !== undefined && (
    !extremityMaxTargets || typeof extremityMaxTargets !== 'object' || Array.isArray(extremityMaxTargets)
    || !['hands', 'headNeck'].every(part => {
      const limit = (extremityMaxTargets as Record<string, unknown>)[part];
      return limit === undefined || isFiniteNumber(limit) && limit >= 0;
    })
  )) return null;

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

  return {
    ...(metadata !== undefined ? { items: parsedItems } : { itemClo: parsedClo }),
    targets, minTargets, arms, targetRange, extremityMaxTargets,
  } as PhaseEvaluationInput;
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
  let resolved = validPhases;
  try {
    if (hasItems) resolved = await resolveEvaluationItems(validPhases, getSupabase(), hasCustom ? await getAuthUserId() : null);
  } catch (error) {
    console.error('Failed to load evaluation items:', error);
    return jsonError('Could not load thermal data for these layers', 503);
  }
  return NextResponse.json({ phases: resolved.map(evaluatePhase) });
}
