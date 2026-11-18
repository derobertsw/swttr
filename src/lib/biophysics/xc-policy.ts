import type { XCContext } from '@/types/xc';
import type { PrecipitationType } from '@/types/weather';

export interface XCPhaseContext {
  outingPattern: NonNullable<XCContext['outingPattern']>;
  exposure: NonNullable<XCContext['xcExposure']>;
  effectiveWindMs: number;
  precipitation: 'dry' | 'dry_snow' | 'wet';
  carryWarmth: boolean;
}

/** Exposure floors are engineering assumptions, not inferred travel speeds.
 * Use max, never ambient + movement: the same wind enters targets and policy
 * once. Ordinary motion is already handled by phaseExposure; no movement speed is added here.
 */
export function xcPhaseContext(input: XCContext & {
  tempC: number; windMs: number; precipitation: boolean; precipitationType?: PrecipitationType;
}): XCPhaseContext {
  const exposure = input.xcExposure ?? 'unknown';
  const effectiveWindMs = Math.max(input.windMs, exposure === 'descents' ? 5 : exposure === 'exposed' ? 4 : 0);
  const precipitation = classifyPrecipitation(input.precipitation, input.precipitationType, input.tempC);
  return {
    outingPattern: input.outingPattern ?? 'unknown', exposure, effectiveWindMs, precipitation,
    carryWarmth: input.outingPattern === 'frequent_stops' || input.tempC <= 5 || precipitation === 'wet',
  };
}

/** Snow near melting can wet clothing. Unknown precipitation is treated
 * conservatively as wet; the weather contract has no measured snow water.
 * Shared by XC and the ski-touring climb. */
export function classifyPrecipitation(
  precipitation: boolean, precipitationType: PrecipitationType | undefined, tempC: number,
): XCPhaseContext['precipitation'] {
  if (!precipitation) return 'dry';
  return precipitationType === 'snow' && tempC < -1 ? 'dry_snow' : 'wet';
}

/** Condition-based wind protection, independent of garment category. */
export function needsXCWindProtection(tempC: number, windMs: number): boolean {
  return windMs > 8 || (tempC <= 5 && windMs >= 4) || (tempC <= -10 && windMs >= 2);
}
