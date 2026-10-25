/** Running selects a complete moving outfit before evaluating accessories. */
import { OUTER_AIR_PERMEABILITY } from '@/lib/biophysics/constants';
import { createSinglePhaseSport } from './single-phase';
import { buildRunningEnsemble, runningProtectionWarnings, runningRegionMatches } from './running-outfit';

export { buildRunningEnsemble } from './running-outfit';

const MIN_EVAP_POTENTIAL = 0.3;

export const running = createSinglePhaseSport({
  requirementFirst: true,
  completeOutfit: true,
  activity: 'running',
  profile: { name: 'Running', windExposure: 'normal' },
  // Retain the current server exposure policy independently of wardrobe selection.
  outerAirPermeability: ({ tempC, windMs }) => tempC <= 0 || windMs > 8
    ? OUTER_AIR_PERMEABILITY.windResistant : OUTER_AIR_PERMEABILITY.open,
  minEvapPotential: MIN_EVAP_POTENTIAL,
  protect: (ensemble, _categorized, targets) => ({ ensemble, warnings: runningProtectionWarnings(ensemble, targets) }),
  buildEnsemble: (categorized, targets) => buildRunningEnsemble(categorized, targets, MIN_EVAP_POTENTIAL),
  conditions: (request) => ({ precipitation: request.precipitation }),
  guidance: (_request, _ireq, ensemble, targets) => {
    if (!ensemble || !targets) return ['Choose a running top and shorts or standalone tights to meet the moving-phase targets.'];
    const incomplete = !runningRegionMatches(ensemble, targets, 'torso') || !runningRegionMatches(ensemble, targets, 'legs');
    const names = ensemble.map(g => `${g.brand} ${g.model_name}`).join(', ');
    const guidance = ensemble.length
      ? [incomplete
        ? `Best available clothing while running: ${names}. This outfit still has clothing gaps; see the requirements for what remains needed.`
        : `While running, wear: ${names}.`]
      : ['No available clothing forms a suitable moving outfit; fill the clothing gaps below.'];
    if (ensemble.some(g => g.garment_type === 'shorts')) guidance.push('Shorts intentionally leave the lower legs exposed; their regional insulation includes that exposure.');
    if (ensemble.some(g => g.garment_type === 'top_short_sleeve')) guidance.push('Short sleeves intentionally leave part of the arms exposed.');
    if (targets.policy?.protection.wet) guidance.push('Wet conditions require rain protection as well as suitable insulation.');
    else if (targets.policy?.protection.wind) guidance.push('Cold or windy conditions require wind protection as well as suitable insulation.');
    return guidance;
  },
});
