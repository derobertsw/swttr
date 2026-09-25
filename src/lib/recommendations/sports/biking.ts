/**
 * Biking: breathability first like running, but always adds a wind shell
 * since riding speed makes the rider's wind exposure high.
 */
import type { CategorizedGarments, GarmentRow } from '../types';
import { createSinglePhaseSport } from './single-phase';
import { buildBreathableEnsemble } from './breathable-ensemble';

const MIN_EVAP_POTENTIAL = 0.25;

/**
 * Build a garment ensemble for biking, prioritizing breathability.
 * Selects base layers, mid-layers, and shells for torso and legs
 * while respecting IREQ targets and preventing duplicate garments.
 */
export function buildBikingEnsemble(
  categorized: CategorizedGarments,
  ireq: { ireqMin: number; ireqNeutral: number },
  maxClo: number,
  minEvapPotential: number
): GarmentRow[] {
  return buildBreathableEnsemble(categorized, ireq, maxClo, minEvapPotential, () => true);
}

function getBikingGuidance(tempC: number, ireq: { ireqMin: number; ireqNeutral: number }): string[] {
  const guidance: string[] = [];

  if (tempC > 0) {
    guidance.push('Mild conditions - prioritize breathable layers');
  } else if (tempC > -10) {
    guidance.push('Cool conditions - add wind protection');
  } else {
    guidance.push('Cold conditions - add a midlayer and wind shell');
  }

  if (ireq.ireqNeutral < 1.1) {
    guidance.push('Avoid heavy insulation to prevent overheating');
  }

  return guidance;
}

export const biking = createSinglePhaseSport({
  activity: 'biking',
  profile: { name: 'Biking', windExposure: 'exposed' },
  minEvapPotential: MIN_EVAP_POTENTIAL,
  buildEnsemble: (categorized, targets) =>
    buildBikingEnsemble(categorized, targets.ireq, targets.targetRange[1], MIN_EVAP_POTENTIAL),
  conditions: () => ({}),
  guidance: (request, ireq) => getBikingGuidance(request.tempC, ireq),
});
