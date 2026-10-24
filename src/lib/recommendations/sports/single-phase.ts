/**
 * Recommender for sports modelled as one continuous activity phase (running,
 * biking, XC skiing): a single IREQ and target range, active-use extremity
 * gear, and no helmet.
 */
import { xcPhaseContext } from '@/lib/biophysics/xc-policy';
import type { BiophysicsRecommendation } from '@/types/biophysics';
import type { ActivityType } from '@/lib/biophysics/constants';
import type { ActivityProfile } from '@/lib/biophysics/scorer';
import type { IreqResult } from '@/types/garments';
import type { SportRecommender } from '../handler';
import type { CatalogFilter } from '../gear-pool';
import type { RecommendationRequest } from '../request';
import type { CategorizedGarments, GarmentRow } from '../types';
import {
  basicIreq,
  metabolicRateFor,
  phaseExposure,
  phaseIreq,
  phaseTargets,
  type PhaseTargets,
} from '../thermal-targets';
import { selectPhaseAccessories } from '../extremities';
import { buildScoredRecommendation } from '../response-builder';
import { formatConditions, formatSinglePhaseIreq } from '../formatting';
import { buildClothingRequirements, filterUnsuitableEnsemble } from '../requirements';

interface SinglePhaseTargets extends PhaseTargets {
  metabolicRate: number;
  /** IREQ: the resultant insulation required in this wind and motion. */
  ireq: IreqResult;
  /** The same IREQ in the basic clo garments are rated in. */
  basicIreq: IreqResult;
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
  guidance(request: RecommendationRequest, ireq: IreqResult, ensemble?: GarmentRow[], targets?: SinglePhaseTargets): string[];
  completeOutfit?: boolean;
  carry?(request: RecommendationRequest, targets: SinglePhaseTargets): BiophysicsRecommendation['carry_items'];
  /** Retain functional protection when a calibrated budget changes. */
  protect?(ensemble: GarmentRow[], categorized: CategorizedGarments, targets: SinglePhaseTargets): { ensemble: GarmentRow[]; warnings: string[] };
  /** Air permeability of the outer layer this sport dresses in these conditions, l/(m²·s). */
  outerAirPermeability(request: RecommendationRequest): number;
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
      const xc = config.activity === 'xc_skiing' ? xcPhaseContext({ ...request, precipitationType: request.weather.precipitation_type }) : undefined;
      const conditions = { tempC: request.tempC, humidity: request.humidity,
        precipitation: xc ? xc.precipitation === 'wet' : request.precipitation, ...(xc ? { xc } : {}) };
      const windMs = xc?.effectiveWindMs ?? request.windMs;
      const metabolicRate = metabolicRateFor(config.activity, request.exertion, request.bodyMetrics);
      const ireq = phaseIreq(conditions, windMs, metabolicRate);
      const exposure = phaseExposure(windMs, metabolicRate, config.outerAirPermeability(request));
      return {
        metabolicRate,
        ireq,
        basicIreq: basicIreq(ireq, exposure),
        ...phaseTargets(config.activity, ireq, metabolicRate, conditions, windMs, ireq, request.exertion, exposure),
      };
    },

    emptyResponse(request, targets) {
      // The no-garment fast path has not inspected accessory availability.
      const accessories = selectPhaseAccessories(config.activity, targets, { handwear: [], headwear: [], availability: 'unknown' }, request.tempC);
      return {
        ...(config.carry ? { carry_items: config.carry(request, targets) } : {}),
        ireq: targets.policy ? formatSinglePhaseIreq(targets.ireq, targets) : { min: targets.ireq.ireqMin, neutral: targets.ireq.ireqNeutral },
        ...(config.requirementFirst ? {
          requirements: buildClothingRequirements(config.activity, targets, { garments: [], handwear: [], headwear: [], ownership: { garments: false, handwear: false, headwear: false }, accessories: accessories.assessments }),
        } : {}),
        recommendations: {
          target_clo_range: targets.targetRange,
          min_evap_potential: config.minEvapPotential,
          ...(accessories.assessments ? { accessories: accessories.assessments } : {}),
          guidance: [...(config.activity === 'xc_skiing' ? config.guidance(request, targets.basicIreq, [], targets) : config.guidance(request, targets.basicIreq)), ...(targets.policy?.assumptions ?? [])],
        },
      };
    },

    recommend(request, targets, pool) {
      const built = config.buildEnsemble(pool.categorized, targets, request);
      const protectedOutfit = config.protect?.(built, pool.categorized, targets);
      const builtEnsemble = protectedOutfit?.ensemble ?? built;
      const functional = config.requirementFirst
        ? {
          minEvapPotential: config.minEvapPotential,
          torsoWind: config.windTorsoRequirement?.(request) ?? false,
          protection: targets.policy?.protection,
        }
        : undefined;
      const ensemble = functional && !config.completeOutfit ? filterUnsuitableEnsemble(builtEnsemble, targets.regional, functional) : builtEnsemble;
      const accessories = selectPhaseAccessories(config.activity, targets, pool, request.tempC, ensemble);
      const { handwear, headwear } = accessories;
      // Scoring, the echoed targets and manual edits share the upper limits
      // the accessories were chosen against.
      const judged = accessories.extremityMax ? { ...targets, extremity: { ...targets.extremity, max: accessories.extremityMax } } : targets;

      const { recommendation, warnings } = buildScoredRecommendation(
        {
          ensemble,
          weather: {
            temperature: request.tempC,
            windSpeed: targets.policy?.xc?.effectiveWindMs ?? request.windMs,
            humidity: request.humidity,
            precipitation: targets.policy?.xc ? targets.policy.xc.precipitation === 'wet' : request.precipitation,
            ...(targets.policy?.xc ? { precipitationType: request.weather.precipitation_type } : {}),
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
            extremityMaxTarget: judged.extremity.max,
          },
        },
        handwear,
        headwear
      );
      if (accessories.assessments) recommendation.accessories = accessories.assessments;

      const requirements = config.requirementFirst
        ? buildClothingRequirements(config.activity, targets, {
          garments: pool.garments ?? Object.values(pool.categorized).flat(),
          handwear: pool.handwear, headwear: pool.headwear,
          ownership: { garments: pool.usingWardrobe, handwear: pool.handwearOwned ?? false, headwear: pool.headwearOwned ?? false },
          functional,
          ...(config.completeOutfit ? { selectedGarments: ensemble } : {}),
          accessories: accessories.assessments,
          selectedIds: new Set([...ensemble.map((g) => g.id), handwear?.id, headwear.headWarmth?.id, headwear.neckWarmth?.id].filter((id): id is string => Boolean(id))),
        })
        : undefined;
      const missingGuidance = requirements?.filter((r) => r.status === 'missing').map((r) => r.message) ?? [];

      return {
        ...(config.carry ? { carry_items: config.carry(request, targets) } : {}),
        conditions: {
          ...formatConditions(request.weather),
          exertion: request.exertion,
          ...config.conditions(request),
        },
        ireq: formatSinglePhaseIreq(targets.ireq, judged),
        ...(requirements ? { requirements } : {}),
        recommendation,
        warnings: [...warnings, ...(protectedOutfit?.warnings ?? []), ...accessories.warnings],
        guidance: [...new Set([...config.guidance(request, targets.basicIreq, ensemble, targets), ...missingGuidance,
          ...Object.values(accessories.assessments ?? {}).map(assessment => assessment.message),
          ...(targets.policy?.assumptions ?? [])])],
      };
    },
  };
}
