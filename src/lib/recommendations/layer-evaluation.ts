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

/** Pill thresholds for a body part's actual vs target clo. */
const BODY_PART_UNDER_CLO = 0.15;
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

function bodyPartStatus(delta: number): BodyPartEvaluation['status'] {
  if (delta > BODY_PART_UNDER_CLO) return 'under';
  if (-delta > BODY_PART_OVER_CLO) return 'over';
  return 'in_range';
}

export function evaluatePhase(input: PhaseEvaluationInput): PhaseEvaluation {
  const bodyParts = Object.fromEntries(
    EVALUATED_BODY_PARTS.map((part) => {
      const rawClo = sum(input.itemClo[part]);
      const coef = REGRESSION_COEF[part];
      const clo = coef ? rawClo * coef : rawClo;
      const target = input.targets[part];
      const evaluation: BodyPartEvaluation =
        target === undefined
          ? { clo }
          : { clo, target, delta: target - clo, status: bodyPartStatus(target - clo) };
      return [part, evaluation];
    })
  ) as Record<EvaluatedBodyPart, BodyPartEvaluation>;

  const { torso, legs, hands, headNeck } = bodyParts;
  const maxRegionalDeficit = Math.max(
    deficit(torso.target, torso.clo),
    deficit(input.arms?.target, input.arms?.deficitClo ?? input.arms?.clo),
    deficit(legs.target, legs.clo)
  );
  const maxExtremityDeficit = Math.max(
    deficit(hands.target, hands.clo),
    deficit(headNeck.target, headNeck.clo)
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

