// Defines the valid layer options for each body part

export const layerOptions = {
  torso: {
    base: ["Light", "Medium", "Heavy"],
    mid: ["Pullover", "Sweater", "Vest"],
    outer: ["Windbreaker", "Soft Shell", "Snow Shell", "Insulated Shell"],
  },
  legs: {
    base: ["Light", "Medium", "Heavy"],
    outer: ["Shorts", "Joggers", "Soft Shell", "Snow Shell", "Insulated Shell"],
  },
  hands: {
    base: [
      "Lightweight liner",
      "Mediumweight liner",
      "Standalone lightweight glove",
    ],
    outer: ["Mediumweight shell", "Heavy shell", "Heavy mittens"],
  },
  headNeck: {
    base: [
      "Neck gator low weight",
      "Neck gator medium weight",
      "Neck gator heavy weight",
      "Balaclava low weight",
      "Balaclava medium weight",
      "Balaclava heavy weight",
      "Beanie low weight",
      "Beanie medium weight",
      "Beanie heavy weight",
    ],
    outer: ["Helmet", "Goggles"],
  },
} as const;

export type BodyPart = keyof typeof layerOptions;
export type LayerType = "base" | "mid" | "outer";

export type TorsoBaseOption = (typeof layerOptions.torso.base)[number];
export type TorsoMidOption = (typeof layerOptions.torso.mid)[number];
export type TorsoOuterOption = (typeof layerOptions.torso.outer)[number];

export type LegsBaseOption = (typeof layerOptions.legs.base)[number];
export type LegsOuterOption = (typeof layerOptions.legs.outer)[number];

export type HandsBaseOption = (typeof layerOptions.hands.base)[number];
export type HandsOuterOption = (typeof layerOptions.hands.outer)[number];

export type HeadNeckBaseOption = (typeof layerOptions.headNeck.base)[number];
export type HeadNeckOuterOption = (typeof layerOptions.headNeck.outer)[number];
