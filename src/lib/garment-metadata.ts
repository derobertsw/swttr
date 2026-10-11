import type { EvaluationItem } from '@/types/biophysics';

/** Copy the public garment contract unchanged across recommendation and picker views. */
export function garmentMetadata(item: EvaluationItem) {
  return {
    garment_type: item.garment_type, usage: item.usage,
    coverage_torso: item.coverage_torso, coverage_arms: item.coverage_arms,
    coverage_legs: item.coverage_legs, suitable_activities: item.suitable_activities,
    thermal_data_status: item.thermal_data_status,
    thermal_provenance: item.thermal_provenance, protection: item.protection,
  };
}
