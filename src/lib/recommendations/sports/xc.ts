/**
 * XC skiing: breathability over warmth, with separate clo budgets for torso
 * and legs so one region cannot borrow insulation from the other.
 */
import { exertionToXcIntensity } from '@/lib/biophysics/exertion';
import type { CategorizedGarments, GarmentRow } from '../types';
import { sortByBreathability } from '../sorting';
import { createSinglePhaseSport } from './single-phase';

const MIN_EVAP_POTENTIAL = 0.25;

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

export const xc = createSinglePhaseSport({
  activity: 'xc_skiing',
  profile: { name: 'XC Skiing', windExposure: 'normal' },
  minEvapPotential: MIN_EVAP_POTENTIAL,
  catalog: { minScore: { field: 'xc_skiing_score', minScore: 6 } },
  buildEnsemble: (categorized, targets) =>
    buildXCEnsemble(categorized, targets.regional, MIN_EVAP_POTENTIAL),
  conditions: (request) => ({ intensity: exertionToXcIntensity(request.exertion) }),
  guidance: (request, ireq) => getXCGuidance(request.tempC, ireq),
});
