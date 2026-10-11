import 'server-only';
import { garmentMetadata } from '@/lib/garment-metadata';
import { formatGarmentResponse } from './formatting';
import type { GarmentRow } from './types';
import type { EvaluationItem } from '@/types/biophysics';

type Row = Record<string, unknown> & { id: string };

export function knownClo(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** The same server-computed contract feeds catalog, wardrobe and evaluation. */
export function itemThermalMetadata(type: NonNullable<EvaluationItem['item_type']>, row: Row): EvaluationItem & { rcl_clo?: number; rcl_torso?: number; rcl_legs?: number; rcl_arms?: number } {
  if (type === 'garment') {
    const garment = formatGarmentResponse(row as unknown as GarmentRow);
    return {
      ...garmentMetadata(garment),
      rcl_clo: knownClo(garment.rcl) ? garment.rcl : typeof garment.rcl === 'string' && knownClo(Number(garment.rcl)) ? Number(garment.rcl) : undefined,
      rcl_torso: garment.thermal_data_status === 'known' && garment.covers_torso ? garment.rcl_torso : undefined,
      rcl_legs: garment.thermal_data_status === 'known' && garment.covers_legs ? garment.rcl_legs : undefined,
      rcl_arms: garment.rcl_arms,
    };
  }
  return {
    rcl_clo: knownClo(row.rcl_clo) ? row.rcl_clo : undefined,
    thermal_data_status: knownClo(row.rcl_clo) ? 'known' as const : 'unknown' as const,
    ...(type === 'custom' && { thermal_provenance: { generic_estimate: true, data_source: 'user_custom_items' } }),
  };
}
