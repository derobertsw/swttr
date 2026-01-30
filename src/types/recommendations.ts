export interface LayerSet {
  base: string[];
  mid?: string[];
  outer: string[];
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
