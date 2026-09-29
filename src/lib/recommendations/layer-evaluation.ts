/**
 * Evaluates the layers a user is wearing (possibly edited after the
 * recommendation) against the recommendation's thermal targets. Backs
 * POST /api/v1/ensembles/evaluate so the recommendation view never does
 * thermal math in the browser.
 */
import { ENSEMBLE_REGRESSION, REGIONAL_WEIGHTS } from '@/lib/biophysics/constants';
import {
  calculateThermalComfortScore,
  evaluateThermalComfort,
  THERMAL_DISPLAY_CLO_EPSILON,
} from '@/lib/biophysics/comfort';
import type {
  BodyPartEvaluation,
  EvaluatedBodyPart,
  PhaseEvaluation,
  PhaseEvaluationInput,
} from '@/types/biophysics';

export const EVALUATED_BODY_PARTS: readonly EvaluatedBodyPart[] = ['torso', 'legs', 'hands', 'headNeck'];

/** How far a body part's clo can exceed its neutral target before it counts as over. */
const BODY_PART_OVER_CLO = 0.35;

/** Layering compresses air gaps, so stacked garments insulate less than their sum. */
const REGRESSION_COEF: Partial<Record<EvaluatedBodyPart, number>> = {
  torso: ENSEMBLE_REGRESSION.thermal.torso.coef,
  legs: ENSEMBLE_REGRESSION.thermal.leg.coef,
};

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function deficit(target: number | undefined, current: number | undefined): number {
  if (target === undefined) return 0;
  return Math.max(0, target - (current ?? 0));
}

/**
 * Whole-body clo: each region's clo weighted by its share of the body, with
 * the per-region contributions so the view can show the working.
 */
function weightedBreakdown(torso: number, arms: number, legs: number) {
  const regions = [
    { region: 'torso' as const, clo: torso, weight: REGIONAL_WEIGHTS.torso },
    { region: 'arms' as const, clo: arms, weight: REGIONAL_WEIGHTS.arm },
    { region: 'legs' as const, clo: legs, weight: REGIONAL_WEIGHTS.leg },
  ].map((entry) => ({ ...entry, contribution: entry.clo * entry.weight }));
  return {
    regions,
    total: regions[0].contribution + regions[1].contribution + regions[2].contribution,
  };
}

/**
 * Under when short of the minimum by more than the cold-warning tolerance,
 * over when well above the neutral target, and in range in between.
 */
function bodyPartStatus(clo: number, minimum: number, target: number): BodyPartEvaluation['status'] {
  if (minimum - clo > THERMAL_DISPLAY_CLO_EPSILON) return 'under';
  if (clo - target > BODY_PART_OVER_CLO) return 'over';
  return 'in_range';
}

export function evaluatePhase(input: PhaseEvaluationInput): PhaseEvaluation {
  // Measure shortfalls against each part's minimum, or its neutral target
  // when the caller sent no minimum.
  const minimum = (part: EvaluatedBodyPart) => input.minTargets?.[part] ?? input.targets[part];

  const bodyParts = Object.fromEntries(
    EVALUATED_BODY_PARTS.map((part) => {
      const rawClo = sum(input.itemClo[part]);
      const coef = REGRESSION_COEF[part];
      const clo = coef ? rawClo * coef : rawClo;
      const target = input.targets[part];
      const evaluation: BodyPartEvaluation =
        target === undefined
          ? { clo }
          : { clo, target, delta: target - clo, status: bodyPartStatus(clo, minimum(part) ?? target, target) };
      return [part, evaluation];
    })
  ) as Record<EvaluatedBodyPart, BodyPartEvaluation>;

  const { torso, legs, hands, headNeck } = bodyParts;
  const maxRegionalDeficit = Math.max(
    deficit(minimum('torso'), torso.clo),
    deficit(input.arms?.minTarget ?? input.arms?.target, input.arms?.deficitClo ?? input.arms?.clo),
    deficit(minimum('legs'), legs.clo)
  );
  const maxExtremityDeficit = Math.max(
    deficit(minimum('hands'), hands.clo),
    deficit(minimum('headNeck'), headNeck.clo)
  );

  const breakdown = input.arms ? weightedBreakdown(torso.clo, input.arms.clo, legs.clo) : undefined;

  const comfortInput = {
    totalClo: breakdown?.total,
    targetRange: input.targetRange,
    maxRegionalDeficit,
    maxExtremityDeficit,
  };

  return {
    bodyParts,
    breakdown,
    totalClo: breakdown?.total,
    maxRegionalDeficit,
    maxExtremityDeficit,
    hasRegionalGap: maxRegionalDeficit > THERMAL_DISPLAY_CLO_EPSILON,
    hasExtremityGap: maxExtremityDeficit > THERMAL_DISPLAY_CLO_EPSILON,
    decision: evaluateThermalComfort(comfortInput),
    comfortScore: calculateThermalComfortScore(comfortInput),
  };
}

