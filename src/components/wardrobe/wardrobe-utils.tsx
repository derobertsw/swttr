import { Shirt, Hand, HardHat, Layers, Flame, Shield, Wind, CloudRain, Sparkles, LucideProps } from "lucide-react";
import type { WardrobeItem, AvailableItem, BodyPart, LayerType } from "@/types/wardrobe";
import type { EstimationMethod } from "@/types/garments";

// Custom pants icon (ski pants style) since lucide-react doesn't have one
function PantsIcon(props: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 3h12v4l1 13h-5l-2-11-2 11H5l1-13V3z" />
    </svg>
  );
}

const LEGS_GARMENT_TYPES = ["pants", "shorts", "bib"];

/**
 * Convert display body part name to filter key
 * Maps "head & neck" to "headNeck" for consistency with search filters
 */
/**
 * Infer the body part category for an available item
 * Used for filtering items by body part
 */
export function inferAvailableBodyPart(
  item: AvailableItem
): "torso" | "legs" | "hands" | "headNeck" {
  if (item.type === "custom") {
    return item.body_part || "torso";
  }
  if (item.type === "handwear") return "hands";
  if (item.type === "headwear") return "headNeck";

  const garmentType = item.garment_type?.toLowerCase();
  if (garmentType && LEGS_GARMENT_TYPES.includes(garmentType)) {
    return "legs";
  }

  return "torso";
}

export const typeIcons = {
  garment: Shirt,
  handwear: Hand,
  headwear: HardHat,
  custom: Sparkles,
};

// Keyed by item type, "legs", and garment category. Kept at module level so
// icon components index into a static map instead of creating components
// during render.
const ITEM_ICONS: Record<string, React.ComponentType<LucideProps>> = {
  ...typeIcons,
  legs: PantsIcon,
  base_layer: Layers,
  mid_layer_light: Shirt,
  mid_layer_heavy: Shirt,
  insulation_synthetic: Flame,
  insulation_down: Flame,
  soft_shell: Shield,
  hard_shell: CloudRain,
  outer_insulated: Flame,
  windbreaker: Wind,
};

export const typeLabels = {
  garment: "Clothing",
  handwear: "Handwear",
  headwear: "Headwear",
  custom: "Custom",
};

/** Body areas in the order the wardrobe lists them. */
export const BODY_AREAS: BodyPart[] = ["torso", "legs", "hands", "headNeck"];
const BODY_AREA_LABELS: Record<BodyPart, string> = {
  torso: "Upper body",
  legs: "Legs",
  hands: "Hands",
  headNeck: "Head & neck",
};

export function formatBodyPartLabel(part: BodyPart): string {
  return BODY_AREA_LABELS[part];
}

export const LAYER_LABELS: Record<LayerType, string> = {
  base: "Base layer",
  mid: "Mid layer",
  outer: "Outer layer",
};

function getItemIconKey(itemType: string, garmentType?: string, category?: string): string {
  if (itemType === "custom") return "custom";
  if (itemType === "garment" && garmentType && LEGS_GARMENT_TYPES.includes(garmentType)) return "legs";
  if (itemType === "garment" && category && ITEM_ICONS[category]) return category;
  return ITEM_ICONS[itemType] ? itemType : "garment";
}

interface ItemIconProps extends LucideProps {
  itemType: string;
  garmentType?: string;
  category?: string;
}

/** Icon for a wardrobe item, picked by item type, garment type, and category. */
export function ItemIcon({ itemType, garmentType, category, ...props }: ItemIconProps) {
  const Icon = ITEM_ICONS[getItemIconKey(itemType, garmentType, category)];
  return <Icon {...props} />;
}

export function formatCategory(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatEstimationMethod(method: EstimationMethod | undefined): string {
  if (!method) return "—";
  const labels: Record<EstimationMethod, string> = {
    lab_tested: "Lab Tested",
    derived_from_similar: "Derived from Similar",
    calculated_from_materials: "Calculated from Materials",
  };
  return labels[method] || method;
}

export function formatConfidence(score: number | undefined): string {
  if (score === undefined) return "—";
  if (score >= 0.9) return "High";
  if (score >= 0.7) return "Medium";
  return "Low";
}

export function getClo(item: WardrobeItem): number | undefined {
  if (item.item_type === "custom") {
    return item.details.rcl_clo;
  }
  if (item.details.rcl_clo !== undefined) return item.details.rcl_clo;
  const tp = item.details.garment_thermal_properties;
  const props = Array.isArray(tp) ? tp[0] : tp;
  return props?.rcl_whole_body;
}

/** The body area an owned item is listed under. */
export function getItemBodyArea(item: WardrobeItem): BodyPart {
  const part = getBodyPart(item);
  return part === "head & neck" ? "headNeck" : (part as BodyPart);
}

/** What an item is: its catalog category, or a custom item's layer and type. */
export function getItemCategoryLabel(item: WardrobeItem): string {
  const { details } = item;
  if (item.item_type === "custom") {
    const layer = details.layer_type ? LAYER_LABELS[details.layer_type] : "Custom item";
    return details.generic_option ? `${layer} · ${details.generic_option}` : layer;
  }
  const category = details.category || details.handwear_type || details.headwear_type;
  return category ? formatCategory(category) : "Uncategorized";
}

/** Who makes an item, or that it's a custom stand-in. */
export function getItemBrandLabel(item: WardrobeItem): string {
  if (item.item_type === "custom") return "Custom item";
  return item.details.brand || "Unknown brand";
}

/** The text "Search my gear" matches against. */
export function getItemSearchText(item: WardrobeItem): string {
  return `${getItemBrandLabel(item)} ${item.details.model_name} ${getItemCategoryLabel(item)}`;
}

export function getBodyPart(item: WardrobeItem): string {
  if (item.item_type === "custom") {
    const bp = item.details.body_part;
    return bp === "headNeck" ? "head & neck" : bp || "torso";
  }
  if (item.item_type === "handwear") return "hands";
  if (item.item_type === "headwear") return "head & neck";
  if (item.details.garment_type && LEGS_GARMENT_TYPES.includes(item.details.garment_type)) return "legs";
  return "torso";
}


export function normalizeSearch(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9\s]/g, "");
}
