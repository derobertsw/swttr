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
  isActive: boolean
): HandwearRow | null {
  if (handwear.length === 0) return null;

  // Filter by temperature suitability
  const suitable = handwear.filter((h) => {
    const minTemp = isActive ? h.min_temp_active : h.min_temp_static;
    return minTemp === undefined || minTemp === null || tempC >= minTemp;
  });

  // Sort by clo (warmest first for cold, lightest first for warm)
  const sorted = [...(suitable.length > 0 ? suitable : handwear)].sort((a, b) => {
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
  isActive: boolean
): HeadwearRecommendations {
  const helmets = headwear.filter((h) => HELMET_TYPES.includes(h.headwear_type));
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
