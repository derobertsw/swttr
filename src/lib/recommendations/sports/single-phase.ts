/**
 * Recommender for sports modelled as one continuous activity phase (running,
 * biking, XC skiing): a single IREQ and target range, active-use extremity
 * gear, and no helmet.
 */
import type { ActivityType } from '@/lib/biophysics/constants';
import type { ActivityProfile } from '@/lib/biophysics/scorer';
import type { IreqResult } from '@/types/garments';
import type { SportRecommender } from '../handler';
import type { CatalogFilter } from '../gear-pool';
import type { RecommendationRequest } from '../request';
import type { CategorizedGarments, GarmentRow } from '../types';
import { metabolicRateFor, phaseIreq, phaseTargets, type PhaseTargets } from '../thermal-targets';
import { selectHandwear, selectHeadwearByCategory } from '../extremities';
import { buildScoredRecommendation } from '../response-builder';
import { formatConditions, formatSinglePhaseIreq } from '../formatting';

interface SinglePhaseTargets extends PhaseTargets {
  metabolicRate: number;
  ireq: IreqResult;
}

interface SinglePhaseSportConfig {
  activity: ActivityType;
  /** Name and wind exposure used when scoring the ensemble. */
  profile: Pick<ActivityProfile, 'name' | 'windExposure'>;
  /** Evaporative potential a layer should reach to count as breathable. */
  minEvapPotential: number;
  catalog?: CatalogFilter;
  buildEnsemble(
    categorized: CategorizedGarments,
    targets: SinglePhaseTargets,
    request: RecommendationRequest
  ): GarmentRow[];
  /** Extra fields echoed in `conditions` after temperature, wind and exertion. */
  conditions(request: RecommendationRequest): object;
  guidance(request: RecommendationRequest, ireq: IreqResult): string[];
}

export function createSinglePhaseSport(
  config: SinglePhaseSportConfig
): SportRecommender<SinglePhaseTargets> {
  return {
    catalog: config.catalog ?? {},

    computeTargets(request) {
      const conditions = { tempC: request.tempC, humidity: request.humidity };
      const metabolicRate = metabolicRateFor(config.activity, request.exertion, request.bodyMetrics);
      const ireq = phaseIreq(conditions, request.windMs, metabolicRate);
      return {
        metabolicRate,
        ireq,
        ...phaseTargets(config.activity, ireq, metabolicRate, conditions, request.windMs),
      };
    },

    emptyResponse(request, targets) {
      return {
        ireq: { min: targets.ireq.ireqMin, neutral: targets.ireq.ireqNeutral },
        recommendations: {
          target_clo_range: targets.targetRange,
          min_evap_potential: config.minEvapPotential,
          guidance: config.guidance(request, targets.ireq),
        },
      };
    },

    recommend(request, targets, pool) {
      const ensemble = config.buildEnsemble(pool.categorized, targets, request);
      const handwear = selectHandwear(
        pool.handwear,
        request.tempC,
        true,
        targets.extremity.neutral.hands
      );
      const headwear = selectHeadwearByCategory(pool.headwear, request.tempC, true, {
        includeHelmet: false,
      });

      const { recommendation, warnings } = buildScoredRecommendation(
        {
          ensemble,
          weather: {
            temperature: request.tempC,
            windSpeed: request.windMs,
            humidity: request.humidity,
            precipitation: request.precipitation,
          },
          activity: {
            ...config.profile,
            metabolicRate: targets.metabolicRate,
            hasStaticPeriods: false,
          },
          activityKey: config.activity,
          comfortContext: {
            targetRange: targets.targetRange,
            regionalNeutralTarget: targets.regional.neutral,
            extremityNeutralTarget: targets.extremity.neutral,
          },
        },
        handwear,
        headwear
      );

      return {
        conditions: {
          ...formatConditions(request.weather),
          exertion: request.exertion,
          ...config.conditions(request),
        },
        ireq: formatSinglePhaseIreq(targets.ireq, targets),
        recommendation,
        warnings,
        guidance: config.guidance(request, targets.ireq),
      };
    },
  };
}
