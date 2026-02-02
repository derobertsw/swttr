import { NextRequest, NextResponse } from 'next/server';
import { predictEnsembleThermal } from '@/lib/biophysics/ensemble';
import { calculateIreq } from '@/lib/biophysics/ireq';
import { scoreEnsemble } from '@/lib/biophysics/scorer';
import { METABOLIC_RATES } from '@/lib/biophysics/constants';
import {
  type GarmentRow,
  type CategorizedGarments,
  validateRecommendationRequest,
  fetchGarmentsWithDetails,
  categorizeGarments,
  sortByBreathability,
  ensembleToThermalGarments,
} from '@/lib/recommendations/shared';

/**
 * POST /api/v1/recommendations/ski-touring
 * Get ski touring clothing recommendations
 *
 * Handles the unique challenge of ski touring: needing minimal insulation
 * while climbing but more protection at transitions and descending.
 *
 * Body:
 * {
 *   weather: {
 *     temperature: number,  // °F
 *     wind_speed: number,   // mph
 *     humidity?: number,
 *     precipitation?: boolean
 *   },
 *   prioritize_light_pack?: boolean (default: false)
 * }
 */
export async function POST(request: NextRequest) {
  const validated = await validateRecommendationRequest(request);
  if (validated instanceof NextResponse) return validated;

  const { supabase, weather, tempC, windMs, body } = validated;

  const prioritizeLightPack = (body.prioritize_light_pack as boolean) ?? false;

  // Calculate IREQ for each phase
  const ireqUphill = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs * 0.3, // Sheltered while climbing
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate: METABOLIC_RATES.ski_touring_uphill,
  });

  const ireqDownhill = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs + 5, // Speed adds wind
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate: METABOLIC_RATES.ski_touring_downhill,
  });

  const ireqTransition = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs * 1.5, // Often exposed at transitions
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate: 90, // Standing/resting
  });

  // Fetch all garments with their related data
  const { data: fetchedGarments, error } = await fetchGarmentsWithDetails(supabase, {});

  // Apply OR filter for ski touring (uphill OR downhill suitability)
  const allGarments = (fetchedGarments ?? []).filter((g) => {
    const ratings = g.garment_activity_ratings;
    if (!ratings) return false;
    return (ratings.ski_touring_uphill_score ?? 0) >= 6 ||
           (ratings.ski_touring_downhill_score ?? 0) >= 6;
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!allGarments || allGarments.length === 0) {
    return NextResponse.json({
      message: 'No suitable garments found in database',
      ireq: {
        uphill: { min: ireqUphill.ireqMin, neutral: ireqUphill.ireqNeutral },
        downhill: { min: ireqDownhill.ireqMin, neutral: ireqDownhill.ireqNeutral },
        transition: { min: ireqTransition.ireqMin, neutral: ireqTransition.ireqNeutral },
      },
      guidance: getTouringGuidance(tempC, ireqUphill, ireqDownhill),
    });
  }

  // Categorize garments
  const categorized = categorizeGarments(allGarments);

  // Build uphill ensemble (prioritize breathability)
  const uphillEnsemble = buildUphillEnsemble(
    categorized,
    ireqUphill.ireqMin,
    1.8, // Max clo for uphill
    0.20 // Min evap potential
  );

  // Calculate uphill clo
  const uphillThermal = ensembleToThermalGarments(uphillEnsemble);
  const uphillProps = predictEnsembleThermal(uphillThermal);
  const uphillClo = uphillProps.rcl.wholeBody;

  // Determine additional layers needed for descent
  const additionalCloNeeded = Math.max(0, ireqDownhill.ireqNeutral - uphillClo);

  // Select packable insulation
  const insulationLayer = selectPackableInsulation(
    categorized.insulation,
    additionalCloNeeded,
    prioritizeLightPack
  );

  // Select shell if needed
  const shellLayer = (weather.precipitation || windMs > 8)
    ? selectShell(categorized.shells, weather.precipitation ?? false)
    : null;

  // Build downhill ensemble
  const downhillEnsemble = [...uphillEnsemble];
  if (insulationLayer) downhillEnsemble.push(insulationLayer);
  if (shellLayer && !uphillEnsemble.includes(shellLayer)) {
    downhillEnsemble.push(shellLayer);
  }

  // Calculate properties for both ensembles
  const downhillThermal = ensembleToThermalGarments(downhillEnsemble);
  const downhillProps = predictEnsembleThermal(downhillThermal);

  // Score both configurations
  const uphillScore = scoreEnsemble(
    uphillThermal,
    {
      temperature: tempC,
      windSpeed: windMs * 0.3,
      humidity: weather.humidity ?? 50,
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
    downhillThermal,
    {
      temperature: tempC,
      windSpeed: windMs + 5,
      humidity: weather.humidity ?? 50,
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

  // Generate transition protocol
  const transitionProtocol = generateTransitionProtocol(
    tempC,
    windMs,
    uphillClo,
    ireqTransition,
    insulationLayer,
    shellLayer
  );

  // Pack items
  const packItems: GarmentRow[] = [];
  if (insulationLayer) packItems.push(insulationLayer);
  if (shellLayer && !uphillEnsemble.some((g) => g.id === shellLayer.id)) {
    packItems.push(shellLayer);
  }

  const packWeight = packItems.reduce(
    (sum, g) => sum + (g.weight_grams ?? 0),
    0
  );

  return NextResponse.json({
    conditions: {
      temperature: `${weather.temperature}°F`,
      wind_speed: `${weather.wind_speed} mph`,
      precipitation: weather.precipitation ?? false,
    },
    ireq_analysis: {
      uphill: {
        min_clo: ireqUphill.ireqMin,
        neutral_clo: ireqUphill.ireqNeutral,
      },
      downhill: {
        min_clo: ireqDownhill.ireqMin,
        neutral_clo: ireqDownhill.ireqNeutral,
      },
      transition: {
        min_clo: ireqTransition.ireqMin,
        neutral_clo: ireqTransition.ireqNeutral,
      },
    },
    uphill_ensemble: {
      garments: uphillEnsemble.map((g) => ({
        id: g.id,
        name: `${g.brand} ${g.model_name}`,
        category: g.category,
      })),
      total_clo: Math.round(uphillProps.rcl.wholeBody * 100) / 100,
      evap_potential: Math.round(uphillProps.evapPotential * 1000) / 1000,
      score: uphillScore.totalScore,
    },
    downhill_ensemble: {
      garments: downhillEnsemble.map((g) => ({
        id: g.id,
        name: `${g.brand} ${g.model_name}`,
        category: g.category,
      })),
      total_clo: Math.round(downhillProps.rcl.wholeBody * 100) / 100,
      evap_potential: Math.round(downhillProps.evapPotential * 1000) / 1000,
      score: downhillScore.totalScore,
    },
    pack_items: {
      garments: packItems.map((g) => ({
        id: g.id,
        name: `${g.brand} ${g.model_name}`,
        weight_g: g.weight_grams,
      })),
      total_weight_g: packWeight,
    },
    transition_protocol: transitionProtocol,
    warnings: [...uphillScore.warnings, ...downhillScore.warnings],
    guidance: getTouringGuidance(tempC, ireqUphill, ireqDownhill),
  });
}

function buildUphillEnsemble(
  categorized: CategorizedGarments,
  minClo: number,
  maxClo: number,
  minEvapPotential: number
): GarmentRow[] {
  const ensemble: GarmentRow[] = [];

  // 1. Base layers for torso and legs separately - most breathable that provides enough warmth
  const torsoBaseLayers = categorized.baseLayers.filter((g) => g.covers_torso);
  const legsBaseLayers = categorized.baseLayers.filter((g) => g.covers_legs);

  // Select torso base layer (prioritize breathability)
  const sortedTorsoBases = sortByBreathability(torsoBaseLayers);

  if (sortedTorsoBases.length > 0) {
    const suitableBase = sortedTorsoBases.find(
      (b) => (b.garment_thermal_properties?.evap_potential ?? 0) >= minEvapPotential
    );
    ensemble.push(suitableBase ?? sortedTorsoBases[0]);
  }

  // Select legs base layer (prioritize breathability)
  const sortedLegsBases = sortByBreathability(legsBaseLayers);

  if (sortedLegsBases.length > 0) {
    const suitableBase = sortedLegsBases.find(
      (b) => (b.garment_thermal_properties?.evap_potential ?? 0) >= minEvapPotential
    );
    // Don't add if it's the same item (e.g., one-piece that covers both)
    const baseToAdd = suitableBase ?? sortedLegsBases[0];
    if (!ensemble.some((g) => g.id === baseToAdd.id)) {
      ensemble.push(baseToAdd);
    }
  }

  // 2. Add breathable mid if needed
  let currentClo = ensemble.reduce(
    (sum, g) => sum + (g.garment_thermal_properties?.rcl_whole_body ?? 0),
    0
  );

  if (currentClo < minClo && categorized.midLayers.length > 0) {
    const sortedMids = sortByBreathability(categorized.midLayers);

    for (const mid of sortedMids) {
      const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
      const midEp = mid.garment_thermal_properties?.evap_potential ?? 0;
      if (currentClo + midClo <= maxClo && midEp >= minEvapPotential * 0.8) {
        ensemble.push(mid);
        currentClo += midClo;
        break;
      }
    }
  }

  // 3. Breathable soft shell for wind protection
  const breathableSoftShells = categorized.shells.filter(
    (s) =>
      s.category === 'soft_shell' &&
      (s.garment_thermal_properties?.evap_potential ?? 0) >= 0.20
  );

  if (breathableSoftShells.length > 0) {
    const sorted = sortByBreathability(breathableSoftShells);
    const shell = sorted[0];
    const shellClo = shell.garment_thermal_properties?.rcl_whole_body ?? 0;
    if (currentClo + shellClo <= maxClo) {
      ensemble.push(shell);
    }
  }

  return ensemble;
}

function selectPackableInsulation(
  insulation: GarmentRow[],
  targetClo: number,
  prioritizeLight: boolean
): GarmentRow | null {
  if (insulation.length === 0 || targetClo <= 0) return null;

  const scored = insulation.map((ins) => {
    const clo = ins.garment_thermal_properties?.rcl_whole_body ?? 0;
    const weight = ins.weight_grams ?? 500;

    // Warmth score
    let warmthScore: number;
    if (clo >= targetClo) {
      warmthScore = 1.0 - Math.min(0.5, (clo - targetClo) / 2);
    } else {
      warmthScore = targetClo > 0 ? clo / targetClo : 0;
    }

    // Weight score (lighter = better)
    const weightScore = Math.max(0, 1.0 - (weight - 200) / 600);

    const total = prioritizeLight
      ? warmthScore * 0.4 + weightScore * 0.6
      : warmthScore * 0.7 + weightScore * 0.3;

    return { garment: ins, score: total };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.garment ?? null;
}

function selectShell(shells: GarmentRow[], precipitation: boolean): GarmentRow | null {
  if (shells.length === 0) return null;

  if (precipitation) {
    const hardShells = shells.filter((s) => s.category === 'hard_shell');
    if (hardShells.length > 0) {
      return hardShells[0];
    }
  }

  // Wind only - prefer most breathable
  const sorted = sortByBreathability(shells);

  return sorted[0];
}

function generateTransitionProtocol(
  tempC: number,
  windMs: number,
  uphillClo: number,
  ireqTransition: { ireqMin: number; ireqNeutral: number },
  insulationLayer: GarmentRow | null,
  shellLayer: GarmentRow | null
): {
  priority: 'urgent' | 'quick' | 'normal';
  time_limit_minutes: number | null;
  steps: string[];
  warnings: string[];
} {
  const cloDeficit = ireqTransition.ireqMin - uphillClo;

  const protocol: {
    priority: 'urgent' | 'quick' | 'normal';
    time_limit_minutes: number | null;
    steps: string[];
    warnings: string[];
  } = {
    priority: 'normal',
    time_limit_minutes: null,
    steps: [],
    warnings: [],
  };

  if (cloDeficit > 1.5) {
    protocol.priority = 'urgent';
    protocol.time_limit_minutes = 5;
    protocol.steps = [
      'IMMEDIATELY add insulation layer before doing anything else',
      'Then handle skins and ski mode transition',
      'Add shell if windy/snowing',
    ];
    protocol.warnings.push(
      `High heat loss risk: ${uphillClo.toFixed(1)} clo vs ${ireqTransition.ireqMin.toFixed(1)} clo needed`
    );
  } else if (cloDeficit > 0.5) {
    protocol.priority = 'quick';
    protocol.time_limit_minutes = 10;
    protocol.steps = [
      'Add insulation layer first',
      'Handle skins and boots',
      'Add shell if needed',
    ];
  } else {
    protocol.steps = [
      'Handle skins and ski mode at normal pace',
      'Add layers if feeling cold',
    ];
  }

  if (windMs > 10) {
    protocol.steps.unshift('Find wind shelter if possible');
    protocol.warnings.push('High wind - minimize exposed time');
  }

  if (tempC < -15) {
    protocol.warnings.push('Risk of freezing exposed skin - keep gloves on');
  }

  if (insulationLayer) {
    protocol.steps.push(`Insulation to add: ${insulationLayer.brand} ${insulationLayer.model_name}`);
  }

  return protocol;
}

function getTouringGuidance(
  tempC: number,
  ireqUphill: { ireqMin: number; ireqNeutral: number },
  ireqDownhill: { ireqMin: number; ireqNeutral: number }
): string[] {
  const guidance: string[] = [];

  guidance.push(`Uphill target: ${ireqUphill.ireqMin.toFixed(1)}-${ireqUphill.ireqNeutral.toFixed(1)} clo`);
  guidance.push(`Downhill target: ${ireqDownhill.ireqMin.toFixed(1)}-${ireqDownhill.ireqNeutral.toFixed(1)} clo`);

  const cloDiff = ireqDownhill.ireqNeutral - ireqUphill.ireqNeutral;
  guidance.push(`Pack insulation adding ~${cloDiff.toFixed(1)} clo for transitions/descent`);

  if (tempC > 0) {
    guidance.push('Warm conditions - may need minimal extra layers for descent');
  } else if (tempC > -10) {
    guidance.push('Standard touring conditions - bring packable insulation');
  } else {
    guidance.push('Cold conditions - ensure robust insulation in pack');
  }

  guidance.push('Prioritize breathability for uphill (evap potential >= 0.20)');

  return guidance;
}
