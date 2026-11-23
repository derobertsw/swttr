/**
 * Cycling selects a complete moving outfit with running's search: reviewed
 * standalone tops and shorts or tights, with optional underlayers, mids,
 * insulation and outers, ranked against the shared regional bands. Wind and
 * rain protection follow `cyclingProtection`.
 */
import { OUTER_AIR_PERMEABILITY } from '@/lib/biophysics/constants';
import { cyclingRelativeAirSpeed } from '@/lib/biophysics/sport-policy';
import { createSinglePhaseSport } from './single-phase';
import { runningProtectionWarnings, runningRegionMatches } from './running-outfit';
import { buildCyclingEnsemble, cyclingProtection } from './cycling-outfit';

const MIN_EVAP_POTENTIAL = 0.25;

export const biking = createSinglePhaseSport({
  requirementFirst: true,
  completeOutfit: true,
  activity: 'biking',
  profile: { name: 'Biking', windExposure: 'exposed' },
  minEvapPotential: MIN_EVAP_POTENTIAL,
  // Targets keep assuming a windproof outer, as before.
  outerAirPermeability: () => OUTER_AIR_PERMEABILITY.windproof,
  // Riding speed combined with ambient wind (#374); see cyclingRelativeAirSpeed.
  airSpeedMs: (request) => cyclingRelativeAirSpeed(request.windMs, request.exertion),
  protection: cyclingProtection,
  protect: (ensemble, _categorized, targets) => ({ ensemble, warnings: runningProtectionWarnings(ensemble, targets, targets.protection) }),
  buildEnsemble: (categorized, targets, _request, head) =>
    buildCyclingEnsemble(categorized, targets, MIN_EVAP_POTENTIAL, targets.protection!, head),
  conditions: (request) => ({
    precipitation: request.precipitation,
    relative_air_speed_ms: Math.round(cyclingRelativeAirSpeed(request.windMs, request.exertion) * 100) / 100,
  }),
  guidance: (_request, _ireq, ensemble, targets) => {
    if (!ensemble || !targets) return ['Choose a cycling top and shorts or tights to meet the riding targets.'];
    const needs = targets.protection;
    const incomplete = !runningRegionMatches(ensemble, targets, 'torso', needs) || !runningRegionMatches(ensemble, targets, 'legs', needs);
    const names = ensemble.map(g => `${g.brand} ${g.model_name}`).join(', ');
    const guidance = ensemble.length
      ? [incomplete
        ? `Best available clothing while riding: ${names}. This outfit still has clothing gaps; see the requirements for what remains needed.`
        : `While riding, wear: ${names}.`]
      : ['No available clothing forms a suitable riding outfit; fill the clothing gaps below.'];
    if (ensemble.some(g => g.garment_type === 'shorts')) guidance.push('Shorts intentionally leave the lower legs exposed; their regional insulation includes that exposure.');
    if (ensemble.some(g => g.garment_type === 'top_short_sleeve')) guidance.push('Short sleeves intentionally leave part of the arms exposed.');
    if (needs?.wet) guidance.push('Wet conditions require rain protection as well as suitable insulation.');
    else if (needs?.wind) guidance.push('Cold or windy conditions require wind protection as well as suitable insulation.');
    guidance.push('These targets assume continuous riding. Bring an extra layer for stops and long descents.');
    return guidance;
  },
});
