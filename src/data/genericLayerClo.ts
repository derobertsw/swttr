import type { BodyPart, LayerType } from "@/types/wardrobe";

const GENERIC_LAYER_CLO: Record<BodyPart, Partial<Record<LayerType, Record<string, number>>>> = {
  torso: {
    base: {
      Light: 0.2,
      Medium: 0.3,
      Heavy: 0.4,
    },
    mid: {
      Pullover: 0.3,
      Sweater: 0.45,
      Vest: 0.25,
    },
    outer: {
      Windbreaker: 0.1,
      "Soft Shell": 0.2,
      "Snow Shell": 0.25,
      "Insulated Shell": 0.45,
    },
  },
  legs: {
    base: {
      Light: 0.15,
      Medium: 0.25,
      Heavy: 0.35,
    },
    outer: {
      Shorts: 0.2,
      Joggers: 0.15,
      "Soft Shell": 0.2,
      "Snow Shell": 0.25,
      "Insulated Shell": 0.4,
    },
  },
  hands: {
    base: {
      "Lightweight liner": 0.08,
      "Mediumweight liner": 0.12,
      "Standalone lightweight glove": 0.18,
    },
    outer: {
      "Mediumweight shell": 0.25,
      "Heavy shell": 0.35,
      "Heavy mittens": 0.45,
    },
  },
  headNeck: {
    base: {
      "Neck gator low weight": 0.05,
      "Neck gator medium weight": 0.1,
      "Neck gator heavy weight": 0.15,
      "Balaclava low weight": 0.12,
      "Balaclava medium weight": 0.2,
      "Balaclava heavy weight": 0.3,
      "Beanie low weight": 0.1,
      "Beanie medium weight": 0.18,
      "Beanie heavy weight": 0.25,
    },
    outer: {
      Helmet: 0.1,
      Goggles: 0.02,
    },
  },
};

export function getGenericLayerClo(
  bodyPart: BodyPart,
  layerType: LayerType,
  optionName: string
): number {
  return GENERIC_LAYER_CLO[bodyPart][layerType]?.[optionName] ?? 0;
}
