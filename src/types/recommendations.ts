import type { EvaluationItem } from './biophysics';

export interface LayerItem extends EvaluationItem {
  name: string;
  rcl?: number;
  isGeneric?: boolean;
  sourceId?: string;
  isRecommended?: boolean;
  brand?: string;
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
  /** The place's IANA time zone, e.g. "Australia/Sydney". Missing for the device's own location. */
  timeZone?: string;
}
