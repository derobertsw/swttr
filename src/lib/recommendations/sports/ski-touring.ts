/**
 * Ski touring: a breathable climbing outfit plus pack layers for the
 * transition and descent, each phase with its own IREQ targets.
 */
import { garmentMetadata } from '@/lib/garment-metadata';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { DLE_ESTIMATION_METHOD } from '@/lib/biophysics/ireq';
import { buildScoredRecommendation } from '../response-builder';
import type { ExertionLevel } from '@/lib/biophysics/exertion';
import { applyBodySizeMetabolicAdjustment } from '@/lib/biophysics/bodyMetrics';
import { COWEDA_VALIDATION_SOURCE } from '@/lib/biophysics/coweda';
import type { IreqResult } from '@/types/garments';
import type { SportRecommender } from '../handler';
import type { CategorizedGarments, GarmentRow } from '../types';
import { OUTER_AIR_PERMEABILITY } from '@/lib/biophysics/constants';
import {
  basicIreq,
  metabolicRateFor,
  phaseExposure,
  phaseIreq,
  phaseTargets,
  type PhaseTargets,
} from '../thermal-targets';
import { selectPhaseAccessories } from '../extremities';
import { ventilationAdvice, withVentTransitionStep } from '../ventilation';
import { xcProtection } from './xc-outfit';
import {
  buildTouringClimbEnsemble,
  climbProtection,
  selectDescentPack,
  type ClimbProtection,
} from './ski-touring-outfit';
import { buildHelmetRequirement } from '../requirements';
import {
  ensembleToThermalGarments,
  formatConditions,
  formatGarmentResponse,
  formatHandwearResponse,
  formatHeadwearSet,
  formatIreqPhase,
  formatValidationBuffer,
} from '../formatting';

// ============================================
// CONSTANTS
// ============================================

const UPHILL_MIN_EVAP_POTENTIAL = 0.20;
const UPHILL_WIND_FACTOR = 0.3;
const DOWNHILL_SPEED_WIND = 5;
const TRANSITION_WIND_FACTOR = 1.5;
/** Minimum uphill or downhill activity score for catalog garments. */
const CATALOG_MIN_SCORE = 6;

// ============================================
// TYPES
// ============================================

type TransitionPriority = 'urgent' | 'quick' | 'normal';

interface TransitionProtocolResponse {
  priority: TransitionPriority;
  time_limit_minutes: number | null;
  steps: string[];
  warnings: string[];
}

interface IreqBounds {
  ireqMin: number;
  ireqNeutral: number;
}

interface SkiTouringTargets {
  uphillRate: number;
  downhillRate: number;
  uphillWind: number;
  downhillWind: number;
  uphillIreq: IreqResult;
  downhillIreq: IreqResult;
  transitionIreq: IreqResult;
  /** The transition IREQ in the basic clo garments are rated in. */
  basic: { transition: IreqResult };
  uphill: PhaseTargets;
  downhill: PhaseTargets;
  /** Wind and wet protection the climb itself must wear. */
  climbProtection: ClimbProtection;
}

function getTransitionMetabolicRate(exertion: ExertionLevel): number {
  if (exertion === 'easy') return 80;
  if (exertion === 'hard') return 100;
  return 90;
}

// ============================================
// RECOMMENDER
// ============================================

export const skiTouring: SportRecommender<SkiTouringTargets> = {
  catalog: {
    activity: 'ski_touring_uphill',
    predicate: (garment) => {
      const activityRatings = garment.garment_activity_ratings;
      if (!activityRatings) return false;
      const uphillScore = activityRatings.ski_touring_uphill_score ?? 0;
      const downhillScore = activityRatings.ski_touring_downhill_score ?? 0;
      return uphillScore >= CATALOG_MIN_SCORE || downhillScore >= CATALOG_MIN_SCORE;
    },
  },

  computeTargets({ tempC, windMs, humidity, exertion, bodyMetrics, precipitation, weather }) {
    const conditions = { tempC, humidity };
    const uphillRate = metabolicRateFor('ski_touring_uphill', exertion, bodyMetrics);
    const downhillRate = metabolicRateFor('ski_touring_downhill', exertion, bodyMetrics);
    const transitionRate = applyBodySizeMetabolicAdjustment(
      getTransitionMetabolicRate(exertion),
      bodyMetrics
    );
    const uphillWind = windMs * UPHILL_WIND_FACTOR;
    const downhillWind = windMs + DOWNHILL_SPEED_WIND;

    const uphillIreq = phaseIreq(conditions, uphillWind, uphillRate);
    const downhillIreq = phaseIreq(conditions, downhillWind, downhillRate);
    const transitionWind = windMs * TRANSITION_WIND_FACTOR;
    const transitionIreq = phaseIreq(conditions, transitionWind, transitionRate);
    // Every phase keeps the membrane outer the targets were calibrated with
    // (docs/catalog-thermal-calibration.md). The descent always ends in a
    // hard shell; the climb now wears one only for wind or wet (#372), so
    // its targets can understate the basic clo needed in more open fabrics.
    const outer = OUTER_AIR_PERMEABILITY.membrane;
    const uphillExposure = phaseExposure(uphillWind, uphillRate, outer);
    const downhillExposure = phaseExposure(downhillWind, downhillRate, outer);

    return {
      uphillRate,
      downhillRate,
      uphillWind,
      downhillWind,
      uphillIreq,
      downhillIreq,
      transitionIreq,
      basic: {
        transition: basicIreq(transitionIreq, phaseExposure(transitionWind, transitionRate, outer)),
      },
      uphill: phaseTargets('ski_touring_uphill', uphillIreq, uphillRate, conditions, uphillWind, uphillIreq, undefined, uphillExposure),
      downhill: phaseTargets('ski_touring_downhill', downhillIreq, downhillRate, conditions, downhillWind, downhillIreq, undefined, downhillExposure),
      climbProtection: climbProtection(tempC, uphillWind, precipitation, weather.precipitation_type),
    };
  },

  emptyResponse({ tempC }, targets) {
    return {
      ireq: {
        uphill: formatIreqPhase(targets.uphillIreq),
        downhill: formatIreqPhase(targets.downhillIreq),
        transition: formatIreqPhase(targets.transitionIreq),
        dle_hours: targets.downhillIreq.dleHours,
        dle_method: DLE_ESTIMATION_METHOD,
        target_range: targets.uphill.targetRange,
        validation_buffer_clo: {
          uphill: formatValidationBuffer(targets.uphill.validationBuffer),
          downhill: formatValidationBuffer(targets.downhill.validationBuffer),
        },
        validation_source: COWEDA_VALIDATION_SOURCE,
      },
      guidance: generateTouringGuidance(tempC, targets.uphillIreq, targets.downhillIreq),
    };
  },

  recommend(request, targets, pool) {
    const { tempC, windMs, humidity } = request;
    const { categorized } = pool;
    const { uphill, downhill } = targets;

    // Catalog callers draw from the catalog filter (uphill OR downhill >= 6),
    // so each phase only takes catalog garments that clear its own threshold.
    // Wardrobe garments stay unfiltered: they're the user's own kit and may
    // lack activity ratings.
    const suitedFor = (phase: 'ski_touring_uphill_score' | 'ski_touring_downhill_score') => (g: GarmentRow) =>
      pool.usingWardrobe || (g.garment_activity_ratings?.[phase] ?? 0) >= CATALOG_MIN_SCORE;
    const forClimb = suitedFor('ski_touring_uphill_score');
    const forDescent = suitedFor('ski_touring_downhill_score');
    const climbPool: CategorizedGarments = {
      baseLayers: categorized.baseLayers.filter(forClimb),
      midLayers: categorized.midLayers.filter(forClimb),
      insulation: [],
      shells: categorized.shells.filter(forClimb),
    };

    // Climb: fitted region by region; a protective shell only for wind or wet.
    const uphillEnsemble = buildTouringClimbEnsemble(
      climbPool, uphill.regional, targets.climbProtection, UPHILL_MIN_EVAP_POTENTIAL
    );

    const uphillThermalGarments = ensembleToThermalGarments(uphillEnsemble);
    const uphillThermalProperties = predictEnsembleThermal(uphillThermalGarments);
    const uphillTotalClo = uphillThermalProperties.rcl.wholeBody;

    // Descent: the climb clothing stays on; the pack adds the mandatory hard
    // shell, and a fleece or puffy and a leg layer where those regions would
    // fall short. The shell keeps its existing pool (any shell not worn).
    const pack = selectDescentPack(uphillEnsemble, {
      shells: categorized.shells,
      insulation: [...categorized.midLayers, ...categorized.insulation].filter(forDescent),
      legs: [...categorized.shells, ...categorized.insulation].filter(forDescent),
    }, downhill.regional, request.prioritizeLightPack);
    const packItems = [pack.insulation, pack.shell, pack.legs].filter((g): g is GarmentRow => g !== null);
    const downhillEnsemble = [...uphillEnsemble, ...packItems];

    // Accessories fit each phase's local bands, counting that phase's hoods.
    // Climb: no helmet, gloves that grip poles. Descent: helmet required, and
    // the climb's gloves carry over when they fit its band.
    const climbAccessories = selectPhaseAccessories('ski_touring_uphill', uphill, pool, tempC, uphillEnsemble);
    const climbHeadwear = climbAccessories.headwear;
    const descentAccessories = selectPhaseAccessories('ski_touring_downhill', downhill, pool, tempC, downhillEnsemble,
      { precipitation: request.precipitation, preferHandwearId: climbAccessories.handwear?.id });
    const descentHeadwear = descentAccessories.headwear;
    const descentHelmet = buildHelmetRequirement('ski_touring_downhill', descentHeadwear.helmet, pool);
    const climbExtremity = { ...uphill.extremity, max: climbAccessories.extremityMax };
    const descentExtremity = { ...downhill.extremity, max: descentAccessories.extremityMax };

    const downhillThermalGarments = ensembleToThermalGarments(downhillEnsemble);
    const downhillThermalProperties = predictEnsembleThermal(downhillThermalGarments);

    // Transition Protocol
    const transitionProtocol = generateTransitionProtocol(
      tempC, windMs, uphillTotalClo, targets.basic.transition, pack.insulation, pack.legs
    );

    const totalPackWeightGrams = packItems.reduce((sum, g) => sum + (g.weight_grams ?? 0), 0);

    // Downhill regional clo (climb garments + pack items)
    const downhillRegionalClo = {
      torso: Math.round(downhillThermalProperties.rcl.torso * 100) / 100,
      arms: Math.round(downhillThermalProperties.rcl.arm * 100) / 100,
      legs: Math.round(downhillThermalProperties.rcl.leg * 100) / 100,
    };

    const selectedHandwear = climbAccessories.handwear;
    const descentHandwear = descentAccessories.handwear;

    const scorePhase = (ensemble: GarmentRow[], phase: PhaseTargets, extremity: PhaseTargets['extremity'], climb: boolean) => buildScoredRecommendation({
      ensemble,
      weather: { temperature: tempC, windSpeed: climb ? targets.uphillWind : targets.downhillWind, humidity, precipitation: !climb && request.precipitation },
      activity: { name: climb ? 'Ski Touring Uphill' : 'Ski Touring Downhill', metabolicRate: climb ? targets.uphillRate : targets.downhillRate, hasStaticPeriods: false, windExposure: climb ? 'sheltered' : 'exposed' },
      activityKey: climb ? 'ski_touring_uphill' : 'ski_touring_downhill',
      comfortContext: { targetRange: phase.targetRange, regionalMinTarget: phase.regional.min, regionalTarget: phase.regional.neutral,
        extremityMinTarget: extremity.min, extremityTarget: extremity.neutral, extremityMaxTarget: extremity.max },
    }, climb ? selectedHandwear : descentHandwear, climb ? climbHeadwear : descentHeadwear);
    const uphillResult = scorePhase(uphillEnsemble, uphill, climbExtremity, true);
    const downhillResult = scorePhase(downhillEnsemble, downhill, descentExtremity, false);
    uphillResult.recommendation.accessories = climbAccessories.assessments;

    // Vent settings for the selected garments: the climb, then the
    // transition and descent (climb layers stay on, pack layers go on).
    const ventilation = ventilationAdvice({
      windMs,
      precipitation: request.precipitation,
      active: { phase: 'climb', ensemble: uphillEnsemble, metabolicRate: targets.uphillRate, evaluation: uphillResult.recommendation.evaluation },
      rest: [{ phase: 'transition', ensemble: uphillEnsemble }, { phase: 'descent', ensemble: downhillEnsemble }],
    });

    return {
      ...(descentHelmet ? { requirements: [descentHelmet.requirement] } : {}),
      conditions: {
        ...formatConditions(request.weather),
        exertion: request.exertion,
        precipitation: request.precipitation,
      },
      ireq: {
        uphill: formatIreqPhase(targets.uphillIreq),
        downhill: formatIreqPhase(targets.downhillIreq),
        downhill_target_range: downhill.targetRange,
        dle_hours: targets.downhillIreq.dleHours,
        dle_method: DLE_ESTIMATION_METHOD,
        target_range: uphill.targetRange,
        regional: uphill.regional,
        extremity: climbExtremity,
        validation_buffer_clo: {
          uphill: formatValidationBuffer(uphill.validationBuffer),
          downhill: formatValidationBuffer(downhill.validationBuffer),
        },
        validation_source: COWEDA_VALIDATION_SOURCE,
      },
      recommendation: uphillResult.recommendation,
      descent_evaluation: downhillResult.recommendation.evaluation,
      descent_headwear: formatHeadwearSet(descentHeadwear),
      descent_handwear: descentHandwear ? formatHandwearResponse(descentHandwear) : null,
      descent_breakdown: {
        total_clo: Math.round(downhillThermalProperties.rcl.wholeBody * 100) / 100,
        regional_clo: downhillRegionalClo,
        regional_ireq: downhill.regional,
        extremity_ireq: descentExtremity,
      },
      pack_items: {
        garments: packItems.map((g) => {
          const formatted = formatGarmentResponse(g);
          return {
            id: formatted.id, name: formatted.name,
            ...garmentMetadata(formatted),
            weight_g: g.weight_grams,
            rcl_clo: formatted.rcl,
            rcl_torso: formatted.rcl_torso,
            // Where the layer goes on at the transition (#372 adds leg layers).
            rcl_legs: formatted.rcl_legs,
            covers_torso: formatted.covers_torso,
            covers_arms: formatted.covers_arms,
            covers_legs: formatted.covers_legs,
          };
        }),
        total_weight_g: totalPackWeightGrams,
      },
      transition_protocol: withVentTransitionStep(transitionProtocol, ventilation),
      warnings: [
        ...[...uphillResult.warnings, ...climbAccessories.warnings].map(w => `Climb: ${w}`),
        ...climbProtectionWarnings(uphillEnsemble, targets.climbProtection),
        ...[...downhillResult.warnings, ...descentAccessories.warnings, ...(descentHelmet?.warnings ?? [])].map(w => `Descent: ${w}`),
      ],
      guidance: [
        ...(uphillResult.recommendation.evaluation?.decision?.reasons ?? []).map(r => `Climb: ${r}`),
        ...(downhillResult.recommendation.evaluation?.decision?.reasons ?? []).map(r => `Descent: ${r}`),
        climbProtectionGuidance(targets.climbProtection, pack.shell),
        ...(pack.legs ? [`Descent: put ${pack.legs.brand} ${pack.legs.model_name} on over your climbing layers. Pants with full side zips go on over ski boots.`] : []),
        ...generateTouringGuidance(tempC, targets.uphillIreq, targets.downhillIreq),
      ],
      ...(ventilation && { ventilation }),
    };
  },
};

// ============================================
// CLIMB PROTECTION
// ============================================

/** Report each region the climb couldn't protect, since protection ranks before warmth. */
function climbProtectionWarnings(ensemble: GarmentRow[], needs: ClimbProtection): string[] {
  return (['torso', 'legs'] as const).flatMap((region) => {
    const lacking: string[] = [];
    if (needs.wind && !xcProtection(ensemble, region, { wind: true, wet: false })) lacking.push('wind');
    if (needs.wet && !xcProtection(ensemble, region, { wind: false, wet: true })) lacking.push('wet-weather');
    return lacking.length ? [`Climb: Available clothing lacks required ${lacking.join(' and ')} protection for ${region}.`] : [];
  });
}

/** Say why the climb does or doesn't wear a shell. */
function climbProtectionGuidance(needs: ClimbProtection, packedShell: GarmentRow | null): string {
  if (needs.wet) return 'Climb: rain or wet snow calls for a waterproof or water-resistant outer layer on the climb.';
  if (needs.wind) return 'Climb: wind on the climb calls for a wind-resistant outer layer.';
  return packedShell
    ? `Climb: no wind or wet protection is needed while climbing, so the ${packedShell.brand} ${packedShell.model_name} stays in the pack until the descent.`
    : 'Climb: no wind or wet protection is needed while climbing.';
}

// ============================================
// TRANSITION PROTOCOL
// ============================================

const URGENT_CLO_DEFICIT_THRESHOLD = 1.5;
const QUICK_CLO_DEFICIT_THRESHOLD = 0.5;
const HIGH_WIND_THRESHOLD = 10;
const FROSTBITE_RISK_TEMP = -15;

function generateTransitionProtocol(
  tempC: number,
  windMs: number,
  currentUphillClo: number,
  ireqTransition: IreqBounds,
  packInsulationLayer: GarmentRow | null,
  packLegLayer: GarmentRow | null
): TransitionProtocolResponse {
  const deficit = ireqTransition.ireqMin - currentUphillClo;

  let priority: TransitionPriority = 'normal';
  let timeLimitMinutes: number | null = null;
  let steps: string[] = [];
  const warnings: string[] = [];

  if (deficit > URGENT_CLO_DEFICIT_THRESHOLD) {
    priority = 'urgent';
    timeLimitMinutes = 5;
    steps = [
      'IMMEDIATELY add insulation layer before doing anything else',
      'Then handle skins and ski mode transition',
      'Add shell if windy/snowing',
    ];
    warnings.push(`High heat loss risk: ${currentUphillClo.toFixed(1)} clo vs ${ireqTransition.ireqMin.toFixed(1)} clo needed`);
  } else if (deficit > QUICK_CLO_DEFICIT_THRESHOLD) {
    priority = 'quick';
    timeLimitMinutes = 10;
    steps = ['Add insulation layer first', 'Handle skins and boots', 'Add shell if needed'];
  } else {
    steps = ['Handle skins and ski mode at normal pace', 'Add layers if feeling cold'];
  }

  if (windMs > HIGH_WIND_THRESHOLD) {
    steps.unshift('Find wind shelter if possible');
    warnings.push('High wind - minimize exposed time');
  }

  if (tempC < FROSTBITE_RISK_TEMP) {
    warnings.push('Risk of freezing exposed skin - keep gloves on');
  }

  if (packInsulationLayer) {
    steps.push(`Insulation to add: ${packInsulationLayer.brand} ${packInsulationLayer.model_name}`);
  }
  if (packLegLayer) {
    steps.push(`Leg layer to add: ${packLegLayer.brand} ${packLegLayer.model_name}`);
  }

  return { priority, time_limit_minutes: timeLimitMinutes, steps, warnings };
}

// ============================================
// GUIDANCE
// ============================================

function generateTouringGuidance(
  tempC: number,
  ireqUphill: IreqBounds,
  ireqDownhill: IreqBounds
): string[] {
  const guidance: string[] = [];

  guidance.push(`Uphill target: ${ireqUphill.ireqMin.toFixed(1)}-${ireqUphill.ireqNeutral.toFixed(1)} clo`);
  guidance.push(`Downhill target: ${ireqDownhill.ireqMin.toFixed(1)}-${ireqDownhill.ireqNeutral.toFixed(1)} clo`);

  const requiredPackClo = ireqDownhill.ireqNeutral - ireqUphill.ireqNeutral;
  guidance.push(`Pack insulation adding ~${requiredPackClo.toFixed(1)} clo for transitions/descent`);

  if (tempC > 0) {
    guidance.push('Warm conditions - may need minimal extra layers for descent');
  } else if (tempC > -10) {
    guidance.push('Standard touring conditions - bring packable insulation');
  } else {
    guidance.push('Cold conditions - ensure robust insulation in pack');
  }

  guidance.push(`Prioritize breathability for uphill (evap potential >= ${UPHILL_MIN_EVAP_POTENTIAL})`);

  return guidance;
}
