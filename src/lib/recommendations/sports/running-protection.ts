/** Compatibility safeguard while the complete running selector (#247) is pending. */
import type { SustainedSportPolicy } from '@/lib/biophysics/sport-policy';
import { garmentCapabilities } from '../garment-semantics';
import { sortByInsulation } from '../sorting';
import type { GarmentRow, CategorizedGarments } from '../types';

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
    if (result.some(g => g[`covers_${region}`] && meetsProtection(g))) continue;
    const candidates = sortByInsulation(categorized.shells.filter(g => g[`covers_${region}`] && meetsProtection(g)), false);
    // Replacing an outer that spans regions must preserve protection already
    // supplied elsewhere. Keep one outer per covered region and no duplicates.
    const replacement = candidates.find(candidate => {
      const conflicts = result.filter(g => categorized.shells.some(shell => shell.id === g.id)
        && (['torso', 'legs'] as const).some(r => g[`covers_${r}`] && candidate[`covers_${r}`]));
      return conflicts.every(g => (['torso', 'legs'] as const).every(r =>
        !g[`covers_${r}`] || !meetsProtection(g) || candidate[`covers_${r}`]));
    });
    if (!replacement) {
      warnings.push(`Available clothing does not provide the required ${needs.wet ? 'wet' : 'wind'} protection for ${region}.`);
      continue;
    }
    for (let i = result.length - 1; i >= 0; i--) {
      const g = result[i];
      if (categorized.shells.some(shell => shell.id === g.id)
        && (['torso', 'legs'] as const).some(r => g[`covers_${r}`] && replacement[`covers_${r}`])) result.splice(i, 1);
    }
    if (!result.some(g => g.id === replacement.id)) result.push(replacement);
  }
  return { ensemble: result, warnings };
}
