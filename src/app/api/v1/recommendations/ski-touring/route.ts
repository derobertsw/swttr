import { NextRequest, NextResponse } from 'next/server';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { calculateIreq, calculateRegionalIreq, calculateExtremityIreq } from '@/lib/biophysics/ireq';
import { scoreEnsemble } from '@/lib/biophysics/scorer';
import { METABOLIC_RATES } from '@/lib/biophysics/constants';
import { calculateActivityTargetRange } from '@/lib/biophysics/targets';
import {
  type GarmentRow,
  type CategorizedGarments,
  validateRecommendationRequest,
  getUserWardrobeGarmentIds,
  fetchGarmentsWithDetails,
  categorizeGarments,
  sortByBreathability,
  ensembleToThermalGarments,
  fetchUserHandwear,
  fetchUserHeadwear,
  selectHandwear,
  selectHeadwearByCategory,
  formatGarmentResponse,
  formatHandwearResponse,
  formatHeadwearResponse,
} from '@/lib/recommendations/shared';

// ============================================
// CONSTANTS
// ============================================

const UPHILL_MAX_CLO = 1.8;
const UPHILL_MIN_EVAP_POTENTIAL = 0.20;
const UPHILL_WIND_FACTOR = 0.3;
const DOWNHILL_SPEED_WIND = 5;
const TRANSITION_WIND_FACTOR = 1.5;
const TRANSITION_METABOLIC_RATE = 90;
const SHELL_WIND_THRESHOLD = 8;

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

interface IreqResult {
  ireqMin: number;
  ireqNeutral: number;
}

// ============================================
// MAIN ROUTE HANDLER
// ============================================

/**
 * POST /api/v1/recommendations/ski-touring
 *
 * Generates clothing recommendations for ski touring with two sets:
 * 1. Primary ensemble for uphill climbing
 * 2. Pack items for transitions/descent
 */
export async function POST(request: NextRequest) {
  const validated = await validateRecommendationRequest(request);
  if (validated instanceof NextResponse) return validated;

  const { supabase, userId, weather, tempC, windMs, body } = validated;
  const shouldPrioritizeLightPack = (body.prioritize_light_pack as boolean) ?? false;
  const defaultHumidity = weather.humidity ?? 50;

  // IREQ Calculations
  const ireqUphill = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs * UPHILL_WIND_FACTOR,
    relativeHumidity: defaultHumidity,
    metabolicRate: METABOLIC_RATES.ski_touring_uphill,
  });

  const ireqDownhill = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs + DOWNHILL_SPEED_WIND,
    relativeHumidity: defaultHumidity,
    metabolicRate: METABOLIC_RATES.ski_touring_downhill,
  });

  const ireqTransition = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs * TRANSITION_WIND_FACTOR,
    relativeHumidity: defaultHumidity,
    metabolicRate: TRANSITION_METABOLIC_RATE,
  });

  const regionalIreqDownhill = calculateRegionalIreq(ireqDownhill, 'ski_touring_downhill');
  const extremityIreqDownhill = calculateExtremityIreq(
    ireqDownhill, 'ski_touring_downhill', tempC, windMs + DOWNHILL_SPEED_WIND
  );

  // Wardrobe and Garment Fetching
  const wardrobeGarmentIds = await getUserWardrobeGarmentIds(supabase, userId);
  const hasUserWardrobe = wardrobeGarmentIds && wardrobeGarmentIds.length > 0;

  const { data: fetchedGarments, error: garmentFetchError } = await fetchGarmentsWithDetails(
    supabase, { wardrobeIds: hasUserWardrobe ? wardrobeGarmentIds : null }
  );

  if (garmentFetchError) {
    return NextResponse.json({ error: garmentFetchError.message }, { status: 500 });
  }

  const suitableGarments = hasUserWardrobe
    ? (fetchedGarments ?? [])
    : (fetchedGarments ?? []).filter((garment) => {
        const activityRatings = garment.garment_activity_ratings;
        if (!activityRatings) return false;
        const uphillScore = activityRatings.ski_touring_uphill_score ?? 0;
        const downhillScore = activityRatings.ski_touring_downhill_score ?? 0;
        return uphillScore >= 6 || downhillScore >= 6;
      });

  if (suitableGarments.length === 0) {
    return NextResponse.json({
      message: 'No suitable garments found in database',
      ireq: {
        uphill: { min: ireqUphill.ireqMin, neutral: ireqUphill.ireqNeutral, dle_hours: ireqUphill.dleHours },
        downhill: { min: ireqDownhill.ireqMin, neutral: ireqDownhill.ireqNeutral, dle_hours: ireqDownhill.dleHours },
        transition: { min: ireqTransition.ireqMin, neutral: ireqTransition.ireqNeutral, dle_hours: ireqTransition.dleHours },
        dle_hours: ireqDownhill.dleHours,
      },
      guidance: generateTouringGuidance(tempC, ireqUphill, ireqDownhill),
    });
  }

  // Extremity Gear
  const [userHandwear, userHeadwear] = await Promise.all([
    fetchUserHandwear(supabase, userId),
    fetchUserHeadwear(supabase, userId),
  ]);

  const selectedHandwear = selectHandwear(userHandwear, tempC, false);
  const selectedHeadwear = selectHeadwearByCategory(userHeadwear, tempC, false);

  // Uphill Ensemble
  const categorizedGarments = categorizeGarments(suitableGarments);
  const uphillEnsemble = buildUphillEnsemble(
    categorizedGarments, ireqUphill.ireqMin, UPHILL_MAX_CLO, UPHILL_MIN_EVAP_POTENTIAL
  );

  const uphillThermalGarments = ensembleToThermalGarments(uphillEnsemble);
  const uphillThermalProperties = predictEnsembleThermal(uphillThermalGarments);
  const uphillTotalClo = uphillThermalProperties.rcl.wholeBody;

  // Pack Items
  const additionalCloNeeded = Math.max(0, ireqDownhill.ireqNeutral - uphillTotalClo);
  const packInsulationLayer = selectPackableInsulation(
    categorizedGarments.insulation, additionalCloNeeded, shouldPrioritizeLightPack
  );

  const needsShellLayer = weather.precipitation || windMs > SHELL_WIND_THRESHOLD;
  const packShellLayer = needsShellLayer
    ? selectShellForConditions(categorizedGarments.shells, weather.precipitation ?? false)
    : null;

  // Downhill Ensemble (for scoring)
  const downhillEnsemble = [...uphillEnsemble];
  if (packInsulationLayer) downhillEnsemble.push(packInsulationLayer);
  if (packShellLayer && !uphillEnsemble.includes(packShellLayer)) downhillEnsemble.push(packShellLayer);

  const downhillThermalGarments = ensembleToThermalGarments(downhillEnsemble);

  // Scoring
  const uphillScore = scoreEnsemble(
    uphillThermalGarments,
    { temperature: tempC, windSpeed: windMs * UPHILL_WIND_FACTOR, humidity: defaultHumidity, precipitation: false },
    { name: 'Ski Touring Uphill', metabolicRate: METABOLIC_RATES.ski_touring_uphill, hasStaticPeriods: false, windExposure: 'sheltered' },
    'ski_touring_uphill'
  );

  const downhillScore = scoreEnsemble(
    downhillThermalGarments,
    { temperature: tempC, windSpeed: windMs + DOWNHILL_SPEED_WIND, humidity: defaultHumidity, precipitation: weather.precipitation ?? false },
    { name: 'Ski Touring Downhill', metabolicRate: METABOLIC_RATES.ski_touring_downhill, hasStaticPeriods: false, windExposure: 'exposed' },
    'ski_touring_downhill'
  );

  // Transition Protocol
  const transitionProtocol = generateTransitionProtocol(
    tempC, windMs, uphillTotalClo, ireqTransition, packInsulationLayer
  );

  // Pack Items Compilation
  const packItems: GarmentRow[] = [];
  if (packInsulationLayer) packItems.push(packInsulationLayer);
  if (packShellLayer && !uphillEnsemble.some((g) => g.id === packShellLayer.id)) packItems.push(packShellLayer);

  const totalPackWeightGrams = packItems.reduce((sum, g) => sum + (g.weight_grams ?? 0), 0);

  const downhillRange = calculateActivityTargetRange({
    activity: 'ski_touring_downhill',
    ireqMin: ireqDownhill.ireqMin,
    ireqNeutral: ireqDownhill.ireqNeutral,
    dleHours: ireqDownhill.dleHours,
    airTempC: tempC,
    windSpeedMs: windMs + DOWNHILL_SPEED_WIND,
  });
  const targetCloRange: [number, number] = [downhillRange.min, downhillRange.max];

  return NextResponse.json({
    conditions: {
      temperature: `${weather.temperature}°F`,
      wind_speed: `${weather.wind_speed} mph`,
      precipitation: weather.precipitation ?? false,
    },
    ireq: {
      uphill: { min: ireqUphill.ireqMin, neutral: ireqUphill.ireqNeutral, dle_hours: ireqUphill.dleHours },
      downhill: { min: ireqDownhill.ireqMin, neutral: ireqDownhill.ireqNeutral, dle_hours: ireqDownhill.dleHours },
      dle_hours: ireqDownhill.dleHours,
      target_range: targetCloRange,
      regional: regionalIreqDownhill,
      extremity: extremityIreqDownhill,
    },
    recommendation: {
      garments: uphillEnsemble.map(formatGarmentResponse),
      handwear: selectedHandwear ? formatHandwearResponse(selectedHandwear) : null,
      headwear: {
        helmet: selectedHeadwear.helmet ? formatHeadwearResponse(selectedHeadwear.helmet) : null,
        head_warmth: selectedHeadwear.headWarmth ? formatHeadwearResponse(selectedHeadwear.headWarmth) : null,
        neck_warmth: selectedHeadwear.neckWarmth ? formatHeadwearResponse(selectedHeadwear.neckWarmth) : null,
      },
      ensemble_properties: {
        total_clo: Math.round(uphillThermalProperties.rcl.wholeBody * 100) / 100,
        regional_clo: {
          torso: Math.round(uphillThermalProperties.rcl.torso * 100) / 100,
          arms: Math.round(uphillThermalProperties.rcl.arm * 100) / 100,
          legs: Math.round(uphillThermalProperties.rcl.leg * 100) / 100,
        },
        evap_potential: Math.round(uphillThermalProperties.evapPotential * 1000) / 1000,
        permeability_index: Math.round(uphillThermalProperties.im * 100) / 100,
      },
      score: uphillScore.totalScore,
      thermal_comfort_score: Math.round(
        ((uphillScore.componentScores.coldProtection + uphillScore.componentScores.overheatPrevention) / 2) * 10
      ) / 10,
      component_scores: uphillScore.componentScores,
    },
    pack_items: {
      garments: packItems.map((g) => ({ id: g.id, name: `${g.brand} ${g.model_name}`, weight_g: g.weight_grams })),
      total_weight_g: totalPackWeightGrams,
    },
    transition_protocol: transitionProtocol,
    warnings: [...uphillScore.warnings, ...downhillScore.warnings],
    guidance: generateTouringGuidance(tempC, ireqUphill, ireqDownhill),
  });
}

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
    const midsSorted = sortByBreathability(categorizedGarments.midLayers);
    const relaxedEvap = minEvapPotential * 0.8;

    for (const mid of midsSorted) {
      const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
      const midEvap = mid.garment_thermal_properties?.evap_potential ?? 0;
      if (currentClo + midClo <= targetMaxClo && midEvap >= relaxedEvap) {
        ensemble.push(mid);
        currentClo += midClo;
        break;
      }
    }
  }

  const breathableSoftShells = categorizedGarments.shells.filter((s) => {
    return s.category === 'soft_shell' &&
      (s.garment_thermal_properties?.evap_potential ?? 0) >= UPHILL_MIN_EVAP_POTENTIAL;
  });

  const shellCandidates = breathableSoftShells.length > 0
    ? breathableSoftShells
    : categorizedGarments.shells;

  if (shellCandidates.length > 0) {
    const shellsSorted = sortByBreathability(shellCandidates);
    const bestShell = shellsSorted[0];
    const shellClo = bestShell.garment_thermal_properties?.rcl_whole_body ?? 0;
    if (currentClo + shellClo <= targetMaxClo) {
      ensemble.push(bestShell);
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
  ireqTransition: IreqResult,
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
  ireqUphill: IreqResult,
  ireqDownhill: IreqResult
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
