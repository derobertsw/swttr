/**
 * Duration-limited exposure (DLE) of a selected ensemble, after ISO 11079
 * 6.2: correct the ensemble's basic insulation to resultant insulation for
 * the phase's wind and motion (Annex A), find the body's heat-storage rate S
 * with that insulation, and divide the allowed heat debt by |S|.
 *
 * It uses SWTTR's simplified heat balance (`calculateIreq`): fixed skin
 * temperatures and no skin-evaporation term. So an outfit exactly at IREQ is
 * in balance (S = 0), and the limit moves with the same inputs as the
 * targets. Assumptions, gaps and reference comparisons:
 * docs/exposure-limits.md.
 *
 * Whole-body heat debt only: not a time to a core-temperature threshold, nor
 * to frostbite or hand, foot or face injury.
 */
import { SKIN_TEMP_MINIMUM, SKIN_TEMP_NEUTRAL } from './constants';
import { calculateHeatStorageRate, resultantInsulationFromBasic } from './ireq';
import type { ExposureConditions, ExposureCriterion, ExposureLimit } from '@/types/biophysics';

export const EXPOSURE_METHOD = 'iso11079_dle_selected_ensemble_v1' as const;

/** ISO 11079's allowed whole-body heat debt Qlim: 144 kJ/m² (40 Wh/m²). */
export const HEAT_DEBT_LIMIT_KJ_M2 = 144;

/** ISO 11079 reports longer limits as "more than 8 h" (a working day). */
const ISO_DLE_REPORTING_LIMIT_HOURS = 8;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function criterion(
  skinTemp: number,
  resultantClo: number,
  conditions: ExposureConditions,
): ExposureCriterion {
  const storage = calculateHeatStorageRate({
    airTemp: conditions.airTempC,
    windSpeed: conditions.relativeAirSpeedMs,
    relativeHumidity: conditions.relativeHumidity,
    metabolicRate: conditions.metabolicRate,
    resultantClo,
    skinTemp,
  });
  // A rounded storage of 0 W/m² still counts as balance, not as a very long limit.
  const heatStorage = round2(storage);
  if (heatStorage >= 0) {
    return { skin_temp_c: skinTemp, heat_storage_w_m2: heatStorage, status: 'no_heat_debt', dle_hours: null };
  }
  // kJ/m² ÷ W/m² gives kiloseconds; ÷ 3.6 gives hours.
  const hours = HEAT_DEBT_LIMIT_KJ_M2 / -storage / 3.6;
  return {
    skin_temp_c: skinTemp,
    heat_storage_w_m2: heatStorage,
    status: hours > ISO_DLE_REPORTING_LIMIT_HOURS ? 'more_than_8_hours' : 'limited',
    dle_hours: round2(hours),
  };
}

/** Which inputs fall outside ISO 11079's stated range. */
function outsideIsoRange(conditions: ExposureConditions): ExposureLimit['outside_iso_range'] {
  const outside: ExposureLimit['outside_iso_range'] = [];
  if (conditions.metabolicRate < 58 || conditions.metabolicRate > 400) outside.push('metabolic_rate');
  if (conditions.airTempC > 10) outside.push('air_temperature');
  if (conditions.relativeAirSpeedMs < 0.4 || conditions.relativeAirSpeedMs > 18) outside.push('air_speed');
  return outside;
}

/**
 * DLE of an ensemble of whole-body basic clo `basicClo` (SWTTR's torso, arm
 * and leg mean, the scale the targets use) in one phase's conditions, at
 * ISO 11079's minimal-strain and neutral skin temperatures.
 */
export function calculateExposureLimit(basicClo: number, conditions: ExposureConditions): ExposureLimit {
  const resultantClo = resultantInsulationFromBasic(basicClo, conditions);
  return {
    method: EXPOSURE_METHOD,
    basic_clo: round2(basicClo),
    resultant_clo: round2(resultantClo),
    heat_debt_limit_kj_m2: HEAT_DEBT_LIMIT_KJ_M2,
    minimal: criterion(SKIN_TEMP_MINIMUM, resultantClo, conditions),
    neutral: criterion(SKIN_TEMP_NEUTRAL, resultantClo, conditions),
    outside_iso_range: outsideIsoRange(conditions),
  };
}
