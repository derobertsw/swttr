/** XC moving outfits: independent regional fit and condition-based protection. */
import { OUTER_AIR_PERMEABILITY } from '@/lib/biophysics/constants';
import { needsXCWindProtection, xcPhaseContext } from '@/lib/biophysics/xc-policy';
import { exertionToXcIntensity } from '@/lib/biophysics/exertion';
import type { PhaseTargets } from '../thermal-targets';
import type { CategorizedGarments, GarmentRow } from '../types';
import { hasUsableThermalData } from '../garment-semantics';
import { createSinglePhaseSport } from './single-phase';
import { buildRegionalEnsemble } from './regional-ensemble';
import { xcBasic, xcProtection, xcRegionFit, xcRegionMatches } from './xc-outfit';

const MIN_EVAP_POTENTIAL = 0.25;
/** Allow insulation beneath a shell, but avoid stacking it beneath an insulated outer. */
const puffyFitsUnder = (outer: GarmentRow) => outer.category !== 'outer_insulated';

/** Keep the shared regional enumeration, identity and slot compatibility.
 * XC assesses actual clothing/protection rather than mandatory base/outer
 * masks. Alpine's rank and search semantics remain unchanged. */
export function buildXCEnsemble(
  categorized: CategorizedGarments,
  targets: PhaseTargets['regional'],
  minEvapPotential: number,
  needs: { wind: boolean; wet: boolean },
): GarmentRow[] {
  const known: CategorizedGarments = {
    baseLayers: categorized.baseLayers.filter(hasUsableThermalData),
    midLayers: categorized.midLayers.filter(hasUsableThermalData),
    insulation: categorized.insulation.filter(hasUsableThermalData),
    shells: categorized.shells.filter(hasUsableThermalData),
  };
  return buildRegionalEnsemble(known, targets, {
    puffyFitsUnder,
    rank: () => [], // XC uses the explicit outfit assessment below.
    /** Rank coverage, protection, thermal fit, and breathability without mandatory layer slots. */
    assess: (outfit, region) => {
      const regional = outfit.filter(g => g[`covers_${region}`]);
      const basic = xcBasic(outfit, region);
      if (regional.length && !basic) return null;
      const { deficit, excess, severeExcess } = xcRegionFit(outfit, targets, region);
      return [
        Number(!xcProtection(outfit, region, needs)),
        needs.wet ? Number(!regional.some(g => g.garment_protection?.waterproof_rating === 'waterproof'
          && xcProtection([g], region, { wind: false, wet: true }))) : 0,
        severeExcess, Number(!basic), deficit + excess, excess,
        regional.filter(g => (g.garment_thermal_properties?.evap_potential ?? 0) <
          (['soft_shell', 'hard_shell', 'windbreaker'].includes(g.category) ? 0.2 : minEvapPotential)).length,
        regional.length,
        -regional.reduce((sum, g) => sum + (g.garment_thermal_properties?.evap_potential ?? 0), 0),
      ];
    },
  });
}

export const xc = createSinglePhaseSport({
  requirementFirst: true,
  completeOutfit: true,
  /** Choose the modeled outer permeability from wetness and exposure-adjusted wind needs. */
  outerAirPermeability: request => {
    const context = xcPhaseContext({ ...request, precipitationType: request.weather.precipitation_type });
    return context.precipitation === 'wet' ? OUTER_AIR_PERMEABILITY.membrane
      : needsXCWindProtection(request.tempC, context.effectiveWindMs) ? OUTER_AIR_PERMEABILITY.windResistant : OUTER_AIR_PERMEABILITY.open;
  },
  activity: 'xc_skiing',
  profile: { name: 'XC Skiing', windExposure: 'normal' },
  minEvapPotential: MIN_EVAP_POTENTIAL,
  catalog: { minScore: { field: 'xc_skiing_score', minScore: 6 } },
  /** Select the moving outfit against regional targets and required protection. */
  buildEnsemble: (categorized, targets) =>
    buildXCEnsemble(categorized, targets.regional, MIN_EVAP_POTENTIAL, targets.policy!.protection),
  /** Preserve the selected outfit and report only the protection each region actually lacks. */
  protect: (ensemble, _categorized, targets) => {
    const needs = targets.policy!.protection;
    const warnings = (['torso', 'legs'] as const).flatMap(region => {
      const lacking: string[] = [];
      if (needs.wind && !xcProtection(ensemble, region, { wind: true, wet: false })) lacking.push('wind');
      if (needs.wet && !xcProtection(ensemble, region, { wind: false, wet: true })) lacking.push('wet-weather');
      return lacking.length ? [`Available XC clothing lacks required ${lacking.join(' and ')} protection for ${region}.`] : [];
    });
    return { ensemble, warnings };
  },
  /** Echo effort and explicit unknown defaults so clients can retain the recommendation context. */
  conditions: (request) => ({ intensity: exertionToXcIntensity(request.exertion),
    outing_pattern: request.outingPattern ?? 'unknown', xc_exposure: request.xcExposure ?? 'unknown' }),
  /** Explain the moving outfit, protection assumptions, and separate warmth for stops. */
  guidance: (_request, _ireq, ensemble, targets) => {
    if (!targets) return ['Choose a breathable Nordic top and standalone tights or pants for the moving phase.'];
    const context = targets.policy!.xc!;
    const guidance = ensemble?.length
      ? [`While skiing, wear: ${ensemble.map(g => `${g.brand} ${g.model_name}`).join(', ')}.`]
      : ['No available clothing forms a suitable XC moving outfit; fill the clothing gaps below.'];
    if (ensemble && xcRegionMatches(ensemble, targets, 'legs') && ensemble.filter(g => g.covers_legs).length === 1)
      guidance.push('One standalone leg garment supplies the selected coverage and warmth; no extra base or shell pants are needed.');
    guidance.push(targets.policy!.protection.wind
      ? 'Wind protection is required by the current exposure; an existing wind-resistant garment can supply it without another shell.'
      : 'No extra wind layer is required for this exposure; freezing alone does not require another garment.');
    guidance.push(context.precipitation === 'wet' ? 'Rain, mixed precipitation or near-melting snow requires wet-weather protection.'
      : context.precipitation === 'dry_snow' ? 'Cold snow is treated as dry snow; waterproof layers are not forced solely by snowfall.'
        : 'Dry conditions do not require a waterproof layer.');
    guidance.push(`Exposure uses ${context.effectiveWindMs.toFixed(1)} m/s effective wind (the greater of ambient wind and the exposure floor, never their sum).`);
    guidance.push(context.outingPattern === 'frequent_stops'
      ? 'Frequent stops: the worn outfit is sized for moving effort. Put on carried warmth at stops and after skiing.'
      : context.outingPattern === 'unknown' ? 'Outing pattern is unknown; moving targets assume continuous skiing. Classic versus skate does not determine effort.'
        : 'Continuous training: moving targets use your selected effort, independently of classic or skate technique.');
    return guidance;
  },
  /** Suggest unworn warmth for frequent stops or cold/wet outings, outside moving comfort. */
  carry: (_request, targets) => targets.policy?.xc?.carryWarmth ? [{
    label: 'Extra insulation for breaks and after skiing',
    reason: targets.policy.xc.outingPattern === 'frequent_stops' ? 'Frequent stops reduce heat production; add this only while stopped.'
      : 'Cold or wet conditions justify extra warmth once movement stops.',
  }] : [],
});
