import type { GarmentThermalProperties } from "@/types/garments";

// Body parts and their layer types
export const BODY_PARTS = ["torso", "legs", "headNeck", "hands"] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export type LayerType = "base" | "mid" | "outer";

// User item mapping - maps standard options to user's custom item names
export interface UserItemMapping {
  id: string;
  user_id: string;
  body_part: BodyPart;
  layer_type: LayerType;
  standard_option: string;
  custom_name: string;
}

// Key for item mapping lookup
export type ItemMappingKey = `${BodyPart}:${LayerType}:${string}`;

export function makeItemMappingKey(
  bodyPart: BodyPart,
  layerType: LayerType,
  standardOption: string
): ItemMappingKey {
  return `${bodyPart}:${layerType}:${standardOption}`;
}

export interface UserCustomItem {
  id: string;
  user_id: string;
  body_part: BodyPart;
  layer_type: LayerType;
  generic_option: string;
  custom_name: string;
  rcl_clo: number;
  created_at: string;
  updated_at: string;
}

export interface AvailableItem {
  id: string;
  type: "garment" | "handwear" | "headwear" | "custom";
  brand: string;
  model_name: string;
  brand_logo_url?: string;
  item_image_url?: string;
  category: string;
  garment_type?: string;
  rcl_clo?: number;
  rcl_torso?: number;
  rcl_legs?: number;
  dexterity_score?: number;
  // For custom items
  body_part?: BodyPart;
  layer_type?: LayerType;
  generic_option?: string;
}

export interface WardrobeItem {
  id: string;
  item_type: "garment" | "handwear" | "headwear" | "custom";
  item_id: string;
  nickname?: string;
  disabled?: boolean;
  details: {
    brand: string;
    model_name: string;
    brand_logo_url?: string;
    item_image_url?: string;
    category?: string;
    garment_type?: string;
    handwear_type?: string;
    headwear_type?: string;
    rcl_clo?: number;
    dexterity_score?: number;
    covers_torso?: boolean;
    covers_arms?: boolean;
    covers_legs?: boolean;
    covers_head?: boolean;
    hood_type?: string;
    covers_ears?: boolean;
    covers_neck?: boolean;
    covers_face?: boolean;
    garment_thermal_properties?: GarmentThermalProperties | GarmentThermalProperties[];
    // For custom items
    body_part?: BodyPart;
    layer_type?: LayerType;
    generic_option?: string;
    custom_name?: string;
  };
}
