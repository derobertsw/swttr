/**
 * Garment categorization by layer type
 */
import type { GarmentRow, CategorizedGarments } from './types';

const BASE_LAYER_CATEGORIES = ['base_layer'];
const MID_LAYER_CATEGORIES = ['mid_layer_light', 'mid_layer_heavy'];
const INSULATION_CATEGORIES = ['insulation_synthetic', 'insulation_down'];
const SHELL_CATEGORIES = ['soft_shell', 'hard_shell', 'windbreaker'];

/**
 * Categorize garments by layer type
 */
export function categorizeGarments(garments: GarmentRow[]): CategorizedGarments {
  return {
    baseLayers: garments.filter((g) => BASE_LAYER_CATEGORIES.includes(g.category)),
    midLayers: garments.filter((g) => MID_LAYER_CATEGORIES.includes(g.category)),
    insulation: garments.filter((g) => INSULATION_CATEGORIES.includes(g.category)),
    shells: garments.filter((g) => SHELL_CATEGORIES.includes(g.category)),
  };
}
