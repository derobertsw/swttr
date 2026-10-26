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
  localThermalStatus,
  type BodyPartClo,
} from '@/lib/biophysics/comfort';
import type {
  BodyPartEvaluation,
  EvaluatedBodyPart,
  PhaseEvaluation,
  PhaseEvaluationInput,
} from '@/types/biophysics';

export const EVALUATED_BODY_PARTS: readonly EvaluatedBodyPart[] = ['torso', 'legs', 'hands', 'headNeck'];

/** Layering compresses air gaps, so stacked garments insulate less than their sum. */
const REGRESSION_COEF: Partial<Record<EvaluatedBodyPart, number>> = {
  torso: ENSEMBLE_REGRESSION.thermal.torso.coef,
  legs: ENSEMBLE_REGRESSION.thermal.leg.coef,
};

function sum(values: (number | null)[]): number | null {
  if (values.some(value => value === null || !Number.isFinite(value) || value < 0)) return null;
  return (values as number[]).reduce((total, value) => total + value, 0);
}

interface PartAgainstMinimum {
  name?: string;
  clo: number;
  minimum: number | undefined;
  maximum?: number;
}

function hasMinimum(part: PartAgainstMinimum): part is BodyPartClo {
  return part.minimum !== undefined;
}

function maxDeficit(parts: PartAgainstMinimum[]): number {
  return Math.max(0, ...parts.filter(hasMinimum).map((part) => part.minimum - part.clo));
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
  return localThermalStatus(clo, minimum, target);
}

/** Assess resolved worn layers against phase bands; unknown insulation withholds comfort. */
export function evaluatePhase(input: PhaseEvaluationInput): PhaseEvaluation {
  if (!input.itemClo) throw new Error('Evaluation items must be resolved before evaluating');
  const itemClo = input.itemClo;
  // Measure shortfalls against each part's minimum, or its neutral target
  // when the caller sent no minimum.
  const minimum = (part: EvaluatedBodyPart) => input.minTargets?.[part] ?? input.targets[part];

  const bodyParts = Object.fromEntries(
    EVALUATED_BODY_PARTS.map((part) => {
      const rawClo = sum(part === 'headNeck' && input.hoodClo !== undefined
        ? [...itemClo[part], input.hoodClo] : itemClo[part]);
      if (rawClo === null) return [part, { thermal_data_status: 'unknown', target: input.targets[part] }];
      const coef = REGRESSION_COEF[part];
      const clo = coef ? rawClo * coef : rawClo;
      const target = input.targets[part];
      const evaluation: BodyPartEvaluation =
        target === undefined
          ? { clo }
          : { clo, target, delta: target - clo, status: bodyPartStatus(clo, minimum(part) ?? target, target) };
      if ((part === 'hands' || part === 'headNeck') && input.extremityMaxTargets?.[part] !== undefined) {
        evaluation.status = localThermalStatus(clo, minimum(part) ?? target ?? 0, input.extremityMaxTargets[part]!);
      }
      return [part, evaluation];
    })
  ) as Record<EvaluatedBodyPart, BodyPartEvaluation>;

  if (EVALUATED_BODY_PARTS.some(part => bodyParts[part].clo === undefined) || input.armClo === null) {
    return {
      thermal_data_status: 'unknown', items: input.items, bodyParts,
      maxRegionalDeficit: null, maxExtremityDeficit: null,
      hasRegionalGap: null, hasExtremityGap: null, decision: null, comfortScore: null,
    };
  }

  const { torso, legs, hands, headNeck } = bodyParts;
  const regions: PartAgainstMinimum[] = [
    { name: 'Torso', clo: torso.clo!, minimum: minimum('torso'), maximum: input.targets.torso },
    { name: 'Legs', clo: legs.clo!, minimum: minimum('legs'), maximum: input.targets.legs },
  ];
  if (input.arms) {
    regions.push({
      name: 'Arms',
      clo: input.armClo ?? input.arms.deficitClo ?? input.arms.clo,
      minimum: input.arms.minTarget ?? input.arms.target,
      maximum: input.arms.target,
    });
  }
  const extremities: PartAgainstMinimum[] = [
    { name: 'Hands', clo: hands.clo!, minimum: minimum('hands'), maximum: input.extremityMaxTargets?.hands ?? input.targets.hands },
    { name: 'Head and neck', clo: headNeck.clo!, minimum: minimum('headNeck'), maximum: input.extremityMaxTargets?.headNeck ?? input.targets.headNeck },
  ];
  const maxRegionalDeficit = maxDeficit(regions);
  const maxExtremityDeficit = maxDeficit(extremities);

  const breakdown = input.arms ? weightedBreakdown(torso.clo!, input.armClo ?? input.arms.deficitClo ?? input.arms.clo, legs.clo!) : undefined;

  const comfortInput = {
    totalClo: breakdown?.total,
    targetRange: input.targetRange,
    bodyParts: [...regions, ...extremities].filter(hasMinimum),
    breathability: input.breathability,
  };

  const decision = evaluateThermalComfort(comfortInput);
  const missingClothing = input.items && (['torso', 'legs'] as const).filter(part => input.items![part].length === 0
    || (input.requireStandalone && !input.items![part].some(item => item.usage === 'standalone' || item.usage === 'either')));
  if (decision) {
    if (missingClothing && missingClothing.length > 0) {
      decision.status = 'incomplete';
      decision.summary = 'Outfit incomplete';
      decision.reasons?.unshift(`No worn clothing selected for ${missingClothing.join(' and ')}. A suitable clothing requirement is not an item being worn.`);
    }
    for (const part of EVALUATED_BODY_PARTS) {
      const names = input.items?.[part].map(item => item.name).filter(Boolean).sort() ?? [];
      if (names.length) decision.reasons?.push(`Selected for ${part === 'headNeck' ? 'head and neck' : part}: ${names.join(', ')}.`);
      else if ((part === 'hands' || part === 'headNeck') && (minimum(part) ?? 0) === 0 && bodyParts[part].clo === 0) {
        decision.reasons?.push(`No thermal ${part === 'hands' ? 'handwear' : 'headwear'} is needed by this phase's policy.`);
      }
    }
    if (!input.breathability) decision.reasons?.push('Breathability is not assessed without usable evaporative resistance data.');
    if (input.hoodClo && input.hoodClo > 0) decision.reasons?.push('The worn hood contributes to head warmth; helmet compatibility is included.');
    if (input.items && [...input.items.torso, ...input.items.legs].some(item =>
      ['coverage_arms', 'coverage_legs'].some(key => {
        const coverage = item[key as 'coverage_arms' | 'coverage_legs'];
        return typeof coverage === 'number' && coverage > 0 && coverage < 1;
      }))) decision.reasons?.push('Selected partial coverage intentionally leaves some skin exposed; regional insulation already includes that exposure.');
    if (input.protectionNeeds && input.items) {
      for (const part of ['torso', 'legs'] as const) {
        const items = input.items[part].filter(item => (item[`coverage_${part}`] ?? 1) === 1);
        for (const need of ['wind', 'wet'] as const) {
          const protectedArea = items.some(item => need === 'wind'
            ? ['wind_resistant', 'windproof'].includes(item.protection?.windproof_rating ?? '')
            : ['water_resistant', 'waterproof'].includes(item.protection?.waterproof_rating ?? ''));
          if (input.protectionNeeds[need] && !protectedArea) {
            decision.status = 'incomplete';
            decision.summary = 'Protection incomplete';
            const reason = `Selected ${part} clothing does not establish the required ${need} protection.`;
            decision.reasons?.push(reason);
            decision.warnings?.push(reason);
          }
        }
      }
      if (input.protectionNeeds.poleGrip) {
        const reason = input.items.hands.length
          ? 'Keep hand protection for pole grip; functional protection is separate from thermal warmth.'
          : 'Pole-grip hand protection is missing; this is separate from a thermal cold deficit.';
        decision.reasons?.push(reason);
        if (!input.items.hands.length) {
          decision.status = 'incomplete';
          decision.summary = 'Protection incomplete';
          decision.warnings?.push(reason);
        }
      }
    }
  }

  return {
    breathabilityTarget: input.breathability?.target,
    ...(input.items && { thermal_data_status: 'known', items: input.items }),
    bodyParts,
    breakdown,
    totalClo: breakdown?.total,
    maxRegionalDeficit,
    maxExtremityDeficit,
    hasRegionalGap: maxRegionalDeficit > THERMAL_DISPLAY_CLO_EPSILON,
    hasExtremityGap: maxExtremityDeficit > THERMAL_DISPLAY_CLO_EPSILON,
    decision,
    comfortScore: calculateThermalComfortScore(comfortInput),
  };
}

