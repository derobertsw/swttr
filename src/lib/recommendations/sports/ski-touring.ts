/**
 * Ski touring: a breathable climbing ensemble plus pack layers for the
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
import { requiredBasicInsulation } from '@/lib/biophysics/ireq';
import {
  basicIreq,
  metabolicRateFor,
  phaseExposure,
  phaseIreq,
  phaseTargets,
  type PhaseTargets,
} from '../thermal-targets';
import { sortByBreathability } from '../sorting';
import { selectPhaseAccessories } from '../extremities';
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

/** Cap on the climb outfit, in resultant clo; converted to basic for the climb's wind and motion. */
const UPHILL_MAX_CLO = 1.8;
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
  /** The same IREQs, and the climb's clo cap, in the basic clo garments are rated in. */
  basic: { uphill: IreqResult; downhill: IreqResult; transition: IreqResult; uphillMaxClo: number };
  uphill: PhaseTargets;
  downhill: PhaseTargets;
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

  computeTargets({ tempC, windMs, humidity, exertion, bodyMetrics }) {
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
    // The climb ends in a hard shell when it fits, and the descent always does.
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
        uphill: basicIreq(uphillIreq, uphillExposure),
        downhill: basicIreq(downhillIreq, downhillExposure),
        transition: basicIreq(transitionIreq, phaseExposure(transitionWind, transitionRate, outer)),
        uphillMaxClo: Math.round(requiredBasicInsulation(UPHILL_MAX_CLO, uphillExposure) * 100) / 100,
      },
      uphill: phaseTargets('ski_touring_uphill', uphillIreq, uphillRate, conditions, uphillWind, uphillIreq, undefined, uphillExposure),
      downhill: phaseTargets('ski_touring_downhill', downhillIreq, downhillRate, conditions, downhillWind, downhillIreq, undefined, downhillExposure),
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

    // Climb: no helmet (conditional), active warmth selection
    const climbAccessories = selectPhaseAccessories('ski_touring_uphill', uphill, pool, tempC);
    const climbHeadwear = climbAccessories.headwear;
    // Descent: helmet mandatory, static warmth selection
    const descentAccessories = selectPhaseAccessories('ski_touring_downhill', downhill, pool, tempC);
    const descentHeadwear = descentAccessories.headwear;

    // Uphill Ensemble
    const uphillEnsemble = buildUphillEnsemble(
      categorized, targets.basic.uphill.ireqMin, targets.basic.uphillMaxClo, UPHILL_MIN_EVAP_POTENTIAL
    );

    const uphillThermalGarments = ensembleToThermalGarments(uphillEnsemble);
    const uphillThermalProperties = predictEnsembleThermal(uphillThermalGarments);
    const uphillTotalClo = uphillThermalProperties.rcl.wholeBody;

    // Pack items are descent gear. Catalog callers draw from the catalog
    // filter (uphill OR downhill >= 6), so restrict the descent pack to
    // insulation that actually clears the downhill threshold. Wardrobe garments
    // stay unfiltered — they're the user's own kit and may lack activity ratings.
    const packInsulationCandidates = pool.usingWardrobe
      ? categorized.insulation
      : categorized.insulation.filter(
          (g) => (g.garment_activity_ratings?.ski_touring_downhill_score ?? 0) >= CATALOG_MIN_SCORE
        );
    const uphillIds = new Set(uphillEnsemble.map((g) => g.id));
    const packShellCandidates = categorized.shells.filter((s) => !uphillIds.has(s.id));
    const additionalCloNeeded = Math.max(0, targets.basic.downhill.ireqNeutral - uphillTotalClo);
    const packInsulationLayer = selectPackableInsulation(
      packInsulationCandidates, additionalCloNeeded, request.prioritizeLightPack
    );

    // Add a hard shell for descent if the climb ensemble doesn't already include one
    const climbHasHardShell = uphillEnsemble.some((g) => g.category === 'hard_shell');
    const packShellLayer = climbHasHardShell
      ? null
      : selectShellForConditions(packShellCandidates, true);

    // Downhill Ensemble (for scoring): climb layers + pack insulation + mandatory shell
    const downhillEnsemble = [...uphillEnsemble];
    if (packInsulationLayer) downhillEnsemble.push(packInsulationLayer);
    if (packShellLayer && !uphillEnsemble.some((g) => g.id === packShellLayer.id)) downhillEnsemble.push(packShellLayer);

    const downhillThermalGarments = ensembleToThermalGarments(downhillEnsemble);
    const downhillThermalProperties = predictEnsembleThermal(downhillThermalGarments);

    // Transition Protocol
    const transitionProtocol = generateTransitionProtocol(
      tempC, windMs, uphillTotalClo, targets.basic.transition, packInsulationLayer
    );

    // Pack Items Compilation
    const packItems: GarmentRow[] = [];
    if (packInsulationLayer) packItems.push(packInsulationLayer);
    if (packShellLayer && !uphillEnsemble.some((g) => g.id === packShellLayer.id)) packItems.push(packShellLayer);

    const totalPackWeightGrams = packItems.reduce((sum, g) => sum + (g.weight_grams ?? 0), 0);

    // Downhill regional clo (climb garments + pack items)
    const downhillRegionalClo = {
      torso: Math.round(downhillThermalProperties.rcl.torso * 100) / 100,
      arms: Math.round(downhillThermalProperties.rcl.arm * 100) / 100,
      legs: Math.round(downhillThermalProperties.rcl.leg * 100) / 100,
    };

    const selectedHandwear = climbAccessories.handwear;
    // Gloves carry over from the climb — only select warmer descent gloves if climb pair is insufficient
    const descentHandwear = selectedHandwear && selectedHandwear.rcl_clo >= downhill.extremity.neutral.hands
      ? selectedHandwear
      : descentAccessories.handwear ?? selectedHandwear;

    const scorePhase = (ensemble: GarmentRow[], phase: PhaseTargets, climb: boolean) => buildScoredRecommendation({
      ensemble,
      weather: { temperature: tempC, windSpeed: climb ? targets.uphillWind : targets.downhillWind, humidity, precipitation: !climb && request.precipitation },
      activity: { name: climb ? 'Ski Touring Uphill' : 'Ski Touring Downhill', metabolicRate: climb ? targets.uphillRate : targets.downhillRate, hasStaticPeriods: false, windExposure: climb ? 'sheltered' : 'exposed' },
      activityKey: climb ? 'ski_touring_uphill' : 'ski_touring_downhill',
      comfortContext: { targetRange: phase.targetRange, regionalMinTarget: phase.regional.min, regionalTarget: phase.regional.neutral,
        extremityMinTarget: phase.extremity.min, extremityTarget: phase.extremity.neutral, extremityMaxTarget: phase.extremity.max },
    }, climb ? selectedHandwear : descentHandwear, climb ? climbHeadwear : descentHeadwear);
    const uphillResult = scorePhase(uphillEnsemble, uphill, true);
    const downhillResult = scorePhase(downhillEnsemble, downhill, false);

    return {
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
        extremity: uphill.extremity,
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
        extremity_ireq: downhill.extremity,
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
          };
        }),
        total_weight_g: totalPackWeightGrams,
      },
      transition_protocol: transitionProtocol,
      warnings: [...uphillResult.warnings.map(w => `Climb: ${w}`), ...downhillResult.warnings.map(w => `Descent: ${w}`)],
      guidance: [
        ...(uphillResult.recommendation.evaluation?.decision?.reasons ?? []).map(r => `Climb: ${r}`),
        ...(downhillResult.recommendation.evaluation?.decision?.reasons ?? []).map(r => `Descent: ${r}`),
        ...generateTouringGuidance(tempC, targets.uphillIreq, targets.downhillIreq),
      ],
    };
  },
};

// ============================================
// ENSEMBLE BUILDING HELPERS
// ============================================

function buildUphillEnsemble(
  categorizedGarments: CategorizedGarments,
  targetMinClo: number,
  targetMaxClo: number,
  minEvapPotential: number
): GarmentRow[] {
  const ensemble: GarmentRow[] = [];

  const torsoBaseLayers = categorizedGarments.baseLayers.filter((g) => g.covers_torso);
  const legsBaseLayers = categorizedGarments.baseLayers.filter((g) => g.covers_legs);

  const torsoBasesSorted = sortByBreathability(torsoBaseLayers);
  if (torsoBasesSorted.length > 0) {
    const breathable = torsoBasesSorted.find(
      (b) => (b.garment_thermal_properties?.evap_potential ?? 0) >= minEvapPotential
    );
    ensemble.push(breathable ?? torsoBasesSorted[0]);
  }

  const legsBasesSorted = sortByBreathability(legsBaseLayers);
  if (legsBasesSorted.length > 0) {
    const breathable = legsBasesSorted.find(
      (b) => (b.garment_thermal_properties?.evap_potential ?? 0) >= minEvapPotential
    );
    const selected = breathable ?? legsBasesSorted[0];
    if (!ensemble.some((g) => g.id === selected.id)) {
      ensemble.push(selected);
    }
  }

  let currentClo = ensemble.reduce(
    (sum, g) => sum + (g.garment_thermal_properties?.rcl_whole_body ?? 0), 0
  );

  if (currentClo < targetMinClo && categorizedGarments.midLayers.length > 0) {
    const relaxedEvap = minEvapPotential * 0.8;

    const torsoMids = sortByBreathability(categorizedGarments.midLayers.filter((g) => g.covers_torso));
    for (const mid of torsoMids) {
      const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
      const midEvap = mid.garment_thermal_properties?.evap_potential ?? 0;
      if (currentClo + midClo <= targetMaxClo && midEvap >= relaxedEvap) {
        ensemble.push(mid);
        currentClo += midClo;
        break;
      }
    }

    const legsMids = sortByBreathability(categorizedGarments.midLayers.filter((g) => g.covers_legs));
    for (const mid of legsMids) {
      if (ensemble.some((g) => g.id === mid.id)) continue;
      const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
      const midEvap = mid.garment_thermal_properties?.evap_potential ?? 0;
      if (currentClo + midClo <= targetMaxClo && midEvap >= relaxedEvap) {
        ensemble.push(mid);
        currentClo += midClo;
        break;
      }
    }
  }

  // Select shells separately for torso and legs
  const torsoShells = categorizedGarments.shells.filter((s) => s.covers_torso);
  const legsShells = categorizedGarments.shells.filter((s) => s.covers_legs);

  const pickShell = (candidates: GarmentRow[]): GarmentRow | null => {
    if (candidates.length === 0) return null;
    // Prefer hard shells for protection on the climb
    const hardShells = candidates.filter((s) => s.category === 'hard_shell');
    if (hardShells.length > 0) return sortByBreathability(hardShells)[0];
    return sortByBreathability(candidates)[0];
  };

  const torsoShell = pickShell(torsoShells);
  if (torsoShell) {
    const shellClo = torsoShell.garment_thermal_properties?.rcl_whole_body ?? 0;
    if (currentClo + shellClo <= targetMaxClo) {
      ensemble.push(torsoShell);
      currentClo += shellClo;
    }
  }

  const legsShell = pickShell(legsShells);
  if (legsShell && !ensemble.some((g) => g.id === legsShell.id)) {
    const shellClo = legsShell.garment_thermal_properties?.rcl_whole_body ?? 0;
    if (currentClo + shellClo <= targetMaxClo) {
      ensemble.push(legsShell);
    }
  }

  return ensemble;
}

// ============================================
// PACK ITEM SELECTION
// ============================================

function selectPackableInsulation(
  availableInsulation: GarmentRow[],
  targetClo: number,
  shouldPrioritizeLightWeight: boolean
): GarmentRow | null {
  if (availableInsulation.length === 0 || targetClo <= 0) return null;

  const scored = availableInsulation.map((g) => {
    const clo = g.garment_thermal_properties?.rcl_whole_body ?? 0;
    const weight = g.weight_grams ?? 500;

    let warmthScore: number;
    if (clo >= targetClo) {
      warmthScore = 1.0 - Math.min(0.5, (clo - targetClo) / 2);
    } else {
      warmthScore = targetClo > 0 ? clo / targetClo : 0;
    }

    const weightScore = Math.max(0, 1.0 - (weight - 200) / 600);

    const totalScore = shouldPrioritizeLightWeight
      ? warmthScore * 0.4 + weightScore * 0.6
      : warmthScore * 0.7 + weightScore * 0.3;

    return { garment: g, score: totalScore };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.garment ?? null;
}

function selectShellForConditions(
  availableShells: GarmentRow[],
  hasPrecipitation: boolean
): GarmentRow | null {
  if (availableShells.length === 0) return null;

  if (hasPrecipitation) {
    const hardShells = availableShells.filter((s) => s.category === 'hard_shell');
    if (hardShells.length > 0) return hardShells[0];
  }

  return sortByBreathability(availableShells)[0];
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
  packInsulationLayer: GarmentRow | null
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
