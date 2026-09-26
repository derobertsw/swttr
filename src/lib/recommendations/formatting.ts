/**
 * Response formatting helpers for recommendation API routes
 */
import { garmentToThermalProps } from '@/lib/biophysics/ensemble';
import { COWEDA_VALIDATION_SOURCE, type CowedaValidationBuffer } from '@/lib/biophysics/coweda';
import { DLE_ESTIMATION_METHOD } from '@/lib/biophysics/ireq';
import type { GarmentWithProtection } from '@/lib/biophysics/scorer';
import type { IreqResult } from '@/types/garments';
import type { GarmentRow, HandwearRow, HeadwearRow, HeadwearRecommendations } from './types';
import type { WeatherInput } from './request';
import type { PhaseTargets } from './thermal-targets';

/**
 * Format garment for API response
 */
export function formatGarmentResponse(garment: GarmentRow): {
  id: string;
  name: string;
  category: string;
  rcl?: number;
  rcl_torso?: number;
  rcl_arms?: number;
  rcl_legs?: number;
  recl?: number;
  evap_potential?: number;
  covers_torso: boolean;
  covers_arms: boolean;
  covers_legs: boolean;
} {
  return {
    id: garment.id,
    name: `${garment.brand} ${garment.model_name}`,
    category: garment.category,
    rcl: garment.garment_thermal_properties?.rcl_whole_body,
    rcl_torso: garment.garment_thermal_properties?.rcl_torso,
    rcl_arms: garment.garment_thermal_properties?.rcl_arms,
    rcl_legs: garment.garment_thermal_properties?.rcl_legs,
    recl: garment.garment_thermal_properties?.recl_whole_body,
    evap_potential: garment.garment_thermal_properties?.evap_potential,
    covers_torso: garment.covers_torso,
    covers_arms: garment.covers_arms,
    covers_legs: garment.covers_legs,
  };
}

/**
 * Convert an ensemble of garments to thermal garments with protection data
 * for use with scoring functions
 */
export function ensembleToThermalGarments(ensemble: GarmentRow[]): GarmentWithProtection[] {
  return ensemble.map((g) => {
    const baseProps = garmentToThermalProps(g, g.garment_thermal_properties ?? {});
    return {
      ...baseProps,
      category: g.category,
      windproofRating: (g.garment_protection?.windproof_rating ?? 'none') as GarmentWithProtection['windproofRating'],
      waterproofRating: (g.garment_protection?.waterproof_rating ?? 'none') as GarmentWithProtection['waterproofRating'],
      waterproofMm: g.garment_protection?.waterproof_mm,
    };
  });
}

/**
 * Format handwear for API response
 */
export function formatHandwearResponse(handwear: HandwearRow) {
  return {
    id: handwear.id,
    name: `${handwear.brand} ${handwear.model_name}`,
    type: handwear.handwear_type,
    rcl: handwear.rcl_clo,
    dexterity: handwear.dexterity_score,
  };
}

/**
 * Format headwear for API response
 */
function formatHeadwearResponse(headwear: HeadwearRow) {
  return {
    id: headwear.id,
    name: `${headwear.brand} ${headwear.model_name}`,
    type: headwear.headwear_type,
    rcl: headwear.rcl_clo,
    covers_ears: headwear.covers_ears,
    covers_neck: headwear.covers_neck,
  };
}

/**
 * Format the helmet / head warmth / neck warmth selection for API response
 */
export function formatHeadwearSet(headwear: HeadwearRecommendations) {
  return {
    helmet: headwear.helmet ? formatHeadwearResponse(headwear.helmet) : null,
    head_warmth: headwear.headWarmth ? formatHeadwearResponse(headwear.headWarmth) : null,
    neck_warmth: headwear.neckWarmth ? formatHeadwearResponse(headwear.neckWarmth) : null,
  };
}

/**
 * Echo the request's weather in the units it was sent
 */
export function formatConditions(weather: WeatherInput) {
  return {
    temperature: `${weather.temperature}°F`,
    wind_speed: `${weather.wind_speed} mph`,
  };
}

/**
 * Format one phase's IREQ (clo) and duration-limited exposure
 */
export function formatIreqPhase(ireq: IreqResult) {
  return { min: ireq.ireqMin, neutral: ireq.ireqNeutral, dle_hours: ireq.dleHours };
}

/**
 * Format the CoWEDA validation buffer added to a phase's targets
 */
export function formatValidationBuffer(buffer: CowedaValidationBuffer) {
  return {
    whole_body: buffer.wholeBody,
    cold_risk: buffer.coldRisk,
    extremity: buffer.extremity,
    context: buffer.context,
  };
}

/**
 * The `ireq` block shared by single-phase sports
 */
export function formatSinglePhaseIreq(ireq: IreqResult, targets: PhaseTargets) {
  return {
    min: ireq.ireqMin,
    neutral: ireq.ireqNeutral,
    dle_hours: ireq.dleHours,
    dle_method: DLE_ESTIMATION_METHOD,
    target_range: targets.targetRange,
    regional: targets.regional,
    extremity: targets.extremity,
    validation_buffer_clo: formatValidationBuffer(targets.validationBuffer),
    validation_source: COWEDA_VALIDATION_SOURCE,
  };
}
