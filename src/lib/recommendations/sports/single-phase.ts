/**
 * Recommender for sports modelled as one continuous activity phase (running,
 * biking, XC skiing): a single IREQ and target range, active-use extremity
 * gear, and the helmet the sport requires (biking).
 */
import { xcPhaseContext } from '@/lib/biophysics/xc-policy';
import type { BiophysicsRecommendation } from '@/types/biophysics';
import type { ActivityType } from '@/lib/biophysics/constants';
import type { ActivityProfile } from '@/lib/biophysics/scorer';
import type { SustainedSportPolicy } from '@/lib/biophysics/sport-policy';
import type { ExertionLevel } from '@/lib/biophysics/exertion';
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
  noWarmerThan,
  phaseTargets,
  type PhaseTargets,
} from '../thermal-targets';
import { hoodHeadPlanner, selectPhaseAccessories, type HoodHeadPlanner } from '../extremities';
import { buildScoredRecommendation } from '../response-builder';
import { assessFootwear, footwearAdvice } from '../footwear';
import { formatConditions, formatSinglePhaseIreq } from '../formatting';
import { buildClothingRequirements, buildHelmetRequirement, filterUnsuitableEnsemble } from '../requirements';
import { describePreference, preferenceOverreach, warmOrCold } from '../preference';

interface SinglePhaseTargets extends PhaseTargets {
  metabolicRate: number;
  /** IREQ: the resultant insulation required in this wind and motion. */
  ireq: IreqResult;
  /** The same IREQ in the basic clo garments are rated in. */
  basicIreq: IreqResult;
  /** Protection required by a sport without a sustained policy (cycling). */
  protection?: SustainedSportPolicy['protection'];
}

type Protection = SustainedSportPolicy['protection'];

const EASIER_EFFORT: Record<ExertionLevel, ExertionLevel | null> = { easy: null, moderate: 'easy', hard: 'moderate' };

/** Protection the worn outfit must establish: the sustained policy's or the sport's own. */
function outfitNeeds(targets: SinglePhaseTargets): Protection | undefined {
  return targets.policy?.protection ?? targets.protection;
}

/** Manual edits repeat these checks. A sustained policy already carries them. */
function outfitChecks(targets: SinglePhaseTargets, requirementFirst = false) {
  return !targets.policy && targets.protection
    ? { outfit_checks: { require_standalone: requirementFirst, protection: targets.protection } }
    : {};
}

interface SinglePhaseSportConfig {
  activity: ActivityType;
  /** Name and wind exposure used when scoring the ensemble. */
  profile: Pick<ActivityProfile, 'name' | 'windExposure'>;
  /** Evaporative potential a layer should reach to count as breathable. */
  minEvapPotential: number;
  catalog?: CatalogFilter;
  /** `head` counts hood head warmth the way the accessories and outfit check do (#413). */
  buildEnsemble(
    categorized: CategorizedGarments,
    targets: SinglePhaseTargets,
    request: RecommendationRequest,
    head: HoodHeadPlanner,
  ): GarmentRow[];
  /** Extra fields echoed in `conditions` after temperature, wind and exertion. */
  conditions(request: RecommendationRequest): object;
  guidance(request: RecommendationRequest, ireq: IreqResult, ensemble?: GarmentRow[], targets?: SinglePhaseTargets): string[];
  /** Advice for packed items, excluded from the worn ensemble and its comfort score. */
  carry?(request: RecommendationRequest, targets: SinglePhaseTargets): BiophysicsRecommendation['carry_items'];
  /** Retain functional protection when a calibrated budget changes. */
  protect?(ensemble: GarmentRow[], categorized: CategorizedGarments, targets: SinglePhaseTargets): { ensemble: GarmentRow[]; warnings: string[] };
  /** Air permeability of the outer layer this sport dresses in these conditions, l/(m²·s). */
  outerAirPermeability(request: RecommendationRequest): number;
  /** Requirement-first flow: report suitable-clothing needs separately from wardrobe matches. */
  requirementFirst?: boolean;
  /** Selector has already assessed suitability of the complete outfit. */
  completeOutfit?: boolean;
  /** Whether the torso requirement includes a wind layer for this request. */
  windTorsoRequirement?(request: RecommendationRequest): boolean;
  /** Wind and rain protection for a sport without a sustained policy. */
  protection?(request: RecommendationRequest): Protection;
  /** Relative air speed at the body, m/s, for the heat balance and the
   * basic-clo conversion only (cycling's riding speed, #374). Defaults to the
   * phase wind. Heuristic wind terms and the margin taper keep the phase wind. */
  airSpeedMs?(request: RecommendationRequest): number;
}

/** Compose one-phase targets, outfit/protection selection, and response evaluation for a sport. */
export function createSinglePhaseSport(
  config: SinglePhaseSportConfig
): SportRecommender<SinglePhaseTargets> {
  const sport: SportRecommender<SinglePhaseTargets> = {
    catalog: { ...config.catalog, activity: config.activity },

    /** Derive moving targets with the same exposure and precipitation policy used for scoring. */
    computeTargets(request) {
      const xc = config.activity === 'xc_skiing' ? xcPhaseContext({ ...request, precipitationType: request.weather.precipitation_type }) : undefined;
      const conditions = { tempC: request.tempC, humidity: request.humidity,
        precipitation: xc ? xc.precipitation === 'wet' : request.precipitation, ...(xc ? { xc } : {}) };
      const windMs = xc?.effectiveWindMs ?? request.windMs;
      const airSpeedMs = config.airSpeedMs?.(request) ?? windMs;
      const metabolicRate = metabolicRateFor(config.activity, request.exertion, request.bodyMetrics);
      const ireq = phaseIreq(conditions, airSpeedMs, metabolicRate);
      const exposure = phaseExposure(airSpeedMs, metabolicRate, config.outerAirPermeability(request));
      const targets: SinglePhaseTargets = {
        metabolicRate,
        ireq,
        basicIreq: basicIreq(ireq, exposure),
        ...(config.protection ? { protection: config.protection(request) } : {}),
        ...phaseTargets(config.activity, ireq, metabolicRate, conditions, windMs, ireq, request.exertion, exposure,
          request.preference?.sensitivity),
      };
      // When air speed rises with effort (cycling, #374), a harder effort's
      // faster riding raises the basic-clo conversion. Where the resultant
      // upper band sits at its cap, that alone could make the harder band
      // warmer, so it is bounded by the next easier effort's bands.
      const easier = config.airSpeedMs && EASIER_EFFORT[request.exertion];
      if (!easier) return targets;
      return { ...targets, ...noWarmerThan(targets, sport.computeTargets({ ...request, exertion: easier })) };
    },

    /** Report clothing gaps and carry advice when no usable garments are available. */
    emptyResponse(request, targets) {
      // The no-garment fast path has not inspected accessory availability.
      const accessories = selectPhaseAccessories(config.activity, targets, { handwear: [], headwear: [], availability: 'unknown' }, request.tempC);
      const footwear = assessFootwear(config.activity, targets.feet);
      const setting = warmOrCold(request.preference);
      const preference = setting && targets.policy
        ? describePreference(setting, targets, { targets: sport.computeTargets({ ...request, preference: undefined }) })
        : undefined;
      const needs = outfitNeeds(targets);
      return {
        ...(preference ? { preference } : {}),
        ...(config.carry ? { carry_items: config.carry(request, targets) } : {}),
        ireq: targets.policy ? formatSinglePhaseIreq(targets.ireq, targets) : { min: targets.ireq.ireqMin, neutral: targets.ireq.ireqNeutral },
        ...(config.requirementFirst ? {
          requirements: buildClothingRequirements(config.activity, targets, { garments: [], handwear: [], headwear: [], ownership: { garments: false, handwear: false, headwear: false },
            ...(needs ? { functional: { protection: needs } } : {}), accessories: accessories.assessments }),
        } : {}),
        recommendations: {
          target_clo_range: targets.targetRange,
          min_evap_potential: config.minEvapPotential,
          accessories: accessories.assessments,
          footwear,
          guidance: [...(config.activity === 'xc_skiing' ? config.guidance(request, targets.basicIreq, [], targets) : config.guidance(request, targets.basicIreq)), ...(targets.policy?.assumptions ?? []),
            footwear.message, ...(preference ? [preference.message] : [])],
        },
      };
    },

    /** Select and score worn clothing, then report requirements, protection gaps, and carry advice. */
    recommend(request, targets, pool) {
      const needs = outfitNeeds(targets);
      const functional = config.requirementFirst
        ? {
          minEvapPotential: config.minEvapPotential,
          torsoWind: config.windTorsoRequirement?.(request) ?? false,
          protection: needs,
        }
        : undefined;
      /** Worn clothing for one set of targets, and the protection it still lacks. */
      const select = (phase: SinglePhaseTargets) => {
        const head = hoodHeadPlanner(config.activity, phase, pool.headwear, request.tempC);
        const built = config.buildEnsemble(pool.categorized, phase, request, head);
        const protectedOutfit = config.protect?.(built, pool.categorized, phase);
        const builtEnsemble = protectedOutfit?.ensemble ?? built;
        return {
          ensemble: functional && !config.completeOutfit ? filterUnsuitableEnsemble(builtEnsemble, phase.regional, functional) : builtEnsemble,
          protectionWarnings: protectedOutfit?.warnings ?? [],
        };
      };
      let { ensemble, protectionWarnings } = select(targets);

      // Run Warm/Run Cold (#251): the standard targets' choice, to keep when
      // the narrowed band's choice would overreach, and to explain the change.
      const setting = warmOrCold(request.preference);
      const standardTargets = setting && targets.policy ? sport.computeTargets({ ...request, preference: undefined }) : undefined;
      let usual: { ensemble: GarmentRow[]; kept: 'minimum' | 'upper_limit' | null } | undefined;
      if (setting && standardTargets && targets.policy?.preference?.targetsChanged) {
        const standardChoice = select(standardTargets);
        const kept = preferenceOverreach(setting.sensitivity, ensemble, standardChoice.ensemble, standardTargets);
        if (kept) ({ ensemble, protectionWarnings } = standardChoice);
        usual = { ensemble: standardChoice.ensemble, kept };
      }

      const accessories = selectPhaseAccessories(config.activity, targets, pool, request.tempC, ensemble, { precipitation: request.precipitation });
      const { handwear, headwear } = accessories;
      const usualAccessories = usual && standardTargets
        && selectPhaseAccessories(config.activity, standardTargets, pool, request.tempC, usual.ensemble, { precipitation: request.precipitation });
      const preference = setting && standardTargets ? describePreference(setting, targets, {
        targets: standardTargets,
        ...(usual && usualAccessories ? { selections: {
          chosen: { ensemble, handwear, headwear },
          usual: { ensemble: usual.ensemble, handwear: usualAccessories.handwear, headwear: usualAccessories.headwear },
          kept: usual.kept,
        } } : {}),
      }) : undefined;
      // Scoring, the echoed targets and manual edits share the upper limits
      // the accessories were chosen against.
      const judged = { ...targets, extremity: { ...targets.extremity, max: accessories.extremityMax } };

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
            sensitivity: targets.policy?.preference?.targetsChanged ? targets.policy.preference.sensitivity : undefined,
            requireStandalone: config.requirementFirst,
            protectionNeeds: needs,
            targetRange: targets.targetRange,
            regionalMinTarget: targets.regional.min,
            regionalTarget: targets.regional.neutral,
            extremityMinTarget: targets.extremity.min,
            extremityTarget: targets.extremity.neutral,
            extremityMaxTarget: judged.extremity.max,
            exposureConditions: targets.exposureConditions,
          },
        },
        handwear,
        headwear
      );
      recommendation.accessories = accessories.assessments;
      recommendation.footwear = assessFootwear(config.activity, targets.feet);
      const feet = footwearAdvice(recommendation.footwear);

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
      // Required protection is reported whatever the thermal demand.
      const helmet = buildHelmetRequirement(config.activity, headwear.helmet, pool);

      return {
        ...(preference ? { preference } : {}),
        ...(config.carry ? { carry_items: config.carry(request, targets) } : {}),
        conditions: {
          ...formatConditions(request.weather),
          exertion: request.exertion,
          ...config.conditions(request),
        },
        ireq: { ...formatSinglePhaseIreq(targets.ireq, judged), ...outfitChecks(targets, config.requirementFirst) },
        ...(requirements || helmet ? { requirements: [...(requirements ?? []), ...(helmet ? [helmet.requirement] : [])] } : {}),
        recommendation,
        warnings: [...warnings, ...protectionWarnings, ...accessories.warnings, ...(helmet?.warnings ?? []), ...feet.warnings],
        guidance: [...new Set([...config.guidance(request, targets.basicIreq, ensemble, targets), ...(recommendation.evaluation?.decision?.reasons ?? []), ...missingGuidance,
          ...Object.values(accessories.assessments).map(assessment => assessment.message), ...feet.guidance,
          ...(targets.policy?.assumptions ?? []), ...(preference ? [preference.message] : [])])],
      };
    },
  };
  return sport;
}
