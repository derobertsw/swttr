import { NextRequest, NextResponse } from 'next/server';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { calculateIreq, calculateRegionalIreq, calculateExtremityIreq } from '@/lib/biophysics/ireq';
import { scoreEnsemble } from '@/lib/biophysics/scorer';
import { METABOLIC_RATES } from '@/lib/biophysics/constants';
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

/** Maximum clo value for uphill climbing to prevent overheating */
const UPHILL_MAX_CLO = 1.8;

/** Minimum evaporative potential required for uphill garments */
const UPHILL_MIN_EVAP_POTENTIAL = 0.20;

/** Sheltered wind factor when climbing (trees, terrain block wind) */
const UPHILL_WIND_FACTOR = 0.3;

/** Additional wind speed from skiing descent (m/s) */
const DOWNHILL_SPEED_WIND = 5;

/** Wind exposure factor at transitions (often on exposed ridges) */
const TRANSITION_WIND_FACTOR = 1.5;

/** Metabolic rate for standing/resting at transitions (W/m²) */
const TRANSITION_METABOLIC_RATE = 90;

/** Wind speed threshold for recommending shell (m/s) */
const SHELL_WIND_THRESHOLD = 8;

// ============================================
// TYPES
// ============================================

/** Transition protocol urgency levels based on thermal risk */
type TransitionPriority = 'urgent' | 'quick' | 'normal';

/** Complete transition protocol for skin-to-ski mode changes (API response format) */
interface TransitionProtocolResponse {
  priority: TransitionPriority;
  time_limit_minutes: number | null;
  steps: string[];
  warnings: string[];
}

/** IREQ calculation result with min and neutral values */
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
 * Generates clothing recommendations for ski touring, addressing the unique
 * challenge of needing minimal insulation while climbing (high metabolic output)
 * but more protection during transitions and descending (lower metabolic output,
 * higher wind exposure).
 *
 * Returns two sets of recommendations:
 * 1. Primary ensemble for uphill climbing (worn while skinning)
 * 2. Pack items for transitions/descent (packable insulation and shell)
 *
 * @param request - Next.js request with weather data and optional preferences
 * @returns JSON response with recommendations, IREQ values, and transition protocol
 *
 * Request Body:
 * {
 *   weather: {
 *     temperature: number,       // Temperature in °F
 *     wind_speed: number,        // Wind speed in mph
 *     humidity?: number,         // Relative humidity (0-100)
 *     precipitation?: boolean    // Whether precipitation is expected
 *   },
 *   prioritize_light_pack?: boolean  // Prefer lighter pack items (default: false)
 * }
 *
 * Headers:
 *   x-user-id: string (optional) - If provided, uses only user's wardrobe items
 */
export async function POST(request: NextRequest) {
  // ----------------------------------------
  // Request Validation
  // ----------------------------------------
  const validated = await validateRecommendationRequest(request);
  if (validated instanceof NextResponse) return validated;

  const { supabase, userId, weather, tempC, windMs, body } = validated;
  const shouldPrioritizeLightPack = (body.prioritize_light_pack as boolean) ?? false;
  const defaultHumidity = weather.humidity ?? 50;

  // ----------------------------------------
  // IREQ Calculations for Each Activity Phase
  // ----------------------------------------

  // Uphill: High metabolic output, sheltered from wind by terrain/trees
  const ireqUphill = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs * UPHILL_WIND_FACTOR,
    relativeHumidity: defaultHumidity,
    metabolicRate: METABOLIC_RATES.ski_touring_uphill,
  });

  // Downhill: Lower metabolic output, exposed to speed-induced wind
  const ireqDownhill = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs + DOWNHILL_SPEED_WIND,
    relativeHumidity: defaultHumidity,
    metabolicRate: METABOLIC_RATES.ski_touring_downhill,
  });

  // Transition: Minimal metabolic output (standing), often on exposed ridges
  const ireqTransition = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs * TRANSITION_WIND_FACTOR,
    relativeHumidity: defaultHumidity,
    metabolicRate: TRANSITION_METABOLIC_RATE,
  });

  // Regional and extremity targets based on downhill phase (most demanding)
  const regionalIreqDownhill = calculateRegionalIreq(ireqDownhill, 'ski_touring_downhill');
  const extremityIreqDownhill = calculateExtremityIreq(
    ireqDownhill,
    'ski_touring_downhill',
    tempC,
    windMs + DOWNHILL_SPEED_WIND
  );

  // ----------------------------------------
  // Wardrobe and Garment Fetching
  // ----------------------------------------

  const wardrobeGarmentIds = await getUserWardrobeGarmentIds(supabase, userId);
  const hasUserWardrobe = wardrobeGarmentIds && wardrobeGarmentIds.length > 0;

  const { data: fetchedGarments, error: garmentFetchError } = await fetchGarmentsWithDetails(
    supabase,
    { wardrobeIds: hasUserWardrobe ? wardrobeGarmentIds : null }
  );

  // Check for database errors first (consistent with alpine/xc routes)
  if (garmentFetchError) {
    return NextResponse.json({ error: garmentFetchError.message }, { status: 500 });
  }

  // Filter garments for ski touring suitability (only when not using user's wardrobe)
  // When using wardrobe, trust that user's items are appropriate for their activities
  const suitableGarments = hasUserWardrobe
    ? (fetchedGarments ?? [])
    : (fetchedGarments ?? []).filter((garment) => {
        const activityRatings = garment.garment_activity_ratings;
        if (!activityRatings) return false;
        const uphillScore = activityRatings.ski_touring_uphill_score ?? 0;
        const downhillScore = activityRatings.ski_touring_downhill_score ?? 0;
        return uphillScore >= 6 || downhillScore >= 6;
      });

  // Return early with IREQ guidance if no garments available
  if (suitableGarments.length === 0) {
    return NextResponse.json({
      message: 'No suitable garments found in database',
      ireq: {
        uphill: { min: ireqUphill.ireqMin, neutral: ireqUphill.ireqNeutral },
        downhill: { min: ireqDownhill.ireqMin, neutral: ireqDownhill.ireqNeutral },
        transition: { min: ireqTransition.ireqMin, neutral: ireqTransition.ireqNeutral },
      },
      guidance: generateTouringGuidance(tempC, ireqUphill, ireqDownhill),
    });
  }

  // ----------------------------------------
  // Extremity Gear Selection
  // ----------------------------------------

  // Fetch handwear and headwear in parallel for efficiency
  const [userHandwear, userHeadwear] = await Promise.all([
    fetchUserHandwear(supabase, userId),
    fetchUserHeadwear(supabase, userId),
  ]);

  // Select extremity gear for static/downhill conditions (when extremities are most exposed)
  const selectedHandwear = selectHandwear(userHandwear, tempC, false);
  const selectedHeadwear = selectHeadwearByCategory(userHeadwear, tempC, false);

  // ----------------------------------------
  // Uphill Ensemble Building
  // ----------------------------------------

  const categorizedGarments = categorizeGarments(suitableGarments);

  const uphillEnsemble = buildUphillEnsemble(
    categorizedGarments,
    ireqUphill.ireqMin,
    UPHILL_MAX_CLO,
    UPHILL_MIN_EVAP_POTENTIAL
  );

  const uphillThermalGarments = ensembleToThermalGarments(uphillEnsemble);
  const uphillThermalProperties = predictEnsembleThermal(uphillThermalGarments);
  const uphillTotalClo = uphillThermalProperties.rcl.wholeBody;

  // ----------------------------------------
  // Pack Items Selection (for transitions/descent)
  // ----------------------------------------

  const additionalCloNeeded = Math.max(0, ireqDownhill.ireqNeutral - uphillTotalClo);

  const packInsulationLayer = selectPackableInsulation(
    categorizedGarments.insulation,
    additionalCloNeeded,
    shouldPrioritizeLightPack
  );

  const needsShellLayer = weather.precipitation || windMs > SHELL_WIND_THRESHOLD;
  const packShellLayer = needsShellLayer
    ? selectShellForConditions(categorizedGarments.shells, weather.precipitation ?? false)
    : null;

  // ----------------------------------------
  // Downhill Ensemble Building (for scoring)
  // ----------------------------------------

  const downhillEnsemble = [...uphillEnsemble];
  if (packInsulationLayer) {
    downhillEnsemble.push(packInsulationLayer);
  }
  if (packShellLayer && !uphillEnsemble.includes(packShellLayer)) {
    downhillEnsemble.push(packShellLayer);
  }

  const downhillThermalGarments = ensembleToThermalGarments(downhillEnsemble);

  // ----------------------------------------
  // Ensemble Scoring
  // ----------------------------------------

  const uphillScore = scoreEnsemble(
    uphillThermalGarments,
    {
      temperature: tempC,
      windSpeed: windMs * UPHILL_WIND_FACTOR,
      humidity: defaultHumidity,
      precipitation: false,
    },
    {
      name: 'Ski Touring Uphill',
      metabolicRate: METABOLIC_RATES.ski_touring_uphill,
      hasStaticPeriods: false,
      windExposure: 'sheltered',
    },
    'ski_touring_uphill'
  );

  const downhillScore = scoreEnsemble(
    downhillThermalGarments,
    {
      temperature: tempC,
      windSpeed: windMs + DOWNHILL_SPEED_WIND,
      humidity: defaultHumidity,
      precipitation: weather.precipitation ?? false,
    },
    {
      name: 'Ski Touring Downhill',
      metabolicRate: METABOLIC_RATES.ski_touring_downhill,
      hasStaticPeriods: false,
      windExposure: 'exposed',
    },
    'ski_touring_downhill'
  );

  // ----------------------------------------
  // Transition Protocol Generation
  // ----------------------------------------

  const transitionProtocol = generateTransitionProtocol(
    tempC,
    windMs,
    uphillTotalClo,
    ireqTransition,
    packInsulationLayer
  );

  // ----------------------------------------
  // Pack Items Compilation
  // ----------------------------------------

  const packItems: GarmentRow[] = [];
  if (packInsulationLayer) {
    packItems.push(packInsulationLayer);
  }
  if (packShellLayer && !uphillEnsemble.some((garment) => garment.id === packShellLayer.id)) {
    packItems.push(packShellLayer);
  }

  const totalPackWeightGrams = packItems.reduce(
    (sum, garment) => sum + (garment.weight_grams ?? 0),
    0
  );

  // ----------------------------------------
  // Response Formatting
  // ----------------------------------------

  const targetCloRange: [number, number] = [
    Math.round(ireqDownhill.ireqMin * 100) / 100,
    Math.round(ireqDownhill.ireqNeutral * 100) / 100,
  ];

  return NextResponse.json({
    conditions: {
      temperature: `${weather.temperature}°F`,
      wind_speed: `${weather.wind_speed} mph`,
      precipitation: weather.precipitation ?? false,
    },
    ireq: {
      uphill: { min: ireqUphill.ireqMin, neutral: ireqUphill.ireqNeutral },
      downhill: { min: ireqDownhill.ireqMin, neutral: ireqDownhill.ireqNeutral },
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
      component_scores: uphillScore.componentScores,
    },
    pack_items: {
      garments: packItems.map((garment) => ({
        id: garment.id,
        name: `${garment.brand} ${garment.model_name}`,
        weight_g: garment.weight_grams,
      })),
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

/**
 * Builds an optimal clothing ensemble for uphill ski touring.
 *
 * Prioritizes breathability (evaporative potential) over insulation since
 * the high metabolic output during climbing generates significant body heat.
 * The ensemble is constrained by a maximum clo value to prevent overheating.
 *
 * Selection order:
 * 1. Base layers (torso and legs) - most breathable that meets minimum evap potential
 * 2. Mid layer - only if needed to reach minimum clo, must maintain breathability
 * 3. Soft shell - for wind protection, only if breathable and within clo budget
 *
 * @param categorizedGarments - Garments organized by layer type
 * @param targetMinClo - Minimum required thermal insulation (clo)
 * @param targetMaxClo - Maximum allowed thermal insulation to prevent overheating
 * @param minEvapPotential - Minimum evaporative potential for breathability
 * @returns Array of garments forming the uphill ensemble
 */
function buildUphillEnsemble(
  categorizedGarments: CategorizedGarments,
  targetMinClo: number,
  targetMaxClo: number,
  minEvapPotential: number
): GarmentRow[] {
  const ensemble: GarmentRow[] = [];

  // ---- Step 1: Base Layer Selection ----
  // Select separate base layers for torso and legs, prioritizing breathability

  const torsoBaseLayers = categorizedGarments.baseLayers.filter((garment) => garment.covers_torso);
  const legsBaseLayers = categorizedGarments.baseLayers.filter((garment) => garment.covers_legs);

  // Torso base layer: find most breathable that meets minimum evap potential
  const torsoBasesSortedByBreathability = sortByBreathability(torsoBaseLayers);
  if (torsoBasesSortedByBreathability.length > 0) {
    const breathableTorsoBase = torsoBasesSortedByBreathability.find(
      (base) => (base.garment_thermal_properties?.evap_potential ?? 0) >= minEvapPotential
    );
    ensemble.push(breathableTorsoBase ?? torsoBasesSortedByBreathability[0]);
  }

  // Legs base layer: find most breathable that meets minimum evap potential
  const legsBasesSortedByBreathability = sortByBreathability(legsBaseLayers);
  if (legsBasesSortedByBreathability.length > 0) {
    const breathableLegsBase = legsBasesSortedByBreathability.find(
      (base) => (base.garment_thermal_properties?.evap_potential ?? 0) >= minEvapPotential
    );
    const selectedLegsBase = breathableLegsBase ?? legsBasesSortedByBreathability[0];

    // Avoid duplicates (handles one-piece garments covering both torso and legs)
    const isAlreadyInEnsemble = ensemble.some((garment) => garment.id === selectedLegsBase.id);
    if (!isAlreadyInEnsemble) {
      ensemble.push(selectedLegsBase);
    }
  }

  // ---- Step 2: Mid Layer Selection (if needed) ----
  // Add a breathable mid layer only if current insulation is below target

  let currentEnsembleClo = ensemble.reduce(
    (sum, garment) => sum + (garment.garment_thermal_properties?.rcl_whole_body ?? 0),
    0
  );

  const needsMoreInsulation = currentEnsembleClo < targetMinClo;
  const hasMidLayersAvailable = categorizedGarments.midLayers.length > 0;

  if (needsMoreInsulation && hasMidLayersAvailable) {
    const midLayersSortedByBreathability = sortByBreathability(categorizedGarments.midLayers);
    const relaxedEvapThreshold = minEvapPotential * 0.8; // Allow slightly less breathable mid layers

    for (const midLayer of midLayersSortedByBreathability) {
      const midLayerClo = midLayer.garment_thermal_properties?.rcl_whole_body ?? 0;
      const midLayerEvapPotential = midLayer.garment_thermal_properties?.evap_potential ?? 0;

      const withinCloBudget = currentEnsembleClo + midLayerClo <= targetMaxClo;
      const meetsBreathabilityRequirement = midLayerEvapPotential >= relaxedEvapThreshold;

      if (withinCloBudget && meetsBreathabilityRequirement) {
        ensemble.push(midLayer);
        currentEnsembleClo += midLayerClo;
        break;
      }
    }
  }

  // ---- Step 3: Shell Selection (for wind protection) ----
  // Prefer breathable soft shells, but fall back to any available shell if none exist

  const breathableSoftShells = categorizedGarments.shells.filter((shell) => {
    const isSoftShell = shell.category === 'soft_shell';
    const hasGoodBreathability = (shell.garment_thermal_properties?.evap_potential ?? 0) >= UPHILL_MIN_EVAP_POTENTIAL;
    return isSoftShell && hasGoodBreathability;
  });

  // Determine which shells to consider: prefer breathable soft shells, fall back to all shells
  const shellCandidates = breathableSoftShells.length > 0
    ? breathableSoftShells
    : categorizedGarments.shells;

  if (shellCandidates.length > 0) {
    const shellsSortedByBreathability = sortByBreathability(shellCandidates);
    const bestShell = shellsSortedByBreathability[0];
    const shellClo = bestShell.garment_thermal_properties?.rcl_whole_body ?? 0;

    if (currentEnsembleClo + shellClo <= targetMaxClo) {
      ensemble.push(bestShell);
    }
  }

  return ensemble;
}

// ============================================
// PACK ITEM SELECTION HELPERS
// ============================================

/**
 * Selects the optimal packable insulation layer for transitions and descent.
 *
 * Uses a weighted scoring system balancing warmth and weight:
 * - Warmth score: How well the garment matches the target clo requirement
 *   (penalized for both under and over-insulation)
 * - Weight score: Lighter garments score higher (important for uphill carry)
 *
 * The weighting between warmth and weight can be adjusted based on user preference:
 * - Normal mode: 70% warmth, 30% weight
 * - Light pack mode: 40% warmth, 60% weight
 *
 * @param availableInsulation - Array of insulation garments to choose from
 * @param targetClo - Additional clo value needed to meet descent requirements
 * @param shouldPrioritizeLightWeight - Whether to favor lighter items over warmth
 * @returns The best-scoring insulation garment, or null if none suitable
 */
function selectPackableInsulation(
  availableInsulation: GarmentRow[],
  targetClo: number,
  shouldPrioritizeLightWeight: boolean
): GarmentRow | null {
  // Early return if no insulation needed or available
  if (availableInsulation.length === 0 || targetClo <= 0) {
    return null;
  }

  // Score each insulation piece
  const scoredInsulation = availableInsulation.map((insulationGarment) => {
    const garmentClo = insulationGarment.garment_thermal_properties?.rcl_whole_body ?? 0;
    const garmentWeightGrams = insulationGarment.weight_grams ?? 500; // Default weight assumption

    // Calculate warmth score (0-1 range)
    // Perfect match = 1.0, over-insulated penalized up to 0.5, under-insulated proportionally
    let warmthScore: number;
    if (garmentClo >= targetClo) {
      const overInsulationPenalty = Math.min(0.5, (garmentClo - targetClo) / 2);
      warmthScore = 1.0 - overInsulationPenalty;
    } else {
      warmthScore = targetClo > 0 ? garmentClo / targetClo : 0;
    }

    // Calculate weight score (0-1 range)
    // 200g or less = 1.0, 800g or more = 0.0, linear interpolation between
    const weightScore = Math.max(0, 1.0 - (garmentWeightGrams - 200) / 600);

    // Apply weighting based on user preference
    const totalScore = shouldPrioritizeLightWeight
      ? warmthScore * 0.4 + weightScore * 0.6
      : warmthScore * 0.7 + weightScore * 0.3;

    return { garment: insulationGarment, score: totalScore };
  });

  // Sort by score descending and return the best option
  scoredInsulation.sort((a, b) => b.score - a.score);
  return scoredInsulation[0]?.garment ?? null;
}

/**
 * Selects the most appropriate shell layer for descent/transition conditions.
 *
 * Selection logic:
 * - If precipitation expected: prefer hard shells for waterproof protection
 * - If wind only: prefer most breathable shell to manage moisture
 *
 * @param availableShells - Array of shell garments to choose from
 * @param hasPrecipitation - Whether precipitation is expected
 * @returns The best shell for conditions, or null if none available
 */
function selectShellForConditions(
  availableShells: GarmentRow[],
  hasPrecipitation: boolean
): GarmentRow | null {
  if (availableShells.length === 0) {
    return null;
  }

  // Precipitation: prioritize waterproof hard shells
  if (hasPrecipitation) {
    const hardShells = availableShells.filter((shell) => shell.category === 'hard_shell');
    if (hardShells.length > 0) {
      return hardShells[0];
    }
  }

  // Wind protection only: prefer most breathable to manage accumulated moisture
  const shellsSortedByBreathability = sortByBreathability(availableShells);
  return shellsSortedByBreathability[0];
}

// ============================================
// TRANSITION PROTOCOL GENERATION
// ============================================

/** Clo deficit threshold for urgent transition (high heat loss risk) */
const URGENT_CLO_DEFICIT_THRESHOLD = 1.5;

/** Clo deficit threshold for quick transition (moderate heat loss risk) */
const QUICK_CLO_DEFICIT_THRESHOLD = 0.5;

/** Wind speed threshold for recommending shelter during transitions (m/s) */
const HIGH_WIND_THRESHOLD = 10;

/** Temperature threshold for frostbite warning (°C) */
const FROSTBITE_RISK_TEMP = -15;

/**
 * Generates a transition protocol for skin-to-ski mode changes.
 *
 * Determines the urgency of adding layers based on the thermal deficit
 * between current uphill clothing and what's needed while stationary.
 * Provides step-by-step instructions and warnings for safe transitions.
 *
 * Priority levels:
 * - Urgent (>1.5 clo deficit): 5 minute limit, immediate insulation required
 * - Quick (>0.5 clo deficit): 10 minute limit, add insulation first
 * - Normal: No time limit, handle at comfortable pace
 *
 * @param temperatureCelsius - Current air temperature in Celsius
 * @param windSpeedMs - Current wind speed in m/s
 * @param currentUphillClo - Clo value of current uphill ensemble
 * @param ireqTransition - IREQ requirements for transition (stationary)
 * @param packInsulationLayer - Available insulation layer to add (if any)
 * @returns Transition protocol with priority, time limit, steps, and warnings
 */
function generateTransitionProtocol(
  temperatureCelsius: number,
  windSpeedMs: number,
  currentUphillClo: number,
  ireqTransition: IreqResult,
  packInsulationLayer: GarmentRow | null
): TransitionProtocolResponse {
  const thermalDeficitClo = ireqTransition.ireqMin - currentUphillClo;

  // Initialize protocol building variables
  let priority: TransitionPriority = 'normal';
  let timeLimitMinutes: number | null = null;
  let steps: string[] = [];
  const warnings: string[] = [];

  // Determine urgency based on thermal deficit
  if (thermalDeficitClo > URGENT_CLO_DEFICIT_THRESHOLD) {
    priority = 'urgent';
    timeLimitMinutes = 5;
    steps = [
      'IMMEDIATELY add insulation layer before doing anything else',
      'Then handle skins and ski mode transition',
      'Add shell if windy/snowing',
    ];
    warnings.push(
      `High heat loss risk: ${currentUphillClo.toFixed(1)} clo vs ${ireqTransition.ireqMin.toFixed(1)} clo needed`
    );
  } else if (thermalDeficitClo > QUICK_CLO_DEFICIT_THRESHOLD) {
    priority = 'quick';
    timeLimitMinutes = 10;
    steps = [
      'Add insulation layer first',
      'Handle skins and boots',
      'Add shell if needed',
    ];
  } else {
    steps = [
      'Handle skins and ski mode at normal pace',
      'Add layers if feeling cold',
    ];
  }

  // Add wind shelter recommendation for high wind conditions
  if (windSpeedMs > HIGH_WIND_THRESHOLD) {
    steps.unshift('Find wind shelter if possible');
    warnings.push('High wind - minimize exposed time');
  }

  // Add frostbite warning for extreme cold
  if (temperatureCelsius < FROSTBITE_RISK_TEMP) {
    warnings.push('Risk of freezing exposed skin - keep gloves on');
  }

  // Include specific insulation layer to add
  if (packInsulationLayer) {
    steps.push(`Insulation to add: ${packInsulationLayer.brand} ${packInsulationLayer.model_name}`);
  }

  return {
    priority,
    time_limit_minutes: timeLimitMinutes,
    steps,
    warnings,
  };
}

// ============================================
// GUIDANCE GENERATION
// ============================================

/**
 * Generates human-readable guidance for ski touring clothing decisions.
 *
 * Provides context-aware advice based on:
 * - Clo targets for uphill and downhill phases
 * - Required pack insulation to bridge the thermal gap
 * - Temperature-specific recommendations
 * - Breathability requirements for uphill efficiency
 *
 * @param temperatureCelsius - Current air temperature in Celsius
 * @param ireqUphill - IREQ requirements for uphill climbing phase
 * @param ireqDownhill - IREQ requirements for downhill descent phase
 * @returns Array of guidance strings for the user
 */
function generateTouringGuidance(
  temperatureCelsius: number,
  ireqUphill: IreqResult,
  ireqDownhill: IreqResult
): string[] {
  const guidance: string[] = [];

  // Clo targets for each phase
  guidance.push(`Uphill target: ${ireqUphill.ireqMin.toFixed(1)}-${ireqUphill.ireqNeutral.toFixed(1)} clo`);
  guidance.push(`Downhill target: ${ireqDownhill.ireqMin.toFixed(1)}-${ireqDownhill.ireqNeutral.toFixed(1)} clo`);

  // Pack insulation requirement
  const requiredPackInsulationClo = ireqDownhill.ireqNeutral - ireqUphill.ireqNeutral;
  guidance.push(`Pack insulation adding ~${requiredPackInsulationClo.toFixed(1)} clo for transitions/descent`);

  // Temperature-specific recommendations
  if (temperatureCelsius > 0) {
    guidance.push('Warm conditions - may need minimal extra layers for descent');
  } else if (temperatureCelsius > -10) {
    guidance.push('Standard touring conditions - bring packable insulation');
  } else {
    guidance.push('Cold conditions - ensure robust insulation in pack');
  }

  // Breathability reminder
  guidance.push(`Prioritize breathability for uphill (evap potential >= ${UPHILL_MIN_EVAP_POTENTIAL})`);

  return guidance;
}
