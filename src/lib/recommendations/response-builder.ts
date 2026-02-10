/**
 * Shared response builder for recommendation API routes.
 * Builds the standard JSON response shape from ensemble data.
 */
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { scoreEnsemble, type WeatherConditions, type ActivityProfile, type GarmentWithProtection } from '@/lib/biophysics/scorer';
import type { ActivityType } from '@/lib/biophysics/constants';
import { calculateThermalComfortScore, getMaxRegionalDeficit, type RegionalCloValues } from '@/lib/biophysics/comfort';
import type { GarmentRow, HandwearRow, HeadwearRecommendations } from './types';
import { formatGarmentResponse, formatHandwearResponse, formatHeadwearResponse, ensembleToThermalGarments } from './formatting';

export interface EnsembleScoringInput {
  ensemble: GarmentRow[];
  weather: WeatherConditions;
  activity: ActivityProfile;
  activityKey: ActivityType;
  comfortContext?: {
    targetRange: [number, number];
    regionalNeutralTarget?: RegionalCloValues;
  };
}

export interface ResponseComponents {
  conditions: Record<string, unknown>;
  recommendation: {
    garments: ReturnType<typeof formatGarmentResponse>[];
    handwear: ReturnType<typeof formatHandwearResponse> | null;
    headwear: {
      helmet: ReturnType<typeof formatHeadwearResponse> | null;
      head_warmth: ReturnType<typeof formatHeadwearResponse> | null;
      neck_warmth: ReturnType<typeof formatHeadwearResponse> | null;
    };
    ensemble_properties: {
      total_clo: number;
      regional_clo: {
        torso: number;
        arms: number;
        legs: number;
      };
      evap_potential: number;
      permeability_index: number;
    };
    score: number;
    thermal_comfort_score: number;
    component_scores: Record<string, number>;
  };
  warnings: string[];
  thermalGarments: GarmentWithProtection[];
}

/**
 * Score an ensemble and format the common response components.
 */
export function buildResponseComponents(
  input: EnsembleScoringInput,
  handwear: HandwearRow | null,
  headwear: HeadwearRecommendations
): ResponseComponents {
  const thermalGarments = ensembleToThermalGarments(input.ensemble);
  const ensembleProps = predictEnsembleThermal(thermalGarments);

  const score = scoreEnsemble(
    thermalGarments,
    input.weather,
    input.activity,
    input.activityKey
  );

  const regionalClo = {
    torso: ensembleProps.rcl.torso,
    arms: ensembleProps.rcl.arm,
    legs: ensembleProps.rcl.leg,
  } satisfies RegionalCloValues;
  const maxRegionalDeficit = getMaxRegionalDeficit(
    regionalClo,
    input.comfortContext?.regionalNeutralTarget
  );
  const comfortScore = input.comfortContext
    ? calculateThermalComfortScore({
      totalClo: ensembleProps.rcl.wholeBody,
      targetRange: input.comfortContext.targetRange,
      maxRegionalDeficit,
    })
    : null;
  const fallbackComfortScore = Math.round(
    ((score.componentScores.coldProtection + score.componentScores.overheatPrevention) / 2) * 10
  ) / 10;

  return {
    conditions: {},
    recommendation: {
      garments: input.ensemble.map(formatGarmentResponse),
      handwear: handwear ? formatHandwearResponse(handwear) : null,
      headwear: {
        helmet: headwear.helmet ? formatHeadwearResponse(headwear.helmet) : null,
        head_warmth: headwear.headWarmth ? formatHeadwearResponse(headwear.headWarmth) : null,
        neck_warmth: headwear.neckWarmth ? formatHeadwearResponse(headwear.neckWarmth) : null,
      },
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
      thermal_comfort_score: comfortScore ?? fallbackComfortScore,
      component_scores: score.componentScores,
    },
    warnings: score.warnings,
    thermalGarments,
  };
}
