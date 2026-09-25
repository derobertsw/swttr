/**
 * Running: breathability first, with shells only when the runner is under
 * the IREQ minimum, conditions are very cold, or it is wet.
 */
import type { CategorizedGarments, GarmentRow } from '../types';
import { createSinglePhaseSport } from './single-phase';
import { buildBreathableEnsemble } from './breathable-ensemble';

const MIN_EVAP_POTENTIAL = 0.3;

/**
 * Build a garment ensemble for running, prioritizing breathability.
 * Selects base layers, mid-layers, and shells for torso and legs
 * while respecting IREQ targets and preventing duplicate garments.
 */
export function buildRunningEnsemble(
  categorized: CategorizedGarments,
  ireq: { ireqMin: number; ireqNeutral: number },
  maxClo: number,
  minEvapPotential: number,
  precipitation = false
): GarmentRow[] {
  return buildBreathableEnsemble(
    categorized,
    ireq,
    maxClo,
    minEvapPotential,
    (currentClo) => currentClo < ireq.ireqMin || ireq.ireqMin > 1.0 || precipitation
  );
}

function getRunningGuidance(
  tempC: number,
  ireq: { ireqMin: number; ireqNeutral: number },
  precipitation = false
): string[] {
  const guidance: string[] = [];

  if (tempC > 0) {
    guidance.push('Mild conditions - focus on breathability');
  } else if (tempC > -10) {
    guidance.push('Cool conditions - light insulation + wind protection');
  } else {
    guidance.push('Cold conditions - add a light midlayer and wind shell');
  }

  if (ireq.ireqNeutral < 1.0) {
    guidance.push('Avoid over-layering to prevent overheating');
  }

  if (precipitation) {
    guidance.push('Wet conditions - wear a water-resistant outer layer');
  }

  return guidance;
}

export const running = createSinglePhaseSport({
  activity: 'running',
  profile: { name: 'Running', windExposure: 'normal' },
  minEvapPotential: MIN_EVAP_POTENTIAL,
  buildEnsemble: (categorized, targets, request) =>
    buildRunningEnsemble(
      categorized,
      targets.ireq,
      targets.targetRange[1],
      MIN_EVAP_POTENTIAL,
      request.precipitation
    ),
  conditions: (request) => ({ precipitation: request.precipitation }),
  guidance: (request, ireq) => getRunningGuidance(request.tempC, ireq, request.precipitation),
});
