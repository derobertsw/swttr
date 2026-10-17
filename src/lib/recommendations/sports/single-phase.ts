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
import { buildClothingRequirements, filterUnsuitableEnsemble } from '../requirements';

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
  /** Retain functional protection when a calibrated budget changes. */
  protect?(ensemble: GarmentRow[], categorized: CategorizedGarments, targets: SinglePhaseTargets): { ensemble: GarmentRow[]; warnings: string[] };
  /** Requirement-first flow: report suitable-clothing needs separately from wardrobe matches. */
  requirementFirst?: boolean;
  /** Whether the torso requirement includes a wind layer for this request. */
  windTorsoRequirement?(request: RecommendationRequest): boolean;
}

/** Compose one-phase targets, outfit/protection selection, and response evaluation for a sport. */
export function createSinglePhaseSport(
  config: SinglePhaseSportConfig
): SportRecommender<SinglePhaseTargets> {
  return {
    catalog: { ...config.catalog, activity: config.activity },

    computeTargets(request) {
      const conditions = { tempC: request.tempC, humidity: request.humidity, precipitation: request.precipitation };
      const metabolicRate = metabolicRateFor(config.activity, request.exertion, request.bodyMetrics);
      const ireq = phaseIreq(conditions, request.windMs, metabolicRate);
      return {
        metabolicRate,
        ireq,
        ...phaseTargets(config.activity, ireq, metabolicRate, conditions, request.windMs, ireq, request.exertion),
      };
    },

    emptyResponse(request, targets) {
      return {
        ireq: targets.policy ? formatSinglePhaseIreq(targets.ireq, targets) : { min: targets.ireq.ireqMin, neutral: targets.ireq.ireqNeutral },
        ...(config.requirementFirst ? {
          requirements: buildClothingRequirements(config.activity, targets, { garments: [], handwear: [], headwear: [], ownership: { garments: false, handwear: false, headwear: false } }),
        } : {}),
        recommendations: {
          target_clo_range: targets.targetRange,
          min_evap_potential: config.minEvapPotential,
          guidance: [...config.guidance(request, targets.ireq), ...(targets.policy?.assumptions ?? [])],
        },
      };
    },

    recommend(request, targets, pool) {
      const built = config.buildEnsemble(pool.categorized, targets, request);
      const protectedOutfit = config.protect?.(built, pool.categorized, targets);
      const builtEnsemble = protectedOutfit?.ensemble ?? built;
      const ensemble = config.requirementFirst ? filterUnsuitableEnsemble(builtEnsemble, targets.regional) : builtEnsemble;
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
            regionalMinTarget: targets.regional.min,
            extremityMinTarget: targets.extremity.min,
          },
        },
        handwear,
        headwear
      );

      const requirements = config.requirementFirst
        ? buildClothingRequirements(config.activity, targets, {
          garments: pool.garments ?? Object.values(pool.categorized).flat(),
          handwear: pool.handwear, headwear: pool.headwear,
          ownership: { garments: pool.usingWardrobe, handwear: pool.handwearOwned ?? false, headwear: pool.headwearOwned ?? false },
          functional: { minEvapPotential: config.minEvapPotential, torsoWind: config.windTorsoRequirement?.(request) ?? false },
          selectedIds: new Set([...ensemble.map((g) => g.id), handwear?.id, headwear.headWarmth?.id, headwear.neckWarmth?.id].filter((id): id is string => Boolean(id))),
        })
        : undefined;
      const missingGuidance = requirements?.filter((r) => r.status === 'missing').map((r) => r.message) ?? [];

      return {
        conditions: {
          ...formatConditions(request.weather),
          exertion: request.exertion,
          ...config.conditions(request),
        },
        ireq: formatSinglePhaseIreq(targets.ireq, targets),
        ...(requirements ? { requirements } : {}),
        recommendation,
        warnings: [...warnings, ...(protectedOutfit?.warnings ?? [])],
        guidance: [...config.guidance(request, targets.ireq), ...missingGuidance, ...(targets.policy?.assumptions ?? [])],
      };
    },
  };
}
