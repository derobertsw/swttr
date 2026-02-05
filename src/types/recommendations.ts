export interface LayerItem {
  name: string;
  rcl?: number;
}

export interface LayerSet {
  base: LayerItem[];
  mid?: LayerItem[];
  outer: LayerItem[];
}

export interface Recommendation {
  torso: LayerSet;
  legs: LayerSet;
  hands: LayerSet;
  headNeck: LayerSet;
}

export interface LocationSuggestion {
  id: number;
  name: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface BackpackItem {
  name: string;
  isCustom: boolean;
}
