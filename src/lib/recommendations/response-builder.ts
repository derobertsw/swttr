/**
 * Scores an ensemble and builds the standard `recommendation` block used by
 * every sport. Ski touring calls this once per worn phase.
 */
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { scoreEnsemble, type WeatherConditions, type ActivityProfile } from '@/lib/biophysics/scorer';
import type { ActivityType } from '@/lib/biophysics/constants';
import {
  type RegionalCloValues,
  type ExtremityCloValues,
} from '@/lib/biophysics/comfort';
import type { BiophysicsRecommendation, PhaseEvaluationInput } from '@/types/biophysics';
import type { GarmentRow, HandwearRow, HeadwearRecommendations } from './types';
import { formatGarmentResponse, formatHandwearResponse, formatHeadwearSet, ensembleToThermalGarments } from './formatting';
import { hoodInsulation } from './extremities';
import { evaluatePhase } from './layer-evaluation';
import { breathabilityTarget } from '@/lib/biophysics/scorer';

interface EnsembleScoringInput {
  ensemble: GarmentRow[];
  weather: WeatherConditions;
  activity: ActivityProfile;
  activityKey: ActivityType;
  comfortContext?: {
    requireStandalone?: boolean;
    protectionNeeds?: PhaseEvaluationInput['protectionNeeds'];
    targetRange: [number, number];
    /** Minimum clo per region: below it the region is short. */
    regionalMinTarget?: RegionalCloValues;
    regionalTarget?: RegionalCloValues;
    /** Minimum clo for the hands and head. */
    extremityMinTarget?: ExtremityCloValues;
    extremityTarget?: ExtremityCloValues;
    extremityMaxTarget?: ExtremityCloValues;
  };
}

type ScoredRecommendation = Pick<BiophysicsRecommendation, 'recommendation' | 'warnings'>;

/**
 * Score an ensemble and format the `recommendation` block and warnings.
 */
export function buildScoredRecommendation(
  input: EnsembleScoringInput,
  handwear: HandwearRow | null,
  headwear: HeadwearRecommendations
): ScoredRecommendation {
  const thermalGarments = ensembleToThermalGarments(input.ensemble);
  const ensembleProps = predictEnsembleThermal(thermalGarments);

  const regionalClo = {
    torso: ensembleProps.rcl.torso,
    arms: ensembleProps.rcl.arm,
    legs: ensembleProps.rcl.leg,
  } satisfies RegionalCloValues;
  // Sum hood clo contributions from garments in the ensemble.
  // When a helmet is selected, only helmet_compatible hoods count
  // (attached/removable hoods can't be worn under a helmet).
  const hoodClo = hoodInsulation(input.ensemble, headwear.helmet != null);

  const garments = input.ensemble.map(formatGarmentResponse);
  const torso = garments.filter(g => g.covers_torso);
  const legs = garments.filter(g => g.covers_legs);
  const context = input.comfortContext;
  const evaluation = context ? evaluatePhase({
    requireStandalone: context.requireStandalone,
    protectionNeeds: context.protectionNeeds,
    items: {
      torso,
      legs,
      hands: handwear ? [{ name: `${handwear.brand} ${handwear.model_name}` }] : [],
      headNeck: [headwear.helmet, headwear.headWarmth, headwear.neckWarmth].flatMap(g => g ? [{ name: `${g.brand} ${g.model_name}` }] : []),
    },
    itemClo: {
      torso: torso.map(g => g.thermal_data_status === 'known' ? g.rcl_torso ?? null : null),
      legs: legs.map(g => g.thermal_data_status === 'known' ? g.rcl_legs ?? null : null),
      hands: handwear ? [handwear.rcl_clo] : [],
      headNeck: [headwear.helmet, headwear.headWarmth, headwear.neckWarmth].flatMap(g => g ? [g.rcl_clo] : []),
    },
    hoodClo,
    armClo: Number.isFinite(regionalClo.arms) ? regionalClo.arms : null,
    arms: { clo: regionalClo.arms, minTarget: context.regionalMinTarget?.arms, target: context.regionalTarget?.arms },
    targets: { torso: context.regionalTarget?.torso, legs: context.regionalTarget?.legs,
      hands: context.extremityTarget?.hands, headNeck: context.extremityTarget?.head },
    minTargets: { torso: context.regionalMinTarget?.torso, legs: context.regionalMinTarget?.legs,
      hands: context.extremityMinTarget?.hands, headNeck: context.extremityMinTarget?.head },
    extremityMaxTargets: context.extremityMaxTarget ? { hands: context.extremityMaxTarget.hands, headNeck: context.extremityMaxTarget.head } : undefined,
    targetRange: context.targetRange,
    breathability: input.ensemble.length ? { evapPotential: ensembleProps.evapPotential, target: breathabilityTarget(input.activity.metabolicRate) } : undefined,
  }) : undefined;
  const score = scoreEnsemble(thermalGarments, input.weather, input.activity, input.activityKey, evaluation);

  return {
    recommendation: {
      garments,
      handwear: handwear ? formatHandwearResponse(handwear) : null,
      headwear: formatHeadwearSet(headwear),
      ensemble_properties: {
        total_clo: ensembleProps.rcl.wholeBody,
        regional_clo: {
          torso: Math.round(ensembleProps.rcl.torso * 100) / 100,
          arms: Math.round(ensembleProps.rcl.arm * 100) / 100,
          legs: Math.round(ensembleProps.rcl.leg * 100) / 100,
        },
        evap_potential: ensembleProps.evapPotential,
        permeability_index: ensembleProps.im,
      },
      score: score.totalScore,
      thermal_comfort_score: evaluation?.comfortScore ?? undefined,
      evaluation: evaluation ? { ...evaluation, items: undefined } : undefined,
      component_scores: score.componentScores,
    },
    warnings: evaluation ? [...(evaluation.decision?.warnings ?? [])] : score.warnings,
  };
}
