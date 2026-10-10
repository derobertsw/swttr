import type { GarmentRow } from './types';

/** All covered regions need measured or explicitly estimated thermal data.
 * An uncovered region legitimately contributes zero; missing covered values
 * must not enter ensemble scoring as zero insulation or perfect permeability.
 */
export function hasUsableThermalData(garment: GarmentRow): boolean {
  const thermal = garment.garment_thermal_properties;
  const known = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  return !!thermal && known(thermal.rcl_whole_body)
    && (['torso', 'arms', 'legs'] as const).every(region =>
      !garment[`covers_${region}`] || (known(thermal[`rcl_${region}`]) && known(thermal[`recl_${region}`])));
}

/** One garment can satisfy body coverage, warmth and protection regardless of
 * its layer category. Unknown usage/protection never proves a requirement.
 * These are capabilities, not weather requirements or ownership assertions.
 */
export function garmentCapabilities(garment: GarmentRow) {
  return {
    standalone: garment.usage === 'standalone' || garment.usage === 'either',
    coverage: {
      torso: garment.coverage_torso ?? null,
      arms: garment.coverage_arms ?? null,
      legs: garment.coverage_legs ?? null,
    },
    thermalDataKnown: hasUsableThermalData(garment),
    wind: ['wind_resistant', 'windproof'].includes(garment.garment_protection?.windproof_rating ?? ''),
    wet: ['water_resistant', 'waterproof'].includes(garment.garment_protection?.waterproof_rating ?? ''),
  };
}
