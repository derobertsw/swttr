/**
 * Extremity gear selection (handwear and headwear)
 */
import type { HandwearRow, HeadwearRow, HeadwearRecommendations } from './types';

// Headwear type categories
const HELMET_TYPES = ['ski_helmet'];
const HEAD_WARMTH_TYPES = ['liner_beanie', 'midweight_beanie', 'heavy_beanie', 'balaclava_light', 'balaclava_heavy', 'headband'];
const NECK_WARMTH_TYPES = ['buff_thin', 'buff_heavy', 'facemask'];

/**
 * Select best handwear based on temperature
 */
export function selectHandwear(
  handwear: HandwearRow[],
  tempC: number,
  isActive: boolean,
  targetClo?: number
): HandwearRow | null {
  if (handwear.length === 0) return null;

  // Filter by temperature suitability
  const suitable = handwear.filter((h) => {
    const minTemp = isActive ? h.min_temp_active : h.min_temp_static;
    return minTemp === undefined || minTemp === null || tempC >= minTemp;
  });

  const candidates = suitable.length > 0 ? suitable : handwear;

  // If we have a hand clo target, choose the closest glove with a mild overshoot penalty.
  if (targetClo !== undefined) {
    // With an explicit clo target, do not hard-filter by min temp.
    // Instead, apply a cold-mismatch penalty when current temp is below glove's recommended minimum.
    const targetCandidates = [...handwear];
    const minRatio = tempC <= 0 ? 0.8 : 0.65;
    const minimumAcceptableClo = targetClo * minRatio;
    const constrainedCandidates = targetCandidates.filter((c) => c.rcl_clo >= minimumAcceptableClo);
    const pool = constrainedCandidates.length > 0 ? constrainedCandidates : targetCandidates;

    const scored = [...pool].sort((a, b) => {
      const deltaA = a.rcl_clo - targetClo;
      const deltaB = b.rcl_clo - targetClo;
      const costA = deltaA > 0 ? deltaA * 2 : Math.abs(deltaA);
      const costB = deltaB > 0 ? deltaB * 2 : Math.abs(deltaB);
      const minTempA = isActive ? a.min_temp_active : a.min_temp_static;
      const minTempB = isActive ? b.min_temp_active : b.min_temp_static;
      const belowMinA =
        minTempA !== undefined && minTempA !== null ? Math.max(0, minTempA - tempC) : 0;
      const belowMinB =
        minTempB !== undefined && minTempB !== null ? Math.max(0, minTempB - tempC) : 0;
      const tempPenaltyA = belowMinA > 0 ? (belowMinA * belowMinA) * 0.08 : 0;
      const tempPenaltyB = belowMinB > 0 ? (belowMinB * belowMinB) * 0.08 : 0;
      const totalA = costA + tempPenaltyA;
      const totalB = costB + tempPenaltyB;

      if (totalA !== totalB) return totalA - totalB;
      if (Math.abs(deltaA) !== Math.abs(deltaB)) return Math.abs(deltaA) - Math.abs(deltaB);
      return a.rcl_clo - b.rcl_clo;
    });
    return scored[0] || null;
  }

  // Fallback: temperature-only sort
  const sorted = [...candidates].sort((a, b) => {
    if (tempC < -10) return b.rcl_clo - a.rcl_clo; // Cold: prefer warmer
    if (tempC > 0) return a.rcl_clo - b.rcl_clo;   // Warm: prefer lighter
    return b.rcl_clo - a.rcl_clo; // Default: prefer warmer
  });

  return sorted[0] || null;
}

/**
 * Select best headwear based on temperature (legacy - single item)
 */
export function selectHeadwear(
  headwear: HeadwearRow[],
  tempC: number,
  isActive: boolean
): HeadwearRow | null {
  if (headwear.length === 0) return null;

  // Filter by temperature suitability
  const suitable = headwear.filter((h) => {
    const minTemp = isActive ? h.min_temp_active : h.min_temp_static;
    return minTemp === undefined || minTemp === null || tempC >= minTemp;
  });

  // Sort by clo (warmest first for cold, lightest first for warm)
  const sorted = [...(suitable.length > 0 ? suitable : headwear)].sort((a, b) => {
    if (tempC < -10) return b.rcl_clo - a.rcl_clo; // Cold: prefer warmer
    if (tempC > 0) return a.rcl_clo - b.rcl_clo;   // Warm: prefer lighter
    return b.rcl_clo - a.rcl_clo; // Default: prefer warmer
  });

  return sorted[0] || null;
}

/**
 * Select headwear by category - returns helmet, head warmth, and neck warmth separately
 */
export function selectHeadwearByCategory(
  headwear: HeadwearRow[],
  tempC: number,
  isActive: boolean,
  options?: { includeHelmet?: boolean }
): HeadwearRecommendations {
  const includeHelmet = options?.includeHelmet ?? false;
  const helmets = includeHelmet
    ? headwear.filter((h) => HELMET_TYPES.includes(h.headwear_type))
    : [];
  const headWarmthItems = headwear.filter((h) => HEAD_WARMTH_TYPES.includes(h.headwear_type));
  const neckWarmthItems = headwear.filter((h) => NECK_WARMTH_TYPES.includes(h.headwear_type));

  // Select best helmet (prefer warmer for cold, but helmets have similar warmth)
  const helmet = selectBestFromCategory(helmets, tempC, isActive);

  // Select best head warmth layer based on temperature
  const headWarmth = selectBestFromCategory(headWarmthItems, tempC, isActive);

  // Select neck warmth if cold enough (below 0°C / 32°F)
  const neckWarmth = tempC < 0 ? selectBestFromCategory(neckWarmthItems, tempC, isActive) : null;

  return { helmet, headWarmth, neckWarmth };
}

/**
 * Select best item from a category based on temperature
 */
export function selectBestFromCategory(
  items: HeadwearRow[],
  tempC: number,
  isActive: boolean
): HeadwearRow | null {
  if (items.length === 0) return null;

  // Filter by temperature suitability
  const suitable = items.filter((h) => {
    const minTemp = isActive ? h.min_temp_active : h.min_temp_static;
    return minTemp === undefined || minTemp === null || tempC >= minTemp;
  });

  // Sort by clo (warmest first for cold, lightest first for warm)
  const sorted = [...(suitable.length > 0 ? suitable : items)].sort((a, b) => {
    if (tempC < -10) return b.rcl_clo - a.rcl_clo; // Cold: prefer warmer
    if (tempC > 0) return a.rcl_clo - b.rcl_clo;   // Warm: prefer lighter
    return b.rcl_clo - a.rcl_clo; // Default: prefer warmer
  });

  return sorted[0] || null;
}
