/** Compatibility safeguard while the complete running selector (#247) is pending. */
import type { SustainedSportPolicy } from '@/lib/biophysics/sport-policy';
import { garmentCapabilities } from '../garment-semantics';
import type { GarmentRow, CategorizedGarments } from '../types';

type Region = 'torso' | 'legs';

// A bib's upper sits under the jacket (as in the regional search), so it
// shields only the legs.
const shields = (g: GarmentRow, region: Region) =>
  g[`covers_${region}`] && !(region === 'torso' && g.garment_type === 'bib');

/** Retain required torso/leg protection, replacing conflicting shells or warning when unavailable. */
export function retainRunningProtection(
  ensemble: GarmentRow[],
  categorized: CategorizedGarments,
  needs: SustainedSportPolicy['protection'],
): { ensemble: GarmentRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const result = [...ensemble];
  if (!needs.wind && !needs.wet) return { ensemble: result, warnings };
  const meetsProtection = (g: GarmentRow) => {
    const capability = garmentCapabilities(g);
    return (!needs.wind || capability.wind) && (!needs.wet || capability.wet);
  };
  for (const region of ['torso', 'legs'] as const) {
    if (result.some(g => shields(g, region) && meetsProtection(g))) continue;
    // Least insulating first; among equally warm shells (T21-03 rates every
    // thin shell alike), the most breathable, then the lightest.
    const candidates = [...categorized.shells.filter(g => shields(g, region) && meetsProtection(g))].sort((a, b) =>
      (a.garment_thermal_properties?.rcl_whole_body ?? 0) - (b.garment_thermal_properties?.rcl_whole_body ?? 0)
      || (b.garment_thermal_properties?.evap_potential ?? 0) - (a.garment_thermal_properties?.evap_potential ?? 0)
      || (a.weight_grams ?? Infinity) - (b.weight_grams ?? Infinity));
    // Replacing an outer that spans regions must preserve protection already
    // supplied elsewhere. Keep one outer per covered region and no duplicates.
    const replacement = candidates.find(candidate => {
      const conflicts = result.filter(g => categorized.shells.some(shell => shell.id === g.id)
        && (['torso', 'legs'] as const).some(r => shields(g, r) && shields(candidate, r)));
      return conflicts.every(g => (['torso', 'legs'] as const).every(r =>
        !shields(g, r) || !meetsProtection(g) || shields(candidate, r)));
    });
    if (!replacement) {
      warnings.push(`Available clothing does not provide the required ${needs.wet ? 'wet' : 'wind'} protection for ${region}.`);
      continue;
    }
    for (let i = result.length - 1; i >= 0; i--) {
      const g = result[i];
      if (categorized.shells.some(shell => shell.id === g.id)
        && (['torso', 'legs'] as const).some(r => shields(g, r) && shields(replacement, r))) result.splice(i, 1);
    }
    if (!result.some(g => g.id === replacement.id)) result.push(replacement);
  }
  return { ensemble: result, warnings };
}
