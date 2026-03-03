import { Shirt, Hand, HardHat, Layers, Flame, Shield, Wind, CloudRain, Sparkles, LucideProps } from "lucide-react";
import type { WardrobeItem, AvailableItem } from "@/types/wardrobe";
import type { EstimationMethod } from "@/types/garments";

// Custom pants icon (ski pants style) since lucide-react doesn't have one
export function PantsIcon(props: LucideProps) {
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

export const LEGS_GARMENT_TYPES = ["pants", "shorts", "bib"];

/**
 * Convert display body part name to filter key
 * Maps "head & neck" to "headNeck" for consistency with search filters
 */
export function bodyPartToFilterKey(
  displayName: string
): "torso" | "legs" | "hands" | "headNeck" {
  if (displayName === "head & neck") return "headNeck";
  return displayName as "torso" | "legs" | "hands";
}

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

const categoryIcons: Record<string, React.ComponentType<LucideProps>> = {
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

export const BODY_PART_ORDER = ["torso", "legs", "hands", "head & neck"];

export function getItemIcon(itemType: string, garmentType?: string, category?: string) {
  if (itemType === "custom") {
    return Sparkles;
  }
  if (itemType === "garment" && garmentType && LEGS_GARMENT_TYPES.includes(garmentType)) {
    return PantsIcon;
  }
  if (itemType === "garment" && category && categoryIcons[category]) {
    return categoryIcons[category];
  }
  return typeIcons[itemType as keyof typeof typeIcons] || Shirt;
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

export function formatValue(value: number | undefined | null, decimals: number = 3): string {
  if (value === undefined || value === null) return "—";
  return value.toFixed(decimals);
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

export function getEmptyStateIcon(part: string) {
  switch (part) {
    case "torso": return Shirt;
    case "legs": return PantsIcon;
    case "hands": return Hand;
    case "head & neck": return HardHat;
    default: return Shirt;
  }
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
