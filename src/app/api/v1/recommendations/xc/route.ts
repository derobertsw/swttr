import { NextRequest, NextResponse } from 'next/server';
import { calculateIreq, calculateRegionalIreq, calculateExtremityIreq } from '@/lib/biophysics/ireq';
import { METABOLIC_RATES } from '@/lib/biophysics/constants';
import { calculateActivityTargetRange } from '@/lib/biophysics/targets';
import {
  validateRecommendationRequest,
  sortByBreathability,
  getEnsembleClo,
  findBreathableGarment,
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

  const intensity = (body.intensity ?? 'moderate') as 'easy' | 'moderate' | 'racing';
  const intensityToRate: Record<'easy' | 'moderate' | 'racing', keyof typeof METABOLIC_RATES> = {
    easy: 'xc_skiing_easy',
    moderate: 'xc_skiing_moderate',
    racing: 'xc_skiing_racing',
  };
  const metabolicRateKey = intensityToRate[intensity];

  const ireq = calculateIreq({
    airTemp: tempC,
    windSpeed: windMs,
    relativeHumidity: weather.humidity ?? 50,
    metabolicRate: METABOLIC_RATES[metabolicRateKey],
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
  const ensemble = buildXCEnsemble(categorized, ireq, maxClo, minEvapPotential);

  const recommendedHandwear = selectHandwear(userHandwear, tempC, true);
  const recommendedHeadwear = selectHeadwearByCategory(userHeadwear, tempC, true);

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
        metabolicRate: METABOLIC_RATES[metabolicRateKey],
        hasStaticPeriods: false,
        windExposure: 'normal',
      },
      activityKey: 'xc_skiing',
    },
    recommendedHandwear,
    recommendedHeadwear
  );

  const regionalIreq = calculateRegionalIreq(ireq, 'xc_skiing');
  const extremityIreq = calculateExtremityIreq(ireq, 'xc_skiing', tempC, windMs);

  return NextResponse.json({
    conditions: {
      temperature: `${weather.temperature}°F`,
      wind_speed: `${weather.wind_speed} mph`,
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

function buildXCEnsemble(
  categorized: CategorizedGarments,
  ireq: { ireqMin: number; ireqNeutral: number },
  maxClo: number,
  minEvapPotential: number
): GarmentRow[] {
  const ensemble: GarmentRow[] = [];

  const torsoBaseLayers = categorized.baseLayers.filter((g) => g.covers_torso);
  const legsBaseLayers = categorized.baseLayers.filter((g) => g.covers_legs);

  const sortedTorsoBases = sortByBreathability(torsoBaseLayers);
  if (sortedTorsoBases.length > 0) {
    const suitableBase = findBreathableGarment(sortedTorsoBases, minEvapPotential);
    ensemble.push(suitableBase ?? sortedTorsoBases[0]);
  }

  const sortedLegsBases = sortByBreathability(legsBaseLayers);
  if (sortedLegsBases.length > 0) {
    const suitableBase = findBreathableGarment(sortedLegsBases, minEvapPotential);
    if (!ensemble.some((g) => g.id === suitableBase?.id)) {
      ensemble.push(suitableBase ?? sortedLegsBases[0]);
    }
  }

  let currentClo = getEnsembleClo(ensemble);

  if (currentClo < ireq.ireqMin && categorized.midLayers.length > 0) {
    const sortedMids = sortByBreathability(categorized.midLayers);
    for (const mid of sortedMids) {
      const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + midClo <= maxClo) {
        ensemble.push(mid);
        currentClo += midClo;
        break;
      }
    }
  }

  if (categorized.shells.length > 0) {
    const breathableShells = categorized.shells.filter(
      (s) => (s.garment_thermal_properties?.evap_potential ?? 0) >= 0.20
    );
    const shellCandidates = breathableShells.length > 0 ? breathableShells : categorized.shells;
    const sortedShells = sortByBreathability(shellCandidates);
    if (sortedShells.length > 0) {
      const shell = sortedShells[0];
      const shellClo = shell.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + shellClo <= maxClo) {
        ensemble.push(shell);
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
