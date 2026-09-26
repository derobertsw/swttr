import type {
  PackItemGarment,
  RecommendedGarment,
  RecommendedHandwear,
  RecommendedHeadwear,
} from "@/types/biophysics";
import { LayerSet, LayerItem } from "@/types/recommendations";
import { BodyPart, LayerType, BODY_PARTS as _BODY_PARTS } from "@/types/wardrobe";

// Re-export for convenience
export type { LayerSet, LayerItem };
export type { BodyPart, LayerType };

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
  outer_insulated: "mid",
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
 * All body parts in display order
 */
export const BODY_PARTS = _BODY_PARTS;

/**
 * Creates an empty LayerSet with no garments
 */
export function createEmptyLayerSet(): LayerSet {
  return { base: [], mid: [], outer: [] };
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
      // Use regional clo for the specific body part so displayed values
      // match the regional deficit/surplus calculations
      const regionalRcl = bodyPart === "legs" ? garment.rcl_legs
        : bodyPart === "torso" ? garment.rcl_torso
        : undefined;
      layers[layerType]?.push({ name: garment.name, rcl: regionalRcl ?? garment.rcl, sourceId: garment.id });
    }
  }

  return layers;
}

/** Layers worn on every body part. */
export type BodyPartLayers = Record<BodyPart, LayerSet>;

const LAYER_TYPES: LayerType[] = ["base", "mid", "outer"];

function handwearLayers(handwear: RecommendedHandwear | null | undefined): LayerSet {
  const layers = createEmptyLayerSet();
  if (handwear) {
    layers.outer = [{ name: handwear.name, rcl: handwear.rcl, sourceId: handwear.id }];
  }
  return layers;
}

/** Warmth items (hat, neck gaiter) as base layers and the helmet as the outer layer. */
function headwearLayers(headwear: RecommendedHeadwear | null | undefined): LayerSet {
  const layers = createEmptyLayerSet();
  if (!headwear) return layers;

  const baseItems: LayerItem[] = [];
  if (headwear.head_warmth) {
    baseItems.push({ name: headwear.head_warmth.name, rcl: headwear.head_warmth.rcl, sourceId: headwear.head_warmth.id });
  }
  if (headwear.neck_warmth) {
    baseItems.push({ name: headwear.neck_warmth.name, rcl: headwear.neck_warmth.rcl, sourceId: headwear.neck_warmth.id });
  }
  if (baseItems.length > 0) layers.base = baseItems;
  if (headwear.helmet) {
    layers.outer = [{ name: headwear.helmet.name, rcl: headwear.helmet.rcl, sourceId: headwear.helmet.id }];
  }
  return layers;
}

/** The layers of a biophysics recommendation, per body part. */
export function buildRecommendedLayers(
  garments: RecommendedGarment[] | undefined,
  handwear: RecommendedHandwear | null | undefined,
  headwear: RecommendedHeadwear | null | undefined
): BodyPartLayers {
  return {
    torso: garments ? garmentsToLayerSet(garments, "torso") : createEmptyLayerSet(),
    legs: garments ? garmentsToLayerSet(garments, "legs") : createEmptyLayerSet(),
    hands: handwearLayers(handwear),
    headNeck: headwearLayers(headwear),
  };
}

/**
 * Ski-touring descent layers: the climb garments plus pack items (added as
 * torso outer layers), with the descent gloves and headwear when provided.
 */
export function buildDescentLayers(
  garments: RecommendedGarment[] | undefined,
  climbHandwear: RecommendedHandwear | null | undefined,
  climbHeadwear: RecommendedHeadwear | null | undefined,
  packItems: PackItemGarment[],
  descentHandwear: RecommendedHandwear | null | undefined,
  descentHeadwear: RecommendedHeadwear | null | undefined
): BodyPartLayers {
  const torso = garments ? garmentsToLayerSet(garments, "torso") : createEmptyLayerSet();
  const legs = garments ? garmentsToLayerSet(garments, "legs") : createEmptyLayerSet();

  const packLayerItems: LayerItem[] = packItems.map((item) => ({
    name: item.name,
    rcl: typeof item.rcl_clo === "number" ? item.rcl_clo : undefined,
    sourceId: item.id,
  }));
  torso.outer = [...torso.outer, ...packLayerItems];

  const handwear = descentHandwear && descentHandwear.name !== climbHandwear?.name
    ? descentHandwear
    : climbHandwear;

  return {
    torso,
    legs,
    hands: handwearLayers(handwear),
    headNeck: headwearLayers(descentHeadwear ?? climbHeadwear),
  };
}

function forEachItem(layers: BodyPartLayers, visit: (item: LayerItem, bodyPart: BodyPart) => void) {
  for (const part of BODY_PARTS) {
    for (const layerType of LAYER_TYPES) {
      for (const item of layers[part][layerType] ?? []) visit(item, part);
    }
  }
}

/** Catalog ids of every item worn. */
export function collectInUseIds(layers: BodyPartLayers): Set<string> {
  const ids = new Set<string>();
  forEachItem(layers, (item) => {
    if (item.sourceId) ids.add(item.sourceId);
  });
  return ids;
}

/**
 * Names of items worn in `layers` but not in `other` (matched by catalog id,
 * or name for custom items), in body-part and layer order without repeats.
 */
export function itemNamesMissingFrom(layers: BodyPartLayers, other: BodyPartLayers): string[] {
  const keyOf = (item: LayerItem) => item.sourceId || item.name;
  const otherKeys = new Set<string>();
  forEachItem(other, (item) => otherKeys.add(keyOf(item)));

  const names: string[] = [];
  const seen = new Set<string>();
  forEachItem(layers, (item) => {
    const key = keyOf(item);
    if (otherKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    names.push(item.name);
  });
  return names;
}

/** Clo of every item worn, per body part (items without a clo value count as 0). */
export function itemCloByBodyPart(layers: BodyPartLayers): Record<BodyPart, number[]> {
  const clo: Record<BodyPart, number[]> = { torso: [], legs: [], hands: [], headNeck: [] };
  forEachItem(layers, (item, part) => clo[part].push(item.rcl ?? 0));
  return clo;
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
export interface LegacyRecommendation {
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
