import { NextRequest, NextResponse } from 'next/server';
import { calculateIreq, calculateRegionalIreq, calculateExtremityIreq } from '@/lib/biophysics/ireq';
import { calculateActivityTargetRange, scaleIreqShapeToTargetRange } from '@/lib/biophysics/targets';
import {
  exertionToXcIntensity,
  getMetabolicRateForActivity,
  parseExertionLevel,
} from '@/lib/biophysics/exertion';
import {
  validateRecommendationRequest,
  sortByBreathability,
  selectHandwear,
  selectHeadwearByCategory,
  type GarmentRow,
  type CategorizedGarments,
} from '@/lib/recommendations/shared';
import { prepareRouteData, isPreparedData } from '@/lib/recommendations/route-handler';
import { buildResponseComponents } from '@/lib/recommendations/response-builder';

/**
 * POST /api/v1/recommendations/xc
 * Get XC skiing clothing recommendations
 *
 * XC skiing prioritizes breathability (evap_potential >= 0.25) over warmth
 */
export async function POST(request: NextRequest) {
  const validated = await validateRecommendationRequest(request);
  if (validated instanceof NextResponse) return validated;

  const { weather, tempC, windMs, body } = validated;

  const exertion = parseExertionLevel(body.exertion ?? body.intensity);
  const intensity = exertionToXcIntensity(exertion);
  const metabolicRate = getMetabolicRateForActivity('xc_skiing', exertion);

  const ireq = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs,
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate,
  });

  const targetRange = calculateActivityTargetRange({
    activity: 'xc_skiing',
    ireqMin: ireq.ireqMin,
    ireqNeutral: ireq.ireqNeutral,
    dleHours: ireq.dleHours,
    airTempC: tempC,
    windSpeedMs: windMs,
  });
  const targetMinClo = targetRange.min;
  const maxClo = targetRange.max;
  const minEvapPotential = 0.25;
  const regionalIreq = scaleIreqShapeToTargetRange(calculateRegionalIreq(ireq, 'xc_skiing'), {
    ireqMin: ireq.ireqMin,
    ireqNeutral: ireq.ireqNeutral,
    targetMin: targetMinClo,
    targetMax: maxClo,
  });

  const prepared = await prepareRouteData(validated, {
    activityFilter: { field: 'xc_skiing_score', minScore: 6 },
  });
  if (!isPreparedData(prepared)) {
    return NextResponse.json({
      message: 'No suitable garments found in database',
      ireq: { min: ireq.ireqMin, neutral: ireq.ireqNeutral },
      recommendations: {
        target_clo_range: [targetMinClo, maxClo],
        min_evap_potential: minEvapPotential,
        guidance: getXCGuidance(tempC, ireq),
      },
    });
  }

  const { categorized, userHandwear, userHeadwear } = prepared;
  const ensemble = buildXCEnsemble(categorized, regionalIreq, minEvapPotential);
  const extremityIreq = scaleIreqShapeToTargetRange(
    calculateExtremityIreq(ireq, 'xc_skiing', tempC, windMs),
    {
      ireqMin: ireq.ireqMin,
      ireqNeutral: ireq.ireqNeutral,
      targetMin: targetMinClo,
      targetMax: maxClo,
    }
  );

  const recommendedHandwear = selectHandwear(
    userHandwear,
    tempC,
    true,
    extremityIreq.neutral.hands
  );
  const recommendedHeadwear = selectHeadwearByCategory(userHeadwear, tempC, true, {
    includeHelmet: false,
  });

  const response = buildResponseComponents(
    {
      ensemble,
      weather: {
        temperature: tempC,
        windSpeed: windMs,
        humidity: weather.humidity ?? 50,
        precipitation: weather.precipitation ?? false,
      },
      activity: {
        name: 'XC Skiing',
        metabolicRate,
        hasStaticPeriods: false,
        windExposure: 'normal',
      },
      activityKey: 'xc_skiing',
    },
    recommendedHandwear,
    recommendedHeadwear
  );

  return NextResponse.json({
    conditions: {
      temperature: `${weather.temperature}°F`,
      wind_speed: `${weather.wind_speed} mph`,
      exertion,
      intensity,
    },
    ireq: {
      min: ireq.ireqMin,
      neutral: ireq.ireqNeutral,
      dle_hours: ireq.dleHours,
      target_range: [targetMinClo, maxClo],
      regional: regionalIreq,
      extremity: extremityIreq,
    },
    recommendation: response.recommendation,
    warnings: response.warnings,
    guidance: getXCGuidance(tempC, ireq),
  });
}

export function buildXCEnsemble(
  categorized: CategorizedGarments,
  regionalIreq: { min: { torso: number; legs: number }; neutral: { torso: number; legs: number } },
  minEvapPotential: number
): GarmentRow[] {
  type Region = "torso" | "legs";
  const EPSILON = 1e-6;
  const regions: Region[] = ["torso", "legs"];
  const ensemble: GarmentRow[] = [];
  const selectedIds = new Set<string>();
  const regionClo: Record<Region, number> = { torso: 0, legs: 0 };
  const regionMax: Record<Region, number> = {
    torso: regionalIreq.neutral.torso,
    legs: regionalIreq.neutral.legs,
  };
  const coversRegion = (garment: GarmentRow, region: Region): boolean =>
    region === "torso" ? garment.covers_torso : garment.covers_legs;

  const getRegionalClo = (garment: GarmentRow, region: Region): number => {
    const thermal = garment.garment_thermal_properties;
    if (!thermal) return 0;
    if (region === "torso") {
      return thermal.rcl_torso ?? thermal.rcl_whole_body ?? 0;
    }
    return thermal.rcl_legs ?? thermal.rcl_whole_body ?? 0;
  };

  const sortByBreathabilityThenClo = (garments: GarmentRow[], region: Region): GarmentRow[] => {
    return [...garments].sort((a, b) => {
      const evapA = a.garment_thermal_properties?.evap_potential ?? 0;
      const evapB = b.garment_thermal_properties?.evap_potential ?? 0;
      if (evapB !== evapA) return evapB - evapA;
      return getRegionalClo(a, region) - getRegionalClo(b, region);
    });
  };

  const canFitRegionalBudget = (garment: GarmentRow): boolean => {
    return regions.every((region) => {
      if (!coversRegion(garment, region)) return true;
      return regionClo[region] + getRegionalClo(garment, region) <= regionMax[region] + EPSILON;
    });
  };

  const tryAddGarment = (garment: GarmentRow | undefined): boolean => {
    if (!garment) return false;
    if (selectedIds.has(garment.id)) return false;
    if (!canFitRegionalBudget(garment)) return false;

    ensemble.push(garment);
    selectedIds.add(garment.id);
    for (const region of regions) {
      if (coversRegion(garment, region)) {
        regionClo[region] += getRegionalClo(garment, region);
      }
    }
    return true;
  };

  const getMinimumRegionalClo = (candidates: GarmentRow[], region: Region): number | null => {
    const relevant = candidates
      .filter((g) => coversRegion(g, region))
      .map((g) => getRegionalClo(g, region))
      .filter((clo) => clo > 0);
    if (relevant.length === 0) return null;
    return Math.min(...relevant);
  };

  const addBestLayerForRegion = (
    candidates: GarmentRow[],
    region: Region,
    reserveForRegion = 0
  ): void => {
    const otherRegion: Region = region === "torso" ? "legs" : "torso";
    const regionCandidates = candidates.filter((g) => coversRegion(g, region));
    const singleRegionCandidates = regionCandidates.filter((g) => !coversRegion(g, otherRegion));
    const multiRegionCandidates = regionCandidates.filter((g) => coversRegion(g, otherRegion));
    const sorted = [
      ...sortByBreathabilityThenClo(singleRegionCandidates, region),
      ...sortByBreathabilityThenClo(multiRegionCandidates, region),
    ];

    const tryFromList = (list: GarmentRow[], requireBreathable: boolean): boolean => {
      for (const garment of list) {
        if (requireBreathable) {
          const evap = garment.garment_thermal_properties?.evap_potential ?? 0;
          if (evap < minEvapPotential) continue;
        }
        const nextRegionClo = regionClo[region] + getRegionalClo(garment, region);
        if (nextRegionClo + reserveForRegion > regionMax[region] + EPSILON) continue;
        if (tryAddGarment(garment)) return true;
      }
      return false;
    };

    if (tryFromList(sorted, true)) return;
    if (tryFromList(sorted, false)) return;

    for (const garment of sorted) {
      const evap = garment.garment_thermal_properties?.evap_potential ?? 0;
      if (evap >= minEvapPotential && tryAddGarment(garment)) return;
    }
  };

  // Select base layer per region
  for (const region of regions) {
    const minMidClo = getMinimumRegionalClo(
      [...categorized.midLayers, ...categorized.insulation],
      region
    ) ?? 0;
    const minShellClo = getMinimumRegionalClo(categorized.shells, region) ?? 0;
    addBestLayerForRegion(categorized.baseLayers, region, minMidClo + minShellClo);
  }

  // Select mid layer per region; prioritize regions under minimum
  const midCandidates = [...categorized.midLayers, ...categorized.insulation];
  for (const region of regions) {
    const minShellClo = getMinimumRegionalClo(categorized.shells, region) ?? 0;
    addBestLayerForRegion(midCandidates, region, minShellClo);
  }

  // Select shell per region independently
  if (categorized.shells.length > 0) {
    const breathableShells = categorized.shells.filter(
      (s) => (s.garment_thermal_properties?.evap_potential ?? 0) >= 0.20
    );
    const shellCandidates = breathableShells.length > 0 ? breathableShells : categorized.shells;
    for (const region of regions) {
      const regionShells = shellCandidates.filter((s) => coversRegion(s, region));
      const sortedShells = sortByBreathability(regionShells);
      for (const shell of sortedShells) {
        if (tryAddGarment(shell)) break;
      }
    }
  }

  return ensemble;
}

function getXCGuidance(tempC: number, ireq: { ireqMin: number; ireqNeutral: number }): string[] {
  const guidance: string[] = [];

  if (tempC > 0) {
    guidance.push('Warm conditions - prioritize breathability over insulation');
    guidance.push('A single breathable base layer may be sufficient');
  } else if (tempC > -10) {
    guidance.push('Moderate cold - balance warmth and breathability');
    guidance.push('Consider a light base + breathable mid layer');
  } else {
    guidance.push('Cold conditions - ensure adequate insulation while maintaining breathability');
    guidance.push('Use a mid-weight base with a breathable softshell');
  }

  guidance.push(`Target insulation: ${ireq.ireqMin.toFixed(1)}-${ireq.ireqNeutral.toFixed(1)} clo`);
  guidance.push('Look for garments with evaporative potential >= 0.25');

  return guidance;
}
