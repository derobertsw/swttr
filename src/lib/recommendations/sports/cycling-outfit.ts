/**
 * Complete moving outfits for cycling: running's search and regional checks,
 * with cycling's protection needs, eligibility and requirement labels.
 */
import type { SustainedSportPolicy } from '@/lib/biophysics/sport-policy';
import type { HoodHeadPlanner } from '../extremities';
import type { PhaseTargets } from '../thermal-targets';
import type { CategorizedGarments, GarmentRow } from '../types';
import { buildRunningEnsemble, isLightRequirement, protectionSuffix, type OutfitProtection } from './running-outfit';

type Region = 'torso' | 'legs';

/** Wind and rain protection cycling requires of torso and legs. Same rule as
 * running, from ambient wind only: riding speed is not yet modeled (#374). */
export function cyclingProtection({ tempC, windMs, precipitation }: { tempC: number; windMs: number; precipitation: boolean }): SustainedSportPolicy['protection'] {
  return { wind: tempC <= 0 || windMs > 8, wet: precipitation, poleGrip: false };
}

/** Ski bibs sit under a jacket, which the one-outer-per-region search can't
 * express, so they need explicit cycling suitability. Insulated outerwear
 * stays eligible for deep cold. */
const cyclingEligible = (g: GarmentRow) => g.suitable_activities?.includes('biking') || g.garment_type !== 'bib';

/** Compare complete top-and-leg outfits against the regional bands. A
 * protective outer's warmth is counted in the fit, never added on top. */
export function buildCyclingEnsemble(
  categorized: CategorizedGarments,
  targets: PhaseTargets,
  minEvapPotential: number,
  needs: OutfitProtection,
  head?: HoodHeadPlanner,
): GarmentRow[] {
  return buildRunningEnsemble(categorized, targets, minEvapPotential, { needs, eligible: cyclingEligible, head });
}

export function cyclingRequirementLabel(targets: PhaseTargets, region: Region, needs: OutfitProtection | undefined): string {
  const light = isLightRequirement(targets, region);
  const basic = region === 'torso'
    ? light ? 'Short-sleeve cycling jersey' : 'Breathable long-sleeve cycling top with insulation as needed'
    : light ? 'Cycling shorts' : 'Cycling tights or pants';
  return basic + protectionSuffix(needs);
}
