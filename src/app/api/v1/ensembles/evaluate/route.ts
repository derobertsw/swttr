import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { EVALUATED_BODY_PARTS, evaluatePhase } from "@/lib/recommendations/layer-evaluation";
import type { PhaseEvaluationInput } from "@/types/biophysics";

/** Climb, plus descent for ski touring. */
const MAX_PHASES = 2;
const MAX_ITEMS_PER_BODY_PART = 20;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

function parsePhase(value: unknown): PhaseEvaluationInput | null {
  if (!value || typeof value !== "object") return null;
  const { itemClo, targets, arms, targetRange } = value as Record<string, unknown>;

  if (!itemClo || typeof itemClo !== "object") return null;
  for (const part of EVALUATED_BODY_PARTS) {
    const items = (itemClo as Record<string, unknown>)[part];
    if (!Array.isArray(items) || items.length > MAX_ITEMS_PER_BODY_PART || !items.every(isFiniteNumber)) {
      return null;
    }
  }

  if (!targets || typeof targets !== "object") return null;
  if (!EVALUATED_BODY_PARTS.every((part) => isOptionalNumber((targets as Record<string, unknown>)[part]))) {
    return null;
  }

  if (arms !== undefined) {
    const { clo, target, deficitClo } = (arms ?? {}) as Record<string, unknown>;
    if (!isFiniteNumber(clo) || !isOptionalNumber(target) || !isOptionalNumber(deficitClo)) return null;
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

  return NextResponse.json({
    phases: (phases as PhaseEvaluationInput[]).map(evaluatePhase),
  });
}
