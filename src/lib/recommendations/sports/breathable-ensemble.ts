/**
 * Ensemble builder for high-output sports (running, biking): every layer is
 * picked by breathability within a whole-body clo budget.
 */
import type { CategorizedGarments, GarmentRow } from '../types';
import { findBreathableGarment, getEnsembleClo, sortByBreathability } from '../sorting';

/**
 * Selects base layers, then mid-layers while under the IREQ minimum, then
 * shells when `shouldAddShells` says so, for torso and legs independently and
 * without repeating a garment.
 */
export function buildBreathableEnsemble(
  categorized: CategorizedGarments,
  ireq: { ireqMin: number; ireqNeutral: number },
  maxClo: number,
  minEvapPotential: number,
  shouldAddShells: (currentClo: number) => boolean
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
    const legsBase = suitableBase ?? sortedLegsBases[0];
    if (!ensemble.some((g) => g.id === legsBase.id)) {
      ensemble.push(legsBase);
    }
  }

  let currentClo = getEnsembleClo(ensemble);

  if (currentClo < ireq.ireqMin && categorized.midLayers.length > 0) {
    const torsoMids = sortByBreathability(categorized.midLayers.filter((g) => g.covers_torso));
    for (const mid of torsoMids) {
      const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + midClo <= maxClo) {
        ensemble.push(mid);
        currentClo += midClo;
        break;
      }
    }

    const legsMids = sortByBreathability(categorized.midLayers.filter((g) => g.covers_legs));
    for (const mid of legsMids) {
      if (ensemble.some((g) => g.id === mid.id)) continue;
      const midClo = mid.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + midClo <= maxClo) {
        ensemble.push(mid);
        currentClo += midClo;
        break;
      }
    }
  }

  if (categorized.shells.length > 0 && shouldAddShells(currentClo)) {
    const torsoShells = sortByBreathability(categorized.shells.filter((s) => s.covers_torso));
    for (const shell of torsoShells) {
      const shellClo = shell.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + shellClo <= maxClo) {
        ensemble.push(shell);
        currentClo += shellClo;
        break;
      }
    }

    const legsShells = sortByBreathability(categorized.shells.filter((s) => s.covers_legs));
    for (const shell of legsShells) {
      if (ensemble.some((g) => g.id === shell.id)) continue;
      const shellClo = shell.garment_thermal_properties?.rcl_whole_body ?? 0;
      if (currentClo + shellClo <= maxClo) {
        ensemble.push(shell);
        break;
      }
    }
  }

  return ensemble;
}
