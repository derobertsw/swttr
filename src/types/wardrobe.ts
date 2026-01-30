// Body parts and their layer types
export const BODY_PARTS = ["torso", "legs", "hands", "headNeck"] as const;
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
