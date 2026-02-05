import { RecommendedGarment } from "@/types/biophysics";
import { LayerSet, LayerItem } from "@/types/recommendations";

// Re-export for convenience
export type { LayerSet, LayerItem };

/**
 * Layer type classification for garments
 */
export type LayerType = "base" | "mid" | "outer";

/**
 * Body part classification for layering
 */
export type BodyPart = "torso" | "legs" | "hands" | "headNeck";

/**
 * Mapping from garment categories to their layer types.
 * Used to classify garments into base, mid, or outer layers.
 */
export const CATEGORY_TO_LAYER_TYPE: Record<string, LayerType> = {
  base_layer: "base",
  mid_layer_light: "mid",
  mid_layer_heavy: "mid",
  insulation_synthetic: "mid",
  insulation_down: "mid",
  soft_shell: "outer",
  hard_shell: "outer",
  windbreaker: "outer",
};

/**
 * Human-readable labels for body parts
 */
export const BODY_PART_LABELS: Record<BodyPart, string> = {
  torso: "Torso",
  legs: "Legs",
  hands: "Hands",
  headNeck: "Head/Neck",
};

/**
 * Human-readable labels for layer types
 */
export const LAYER_LABELS: Record<LayerType, string> = {
  base: "Base",
  mid: "Mid",
  outer: "Outer",
};

/**
 * Maps UI body parts to biophysics body regions (for clo calculations)
 */
export const BODY_PART_TO_REGION: Record<BodyPart, "torso" | "arms" | "legs" | null> = {
  torso: "torso",
  legs: "legs",
  hands: null,
  headNeck: null,
};

/**
 * Maps UI body parts to extremity regions (for hands/head clo calculations)
 */
export const BODY_PART_TO_EXTREMITY: Record<BodyPart, "hands" | "head" | null> = {
  torso: null,
  legs: null,
  hands: "hands",
  headNeck: "head",
};

/**
 * All body parts in display order
 */
export const BODY_PARTS: readonly BodyPart[] = ["torso", "legs", "hands", "headNeck"] as const;

/**
 * Creates an empty LayerSet with no garments
 */
export function createEmptyLayerSet(): LayerSet {
  return { base: [], mid: [], outer: [] };
}

/**
 * Formats a garment name with optional clo value for display.
 * Example output: "Patagonia R1 (0.85 clo)"
 *
 * @param name - The garment name/brand model
 * @param rcl - Optional thermal resistance (clo) value
 * @returns Formatted string with clo value appended if available
 */
export function formatGarmentWithClo(name: string, rcl?: number): string {
  const cloStr = rcl !== undefined ? ` (${rcl.toFixed(2)} clo)` : "";
  return `${name}${cloStr}`;
}

/**
 * Transforms biophysics garments into a LayerSet format for display.
 * Filters garments by body part coverage (torso or legs) and organizes
 * them into base, mid, and outer layer arrays.
 *
 * @param garments - Array of recommended garments from biophysics API
 * @param bodyPart - Which body part to filter for ("torso" or "legs")
 * @returns LayerSet with garments organized by layer type
 *
 * @example
 * const garments = [{ name: "R1", category: "mid_layer_light", covers_torso: true, rcl: 0.85 }];
 * const layers = garmentsToLayerSet(garments, "torso");
 * // layers.mid = [{ name: "R1", rcl: 0.85 }]
 */
export function garmentsToLayerSet(
  garments: RecommendedGarment[],
  bodyPart: "torso" | "legs"
): LayerSet {
  const layers = createEmptyLayerSet();

  for (const garment of garments) {
    // Filter by body part coverage
    if (bodyPart === "torso" && !garment.covers_torso) continue;
    if (bodyPart === "legs" && !garment.covers_legs) continue;

    const layerType = CATEGORY_TO_LAYER_TYPE[garment.category];
    if (layerType) {
      layers[layerType]?.push({ name: garment.name, rcl: garment.rcl });
    }
  }

  return layers;
}

/**
 * Checks if a LayerSet has any garments in any layer
 *
 * @param layers - The LayerSet to check
 * @returns true if any layer has garments
 */
export function hasAnyLayers(layers: LayerSet): boolean {
  return (
    layers.base.length > 0 ||
    (layers.mid !== undefined && layers.mid.length > 0) ||
    layers.outer.length > 0
  );
}

/**
 * Applies item name mappings to transform standard garment names to custom user names.
 * Used when users have renamed items in their wardrobe.
 *
 * @param items - Array of layer items to transform
 * @param bodyPart - The body part category
 * @param layerType - The layer type (base, mid, outer)
 * @param mappings - Map of "bodyPart:layerType:itemName" -> "customName"
 * @returns Array of items with custom names applied where mappings exist
 */
export function applyItemMappings(
  items: LayerItem[],
  bodyPart: BodyPart,
  layerType: LayerType,
  mappings: Map<string, string>
): LayerItem[] {
  return items.map((item) => {
    const key = `${bodyPart}:${layerType}:${item.name}`;
    const customName = mappings.get(key);
    return customName ? { ...item, name: customName } : item;
  });
}

/**
 * Converts string arrays to LayerItem arrays for backward compatibility
 * with JSON data that uses simple string arrays
 */
function stringsToLayerItems(items: string[] | undefined): LayerItem[] {
  if (!items) return [];
  return items.map((name) => ({ name }));
}

/**
 * Legacy layer set format using string arrays (from JSON files)
 */
interface LegacyLayerSet {
  base: string[];
  mid?: string[];
  outer: string[];
}

/**
 * Legacy recommendation format using string arrays
 */
interface LegacyRecommendation {
  torso: LegacyLayerSet;
  legs: LegacyLayerSet;
  hands: LegacyLayerSet;
  headNeck: LegacyLayerSet;
}

/**
 * Converts a legacy recommendation (with string arrays) to the new format (with LayerItem arrays)
 */
export function convertLegacyRecommendation(legacy: LegacyRecommendation): {
  torso: LayerSet;
  legs: LayerSet;
  hands: LayerSet;
  headNeck: LayerSet;
} {
  return {
    torso: {
      base: stringsToLayerItems(legacy.torso.base),
      mid: stringsToLayerItems(legacy.torso.mid),
      outer: stringsToLayerItems(legacy.torso.outer),
    },
    legs: {
      base: stringsToLayerItems(legacy.legs.base),
      mid: stringsToLayerItems(legacy.legs.mid),
      outer: stringsToLayerItems(legacy.legs.outer),
    },
    hands: {
      base: stringsToLayerItems(legacy.hands.base),
      mid: stringsToLayerItems(legacy.hands.mid),
      outer: stringsToLayerItems(legacy.hands.outer),
    },
    headNeck: {
      base: stringsToLayerItems(legacy.headNeck.base),
      mid: stringsToLayerItems(legacy.headNeck.mid),
      outer: stringsToLayerItems(legacy.headNeck.outer),
    },
  };
}
